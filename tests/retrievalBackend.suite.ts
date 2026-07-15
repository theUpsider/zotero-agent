/** Shared contract test suite for RetrievalBackend implementations (S3-01 AC3:
 * "a second in-memory fake backend passes the same interface test suite,
 * proves replaceability"). Run against the in-memory backend in
 * tests/memoryBackend.test.ts and against Orama in tests/oramaBackend.test.ts. */

import { describe, expect, it } from "vitest";
import type { FileStore } from "../src/zotero/types";
import type { IndexedChunk, RetrievalBackend } from "../src/retrieval/types";

export interface RetrievalBackendFactory {
  createFileStore(): FileStore;
  createBackend(fileStore: FileStore): Promise<RetrievalBackend> | RetrievalBackend;
}

function chunk(overrides: Partial<IndexedChunk> = {}): IndexedChunk {
  return {
    itemKey: "AAA",
    source: "pdf-text",
    text: "hello world",
    chunkId: "AAA:pdf-text:0",
    ...overrides,
  };
}

export function describeRetrievalBackendContract(name: string, factory: RetrievalBackendFactory): void {
  describe(`RetrievalBackend contract: ${name}`, () => {
    it("returns keyword hits containing the query term", async () => {
      const backend = await factory.createBackend(factory.createFileStore());
      await backend.indexItem("AAA", [
        chunk({ text: "the mitochondria is the powerhouse of the cell" }),
      ]);
      const results = await backend.query({ text: "mitochondria", mode: "keyword" });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.chunk.itemKey).toBe("AAA");
    });

    it("re-indexing an item replaces its previous chunks", async () => {
      const backend = await factory.createBackend(factory.createFileStore());
      await backend.indexItem("AAA", [chunk({ text: "original alphaterm content" })]);
      await backend.indexItem("AAA", [chunk({ text: "replaced betaterm content" })]);
      const alpha = await backend.query({ text: "alphaterm", mode: "keyword" });
      const beta = await backend.query({ text: "betaterm", mode: "keyword" });
      expect(alpha.filter((r) => r.chunk.itemKey === "AAA")).toHaveLength(0);
      expect(beta.filter((r) => r.chunk.itemKey === "AAA").length).toBeGreaterThan(0);
    });

    it("removeItem drops all of an item's chunks", async () => {
      const backend = await factory.createBackend(factory.createFileStore());
      await backend.indexItem("AAA", [chunk({ text: "zebraterm content" })]);
      await backend.removeItem("AAA");
      const results = await backend.query({ text: "zebraterm", mode: "keyword" });
      expect(results).toHaveLength(0);
      expect(await backend.listIndexedItemKeys()).not.toContain("AAA");
    });

    it("filters by itemKeys", async () => {
      const backend = await factory.createBackend(factory.createFileStore());
      await backend.indexItem("AAA", [
        chunk({ itemKey: "AAA", chunkId: "AAA:pdf-text:0", text: "shared shareterm alpha" }),
      ]);
      await backend.indexItem("BBB", [
        chunk({ itemKey: "BBB", chunkId: "BBB:pdf-text:0", text: "shared shareterm beta" }),
      ]);
      const results = await backend.query({ text: "shareterm", mode: "keyword", itemKeys: ["BBB"] });
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.chunk.itemKey === "BBB")).toBe(true);
    });

    it("respects limit", async () => {
      const backend = await factory.createBackend(factory.createFileStore());
      const chunks = Array.from({ length: 5 }, (_, i) =>
        chunk({ chunkId: `AAA:pdf-text:${i}`, text: `keywordterm occurrence number ${i}` }),
      );
      await backend.indexItem("AAA", chunks);
      const results = await backend.query({ text: "keywordterm", mode: "keyword", limit: 2 });
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it("listIndexedItemKeys and stats reflect indexed content", async () => {
      const backend = await factory.createBackend(factory.createFileStore());
      await backend.indexItem("AAA", [
        chunk({ text: "one" }),
        chunk({ chunkId: "AAA:pdf-text:1", text: "two" }),
      ]);
      expect(await backend.listIndexedItemKeys()).toEqual(["AAA"]);
      const stats = await backend.stats();
      expect(stats.itemCount).toBe(1);
      expect(stats.chunkCount).toBe(2);
    });

    it("rebuild drops everything", async () => {
      const backend = await factory.createBackend(factory.createFileStore());
      await backend.indexItem("AAA", [chunk({ text: "persisted term" })]);
      await backend.rebuild();
      expect(await backend.listIndexedItemKeys()).toEqual([]);
      expect((await backend.stats()).chunkCount).toBe(0);
    });

    it("persists across a simulated restart (new backend instance, same store)", async () => {
      const store = factory.createFileStore();
      const backend1 = await factory.createBackend(store);
      await backend1.indexItem("AAA", [chunk({ text: "durableterm content across restarts" })]);
      const backend2 = await factory.createBackend(store);
      const results = await backend2.query({ text: "durableterm", mode: "keyword" });
      expect(results.length).toBeGreaterThan(0);
    });

    it("recovers to an empty, working index when the snapshot is corrupted", async () => {
      const store = factory.createFileStore();
      const backend1 = await factory.createBackend(store);
      await backend1.indexItem("AAA", [chunk({ text: "will be corrupted" })]);
      await store.writeText("index.json", "{ not valid json");
      const backend2 = await factory.createBackend(store);
      expect(await backend2.listIndexedItemKeys()).toEqual([]);
      // Still usable after corruption recovery — never throws.
      await backend2.indexItem("BBB", [
        chunk({ itemKey: "BBB", chunkId: "BBB:pdf-text:0", text: "freshstart term" }),
      ]);
      const results = await backend2.query({ text: "freshstart", mode: "keyword" });
      expect(results.length).toBeGreaterThan(0);
    });
  });
}
