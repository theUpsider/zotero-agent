/** Local retrieval backend abstraction (EIR-015..EIR-018, FR-008, FR-065..FR-079).
 * The index is a rebuildable local cache (BR-009); Zotero stays authoritative
 * (BR-010). Backend must be replaceable without touching workflows (NFR-027). */

export interface IndexedChunk {
  /** Zotero item key the chunk originates from (DAR-010). */
  itemKey: string;
  /** Source kind within the item. */
  source: "pdf-text" | "annotation" | "note" | "tag" | "metadata";
  text: string;
  /** Stable id assigned by the chunker: `${itemKey}:${source}:${n}`. Backends
   * use it as the document id so re-indexing an item replaces its chunks. */
  chunkId: string;
  /** Page label as shown in the reader ("3", "ix"); absent when unknown. */
  page?: string;
  /** First matched color category for annotation chunks (FR-034 citation). */
  colorCategory?: string;
  /** Optional structural hint (e.g. a note title) for citation display. */
  section?: string;
}

export interface RetrievalQuery {
  text: string;
  /** Restrict retrieval to specific Zotero items (paper-level analysis). */
  itemKeys?: string[];
  limit?: number;
  mode?: "semantic" | "keyword" | "hybrid";
}

export interface RetrievalResult {
  chunk: IndexedChunk;
  score: number;
}

export interface IndexStats {
  itemCount: number;
  chunkCount: number;
  /** false while running keyword-only (embedder unavailable/degraded). */
  vectorSearch: boolean;
}

export interface RetrievalBackend {
  /** Add or update chunks for an item; called by background index updates (FR-075).
   * Replaces all chunks previously stored for `itemKey`. */
  indexItem(itemKey: string, chunks: IndexedChunk[]): Promise<void>;
  removeItem(itemKey: string): Promise<void>;
  query(query: RetrievalQuery): Promise<RetrievalResult[]>;
  /** Drop everything; index is rebuilt from Zotero data (FR-078, FR-079). */
  rebuild(): Promise<void>;
  listIndexedItemKeys(): Promise<string[]>;
  stats(): Promise<IndexStats>;
}
