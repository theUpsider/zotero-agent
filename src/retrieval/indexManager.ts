/** Local index manager (S3-06, S3-07): owns the notifier-driven update
 * queue (debounced, throttled, concurrency 1 — never blocks Zotero's main
 * thread during a bulk import, NFR-005), full rebuild, and plain-language
 * status for the settings UI (FR-076). Zero network: this module's only
 * dependencies are the backend, an item reader, and a lister — no fetch, no
 * provider, so indexing structurally cannot reach an AI provider (BR-008). */

import type { Logger } from "../core/errors";
import type { ItemChangeEvent, ItemContextReader, ItemRef } from "../zotero/types";
import { chunkItemContext, type ChunkOptions } from "./chunker";
import type { RetrievalBackend } from "./types";

export type IndexState = "idle" | "indexing" | "rebuilding" | "needs-rebuild";

export interface IndexStatus {
  state: IndexState;
  queued: number;
  indexedItems: number;
  totalItems: number | null;
  lastUpdated: number | null;
  progress: { done: number; total: number } | null;
  vectorSearch: boolean;
  lastError: string | null;
}

export interface IndexManagerDeps {
  backend: RetrievalBackend;
  reader: ItemContextReader;
  listAllItems: () => Promise<ItemRef[]>;
  chunkOptions: () => ChunkOptions;
  logger: Logger;
  /** Overridable for tests; production defaults below. */
  debounceMs?: number;
  maxWaitMs?: number;
  itemDelayMs?: number;
}

/** Narrow surface the settings UI needs (S3-08) — ui/ may reach retrieval/
 * for status only, never the full RetrievalBackend (component view §3). */
export interface IndexAdmin {
  status(): IndexStatus;
  rebuild(): void;
  cancelRebuild(): void;
}

export interface IndexManager extends IndexAdmin {
  onItemEvent(event: ItemChangeEvent): void;
  subscribe(listener: (status: IndexStatus) => void): () => void;
  /** Waits for the backend's own snapshot load and refreshes cached stats;
   * safe to call multiple times. */
  load(): Promise<void>;
  dispose(): void;
}

const DEFAULT_DEBOUNCE_MS = 2000;
const DEFAULT_MAX_WAIT_MS = 30000;
const DEFAULT_ITEM_DELAY_MS = 25;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const keyOf = (ref: ItemRef) => `${ref.libraryID}:${ref.key}`;

export function createIndexManager(deps: IndexManagerDeps): IndexManager {
  const debounceMs = deps.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const maxWaitMs = deps.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const itemDelayMs = deps.itemDelayMs ?? DEFAULT_ITEM_DELAY_MS;

  const listeners = new Set<(status: IndexStatus) => void>();
  const queue = new Map<string, { ref: ItemRef; removed: boolean }>();
  let sweepPending = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let firstQueuedAt: number | null = null;
  let draining = false;
  let disposed = false;

  let state: IndexState = "idle";
  let lastUpdated: number | null = null;
  let lastError: string | null = null;
  let progress: { done: number; total: number } | null = null;
  let cachedIndexedItems = 0;
  let cachedVectorSearch = false;
  let rebuildCancelled = false;
  let rebuildRunning = false;

  function emitStatus(): void {
    const snapshot = getStatus();
    for (const listener of listeners) {
      try {
        listener(snapshot);
      } catch (error) {
        deps.logger.error("index status listener failed", error);
      }
    }
  }

  function getStatus(): IndexStatus {
    return {
      state,
      queued: queue.size,
      indexedItems: cachedIndexedItems,
      totalItems: null,
      lastUpdated,
      progress,
      vectorSearch: cachedVectorSearch,
      lastError,
    };
  }

  async function refreshCachedStats(): Promise<void> {
    try {
      const stats = await deps.backend.stats();
      cachedIndexedItems = stats.itemCount;
      cachedVectorSearch = stats.vectorSearch;
    } catch (error) {
      deps.logger.error("[index] refreshing stats failed", error);
    }
  }

  async function reconcileSweep(): Promise<void> {
    sweepPending = false;
    try {
      const [allRefs, indexedKeys] = await Promise.all([
        deps.listAllItems(),
        deps.backend.listIndexedItemKeys(),
      ]);
      const liveKeys = new Set(allRefs.map((r) => r.key));
      for (const ref of allRefs) {
        if (!queue.has(keyOf(ref))) queue.set(keyOf(ref), { ref, removed: false });
      }
      for (const indexedKey of indexedKeys) {
        if (!liveKeys.has(indexedKey)) {
          await deps.backend.removeItem(indexedKey).catch((error) => {
            deps.logger.error(`[index] sweep removeItem failed for ${indexedKey}`, error);
          });
        }
      }
    } catch (error) {
      deps.logger.error("[index] sweep reconcile failed", error);
    }
  }

  async function processOne(entry: { ref: ItemRef; removed: boolean }): Promise<void> {
    if (entry.removed) {
      await deps.backend.removeItem(entry.ref.key);
      return;
    }
    const [context] = await deps.reader.readItemContexts([entry.ref]);
    if (!context) {
      // Item no longer exists — treat as a removal.
      await deps.backend.removeItem(entry.ref.key);
      return;
    }
    const chunks = chunkItemContext(context, deps.chunkOptions());
    await deps.backend.indexItem(entry.ref.key, chunks);
  }

  async function drain(): Promise<void> {
    if (draining || disposed) return;
    draining = true;
    if (state === "idle") state = "indexing";
    emitStatus();
    try {
      if (sweepPending) await reconcileSweep();
      while (queue.size > 0 && !disposed && !rebuildRunning) {
        const [key, entry] = queue.entries().next().value as [string, { ref: ItemRef; removed: boolean }];
        queue.delete(key);
        try {
          await processOne(entry);
          lastError = null;
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          deps.logger.error(`[index] indexing item ${entry.ref.key} failed`, error);
        }
        await sleep(itemDelayMs);
      }
      await refreshCachedStats();
      lastUpdated = Date.now();
    } finally {
      draining = false;
      firstQueuedAt = null;
      if (state === "indexing") state = "idle";
      emitStatus();
    }
  }

  function scheduleDrain(): void {
    if (disposed) return;
    const now = Date.now();
    if (firstQueuedAt === null) firstQueuedAt = now;
    if (debounceTimer) clearTimeout(debounceTimer);

    const elapsed = now - firstQueuedAt;
    const delay = elapsed >= maxWaitMs ? 0 : debounceMs;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void drain();
    }, delay);
    emitStatus();
  }

  return {
    onItemEvent(event: ItemChangeEvent): void {
      if (disposed) return;
      if (event.kind === "sweep") {
        sweepPending = true;
      } else {
        queue.set(keyOf(event.ref), { ref: event.ref, removed: event.kind === "removed" });
      }
      scheduleDrain();
    },

    status: getStatus,

    subscribe(listener: (status: IndexStatus) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    rebuild(): void {
      if (rebuildRunning) return;
      rebuildRunning = true;
      rebuildCancelled = false;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      queue.clear();
      sweepPending = false;
      state = "rebuilding";
      progress = { done: 0, total: 0 };
      emitStatus();

      void (async () => {
        try {
          await deps.backend.rebuild();
          const allRefs = await deps.listAllItems();
          progress = { done: 0, total: allRefs.length };
          emitStatus();
          for (const ref of allRefs) {
            if (rebuildCancelled) break;
            try {
              await processOne({ ref, removed: false });
            } catch (error) {
              deps.logger.error(`[index] rebuild: indexing ${ref.key} failed`, error);
            }
            progress = { done: (progress?.done ?? 0) + 1, total: allRefs.length };
            emitStatus();
          }
          await refreshCachedStats();
          lastUpdated = Date.now();
          lastError = null;
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          deps.logger.error("[index] rebuild failed", error);
        } finally {
          rebuildRunning = false;
          progress = null;
          state = "idle";
          emitStatus();
        }
      })();
    },

    cancelRebuild(): void {
      rebuildCancelled = true;
    },

    async load(): Promise<void> {
      await refreshCachedStats();
      emitStatus();
    },

    dispose(): void {
      disposed = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      listeners.clear();
    },
  };
}
