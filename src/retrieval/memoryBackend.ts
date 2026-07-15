/** In-memory RetrievalBackend (S3-01 AC3): proves the interface is
 * implementable by more than one backend, and doubles as the runtime
 * fallback if the Orama probe (S3-03) ever surprises us. Keyword-only
 * (simple term-frequency scoring) — no vector search. Optional FileStore
 * gives it the same persistence/rebuild contract as the Orama backend so the
 * shared test suite can exercise restart/corruption behavior against either. */

import type { FileStore } from "../zotero/types";
import {
  INDEX_FILE,
  parseIndexSnapshot,
  SCHEMA_VERSION,
  serializeIndexSnapshot,
  type SnapshotHeader,
} from "./snapshot";
import type { IndexedChunk, IndexStats, RetrievalBackend, RetrievalResult } from "./types";

export interface MemoryBackendOptions {
  fileStore?: FileStore;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Tiny term-frequency score — enough to prove keyword retrieval works and
 * to rank fixture-scale corpora sensibly; not a BM25 implementation. */
function scoreText(text: string, queryTerms: string[]): number {
  if (queryTerms.length === 0) return 0;
  const tokens = tokenize(text);
  if (tokens.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  let score = 0;
  for (const term of queryTerms) {
    const count = counts.get(term) ?? 0;
    if (count > 0) score += count / tokens.length;
  }
  return score;
}

export function createMemoryBackend(options: MemoryBackendOptions = {}): RetrievalBackend {
  const chunksByItem = new Map<string, IndexedChunk[]>();
  const fileStore = options.fileStore;

  async function load(): Promise<void> {
    if (!fileStore) return;
    const text = await fileStore.readText(INDEX_FILE);
    if (!text) return;
    const parsed = parseIndexSnapshot(text);
    if (!parsed) {
      // Corrupt or incompatible-version snapshot: discard and start empty
      // rather than throw (S3-07 — the index is a rebuildable cache).
      await fileStore.remove(INDEX_FILE).catch(() => undefined);
      return;
    }
    for (const [itemKey, chunks] of Object.entries(parsed.chunksByItem)) {
      chunksByItem.set(itemKey, chunks);
    }
  }

  const ready = load();

  async function flush(): Promise<void> {
    if (!fileStore) return;
    const header: SnapshotHeader = { schemaVersion: SCHEMA_VERSION, vector: null, savedAt: Date.now() };
    const record: Record<string, IndexedChunk[]> = {};
    for (const [itemKey, chunks] of chunksByItem) record[itemKey] = chunks;
    await fileStore.writeText(INDEX_FILE, serializeIndexSnapshot(header, record));
  }

  return {
    async indexItem(itemKey, chunks): Promise<void> {
      await ready;
      chunksByItem.set(itemKey, chunks);
      await flush();
    },

    async removeItem(itemKey): Promise<void> {
      await ready;
      chunksByItem.delete(itemKey);
      await flush();
    },

    async query(query): Promise<RetrievalResult[]> {
      await ready;
      const terms = tokenize(query.text);
      const allowed = query.itemKeys ? new Set(query.itemKeys) : null;
      const results: RetrievalResult[] = [];
      for (const [itemKey, chunks] of chunksByItem) {
        if (allowed && !allowed.has(itemKey)) continue;
        for (const chunk of chunks) {
          const score = scoreText(chunk.text, terms);
          if (score > 0) results.push({ chunk, score });
        }
      }
      results.sort((a, b) => b.score - a.score);
      return results.slice(0, query.limit ?? 10);
    },

    async rebuild(): Promise<void> {
      await ready;
      chunksByItem.clear();
      if (fileStore) await fileStore.remove(INDEX_FILE).catch(() => undefined);
    },

    async listIndexedItemKeys(): Promise<string[]> {
      await ready;
      return [...chunksByItem.keys()];
    },

    async stats(): Promise<IndexStats> {
      await ready;
      let chunkCount = 0;
      for (const chunks of chunksByItem.values()) chunkCount += chunks.length;
      return { itemCount: chunksByItem.size, chunkCount, vectorSearch: false };
    },
  };
}
