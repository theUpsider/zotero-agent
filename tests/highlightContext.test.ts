import { describe, expect, it } from "vitest";
import {
  HIGHLIGHT_COMPLETION_TOKENS,
  HIGHLIGHT_WINDOW_OVERLAP_CHARS,
  calculateHighlightRequestBudget,
  createHighlightTextWindows,
  effectiveHighlightContextTokens,
  rankHighlightWindows,
  serializeHighlightPages,
  splitHighlightWindow,
} from "../src/workflows/highlightContext";
import type { PdfPageText } from "../src/zotero/types";

const pages: PdfPageText[] = [
  { pageIndex: 0, pageLabel: "1", text: "a".repeat(2_000) },
  { pageIndex: 1, pageLabel: "2", text: "b".repeat(2_000) },
  { pageIndex: 2, pageLabel: "3", text: "c".repeat(2_000) },
];

describe("auto-highlight context packing", () => {
  it("uses the lower of the user cap and provider metadata", () => {
    expect(effectiveHighlightContextTokens(65_536, 32_768)).toBe(32_768);
    expect(effectiveHighlightContextTokens(16_384, 32_768)).toBe(16_384);
    expect(effectiveHighlightContextTokens(65_536)).toBe(65_536);
  });

  it("subtracts prompt, output, reasoning, and safety reserves", () => {
    const budget = calculateHighlightRequestBudget(65_536, "methodology");
    expect(budget.completionTokens).toBe(HIGHLIGHT_COMPLETION_TOKENS);
    expect(budget.promptOverheadTokens).toBeGreaterThan(0);
    expect(budget.reasoningReserveTokens).toBeGreaterThan(0);
    expect(budget.safetyTokens).toBeGreaterThan(0);
    expect(budget.payloadTokens).toBe(
      budget.contextWindowTokens -
        budget.promptOverheadTokens -
        budget.completionTokens -
        budget.reasoningReserveTokens -
        budget.safetyTokens,
    );
  });

  it("sends a fitting PDF as one complete page-labelled window", () => {
    const windows = createHighlightTextWindows(pages, 10_000);
    expect(windows).toHaveLength(1);
    expect(windows[0]?.text).toBe(serializeHighlightPages(pages));
  });

  it("makes maximal overlapping windows with complete cross-page coverage", () => {
    const document = serializeHighlightPages(pages);
    const windows = createHighlightTextWindows(pages, 2_500);
    expect(windows.length).toBeGreaterThan(1);
    expect(windows.every((window) => window.text.length === 2_500 || window.end === document.length)).toBe(true);
    for (let index = 1; index < windows.length; index++) {
      const previous = windows[index - 1]!;
      const current = windows[index]!;
      expect(previous.end - current.start).toBe(HIGHLIGHT_WINDOW_OVERLAP_CHARS);
      expect(previous.text.slice(-HIGHLIGHT_WINDOW_OVERLAP_CHARS)).toBe(
        current.text.slice(0, HIGHLIGHT_WINDOW_OVERLAP_CHARS),
      );
    }
    expect(windows[0]?.start).toBe(0);
    expect(windows.at(-1)?.end).toBe(document.length);
  });

  it("uses PDF retrieval only to rank and retains every window once", () => {
    const windows = createHighlightTextWindows(pages, 2_500);
    const ranked = rankHighlightWindows(windows, [
      {
        chunk: { itemKey: "AAA", source: "pdf-text", text: "c".repeat(100), chunkId: "c" },
        score: 4,
      },
      {
        chunk: { itemKey: "AAA", source: "note", text: "a".repeat(100), chunkId: "note" },
        score: 100,
      },
    ]);
    expect(ranked[0]?.text).toContain("c".repeat(100));
    expect(ranked.map((window) => window.documentOrder).sort((a, b) => a - b)).toEqual(
      windows.map((window) => window.documentOrder),
    );
  });

  it("splits a rejected window with 500-character overlap", () => {
    const text = "0123456789".repeat(1_000);
    const split = splitHighlightWindow(text);
    expect(split).not.toBeNull();
    const [left, right] = split as [string, string];
    expect(left.length + right.length - text.length).toBe(
      HIGHLIGHT_WINDOW_OVERLAP_CHARS,
    );
  });
});
