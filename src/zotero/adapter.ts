/** Zotero adapter: the only module that talks to Zotero's JavaScript API
 * (EIR-001..EIR-006). Keeps the rest of the codebase testable without a
 * running Zotero instance. Returns only the plain serializable structures
 * from ./types — no Zotero objects leak past this module (S2-01). */

import type { Logger } from "../core/errors";
import { mergeTags } from "../core/tags";
import type {
  AnnotationInfo,
  CreatedHighlight,
  ExistingHighlight,
  HighlightTargets,
  HighlightWriteResult,
  HighlightWriter,
  ItemContext,
  ItemContextReader,
  ItemMetadata,
  ItemRef,
  NoteInfo,
  NoteWriter,
  PdfPageText,
  PlannedHighlight,
  TagWriter,
} from "./types";

export interface SelectedItem extends ItemRef {
  title: string;
}

/** Regular items currently selected in the pane (FR-035, FR-036).
 * Attachments/notes/annotations in the selection are skipped. */
export function getSelectedItemRefs(
  window: _ZoteroTypes.MainWindow,
): SelectedItem[] {
  const items = window.ZoteroPane.getSelectedItems();
  return items
    .filter((item) => item.isRegularItem())
    .map((item) => ({
      libraryID: item.libraryID,
      key: item.key,
      title: String(item.getField("title") ?? ""),
    }));
}

/** Every top-level regular item across all libraries (S3-06/S3-07: full
 * index rebuild, and sweep-reconcile after an unresolvable notifier event). */
export async function listAllItemRefs(logger: Logger): Promise<ItemRef[]> {
  const refs: ItemRef[] = [];
  for (const library of Zotero.Libraries.getAll()) {
    try {
      const items = await Zotero.Items.getAll(library.libraryID, true);
      for (const item of items) {
        if (item.isRegularItem())
          refs.push({ libraryID: item.libraryID, key: item.key });
      }
    } catch (error) {
      logger.error(
        `listing items in library ${library.libraryID} failed`,
        error,
      );
    }
  }
  return refs;
}

/** Read annotations of an item's PDF attachments (research guide §6.4). */
export async function getItemAnnotations(
  item: Zotero.Item,
): Promise<AnnotationInfo[]> {
  const annotations: AnnotationInfo[] = [];
  const attachmentIDs = item.isAttachment() ? [item.id] : item.getAttachments();
  for (const id of attachmentIDs) {
    const attachment = Zotero.Items.get(id);
    if (!attachment.isPDFAttachment()) continue;
    for (const annotation of attachment.getAnnotations()) {
      annotations.push({
        type: String(annotation.annotationType ?? ""),
        text: annotation.annotationText ?? "",
        comment: annotation.annotationComment ?? "",
        color: annotation.annotationColor ?? "",
        pageLabel: annotation.annotationPageLabel ?? "",
      });
    }
  }
  return annotations;
}

const CREATOR_FIELDS = ["firstName", "lastName"] as const;

function readMetadata(item: Zotero.Item): ItemMetadata {
  const field = (name: Parameters<Zotero.Item["getField"]>[0]) =>
    String(item.getField(name) ?? "");
  let itemType = "";
  try {
    itemType = Zotero.ItemTypes.getName(item.itemTypeID) || "";
  } catch {
    // Unknown type id: leave empty rather than fail the whole read.
  }
  const creators = item.getCreators().map((creator) =>
    CREATOR_FIELDS.map((part) => creator[part] ?? "")
      .join(" ")
      .trim(),
  );
  return {
    key: item.key,
    itemType,
    title: field("title"),
    creators: creators.filter((name) => name.length > 0),
    year: field("date").slice(0, 4).replace(/\D.*/, ""),
    publication: field("publicationTitle"),
    abstract: field("abstractNote"),
    doi: field("DOI"),
    url: field("url"),
  };
}

function readNotes(item: Zotero.Item): NoteInfo[] {
  return item.getNotes().map((noteID) => {
    const note = Zotero.Items.get(noteID);
    return {
      title: note.getNoteTitle() ?? "",
      html: note.getNote() ?? "",
    };
  });
}

/** Full text of the first PDF attachment. PDFWorker first (research guide
 * points at it for on-demand extraction), full-text cache as fallback; both
 * failing yields "" — never an error (S2-01 AC#2). */
async function readPdfText(
  item: Zotero.Item,
  logger: Logger,
): Promise<{ text: string; source: ItemContext["pdfTextSource"] }> {
  const attachmentID = item
    .getAttachments()
    .find((id) => Zotero.Items.get(id)?.isPDFAttachment());
  if (attachmentID === undefined) return { text: "", source: "none" };

  try {
    const result = await Zotero.PDFWorker.getFullText(attachmentID, null);
    if (result?.text)
      return { text: String(result.text), source: "pdf-worker" };
  } catch (error) {
    logger.error("PDFWorker full-text extraction failed", error);
  }

  try {
    const attachment = Zotero.Items.get(attachmentID);
    const cacheFile = Zotero.Fulltext.getItemCacheFile(attachment);
    if (cacheFile?.exists()) {
      const text = String(await Zotero.File.getContentsAsync(cacheFile.path));
      if (text) return { text, source: "fulltext-cache" };
    }
  } catch (error) {
    logger.error("full-text cache read failed", error);
  }

  return { text: "", source: "none" };
}

export function createItemContextReader(logger: Logger): ItemContextReader {
  return {
    async readItemContexts(refs: ItemRef[]): Promise<ItemContext[]> {
      const contexts: ItemContext[] = [];
      for (const ref of refs) {
        const item = await Zotero.Items.getByLibraryAndKeyAsync(
          ref.libraryID,
          ref.key,
        );
        if (!item) {
          logger.log(
            `item ${ref.libraryID}/${ref.key} no longer exists; skipping`,
          );
          continue;
        }
        const pdf = await readPdfText(item, logger);
        contexts.push({
          ref,
          metadata: readMetadata(item),
          tags: item.getTags().map((tag) => tag.tag),
          notes: readNotes(item),
          annotations: await getItemAnnotations(item),
          pdfText: pdf.text,
          pdfTextSource: pdf.source,
        });
      }
      return contexts;
    },
  };
}

/** Child-note writer (S2-06). Creates a regular Zotero note — no proprietary
 * format (FR-056) — attached to the originating item (EIR-004, DAR-010).
 * Never touches collections or item locations (EIR-006). */
export function createNoteWriter(logger: Logger): NoteWriter {
  return {
    async createChildNote(
      ref: ItemRef,
      html: string,
    ): Promise<{ noteKey: string }> {
      const note = new Zotero.Item("note");
      note.libraryID = ref.libraryID;
      note.setNote(html);
      note.parentKey = ref.key;
      await note.saveTx();
      logger.log(`note ${note.key} created under item ${ref.key}`);
      return { noteKey: note.key };
    },
  };
}

/** Highlight writer (S5-02; FR-004, FR-044, FR-047, FR-048, EIR-005).
 *
 * Read side: per-page PDF text (so the pure resolver can locate quotes) plus
 * the highlights already present (so re-runs and user work are never
 * double-highlighted, FR-046). Write side: draw each resolved passage as an
 * ordinary Zotero highlight annotation at the mapped color via the documented
 * `Zotero.Annotations.saveFromJSON` path (S2-08). Rects come from the PDF's
 * glyph geometry. The writer opens a temporary background reader when needed,
 * and reports a placement failure rather than creating a misleading zero-area
 * note. Every write is per-passage try/caught: a failure mid-run leaves the
 * already-created annotations valid and reports the rest (NFR-023). */

/** Loose view of the open reader's structured-text extraction. This internal
 * API is cast defensively so signature drift becomes an explicit per-passage
 * placement failure instead of producing an invalid annotation. */
interface ReaderChar {
  c: string;
  inlineRect?: [number, number, number, number];
  rect?: [number, number, number, number];
  ignorable?: boolean;
  spaceAfter?: boolean;
  lineBreakAfter?: boolean;
  paragraphBreakAfter?: boolean;
}

interface ReaderPageData {
  chars?: ReaderChar[];
  viewBox?: [number, number, number, number];
}

interface GeometryReader {
  itemID: number;
  _initPromise?: Promise<unknown>;
  _waitForReader?: () => Promise<void>;
  close?: () => void;
  _internalReader?: {
    _primaryView?: {
      _pdfPages?: Record<number, ReaderPageData>;
      _iframeWindow?: {
        PDFViewerApplication?: {
          pdfDocument?: {
            getPageData?: (arg: {
              pageIndex: number;
            }) => Promise<ReaderPageData>;
          };
        };
      };
    };
  };
}

interface ReaderManager {
  _readers?: GeometryReader[];
  open?: (
    itemID: number,
    location?: unknown,
    options?: { openInBackground?: boolean },
  ) => Promise<GeometryReader | undefined>;
}

/** Acquire character geometry without requiring the user to have opened the
 * PDF first. A temporary background reader is closed by the caller after all
 * highlights have been positioned; an existing reader is always left alone. */
async function acquireGeometryReader(
  attachmentID: number,
): Promise<{ reader: GeometryReader | null; temporary: boolean }> {
  const manager = Zotero.Reader as unknown as ReaderManager;
  const existing = manager._readers?.find(
    (candidate) => candidate.itemID === attachmentID,
  );
  if (existing) {
    await existing._initPromise;
    await existing._waitForReader?.();
    return { reader: existing, temporary: false };
  }
  if (typeof manager.open !== "function")
    return { reader: null, temporary: false };
  const opened = await manager.open(attachmentID, undefined, {
    openInBackground: true,
  });
  const reader =
    opened ??
    manager._readers?.find((candidate) => candidate.itemID === attachmentID);
  if (!reader) return { reader: null, temporary: false };
  await reader._initPromise;
  await reader._waitForReader?.();
  return { reader, temporary: true };
}

/** Split full text into per-page text on the form-feed page delimiter Zotero's
 * extractor inserts; a build that returns a single blob yields one page. */
function splitPages(fullText: string): PdfPageText[] {
  const parts = fullText.includes("\f") ? fullText.split("\f") : [fullText];
  return parts.map((text, pageIndex) => ({
    pageIndex,
    pageLabel: String(pageIndex + 1),
    text,
  }));
}

function firstPdfAttachmentID(item: Zotero.Item): number | undefined {
  if (item.isPDFAttachment()) return item.id;
  return item
    .getAttachments()
    .find((id) => Zotero.Items.get(id)?.isPDFAttachment());
}

/** Open the first PDF attachment of an item in the foreground reader (FR-004
 * convenience: when the user triggers "Highlight paper", the PDF opens so they
 * can watch highlights appear). Returns true when the reader was opened. */
export async function openPdfAttachment(
  ref: ItemRef,
  logger: Logger,
): Promise<boolean> {
  try {
    const item = await Zotero.Items.getByLibraryAndKeyAsync(
      ref.libraryID,
      ref.key,
    );
    if (!item) return false;
    const attachmentID = firstPdfAttachmentID(item);
    if (attachmentID === undefined) return false;
    const manager = Zotero.Reader as unknown as ReaderManager;
    if (typeof manager.open !== "function") return false;
    await manager.open(attachmentID, undefined, { openInBackground: false });
    return true;
  } catch (error) {
    logger.error(`opening PDF reader failed for item ${ref.key}`, error);
    return false;
  }
}

/** Read existing highlight annotations as {pageIndex, text}. pageIndex is read
 * from the annotation's stored position (authoritative), text from
 * annotationText. */
function readExistingHighlights(attachment: Zotero.Item): ExistingHighlight[] {
  const existing: ExistingHighlight[] = [];
  for (const annotation of attachment.getAnnotations()) {
    if (String(annotation.annotationType ?? "") !== "highlight") continue;
    const text = annotation.annotationText ?? "";
    if (!text) continue;
    let pageIndex = 0;
    try {
      const position = JSON.parse(annotation.annotationPosition ?? "{}") as {
        pageIndex?: number;
        rects?: number[][];
      };
      if (typeof position.pageIndex === "number")
        pageIndex = position.pageIndex;
      if (!validRects(position.rects)) continue;
    } catch {
      // Malformed position: fall back to page 0; overlap test still helps.
    }
    existing.push({ pageIndex, text });
  }
  return existing;
}

function validRects(
  rects: unknown,
): rects is [number, number, number, number][] {
  return (
    Array.isArray(rects) &&
    rects.length > 0 &&
    rects.every(
      (rect) =>
        Array.isArray(rect) &&
        rect.length === 4 &&
        rect.every(
          (value) => typeof value === "number" && Number.isFinite(value),
        ) &&
        rect[2]! > rect[0]! &&
        rect[3]! > rect[1]!,
    )
  );
}

function readRepairableFallbacks(attachment: Zotero.Item): PlannedHighlight[] {
  const repairable: PlannedHighlight[] = [];
  for (const annotation of attachment.getAnnotations()) {
    if (String(annotation.annotationType ?? "") !== "note") continue;
    const match = /^\[([^\]]+)]\s+([\s\S]+)$/.exec(
      annotation.annotationComment ?? "",
    );
    if (!match) continue;
    try {
      const position = JSON.parse(annotation.annotationPosition ?? "{}") as {
        pageIndex?: number;
        rects?: number[][];
      };
      if (typeof position.pageIndex !== "number" || validRects(position.rects))
        continue;
      repairable.push({
        pageIndex: position.pageIndex,
        pageLabel:
          annotation.annotationPageLabel ?? String(position.pageIndex + 1),
        category: match[1] as string,
        color: annotation.annotationColor ?? "#ffd400",
        text: match[2] as string,
      });
    } catch {
      // Malformed third-party note position: not one of our repair candidates.
    }
  }
  return repairable;
}

/** Union the glyph rects of `text` on `pageIndex` into per-line highlight rects
 * (S2-08 strategy step 3). Returns null when the glyphs can't be obtained or
 * the text can't be located; the caller reports a placement failure. */
async function computeRects(
  reader: GeometryReader,
  pageIndex: number,
  text: string,
  logger: Logger,
): Promise<{
  rects: [number, number, number, number][];
  offset: number;
  top: number;
} | null> {
  let pageData: ReaderPageData | undefined;
  try {
    const view = reader._internalReader?._primaryView;
    pageData = view?._pdfPages?.[pageIndex];
    if (!pageData?.chars) {
      const getPageData =
        view?._iframeWindow?.PDFViewerApplication?.pdfDocument?.getPageData;
      if (typeof getPageData !== "function") return null;
      pageData = await getPageData.call(
        view?._iframeWindow?.PDFViewerApplication?.pdfDocument,
        { pageIndex },
      );
    }
  } catch (error) {
    logger.error("PDF reader character extraction failed", error);
    return null;
  }
  const chars = pageData?.chars;
  if (!chars?.length) return null;
  const source = readerText(chars);
  const needle = normalizedReaderText(
    text,
    [...text].map((_, index) => index),
  );
  const at = source.text.indexOf(needle.text);
  if (at === -1) return null;
  const start = source.charMap[at];
  const end = source.charMap[at + needle.text.length - 1];
  if (start === undefined || end === undefined) return null;
  const rects = unionLineRects(chars.slice(start, end + 1));
  if (rects.length === 0) return null;
  const viewBox = pageData?.viewBox;
  const top = viewBox
    ? Math.max(
        0,
        viewBox[3] - viewBox[1] - Math.max(...rects.map((rect) => rect[3])),
      )
    : Math.max(0, rects[0]![3]);
  return { rects, offset: start, top };
}

function readerText(chars: ReaderChar[]): { text: string; charMap: number[] } {
  const raw: string[] = [];
  const sourceMap: number[] = [];
  chars.forEach((char, index) => {
    if (!char.ignorable) {
      for (const c of char.c) {
        raw.push(c);
        sourceMap.push(index);
      }
      if (char.spaceAfter || char.lineBreakAfter || char.paragraphBreakAfter) {
        raw.push(" ");
        sourceMap.push(index);
      }
    }
  });
  return normalizedReaderText(raw.join(""), sourceMap);
}

function normalizedReaderText(
  original: string,
  sourceMap: number[],
): { text: string; charMap: number[] } {
  const out: string[] = [];
  const charMap: number[] = [];
  let previousSpace = false;
  for (let index = 0; index < original.length; index++) {
    const char = original[index] as string;
    if (char === "­" || /^[()[\]{}"'`]$/.test(char)) continue;
    if (/[-‐‑‒–—−]/.test(char) && /\s/.test(original[index + 1] ?? "")) {
      while (/\s/.test(original[index + 1] ?? "")) index++;
      continue;
    }
    if (/\s/.test(char)) {
      if (previousSpace || out.length === 0) continue;
      out.push(" ");
      charMap.push(sourceMap[index] as number);
      previousSpace = true;
      continue;
    }
    previousSpace = false;
    const canonical =
      (
        {
          "‐": "-",
          "‑": "-",
          "‒": "-",
          "–": "-",
          "—": "-",
          "−": "-",
        } as Record<string, string>
      )[char] ?? char.toLowerCase();
    for (const expanded of canonical) {
      out.push(expanded);
      charMap.push(sourceMap[index] as number);
    }
  }
  return { text: out.join("").trimEnd(), charMap };
}

/** Group reader chars into exact per-line rects. */
function unionLineRects(
  chars: ReaderChar[],
): [number, number, number, number][] {
  const lines: [number, number, number, number][] = [];
  let line: [number, number, number, number] | null = null;
  for (const char of chars) {
    const rect = char.inlineRect ?? char.rect;
    if (rect) {
      line = line
        ? [
            Math.min(line[0], rect[0]),
            Math.min(line[1], rect[1]),
            Math.max(line[2], rect[2]),
            Math.max(line[3], rect[3]),
          ]
        : [...rect];
    }
    if (char.lineBreakAfter && line) {
      lines.push(line);
      line = null;
    }
  }
  if (line) lines.push(line);
  return lines.filter((rect) => validRects([rect]));
}

/** Zero-padded "ppppp|oooooo|ttttt" sort index the reader uses for ordering. */
function sortIndex(pageIndex: number, offset: number, top: number): string {
  const p = String(pageIndex).padStart(5, "0");
  const o = String(Math.max(0, Math.round(offset))).padStart(6, "0");
  const t = String(Math.max(0, Math.round(top))).padStart(5, "0");
  return `${p}|${o}|${t}`;
}

export function createHighlightWriter(logger: Logger): HighlightWriter {
  return {
    async readTargets(ref: ItemRef): Promise<HighlightTargets> {
      const item = await Zotero.Items.getByLibraryAndKeyAsync(
        ref.libraryID,
        ref.key,
      );
      if (!item) return { pages: [], existing: [] };
      const attachmentID = firstPdfAttachmentID(item);
      if (attachmentID === undefined) return { pages: [], existing: [] };
      const attachment = Zotero.Items.get(attachmentID);

      let pages: PdfPageText[] = [];
      try {
        const result = await Zotero.PDFWorker.getFullText(attachmentID, null);
        if (result?.text) pages = splitPages(String(result.text));
      } catch (error) {
        logger.error(
          "PDFWorker full-text extraction failed for highlighting",
          error,
        );
      }
      return {
        pages,
        existing: readExistingHighlights(attachment),
        repairable: readRepairableFallbacks(attachment),
      };
    },

    async createHighlights(
      ref: ItemRef,
      planned: PlannedHighlight[],
    ): Promise<HighlightWriteResult> {
      const created: CreatedHighlight[] = [];
      const failed: { text: string; reason: string }[] = [];
      const item = await Zotero.Items.getByLibraryAndKeyAsync(
        ref.libraryID,
        ref.key,
      );
      const attachmentID = item ? firstPdfAttachmentID(item) : undefined;
      if (attachmentID === undefined) {
        return {
          created,
          failed: planned.map((p) => ({
            text: p.text,
            reason: "no PDF attachment",
          })),
        };
      }
      const attachment = Zotero.Items.get(attachmentID);
      // Zotero 9 requires callers to provide a unique object key. Other
      // generated fields are still filled by saveFromJSON, so call through a
      // loose view matching that runtime contract.
      const annotations = Zotero.Annotations as unknown as {
        saveFromJSON(
          att: Zotero.Item,
          json: Record<string, unknown>,
        ): Promise<Zotero.Item>;
      };

      let geometry: { reader: GeometryReader | null; temporary: boolean };
      try {
        geometry = await acquireGeometryReader(attachmentID);
      } catch (error) {
        logger.error(`opening PDF reader failed for item ${ref.key}`, error);
        return {
          created,
          failed: planned.map((highlight) => ({
            text: highlight.text,
            reason: `PDF coordinates unavailable: ${toWriteError(error)}`,
          })),
        };
      }

      try {
        for (const highlight of planned) {
          try {
            const fallback = attachment.getAnnotations().find((annotation) => {
              if (String(annotation.annotationType ?? "") !== "note")
                return false;
              if (
                (annotation.annotationComment ?? "") !==
                `[${highlight.category}] ${highlight.text}`
              )
                return false;
              try {
                const position = JSON.parse(
                  annotation.annotationPosition ?? "{}",
                ) as { rects?: number[][] };
                return !validRects(position.rects);
              } catch {
                return false;
              }
            });
            const match = geometry.reader
              ? await computeRects(
                  geometry.reader,
                  highlight.pageIndex,
                  highlight.text,
                  logger,
                )
              : null;
            if (match) {
              const key = Zotero.Utilities.generateObjectKey();
              await annotations.saveFromJSON(attachment, {
                key,
                type: "highlight",
                color: highlight.color,
                text: highlight.text,
                pageLabel: highlight.pageLabel,
                sortIndex: sortIndex(
                  highlight.pageIndex,
                  match.offset,
                  match.top,
                ),
                position: {
                  pageIndex: highlight.pageIndex,
                  rects: match.rects,
                },
              });
              created.push({ ...highlight, kind: "highlight" });
              if (fallback) {
                try {
                  await fallback.eraseTx();
                } catch (error) {
                  logger.error(
                    "replacement highlight saved but old fallback note could not be removed",
                    error,
                  );
                }
              }
            } else {
              failed.push({
                text: highlight.text,
                reason: "PDF coordinates unavailable for the matched passage",
              });
            }
          } catch (error) {
            logger.error(
              `creating highlight failed for item ${ref.key}`,
              error,
            );
            failed.push({ text: highlight.text, reason: toWriteError(error) });
          }
        }
      } finally {
        if (geometry.temporary) geometry.reader?.close?.();
      }
      logger.log(
        `created ${created.length} positioned highlight annotation(s) on item ${ref.key}; ` +
          `${failed.length} could not be placed`,
      );
      return { created, failed };
    },
  };
}

function toWriteError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Tag writer (S4-05). Writes suggested tags straight onto the item after the
 * workflow starts — no per-tag confirmation (FR-059, FR-062, FR-063, BR-003).
 * Case-insensitive duplicates are dropped before writing (FR-064, NFR-020) so
 * a re-run adds nothing new; never touches collections (EIR-006, NFR-022). */
export function createTagWriter(logger: Logger): TagWriter {
  return {
    async addTags(ref: ItemRef, tags: string[]): Promise<{ added: string[] }> {
      const item = await Zotero.Items.getByLibraryAndKeyAsync(
        ref.libraryID,
        ref.key,
      );
      if (!item) {
        logger.log(
          `item ${ref.libraryID}/${ref.key} no longer exists; no tags written`,
        );
        return { added: [] };
      }
      const existing = item.getTags().map((tag) => tag.tag);
      const { added } = mergeTags(existing, tags);
      if (added.length === 0) return { added: [] };
      for (const tag of added) item.addTag(tag);
      await item.saveTx();
      logger.log(`added ${added.length} tag(s) to item ${ref.key}`);
      return { added };
    },
  };
}
