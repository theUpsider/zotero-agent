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

/** Plugin-data-directory file access, injected into retrieval/ so the index
 * can persist without retrieval/ touching the Zotero global directly (S3-01,
 * DAR-003/004). Names are flat filenames within the plugin's own subdirectory
 * — the implementation (src/zotero/files.ts) owns path resolution. Writes
 * must be atomic (crash-safe). This is a types-only seam: retrieval/ may
 * import it from here, never from zotero/files.ts. */
export interface FileStore {
  readText(name: string): Promise<string | null>;
  writeText(name: string, text: string): Promise<void>;
  readBytes(name: string): Promise<Uint8Array | null>;
  writeBytes(name: string, bytes: Uint8Array): Promise<void>;
  remove(name: string): Promise<void>;
}

/** Notifier event surface (S3-06): plain, serializable — the Zotero
 * Notifier's item/attachment/annotation/note/tag events all resolve down to
 * a change on a top-level regular item before crossing this seam. */
export type ItemChangeEvent =
  | { kind: "changed"; ref: ItemRef }
  | { kind: "removed"; ref: ItemRef }
  /** Notifier gave no resolvable item identity (e.g. some delete payloads);
   * the index manager reconciles by re-listing all items. */
  | { kind: "sweep" };
