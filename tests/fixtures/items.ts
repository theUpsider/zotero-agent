/** Fixture builders for adapter ItemContext structures (S2-02/S2-03 tests). */

import type {
  AnnotationInfo,
  ItemContext,
  ItemMetadata,
  ItemRef,
} from "../../src/zotero/types";

export function itemRef(overrides: Partial<ItemRef> = {}): ItemRef {
  return { libraryID: 1, key: "KEY1", ...overrides };
}

export function metadata(overrides: Partial<ItemMetadata> = {}): ItemMetadata {
  return {
    key: "KEY1",
    itemType: "journalArticle",
    title: "A Study of Things",
    creators: ["Ada Lovelace", "Alan Turing"],
    year: "2021",
    publication: "Journal of Things",
    abstract: "We study things.",
    doi: "10.1000/things",
    url: "https://example.org/things",
    ...overrides,
  };
}

export function annotation(overrides: Partial<AnnotationInfo> = {}): AnnotationInfo {
  return {
    type: "highlight",
    text: "An important passage.",
    comment: "",
    color: "#ffd400",
    pageLabel: "3",
    ...overrides,
  };
}

export function itemContext(overrides: Partial<ItemContext> = {}): ItemContext {
  const key = overrides.metadata?.key ?? overrides.ref?.key ?? "KEY1";
  return {
    ref: itemRef({ key }),
    metadata: metadata({ key }),
    tags: ["reading-list"],
    notes: [],
    annotations: [annotation()],
    pdfText: "",
    pdfTextSource: "none",
    ...overrides,
  };
}

/** Multi-page fixture (form-feed page breaks, long unicode paragraph with
 * CJK + emoji + combining marks) for chunker/retrieval tests. */
export function largePdfItem(overrides: Partial<ItemContext> = {}): ItemContext {
  const paragraph = (n: number) => `Paragraph ${n} discusses the method in detail. `.repeat(20);
  const unicodeParagraph =
    "研究の背景と目的について説明する。".repeat(10) +
    " emoji test \u{1F600}\u{1F4DA} combining é test " +
    "结论与讨论。".repeat(10);
  const page1 = [paragraph(1), paragraph(2), unicodeParagraph].join("\n\n");
  const page2 = [paragraph(3), paragraph(4)].join("\n\n");
  const page3 = [paragraph(5)].join("\n\n");
  return itemContext({
    pdfText: [page1, page2, page3].join("\f"),
    pdfTextSource: "pdf-worker",
    ...overrides,
  });
}
