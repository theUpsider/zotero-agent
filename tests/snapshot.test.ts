import { describe, expect, it } from "vitest";
import {
  decodeVectors,
  encodeVectors,
  parseIndexSnapshot,
  SCHEMA_VERSION,
  serializeIndexSnapshot,
} from "../src/retrieval/snapshot";
import type { IndexedChunk } from "../src/retrieval/types";

describe("index snapshot round-trip", () => {
  const chunks: Record<string, IndexedChunk[]> = {
    AAA: [{ itemKey: "AAA", source: "pdf-text", text: "hello", chunkId: "AAA:pdf-text:0" }],
  };

  it("round-trips header + chunks", () => {
    const text = serializeIndexSnapshot({ schemaVersion: SCHEMA_VERSION, vector: null, savedAt: 123 }, chunks);
    const parsed = parseIndexSnapshot(text);
    expect(parsed?.header.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed?.header.savedAt).toBe(123);
    expect(parsed?.chunksByItem).toEqual(chunks);
  });

  it("round-trips a vector descriptor", () => {
    const text = serializeIndexSnapshot(
      { schemaVersion: SCHEMA_VERSION, vector: { model: "all-MiniLM-L6-v2", dim: 384 }, savedAt: 1 },
      chunks,
    );
    const parsed = parseIndexSnapshot(text);
    expect(parsed?.header.vector).toEqual({ model: "all-MiniLM-L6-v2", dim: 384 });
  });

  it("rejects invalid JSON", () => {
    expect(parseIndexSnapshot("{ not json")).toBeNull();
  });

  it("rejects a wrong schema version", () => {
    const text = JSON.stringify({ schemaVersion: 999, vector: null, savedAt: 1, chunksByItem: {} });
    expect(parseIndexSnapshot(text)).toBeNull();
  });

  it("rejects a malformed vector descriptor", () => {
    const text = JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      vector: { model: 42, dim: "nope" },
      savedAt: 1,
      chunksByItem: {},
    });
    expect(parseIndexSnapshot(text)).toBeNull();
  });

  it("rejects missing chunksByItem", () => {
    const text = JSON.stringify({ schemaVersion: SCHEMA_VERSION, vector: null, savedAt: 1 });
    expect(parseIndexSnapshot(text)).toBeNull();
  });
});

describe("vector encode/decode", () => {
  it("round-trips vectors through the flat buffer", () => {
    const vectors = new Map<string, Float32Array>([
      ["a", new Float32Array([1, 2, 3])],
      ["b", new Float32Array([4, 5, 6])],
    ]);
    const { manifest, bytes } = encodeVectors(vectors, 3);
    const decoded = decodeVectors(bytes, manifest, 3);
    expect(decoded?.get("a")).toEqual(new Float32Array([1, 2, 3]));
    expect(decoded?.get("b")).toEqual(new Float32Array([4, 5, 6]));
  });

  it("returns null when the byte length doesn't match the manifest (truncated file)", () => {
    const vectors = new Map<string, Float32Array>([["a", new Float32Array([1, 2, 3])]]);
    const { manifest, bytes } = encodeVectors(vectors, 3);
    const truncated = bytes.slice(0, bytes.length - 4);
    expect(decodeVectors(truncated, manifest, 3)).toBeNull();
  });

  it("handles a non-zero-offset view into a larger buffer", () => {
    const vectors = new Map<string, Float32Array>([["a", new Float32Array([7, 8, 9])]]);
    const { manifest, bytes } = encodeVectors(vectors, 3);
    const padded = new Uint8Array(bytes.length + 5);
    padded.set(bytes, 5);
    const view = padded.subarray(5);
    const decoded = decodeVectors(view, manifest, 3);
    expect(decoded?.get("a")).toEqual(new Float32Array([7, 8, 9]));
  });
});
