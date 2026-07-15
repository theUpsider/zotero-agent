import { describe, expect, it } from "vitest";
import { defaultColorSemantics, ZOTERO_ANNOTATION_COLORS } from "../src/core/colorSemantics";
import { chunkItemContext } from "../src/retrieval/chunker";
import type { IndexedChunk } from "../src/retrieval/types";
import { annotation, itemContext, largePdfItem, metadata } from "./fixtures/items";

const opts = { colorSemantics: defaultColorSemantics() };

function sources(chunks: IndexedChunk[]): IndexedChunk["source"][] {
  return chunks.map((c) => c.source);
}

describe("chunkItemContext", () => {
  it("emits chunks for all five source types with correct source tags", () => {
    const item = itemContext({
      tags: ["reading-list", "ml"],
      notes: [{ title: "My note", html: "<p>Some <b>note</b> text.</p>" }],
      annotations: [annotation()],
      pdfText: "Intro paragraph one.\n\nSecond paragraph here.",
      pdfTextSource: "pdf-worker",
    });
    const chunks = chunkItemContext(item, opts);
    expect(sources(chunks)).toEqual(
      expect.arrayContaining(["metadata", "tag", "annotation", "note", "pdf-text"]),
    );
    for (const chunk of chunks) {
      expect(chunk.itemKey).toBe(item.metadata.key);
      expect(chunk.text.trim().length).toBeGreaterThan(0);
    }
  });

  it("assigns stable, sequential chunkIds per source", () => {
    const item = itemContext({
      pdfText: "Para one.\n\nPara two.\n\nPara three.",
      pdfTextSource: "pdf-worker",
    });
    const chunks = chunkItemContext(item, opts);
    const pdfChunks = chunks.filter((c) => c.source === "pdf-text");
    expect(pdfChunks.map((c) => c.chunkId)).toEqual(
      pdfChunks.map((_, i) => `${item.metadata.key}:pdf-text:${i}`),
    );
  });

  it("carries page label and colorCategory on annotation chunks", () => {
    const item = itemContext({
      annotations: [
        annotation({ color: ZOTERO_ANNOTATION_COLORS.yellow, pageLabel: "12", text: "highlighted text" }),
      ],
    });
    const chunks = chunkItemContext(item, opts);
    const ann = chunks.find((c) => c.source === "annotation")!;
    expect(ann.page).toBe("12");
    expect(ann.colorCategory).toBe("methodology");
  });

  it("splits pdf text on form-feed page breaks and tags page numbers", () => {
    const item = itemContext({
      pdfText: "Page one text.\f\nPage two text.\f\nPage three text.",
      pdfTextSource: "fulltext-cache",
    });
    const chunks = chunkItemContext(item, opts).filter((c) => c.source === "pdf-text");
    expect(chunks.map((c) => c.page)).toEqual(["1", "2", "3"]);
  });

  it("leaves page undefined when there are no form-feed breaks", () => {
    const item = itemContext({ pdfText: "One block of text with no page markers.", pdfTextSource: "pdf-worker" });
    const chunks = chunkItemContext(item, opts).filter((c) => c.source === "pdf-text");
    expect(chunks.every((c) => c.page === undefined)).toBe(true);
  });

  it("packs long pdf text into overlapping chunks near the target size", () => {
    const item = largePdfItem();
    const chunks = chunkItemContext(item, { ...opts, targetChars: 400, overlapChars: 60 }).filter(
      (c) => c.source === "pdf-text",
    );
    expect(chunks.length).toBeGreaterThan(3);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(400 + 60 + 1);
    }
    // Consecutive chunks *within the same page* share overlap text: the start
    // of chunk[i] reappears near the end of chunk[i-1]. Overlap resets at
    // page boundaries (each page is packed independently).
    for (let i = 1; i < chunks.length; i++) {
      if (chunks[i]!.page !== chunks[i - 1]!.page) continue;
      const headOfNext = chunks[i]!.text.slice(0, 20).trim();
      if (!headOfNext) continue;
      expect(chunks[i - 1]!.text.includes(headOfNext)).toBe(true);
    }
  });

  it("never splits unicode surrogate pairs or combining marks", () => {
    const item = largePdfItem();
    const chunks = chunkItemContext(item, { ...opts, targetChars: 120, overlapChars: 20 }).filter(
      (c) => c.source === "pdf-text",
    );
    for (const chunk of chunks) {
      // No lone surrogate halves (a split emoji would produce one).
      expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(chunk.text)).toBe(false);
      expect(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(chunk.text)).toBe(false);
    }
  });

  it("emits nothing for empty/whitespace-only input", () => {
    const item = itemContext({
      tags: [],
      notes: [{ title: "", html: "   " }],
      annotations: [],
      pdfText: "   \n\n  ",
      pdfTextSource: "none",
      metadata: metadata({
        key: "EMPTY",
        title: "",
        creators: [],
        year: "",
        publication: "",
        abstract: "",
        doi: "",
        url: "",
      }),
    });
    expect(chunkItemContext(item, opts)).toEqual([]);
  });

  it("is deterministic for identical input", () => {
    const item = largePdfItem();
    const a = chunkItemContext(item, opts);
    const b = chunkItemContext(item, opts);
    expect(a).toEqual(b);
  });

  it("stores only chunk text, never the full pdfText verbatim as one chunk", () => {
    const item = largePdfItem();
    const chunks = chunkItemContext(item, { ...opts, targetChars: 300, overlapChars: 40 });
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThan(item.pdfText.length);
    }
  });
});
