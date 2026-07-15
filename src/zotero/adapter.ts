/** Zotero adapter: the only module that talks to Zotero's JavaScript API
 * (EIR-001..EIR-006). Keeps the rest of the codebase testable without a
 * running Zotero instance. Returns only the plain serializable structures
 * from ./types — no Zotero objects leak past this module (S2-01). */

import type { Logger } from "../core/errors";
import type {
  AnnotationInfo,
  ItemContext,
  ItemContextReader,
  ItemMetadata,
  ItemRef,
  NoteInfo,
  NoteWriter,
} from "./types";

export interface SelectedItem extends ItemRef {
  title: string;
}

/** Regular items currently selected in the pane (FR-035, FR-036).
 * Attachments/notes/annotations in the selection are skipped. */
export function getSelectedItemRefs(window: _ZoteroTypes.MainWindow): SelectedItem[] {
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
        if (item.isRegularItem()) refs.push({ libraryID: item.libraryID, key: item.key });
      }
    } catch (error) {
      logger.error(`listing items in library ${library.libraryID} failed`, error);
    }
  }
  return refs;
}

/** Read annotations of an item's PDF attachments (research guide §6.4). */
export async function getItemAnnotations(item: Zotero.Item): Promise<AnnotationInfo[]> {
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
    if (result?.text) return { text: String(result.text), source: "pdf-worker" };
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
        const item = await Zotero.Items.getByLibraryAndKeyAsync(ref.libraryID, ref.key);
        if (!item) {
          logger.log(`item ${ref.libraryID}/${ref.key} no longer exists; skipping`);
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
    async createChildNote(ref: ItemRef, html: string): Promise<{ noteKey: string }> {
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
