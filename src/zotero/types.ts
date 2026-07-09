/** Plain serializable data shapes and seams for the Zotero adapter (S2-01).
 * Pure types only — no Zotero references — so workflows/, prompts/, and tests
 * can import them without a running Zotero instance. The adapter implements
 * ItemContextReader/NoteWriter; the orchestrator receives them injected. */

/** Item identity. Keys alone are ambiguous across libraries (EIR-002). */
export interface ItemRef {
  libraryID: number;
  key: string;
}

export interface ItemMetadata {
  key: string;
  itemType: string;
  title: string;
  creators: string[];
  year: string;
  publication: string;
  abstract: string;
  doi: string;
  url: string;
}

export interface AnnotationInfo {
  /** "highlight" | "underline" | "note" | "image" | ... */
  type: string;
  text: string;
  comment: string;
  /** Hex color like "#ffd400"; "" when unset. */
  color: string;
  /** Page label as shown in the reader; "" when unset. */
  pageLabel: string;
}

export interface NoteInfo {
  title: string;
  html: string;
}

/** Everything the prompt composer needs about one item (FR-034, DAR-001). */
export interface ItemContext {
  ref: ItemRef;
  metadata: ItemMetadata;
  tags: string[];
  notes: NoteInfo[];
  annotations: AnnotationInfo[];
  /** Extracted PDF full text; "" when no PDF or extraction failed. */
  pdfText: string;
  pdfTextSource: "pdf-worker" | "fulltext-cache" | "none";
}

export interface ItemContextReader {
  readItemContexts(refs: ItemRef[]): Promise<ItemContext[]>;
}

/** Write seam: child notes only — never collections or item locations
 * (EIR-003, EIR-004, EIR-006). */
export interface NoteWriter {
  createChildNote(ref: ItemRef, html: string): Promise<{ noteKey: string }>;
}
