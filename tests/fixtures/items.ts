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
