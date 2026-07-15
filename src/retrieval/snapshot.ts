/** Pure (de)serialization for the on-disk index snapshot (S3-01, S3-07;
 * DAR-003/004/005). No file I/O here — backends inject a FileStore and use
 * these functions to turn in-memory state into bytes and back. Chunk text
 * and vectors are split across two files: `index.json` stays small text-only
 * JSON even at tens of thousands of chunks, while `vectors.bin` holds the
 * embeddings as a flat Float32Array (with an ordered chunkId manifest) so we
 * never inflate ~150MB of floats into a JSON number array. */

import type { IndexedChunk } from "./types";

export const SCHEMA_VERSION = 1;
export const INDEX_FILE = "index.json";
export const VECTORS_MANIFEST_FILE = "vectors.json";
export const VECTORS_BIN_FILE = "vectors.bin";

export interface SnapshotHeader {
  schemaVersion: number;
  /** null when the index was built keyword-only (no embedder available). A
   * mismatch between this and the running embedder is a schema mismatch —
   * rebuild is the only migration path (BR-009). */
  vector: { model: string; dim: number } | null;
  savedAt: number;
}

export interface ParsedSnapshot {
  header: SnapshotHeader;
  chunksByItem: Record<string, IndexedChunk[]>;
}

export function serializeIndexSnapshot(
  header: SnapshotHeader,
  chunksByItem: Record<string, IndexedChunk[]>,
): string {
  return JSON.stringify({ ...header, chunksByItem });
}

/** Returns null for anything that isn't a valid, current-schema snapshot —
 * callers treat null as "start empty, needs rebuild" (S3-07), never throw. */
export function parseIndexSnapshot(text: string): ParsedSnapshot | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  if (record.schemaVersion !== SCHEMA_VERSION) return null;
  if (!record.chunksByItem || typeof record.chunksByItem !== "object") return null;

  let vector: SnapshotHeader["vector"] = null;
  if (record.vector && typeof record.vector === "object") {
    const v = record.vector as Record<string, unknown>;
    if (typeof v.model === "string" && typeof v.dim === "number") {
      vector = { model: v.model, dim: v.dim };
    } else {
      return null; // malformed vector descriptor — treat whole snapshot as corrupt
    }
  }

  return {
    header: {
      schemaVersion: SCHEMA_VERSION,
      vector,
      savedAt: typeof record.savedAt === "number" ? record.savedAt : 0,
    },
    chunksByItem: record.chunksByItem as Record<string, IndexedChunk[]>,
  };
}

/** Pack per-chunk embeddings into one flat buffer + an ordered chunkId list
 * that lines up with it (vectors.json ↔ vectors.bin). */
export function encodeVectors(
  vectorsByChunkId: ReadonlyMap<string, Float32Array>,
  dim: number,
): { manifest: string[]; bytes: Uint8Array } {
  const manifest = [...vectorsByChunkId.keys()];
  const flat = new Float32Array(manifest.length * dim);
  manifest.forEach((chunkId, i) => {
    flat.set(vectorsByChunkId.get(chunkId)!.subarray(0, dim), i * dim);
  });
  return { manifest, bytes: new Uint8Array(flat.buffer) };
}

/** Returns null when the byte length doesn't match manifest.length * dim * 4
 * — a truncated/corrupt vectors.bin (S3-07 AC: never throw, discard instead). */
export function decodeVectors(
  bytes: Uint8Array,
  manifest: string[],
  dim: number,
): Map<string, Float32Array> | null {
  const expectedBytes = manifest.length * dim * 4;
  if (bytes.byteLength !== expectedBytes) return null;
  // Copy into an aligned buffer: bytes may be a view with a non-zero,
  // non-4-aligned byteOffset into a larger ArrayBuffer.
  const aligned = new Uint8Array(expectedBytes);
  aligned.set(bytes);
  const flat = new Float32Array(aligned.buffer);
  const result = new Map<string, Float32Array>();
  manifest.forEach((chunkId, i) => {
    result.set(chunkId, flat.slice(i * dim, (i + 1) * dim));
  });
  return result;
}
