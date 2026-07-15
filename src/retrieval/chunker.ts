/** Chunking & index content pipeline (S3-02; FR-067, DAR-009). Pure module:
 * splits one item's context into IndexedChunks for all five source types
 * (pdf-text, annotation, note, tag, metadata). Deterministic for identical
 * input; only chunk text is ever produced here — no full-document copies. */

import { categoriesForColor, type ColorSemantics } from "../core/colorSemantics";
import { stripHtml, truncateAtBoundary } from "../core/text";
import type { ItemContext } from "../zotero/types";
import type { IndexedChunk } from "./types";

export interface ChunkOptions {
  colorSemantics: ColorSemantics;
  /** Target size of a packed chunk, in characters. */
  targetChars?: number;
  /** Characters of trailing context repeated at the start of the next chunk. */
  overlapChars?: number;
}

const DEFAULT_TARGET_CHARS = 1000;
const DEFAULT_OVERLAP_CHARS = 150;

function trimmedOrUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Greedily pack paragraphs into chunks of ~targetChars, each chunk (after
 * the first) prefixed with the trailing overlapChars of its predecessor so
 * retrieval doesn't lose context at a chunk boundary. Oversized single
 * paragraphs are cut at a whitespace boundary (never mid-word/surrogate). */
function packParagraphs(paragraphs: string[], targetChars: number, overlapChars: number): string[] {
  const packed: string[] = [];
  let current = "";

  const flush = () => {
    const text = current.trim();
    if (text) packed.push(text);
    current = "";
  };

  for (let paragraph of paragraphs) {
    paragraph = paragraph.trim();
    if (!paragraph) continue;

    // An oversized paragraph starts its own chunk (flushing whatever was
    // pending) and is itself cut into whitespace-aligned pieces.
    while (paragraph.length > targetChars) {
      flush();
      const head = truncateAtBoundary(paragraph, targetChars) || paragraph.slice(0, targetChars);
      current = head;
      flush();
      paragraph = paragraph.slice(head.length).trim();
    }
    if (!paragraph) continue;

    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > targetChars && current) {
      flush();
      current = paragraph;
    } else {
      current = candidate;
    }
  }
  flush();

  if (overlapChars <= 0 || packed.length <= 1) return packed;
  const withOverlap: string[] = [packed[0]!];
  for (let i = 1; i < packed.length; i++) {
    const previous = packed[i - 1]!;
    const overlap = previous.slice(-overlapChars).trimStart();
    withOverlap.push(overlap ? `${overlap}\n\n${packed[i]}` : packed[i]!);
  }
  return withOverlap;
}

function chunkPdfText(text: string, targetChars: number, overlapChars: number): { text: string; page?: string }[] {
  if (!text.trim()) return [];
  // Zotero's full-text cache marks page breaks with form feeds; PDFWorker
  // text may not carry them, in which case everything is "page 1" of one
  // block and page numbers stay undefined below.
  const pages = text.split("\f");
  const hasPageBreaks = pages.length > 1;
  const results: { text: string; page?: string }[] = [];
  pages.forEach((pageText, pageIndex) => {
    const paragraphs = pageText.split(/\n\s*\n/);
    const chunks = packParagraphs(paragraphs, targetChars, overlapChars);
    for (const chunkText of chunks) {
      results.push({ text: chunkText, page: hasPageBreaks ? String(pageIndex + 1) : undefined });
    }
  });
  return results;
}

export function chunkItemContext(item: ItemContext, options: ChunkOptions): IndexedChunk[] {
  const targetChars = options.targetChars ?? DEFAULT_TARGET_CHARS;
  const overlapChars = options.overlapChars ?? DEFAULT_OVERLAP_CHARS;
  const itemKey = item.metadata.key;
  const chunks: IndexedChunk[] = [];
  const counters: Record<IndexedChunk["source"], number> = {
    "pdf-text": 0,
    annotation: 0,
    note: 0,
    tag: 0,
    metadata: 0,
  };
  const nextId = (source: IndexedChunk["source"]) => `${itemKey}:${source}:${counters[source]++}`;

  const m = item.metadata;
  const headerLines: string[] = [];
  if (m.title) headerLines.push(m.title);
  if (m.creators.length > 0) headerLines.push(m.creators.join(", "));
  if (m.year) headerLines.push(m.year);
  if (m.publication) headerLines.push(m.publication);
  if (m.doi) headerLines.push(`DOI: ${m.doi}`);
  if (m.abstract) headerLines.push(m.abstract);
  const metadataText = headerLines.join("\n").trim();
  if (metadataText) {
    chunks.push({ itemKey, source: "metadata", text: metadataText, chunkId: nextId("metadata") });
  }

  if (item.tags.length > 0) {
    chunks.push({
      itemKey,
      source: "tag",
      text: `Tags: ${item.tags.join(", ")}`,
      chunkId: nextId("tag"),
    });
  }

  for (const annotationInfo of item.annotations) {
    const text = annotationInfo.text || annotationInfo.comment;
    if (!text.trim()) continue;
    const parts = [text.trim()];
    if (annotationInfo.comment && annotationInfo.comment.trim() !== text.trim()) {
      parts.push(`Comment: ${annotationInfo.comment.trim()}`);
    }
    const categories = annotationInfo.color
      ? categoriesForColor(options.colorSemantics, annotationInfo.color)
      : [];
    const chunk: IndexedChunk = {
      itemKey,
      source: "annotation",
      text: parts.join("\n"),
      chunkId: nextId("annotation"),
    };
    const page = trimmedOrUndefined(annotationInfo.pageLabel);
    if (page) chunk.page = page;
    if (categories.length > 0) chunk.colorCategory = categories[0];
    chunks.push(chunk);
  }

  for (const note of item.notes) {
    const text = stripHtml(note.html);
    if (!text.trim()) continue;
    const paragraphs = text.split(/\n\s*\n/);
    const packedChunks = packParagraphs(paragraphs, targetChars, overlapChars);
    for (const chunkText of packedChunks) {
      const chunk: IndexedChunk = {
        itemKey,
        source: "note",
        text: chunkText,
        chunkId: nextId("note"),
      };
      const section = trimmedOrUndefined(note.title);
      if (section) chunk.section = section;
      chunks.push(chunk);
    }
  }

  if (item.pdfText.trim()) {
    for (const { text, page } of chunkPdfText(item.pdfText, targetChars, overlapChars)) {
      const chunk: IndexedChunk = {
        itemKey,
        source: "pdf-text",
        text,
        chunkId: nextId("pdf-text"),
      };
      if (page) chunk.page = page;
      chunks.push(chunk);
    }
  }

  return chunks;
}
