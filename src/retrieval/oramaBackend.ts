/** RetrievalBackend over Orama (S3-01, S3-04; per the S2-09 decision doc).
 * Orama supplies BM25 fulltext, vector, and native hybrid search behind one
 * schema; this wrapper owns replace-by-itemKey semantics, the on-disk
 * snapshot (chunks in index.json, embeddings in a separate binary file), and
 * graceful keyword-only degradation when no embedder is available or an
 * embed call fails. Orama's generics make a precisely-typed wrapper
 * impractical, so the internal `db` handle is loosely typed — the public
 * RetrievalBackend surface stays fully typed. */

import { create, insertMultiple, removeMultiple, search } from "@orama/orama";
import type { Logger } from "../core/errors";
import type { FileStore } from "../zotero/types";
import type { Embedder } from "./embeddings";
import { defaultReranker, type Reranker } from "./rerank";
import {
  decodeVectors,
  encodeVectors,
  INDEX_FILE,
  parseIndexSnapshot,
  SCHEMA_VERSION,
  serializeIndexSnapshot,
  VECTORS_BIN_FILE,
  VECTORS_MANIFEST_FILE,
  type SnapshotHeader,
} from "./snapshot";
import type { IndexedChunk, IndexStats, RetrievalBackend, RetrievalQuery, RetrievalResult } from "./types";

export interface OramaBackendOptions {
  fileStore?: FileStore;
  embedder?: Embedder | null;
  rerank?: Reranker;
  logger?: Logger;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OramaDb = any;

// Orama's create() wants a schema literal typed as AnySchema; a plain
// Record<string, unknown> built at runtime doesn't structurally match its
// generic constraints, so this boundary is intentionally untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSchema(hasVector: boolean, dim: number): any {
  const schema: Record<string, unknown> = { text: "string", itemKey: "enum", source: "enum" };
  if (hasVector) schema.embedding = `vector[${dim}]`;
  return schema;
}

function toOramaDoc(chunk: IndexedChunk, vector: Float32Array | undefined): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    id: chunk.chunkId,
    chunkId: chunk.chunkId,
    text: chunk.text,
    itemKey: chunk.itemKey,
    source: chunk.source,
  };
  if (chunk.page !== undefined) doc.page = chunk.page;
  if (chunk.colorCategory !== undefined) doc.colorCategory = chunk.colorCategory;
  if (chunk.section !== undefined) doc.section = chunk.section;
  if (vector) doc.embedding = Array.from(vector);
  return doc;
}

function fromOramaDoc(doc: Record<string, unknown>): IndexedChunk {
  const chunk: IndexedChunk = {
    itemKey: String(doc.itemKey),
    source: doc.source as IndexedChunk["source"],
    text: String(doc.text),
    chunkId: String(doc.chunkId),
  };
  if (typeof doc.page === "string") chunk.page = doc.page;
  if (typeof doc.colorCategory === "string") chunk.colorCategory = doc.colorCategory;
  if (typeof doc.section === "string") chunk.section = doc.section;
  return chunk;
}

export function createOramaBackend(options: OramaBackendOptions = {}): RetrievalBackend {
  const fileStore = options.fileStore;
  const embedder = options.embedder ?? null;
  const rerank = options.rerank ?? defaultReranker;
  const logger = options.logger;

  const chunksByItem = new Map<string, IndexedChunk[]>();
  const vectorsByChunkId = new Map<string, Float32Array>();
  // Whether the live db + snapshot currently carry vectors. Distinct from
  // `embedder` presence: an embed failure or a version/model mismatch on
  // load degrades this to false even when an embedder is configured.
  let vectorSearchActive = !!embedder;
  let db: OramaDb = create({ schema: buildSchema(vectorSearchActive, embedder?.dim ?? 0) });

  function rebuildDb(): void {
    db = create({ schema: buildSchema(vectorSearchActive, embedder?.dim ?? 0) });
    const docs: Record<string, unknown>[] = [];
    for (const chunks of chunksByItem.values()) {
      for (const chunk of chunks) {
        docs.push(toOramaDoc(chunk, vectorSearchActive ? vectorsByChunkId.get(chunk.chunkId) : undefined));
      }
    }
    if (docs.length > 0) insertMultiple(db, docs);
  }

  async function embedChunks(chunks: IndexedChunk[]): Promise<void> {
    if (!embedder || !vectorSearchActive) return;
    try {
      const vectors = await embedder.embed(chunks.map((c) => c.text));
      chunks.forEach((chunk, i) => vectorsByChunkId.set(chunk.chunkId, vectors[i]!));
    } catch (error) {
      logger?.error("embedding failed; downgrading to keyword-only retrieval for this session", error);
      vectorSearchActive = false;
      vectorsByChunkId.clear();
      rebuildDb();
    }
  }

  async function load(): Promise<void> {
    if (!fileStore) return;
    const text = await fileStore.readText(INDEX_FILE);
    if (!text) return;
    const parsed = parseIndexSnapshot(text);
    if (!parsed) {
      // Corrupt or incompatible-version snapshot: discard, start empty
      // rather than throw (S3-07 — the index is a rebuildable cache).
      await fileStore.remove(INDEX_FILE).catch(() => undefined);
      await fileStore.remove(VECTORS_MANIFEST_FILE).catch(() => undefined);
      await fileStore.remove(VECTORS_BIN_FILE).catch(() => undefined);
      return;
    }
    for (const [itemKey, chunks] of Object.entries(parsed.chunksByItem)) {
      chunksByItem.set(itemKey, chunks);
    }

    const headerVector = parsed.header.vector;
    const canUseVector =
      headerVector !== null &&
      !!embedder &&
      embedder.model === headerVector.model &&
      embedder.dim === headerVector.dim;

    if (canUseVector) {
      const manifestText = await fileStore.readText(VECTORS_MANIFEST_FILE);
      const bytes = await fileStore.readBytes(VECTORS_BIN_FILE);
      let decoded: Map<string, Float32Array> | null = null;
      if (manifestText && bytes) {
        try {
          const manifest = JSON.parse(manifestText) as string[];
          decoded = decodeVectors(bytes, manifest, embedder!.dim);
        } catch {
          decoded = null;
        }
      }
      if (decoded) {
        for (const [id, vector] of decoded) vectorsByChunkId.set(id, vector);
        vectorSearchActive = true;
      } else {
        logger?.log("[index] vectors file missing or corrupted — falling back to keyword-only until rebuild");
        vectorSearchActive = false;
      }
    } else {
      // No vector header, or embedder/model/dim mismatch (schema change) —
      // keyword-only until a rebuild regenerates embeddings (BR-009).
      vectorSearchActive = false;
    }

    rebuildDb();
  }

  const ready = load();

  // Flushing happens synchronously at the end of every indexItem/removeItem
  // call — batching multiple item updates into fewer writes is the index
  // manager's job (S3-06 debounces at the queue level, one call per drained
  // batch), not the backend's. Keeping the backend's own write per call
  // atomic and immediate is what makes "persists across a restart" true
  // after every single call, which the shared contract suite relies on.
  async function flush(): Promise<void> {
    if (!fileStore) return;
    const record: Record<string, IndexedChunk[]> = {};
    for (const [itemKey, chunks] of chunksByItem) record[itemKey] = chunks;
    const header: SnapshotHeader = {
      schemaVersion: SCHEMA_VERSION,
      vector: vectorSearchActive && embedder ? { model: embedder.model, dim: embedder.dim } : null,
      savedAt: Date.now(),
    };
    await fileStore.writeText(INDEX_FILE, serializeIndexSnapshot(header, record));
    if (vectorSearchActive && embedder && vectorsByChunkId.size > 0) {
      const { manifest, bytes } = encodeVectors(vectorsByChunkId, embedder.dim);
      await fileStore.writeText(VECTORS_MANIFEST_FILE, JSON.stringify(manifest));
      await fileStore.writeBytes(VECTORS_BIN_FILE, bytes);
    }
  }

  function dropItem(itemKey: string): void {
    const previous = chunksByItem.get(itemKey);
    if (!previous) return;
    removeMultiple(
      db,
      previous.map((c) => c.chunkId),
    );
    for (const c of previous) vectorsByChunkId.delete(c.chunkId);
    chunksByItem.delete(itemKey);
  }

  return {
    async indexItem(itemKey, chunks): Promise<void> {
      await ready;
      dropItem(itemKey);
      await embedChunks(chunks);
      chunksByItem.set(itemKey, chunks);
      if (chunks.length > 0) {
        insertMultiple(
          db,
          chunks.map((chunk) => toOramaDoc(chunk, vectorSearchActive ? vectorsByChunkId.get(chunk.chunkId) : undefined)),
        );
      }
      await flush();
    },

    async removeItem(itemKey): Promise<void> {
      await ready;
      dropItem(itemKey);
      await flush();
    },

    async query(query: RetrievalQuery): Promise<RetrievalResult[]> {
      await ready;
      const limit = query.limit ?? 10;
      const where =
        query.itemKeys && query.itemKeys.length > 0 ? { itemKey: { in: query.itemKeys } } : undefined;

      const wantsVector = query.mode === "semantic" || query.mode === "hybrid";
      const useVector = wantsVector && vectorSearchActive && !!embedder;
      if (wantsVector && !useVector) {
        logger?.log("[index] embeddings unavailable — keyword-only retrieval");
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let searchParams: any;
      if (useVector && query.mode === "semantic") {
        const [vector] = await embedder!.embed([query.text]);
        searchParams = {
          mode: "vector",
          vector: { value: Array.from(vector!), property: "embedding" },
          limit,
          ...(where ? { where } : {}),
        };
      } else if (useVector && query.mode === "hybrid") {
        const [vector] = await embedder!.embed([query.text]);
        searchParams = {
          mode: "hybrid",
          term: query.text,
          vector: { value: Array.from(vector!), property: "embedding" },
          limit,
          ...(where ? { where } : {}),
        };
      } else {
        searchParams = { mode: "fulltext", term: query.text, properties: ["text"], limit, ...(where ? { where } : {}) };
      }

      const results = await search(db, searchParams);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped: RetrievalResult[] = (results.hits as any[]).map((hit) => ({
        chunk: fromOramaDoc(hit.document as Record<string, unknown>),
        score: hit.score,
      }));
      return rerank(query, mapped).slice(0, limit);
    },

    async rebuild(): Promise<void> {
      await ready;
      chunksByItem.clear();
      vectorsByChunkId.clear();
      vectorSearchActive = !!embedder;
      db = create({ schema: buildSchema(vectorSearchActive, embedder?.dim ?? 0) });
      if (fileStore) {
        await fileStore.remove(INDEX_FILE).catch(() => undefined);
        await fileStore.remove(VECTORS_MANIFEST_FILE).catch(() => undefined);
        await fileStore.remove(VECTORS_BIN_FILE).catch(() => undefined);
      }
    },

    async listIndexedItemKeys(): Promise<string[]> {
      await ready;
      return [...chunksByItem.keys()];
    },

    async stats(): Promise<IndexStats> {
      await ready;
      let chunkCount = 0;
      for (const chunks of chunksByItem.values()) chunkCount += chunks.length;
      return { itemCount: chunksByItem.size, chunkCount, vectorSearch: vectorSearchActive };
    },
  };
}
