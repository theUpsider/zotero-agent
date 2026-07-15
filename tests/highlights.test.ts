import { describe, expect, it } from "vitest";
import { defaultColorSemantics, ZOTERO_ANNOTATION_COLORS } from "../src/core/colorSemantics";
import {
  parseHighlightSuggestions,
  planHighlights,
  spanOverlapRatio,
  type HighlightSuggestion,
} from "../src/workflows/highlights";
import type { ExistingHighlight, PdfPageText } from "../src/zotero/types";

const PAGES: PdfPageText[] = [
  {
    pageIndex: 0,
    pageLabel: "1",
    text: "We introduce a novel method. The results show a 42% improvement over the baseline.",
  },
  {
    pageIndex: 1,
    pageLabel: "2",
    text: "A key limitation is the small sample size of only twelve participants.",
  },
];

describe("parseHighlightSuggestions", () => {
  it("parses a JSON array of category/quote objects", () => {
    const reply = `Here are the passages:
\`\`\`json
[
  { "category": "results", "quote": "42% improvement" },
  { "category": "limitations", "quote": "small sample size" }
]
\`\`\`
Hope that helps.`;
    expect(parseHighlightSuggestions(reply)).toEqual([
      { category: "results", quote: "42% improvement" },
      { category: "limitations", quote: "small sample size" },
    ]);
  });

  it("falls back to bracketed line form when there is no JSON", () => {
    const reply = "- [results] 42% improvement\n- [limitations] small sample size";
    expect(parseHighlightSuggestions(reply)).toEqual([
      { category: "results", quote: "42% improvement" },
      { category: "limitations", quote: "small sample size" },
    ]);
  });

  it("skips entries missing a category or quote", () => {
    const reply = '[{ "category": "results" }, { "quote": "orphan" }, { "category": "results", "quote": "ok" }]';
    expect(parseHighlightSuggestions(reply)).toEqual([{ category: "results", quote: "ok" }]);
  });

  it("returns nothing for an empty or non-array reply", () => {
    expect(parseHighlightSuggestions("no passages found")).toEqual([]);
    expect(parseHighlightSuggestions("")).toEqual([]);
  });
});

describe("spanOverlapRatio", () => {
  it("is 0 for disjoint spans and 1 for containment of the shorter", () => {
    expect(spanOverlapRatio({ start: 0, end: 5 }, { start: 10, end: 20 })).toBe(0);
    expect(spanOverlapRatio({ start: 0, end: 20 }, { start: 5, end: 10 })).toBe(1);
  });

  it("measures partial overlap against the shorter span", () => {
    expect(spanOverlapRatio({ start: 0, end: 10 }, { start: 8, end: 12 })).toBeCloseTo(0.5);
  });
});

describe("planHighlights", () => {
  const semantics = defaultColorSemantics();

  it("resolves quotes to spans and colors them by category", () => {
    const suggestions: HighlightSuggestion[] = [
      { category: "results", quote: "42% improvement over the baseline" },
      { category: "limitations", quote: "small sample size" },
    ];
    const { planned, unresolved } = planHighlights(suggestions, PAGES, semantics, []);
    expect(unresolved).toEqual([]);
    expect(planned).toEqual([
      {
        pageIndex: 0,
        pageLabel: "1",
        category: "results",
        color: ZOTERO_ANNOTATION_COLORS.green,
        text: "42% improvement over the baseline",
      },
      {
        pageIndex: 1,
        pageLabel: "2",
        category: "limitations",
        color: ZOTERO_ANNOTATION_COLORS.red,
        text: "small sample size",
      },
    ]);
  });

  it("tolerates whitespace, case and hyphenation differences (fuzzy match)", () => {
    const pages: PdfPageText[] = [
      { pageIndex: 0, pageLabel: "1", text: "the experi-\nmental   design was RANDOMIZED" },
    ];
    const { planned } = planHighlights(
      [{ category: "methodology", quote: "the experimental design was randomized" }],
      pages,
      semantics,
      [],
    );
    expect(planned).toHaveLength(1);
    expect(planned[0]?.text).toBe("the experi-\nmental   design was RANDOMIZED");
  });

  it("tolerates dash/quote variants the model substitutes for plain ASCII ones", () => {
    const pages: PdfPageText[] = [
      { pageIndex: 0, pageLabel: "1", text: "an end-to-end open-source system for real-time use" },
    ];
    const { planned } = planHighlights(
      [{ category: "methodology", quote: "an end‑to‑end open‑source system for real‑time use" }],
      pages,
      semantics,
      [],
    );
    expect(planned).toHaveLength(1);
    expect(planned[0]?.text).toBe("an end-to-end open-source system for real-time use");
  });

  it("tolerates omitted sentence punctuation while keeping every word exact", () => {
    const pages: PdfPageText[] = [
      {
        pageIndex: 0,
        pageLabel: "1",
        text: "Large Audio-Language Models (LALMs) perform well but lack tool-calling found in recent Large Language Models (LLMs).",
      },
    ];
    const { planned } = planHighlights(
      [
        {
          category: "research question",
          quote: "Large Audio-Language Models (LALMs) perform well but lack tool-calling found in recent Large Language Models (LLMs.",
        },
      ],
      pages,
      semantics,
      [],
    );
    expect(planned).toHaveLength(1);
    expect(planned[0]?.text).toBe(pages[0]?.text);
  });

  it("tolerates PDF line-hyphen drift in long otherwise-verbatim quotes", () => {
    const pages: PdfPageText[] = [
      {
        pageIndex: 0,
        pageLabel: "1",
        text: "Hibiki-Zero achieves state-of-the-\nart performance in translation accuracy, latency, voice transfer, and naturalness across five X-to-\nEnglish tasks.",
      },
    ];
    for (const quote of [
      "Hibiki-Zero achieves state-of-theart performance in translation accuracy, latency, voice transfer, and naturalness across five X-to-English tasks.",
      "Hibiki-Zero achieves state-of- theart performance in translation accuracy, latency, voice transfer, and naturalness across five X-toEnglish tasks.",
    ]) {
      const { planned, unresolved } = planHighlights(
        [{ category: "results", quote }],
        pages,
        semantics,
        [],
      );
      expect(unresolved).toEqual([]);
      expect(planned).toHaveLength(1);
    }
  });

  it("reports quotes that cannot be located, never dropping them", () => {
    const { planned, unresolved } = planHighlights(
      [{ category: "results", quote: "this sentence is not in the paper" }],
      PAGES,
      semantics,
      [],
    );
    expect(planned).toEqual([]);
    expect(unresolved).toEqual([
      { category: "results", quote: "this sentence is not in the paper", reason: "not-found" },
    ]);
  });

  it("reports a category with no mapped color", () => {
    const { planned, unresolved } = planHighlights(
      [{ category: "unmapped-category", quote: "novel method" }],
      PAGES,
      semantics,
      [],
    );
    expect(planned).toEqual([]);
    expect(unresolved[0]?.reason).toBe("no-color");
  });

  it("keeps the most-relevant (first) category when passages overlap (FR-045)", () => {
    const suggestions: HighlightSuggestion[] = [
      { category: "results", quote: "42% improvement over the baseline" },
      { category: "methodology", quote: "improvement over the baseline" },
    ];
    const { planned, unresolved } = planHighlights(suggestions, PAGES, semantics, []);
    expect(planned).toHaveLength(1);
    expect(planned[0]?.category).toBe("results");
    expect(unresolved[0]?.reason).toBe("duplicate");
  });

  it("does not duplicate over an existing highlight — user or prior run (FR-046)", () => {
    const existing: ExistingHighlight[] = [
      { pageIndex: 0, text: "42% improvement over the baseline" },
    ];
    const { planned, unresolved } = planHighlights(
      [{ category: "results", quote: "results show a 42% improvement over the baseline" }],
      PAGES,
      semantics,
      existing,
    );
    expect(planned).toEqual([]);
    expect(unresolved[0]?.reason).toBe("duplicate");
  });

  it("allows a non-overlapping highlight on a page that already has one", () => {
    const existing: ExistingHighlight[] = [{ pageIndex: 0, text: "novel method" }];
    const { planned } = planHighlights(
      [{ category: "results", quote: "42% improvement" }],
      PAGES,
      semantics,
      existing,
    );
    expect(planned).toHaveLength(1);
    expect(planned[0]?.category).toBe("results");
  });
});
