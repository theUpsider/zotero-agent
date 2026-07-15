import { describe, expect, it } from "vitest";
import { defaultColorSemantics } from "../src/core/colorSemantics";
import {
  composeFreePrompt,
  composeItemContexts,
  composeTemplatePrompt,
  truncateAtBoundary,
} from "../src/prompts/composer";
import { PROMPT_TEMPLATES } from "../src/prompts/templates";
import { annotation, itemContext, metadata } from "./fixtures/items";

const OPTIONS = { pdfTextCharBudgetPerItem: 100 };
const MAPPING = defaultColorSemantics();

describe("composeItemContexts", () => {
  it("includes metadata header, tags, and delimiter", () => {
    const { combinedText } = composeItemContexts([itemContext()], MAPPING, OPTIONS);
    expect(combinedText).toContain("=== Item: A Study of Things (KEY1) ===");
    expect(combinedText).toContain("Authors: Ada Lovelace, Alan Turing");
    expect(combinedText).toContain("Year: 2021");
    expect(combinedText).toContain("Tags: reading-list");
    expect(combinedText).toContain("Abstract: We study things.");
  });

  it("groups annotations under color-category labels from the mapping (FR-034)", () => {
    const item = itemContext({
      annotations: [
        annotation({ color: "#ffd400", text: "method bit" }),
        annotation({ color: "#5fb236", text: "result bit", pageLabel: "7" }),
      ],
    });
    const { combinedText } = composeItemContexts([item], MAPPING, OPTIONS);
    expect(combinedText).toContain("[methodology]");
    expect(combinedText).toContain('- "method bit" (p. 3)');
    expect(combinedText).toContain("[results]");
    expect(combinedText).toContain('- "result bit" (p. 7)');
  });

  it("uses a custom mapping and marks unmapped colors as uncategorized", () => {
    const item = itemContext({
      annotations: [
        annotation({ color: "#ffd400", text: "custom" }),
        annotation({ color: "#123456", text: "unmapped" }),
      ],
    });
    const custom = { "#ffd400": ["my category"] };
    const { combinedText } = composeItemContexts([item], custom, OPTIONS);
    expect(combinedText).toContain("[my category]");
    expect(combinedText).toContain("[Uncategorized (#123456)]");
  });

  it("includes annotation comments", () => {
    const item = itemContext({
      annotations: [annotation({ comment: "check this" })],
    });
    const { combinedText } = composeItemContexts([item], MAPPING, OPTIONS);
    expect(combinedText).toContain("— Comment: check this");
  });

  it("strips HTML from notes", () => {
    const item = itemContext({
      notes: [{ title: "My note", html: "<p>First <b>bold</b> point</p>" }],
    });
    const { combinedText } = composeItemContexts([item], MAPPING, OPTIONS);
    expect(combinedText).toContain("--- Note: My note ---");
    expect(combinedText).toContain("First bold point");
    expect(combinedText).not.toContain("<p>");
  });

  it("produces one delimited section per item (FR-036)", () => {
    const items = [
      itemContext({ metadata: metadata({ key: "AAA", title: "Paper A" }) }),
      itemContext({ metadata: metadata({ key: "BBB", title: "Paper B" }) }),
    ];
    const result = composeItemContexts(items, MAPPING, OPTIONS);
    expect(result.items).toHaveLength(2);
    expect(result.combinedText).toContain("=== Item: Paper A (AAA) ===");
    expect(result.combinedText).toContain("=== Item: Paper B (BBB) ===");
    expect(result.combinedText.indexOf("Paper A")).toBeLessThan(
      result.combinedText.indexOf("Paper B"),
    );
  });

  it("truncates oversized PDF text deterministically with an explicit marker", () => {
    const pdfText = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    const item = itemContext({ pdfText, pdfTextSource: "pdf-worker" });
    const first = composeItemContexts([item], MAPPING, OPTIONS);
    const second = composeItemContexts([item], MAPPING, OPTIONS);
    expect(first.combinedText).toBe(second.combinedText);
    expect(first.truncations).toHaveLength(1);
    const note = first.truncations[0]!;
    expect(note.itemKey).toBe("KEY1");
    expect(note.totalChars).toBe(pdfText.length);
    expect(note.includedChars).toBeLessThanOrEqual(100);
    expect(first.combinedText).toContain(
      `[Note: full text truncated to ${note.includedChars} of ${note.totalChars} characters]`,
    );
    // Never cuts mid-word: the included text must end at a word boundary.
    expect(first.items[0]!.contextText).not.toMatch(/word\d+[a-z]*\d*$/);
  });

  it("does not truncate PDF text within budget", () => {
    const item = itemContext({ pdfText: "short text", pdfTextSource: "pdf-worker" });
    const result = composeItemContexts([item], MAPPING, OPTIONS);
    expect(result.truncations).toHaveLength(0);
    expect(result.combinedText).toContain("Full text:\nshort text");
    expect(result.combinedText).not.toContain("truncated");
  });

  it("handles items with no annotations, notes, tags, or PDF cleanly", () => {
    const item = itemContext({ tags: [], notes: [], annotations: [], pdfText: "" });
    const { combinedText } = composeItemContexts([item], MAPPING, OPTIONS);
    expect(combinedText).toContain("=== Item:");
    expect(combinedText).not.toContain("Annotations");
    expect(combinedText).not.toContain("Notes:");
    expect(combinedText).not.toContain("Full text:");
    expect(combinedText).not.toContain("Tags:");
  });
});

describe("composeItemContexts — retrieval-augmented context (S3-05)", () => {
  const RETRIEVAL_OPTIONS = { pdfTextCharBudgetPerItem: 20000, tokenBudgetPerItem: 5 };

  it("uses retrieved passages instead of truncating when the item is indexed", () => {
    const pdfText = "word ".repeat(2000);
    const item = itemContext({ pdfText, pdfTextSource: "pdf-worker" });
    const retrievedByItem = new Map([
      [
        "KEY1",
        [
          {
            chunk: { itemKey: "KEY1", source: "pdf-text" as const, text: "the key finding", chunkId: "KEY1:pdf-text:0", page: "4" },
            score: 0.9,
          },
        ],
      ],
    ]);
    const result = composeItemContexts([item], MAPPING, { ...RETRIEVAL_OPTIONS, retrievedByItem });
    expect(result.truncations).toHaveLength(0);
    expect(result.items[0]!.contextSource).toBe("retrieval");
    expect(result.combinedText).toContain("Relevant passages (retrieved for this question):");
    expect(result.combinedText).toContain('[p. 4] "the key finding"');
    expect(result.combinedText).not.toContain("truncated");
  });

  it("falls back to char-budget truncation with a notice when the item isn't indexed", () => {
    const pdfText = "word ".repeat(2000);
    const item = itemContext({ pdfText, pdfTextSource: "pdf-worker" });
    const result = composeItemContexts([item], MAPPING, { pdfTextCharBudgetPerItem: 100, tokenBudgetPerItem: 5 });
    expect(result.truncations).toHaveLength(1);
    expect(result.items[0]!.contextSource).toBe("truncated-full-text");
  });

  it("sends the full text (no retrieval, no truncation) when it already fits the token budget", () => {
    const item = itemContext({ pdfText: "short text", pdfTextSource: "pdf-worker" });
    const result = composeItemContexts([item], MAPPING, { pdfTextCharBudgetPerItem: 20000, tokenBudgetPerItem: 5000 });
    expect(result.items[0]!.contextSource).toBe("full-text");
    expect(result.truncations).toHaveLength(0);
  });

  it("marks items with no PDF text as contextSource 'no-pdf'", () => {
    const item = itemContext({ pdfText: "" });
    const result = composeItemContexts([item], MAPPING, OPTIONS);
    expect(result.items[0]!.contextSource).toBe("no-pdf");
  });
});

describe("composeTemplatePrompt", () => {
  it("renders every predefined template with real context", () => {
    const { combinedText } = composeItemContexts([itemContext()], MAPPING, OPTIONS);
    for (const template of PROMPT_TEMPLATES) {
      const prompt = composeTemplatePrompt(template, combinedText);
      expect(prompt).toContain("=== Item: A Study of Things (KEY1) ===");
      expect(prompt).not.toContain("{{context}}");
    }
  });
});

describe("composeFreePrompt", () => {
  it("puts the user prompt before the composed context", () => {
    const prompt = composeFreePrompt("  What is the method?  ", "CONTEXT");
    expect(prompt.startsWith("What is the method?")).toBe(true);
    expect(prompt).toContain("CONTEXT");
  });
});

describe("truncateAtBoundary", () => {
  it("prefers a paragraph break when one is past half the budget", () => {
    const text = `${"a".repeat(60)}\n\n${"b".repeat(60)}`;
    expect(truncateAtBoundary(text, 100)).toBe("a".repeat(60));
  });

  it("falls back to a word boundary", () => {
    expect(truncateAtBoundary("hello world again", 13)).toBe("hello world");
  });

  it("hard-cuts when there is no boundary", () => {
    expect(truncateAtBoundary("x".repeat(50), 10)).toBe("x".repeat(10));
  });
});
