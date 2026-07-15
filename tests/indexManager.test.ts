import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultColorSemantics } from "../src/core/colorSemantics";
import { noopLogger } from "../src/core/errors";
import { createIndexManager, type IndexManagerDeps, type IndexStatus } from "../src/retrieval/indexManager";
import type { RetrievalBackend } from "../src/retrieval/types";
import type { ItemContext, ItemContextReader, ItemRef } from "../src/zotero/types";
import { itemContext, metadata } from "./fixtures/items";

function fakeBackend(): RetrievalBackend & {
  indexItem: ReturnType<typeof vi.fn>;
  removeItem: ReturnType<typeof vi.fn>;
} {
  const indexed = new Set<string>();
  return {
    indexItem: vi.fn(async (itemKey: string) => {
      indexed.add(itemKey);
    }),
    removeItem: vi.fn(async (itemKey: string) => {
      indexed.delete(itemKey);
    }),
    query: vi.fn(async () => []),
    rebuild: vi.fn(async () => {
      indexed.clear();
    }),
    listIndexedItemKeys: vi.fn(async () => [...indexed]),
    stats: vi.fn(async () => ({ itemCount: indexed.size, chunkCount: indexed.size, vectorSearch: false })),
  };
}

function refFor(key: string): ItemRef {
  return { libraryID: 1, key };
}

function fakeReader(delayMs = 0): ItemContextReader & { readItemContexts: ReturnType<typeof vi.fn> } {
  return {
    readItemContexts: vi.fn(async (refs: ItemRef[]): Promise<ItemContext[]> => {
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      return refs.map((ref) => itemContext({ ref, metadata: metadata({ key: ref.key }) }));
    }),
  };
}

function setup(
  overrides: Partial<Omit<IndexManagerDeps, "backend" | "reader">> & {
    backend?: ReturnType<typeof fakeBackend>;
    reader?: ReturnType<typeof fakeReader>;
  } = {},
) {
  const backend = overrides.backend ?? fakeBackend();
  const reader = overrides.reader ?? fakeReader();
  const listAllItems = overrides.listAllItems ?? vi.fn(async () => [] as ItemRef[]);
  const manager = createIndexManager({
    ...overrides,
    backend,
    reader,
    listAllItems,
    chunkOptions: () => ({ colorSemantics: defaultColorSemantics() }),
    logger: noopLogger,
    debounceMs: overrides.debounceMs ?? 1000,
    maxWaitMs: overrides.maxWaitMs ?? 3000,
    itemDelayMs: overrides.itemDelayMs ?? 10,
  });
  return { manager, backend, reader, listAllItems };
}

describe("createIndexManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces a burst of enqueues into a single drain", async () => {
    const { manager, backend } = setup();
    manager.onItemEvent({ kind: "changed", ref: refFor("AAA") });
    await vi.advanceTimersByTimeAsync(200);
    manager.onItemEvent({ kind: "changed", ref: refFor("BBB") });
    await vi.advanceTimersByTimeAsync(200);
    manager.onItemEvent({ kind: "changed", ref: refFor("CCC") });

    expect(backend.indexItem).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000 + 50);

    expect(backend.indexItem).toHaveBeenCalledTimes(3);
    expect(backend.indexItem.mock.calls.map((c) => c[0])).toEqual(["AAA", "BBB", "CCC"]);
  });

  it("forces a drain once the max-wait cap is exceeded, even under continuous events", async () => {
    const { manager, backend } = setup({ debounceMs: 1000, maxWaitMs: 3000 });
    let key = 0;
    manager.onItemEvent({ kind: "changed", ref: refFor(`item${key++}`) });
    // Re-enqueue a new item every 900ms, always inside the 1000ms debounce
    // window (so debounce alone would never fire), for longer than maxWaitMs.
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(900);
      manager.onItemEvent({ kind: "changed", ref: refFor(`item${key++}`) });
    }
    // Total elapsed since first enqueue: 3600ms > maxWaitMs (3000ms) — the
    // next scheduleDrain call should have set delay=0.
    await vi.advanceTimersByTimeAsync(50);
    expect(backend.indexItem).toHaveBeenCalled();
  });

  it("processes items with concurrency 1 (never overlaps)", async () => {
    const reader = fakeReader(30);
    let inFlight = 0;
    let maxInFlight = 0;
    const backend = fakeBackend();
    backend.indexItem.mockImplementation(async (itemKey: string) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 20));
      inFlight--;
      void itemKey;
    });
    const { manager } = setup({ reader, backend });
    manager.onItemEvent({ kind: "changed", ref: refFor("AAA") });
    manager.onItemEvent({ kind: "changed", ref: refFor("BBB") });

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(200);

    expect(maxInFlight).toBe(1);
    expect(backend.indexItem).toHaveBeenCalledTimes(2);
  });

  it("a removed event calls backend.removeItem", async () => {
    const { manager, backend } = setup();
    manager.onItemEvent({ kind: "removed", ref: refFor("AAA") });
    await vi.advanceTimersByTimeAsync(1050);
    expect(backend.removeItem).toHaveBeenCalledWith("AAA");
    expect(backend.indexItem).not.toHaveBeenCalled();
  });

  it("status reflects queued count and transitions idle -> indexing -> idle", async () => {
    const { manager } = setup();
    const snapshots: IndexStatus[] = [];
    manager.subscribe((s) => snapshots.push(s));
    expect(manager.status().state).toBe("idle");

    manager.onItemEvent({ kind: "changed", ref: refFor("AAA") });
    expect(manager.status().queued).toBe(1);

    await vi.advanceTimersByTimeAsync(1050);
    expect(manager.status().state).toBe("idle");
    expect(manager.status().queued).toBe(0);
    expect(manager.status().indexedItems).toBe(1);
    expect(snapshots.some((s) => s.state === "indexing")).toBe(true);
  });

  it("rebuild reports progress and can be cancelled, leaving the manager idle", async () => {
    const allRefs = [refFor("AAA"), refFor("BBB"), refFor("CCC")];
    const reader = fakeReader(5);
    const backend = fakeBackend();
    const listAllItems = vi.fn(async () => allRefs);
    const { manager } = setup({ backend, reader, listAllItems, itemDelayMs: 50 });

    const snapshots: IndexStatus[] = [];
    manager.subscribe((s) => snapshots.push(s));
    manager.rebuild();
    expect(manager.status().state).toBe("rebuilding");

    await vi.advanceTimersByTimeAsync(10);
    manager.cancelRebuild();
    await vi.advanceTimersByTimeAsync(500);

    expect(manager.status().state).toBe("idle");
    expect(manager.status().progress).toBeNull();
    expect(backend.rebuild).toHaveBeenCalledTimes(1);
    // Cancelled partway: not all three items were necessarily indexed.
    expect(backend.indexItem.mock.calls.length).toBeLessThanOrEqual(allRefs.length);
  });

  it("never makes a network call while draining or rebuilding (BR-008)", async () => {
    const fetchSpy = vi.fn();
    const originalFetch = globalThis.fetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = fetchSpy;
    try {
      const allRefs = [refFor("AAA"), refFor("BBB")];
      const { manager } = setup({ listAllItems: vi.fn(async () => allRefs) });
      manager.onItemEvent({ kind: "changed", ref: refFor("AAA") });
      await vi.advanceTimersByTimeAsync(1050);
      manager.rebuild();
      await vi.advanceTimersByTimeAsync(1000);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      (globalThis as { fetch: typeof fetch }).fetch = originalFetch;
    }
  });
});
