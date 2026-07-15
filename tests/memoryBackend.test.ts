import { describe, expect, it } from "vitest";
import { createMemoryBackend } from "../src/retrieval/memoryBackend";
import { createFakeFileStore } from "./fixtures/fileStore";
import { describeRetrievalBackendContract } from "./retrievalBackend.suite";

describeRetrievalBackendContract("memoryBackend", {
  createFileStore: () => createFakeFileStore(),
  createBackend: (fileStore) => createMemoryBackend({ fileStore }),
});

describe("createMemoryBackend (implementation-specific)", () => {
  it("works with no FileStore at all (pure in-memory, no persistence)", async () => {
    const backend = createMemoryBackend();
    await backend.indexItem("AAA", [
      { itemKey: "AAA", source: "pdf-text", text: "no store needed", chunkId: "AAA:pdf-text:0" },
    ]);
    const results = await backend.query({ text: "store", mode: "keyword" });
    expect(results.length).toBeGreaterThan(0);
  });

  it("ranks chunks with more term occurrences higher", async () => {
    const backend = createMemoryBackend();
    await backend.indexItem("AAA", [
      { itemKey: "AAA", source: "pdf-text", text: "gene gene gene expression", chunkId: "AAA:pdf-text:0" },
      { itemKey: "AAA", source: "pdf-text", text: "gene expression once", chunkId: "AAA:pdf-text:1" },
    ]);
    const results = await backend.query({ text: "gene", mode: "keyword" });
    expect(results[0]!.chunk.chunkId).toBe("AAA:pdf-text:0");
  });

  it("reports vectorSearch: false (keyword-only)", async () => {
    const backend = createMemoryBackend();
    expect((await backend.stats()).vectorSearch).toBe(false);
  });
});
