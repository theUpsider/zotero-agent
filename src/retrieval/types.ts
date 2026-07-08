/** Local retrieval backend abstraction (EIR-015..EIR-018, FR-008, FR-065..FR-079).
 * The index is a rebuildable local cache (BR-009); Zotero stays authoritative
 * (BR-010). Backend must be replaceable without touching workflows (NFR-027). */

export interface IndexedChunk {
  /** Zotero item key the chunk originates from (DAR-010). */
  itemKey: string;
  /** Source kind within the item. */
  source: "pdf-text" | "annotation" | "note" | "tag" | "metadata";
  text: string;
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

export interface RetrievalBackend {
  /** Add or update chunks for an item; called by background index updates (FR-075). */
  indexItem(itemKey: string, chunks: IndexedChunk[]): Promise<void>;
  removeItem(itemKey: string): Promise<void>;
  query(query: RetrievalQuery): Promise<RetrievalResult[]>;
  /** Drop everything; index is rebuilt from Zotero data (FR-078, FR-079). */
  rebuild(): Promise<void>;
}
