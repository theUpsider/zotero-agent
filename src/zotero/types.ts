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

/** One PDF page's extracted text as the adapter hands it to the pure
 * highlight resolver (S5-01). `pageIndex` is 0-based (position coordinate
 * space); `pageLabel` is what the reader shows (e.g. "3", "iv"). */
export interface PdfPageText {
  pageIndex: number;
  pageLabel: string;
  text: string;
}

/** An existing highlight already on the PDF — user- or previously plugin-
 * created (FR-046). Text + page only; the resolver locates its span for the
 * overlap test so re-runs never double-highlight (S5-03). */
export interface ExistingHighlight {
  pageIndex: number;
  text: string;
}

/** A resolved, colored, deduplicated passage ready for the writer to draw
 * (S5-02). `text` is the exact page substring matched — the writer maps it to
 * PDF glyph rects (the only geometry step that needs Zotero). */
export interface PlannedHighlight {
  pageIndex: number;
  pageLabel: string;
  category: string;
  /** Hex color mapped from the category via the color semantics (FR-044). */
  color: string;
  text: string;
}

/** What the writer read for one item: page text to resolve quotes against and
 * the highlights already present for duplicate suppression (S5-02/S5-03). */
export interface HighlightTargets {
  pages: PdfPageText[];
  existing: ExistingHighlight[];
  /** Plugin-created zero-position note fallbacks from earlier runs. These are
   * retried as real highlights and removed only after a valid replacement is
   * saved. */
  repairable?: PlannedHighlight[];
}

/** A highlight the writer actually created, echoed back for the result
 * summary (S5-02 AC#4). `kind` is "highlight" for a real colored highlight, or
 * "note" for the committed fallback (a page-level note annotation) when a
 * passage's glyph rects could not be computed (S2-08 re-scope guard). */
export interface CreatedHighlight {
  pageIndex: number;
  pageLabel: string;
  category: string;
  color: string;
  text: string;
  kind: "highlight" | "note";
}

export interface HighlightWriteResult {
  created: CreatedHighlight[];
  /** Planned highlights that could not be drawn (e.g. glyph rects not found);
   * reported, never silently dropped (NFR-023). */
  failed: { text: string; reason: string }[];
}

/** Write seam for auto-highlighting (S5-02; FR-004, FR-044, FR-047, FR-048,
 * EIR-005). Reads the PDF's page text + existing highlights, then draws the
 * resolved passages as ordinary Zotero highlight annotations at the mapped
 * color. Runs to completion after a single user start — no per-highlight
 * prompt (FR-047). Never touches collections or item locations (EIR-006). */
export interface HighlightWriter {
  readTargets(ref: ItemRef): Promise<HighlightTargets>;
  createHighlights(ref: ItemRef, planned: PlannedHighlight[]): Promise<HighlightWriteResult>;
}

/** Write seam for subject tags (S4-05). Adds tags to an item, skipping
 * case-insensitive duplicates (FR-064); returns the tags actually added so
 * the result view can report them. Never touches collections or item
 * locations (EIR-006, NFR-022, BR-007). */
export interface TagWriter {
  addTags(ref: ItemRef, tags: string[]): Promise<{ added: string[] }>;
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
