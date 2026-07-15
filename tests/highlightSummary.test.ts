import { describe, expect, it } from "vitest";
import { summarizeHighlightRun } from "../src/workflows/highlightSummary";
import type { CreatedHighlight } from "../src/zotero/types";

const created = (over: Partial<CreatedHighlight> = {}): CreatedHighlight => ({
  pageIndex: 0,
  pageLabel: "1",
  category: "results",
  color: "#5fb236",
  text: "a passage",
  kind: "highlight",
  ...over,
});

describe("summarizeHighlightRun (S5-02)", () => {
  it("groups created highlights by category with page numbers", () => {
    const md = summarizeHighlightRun({
      created: [
        created({ category: "results", pageLabel: "2" }),
        created({ category: "results", pageLabel: "3" }),
        created({ category: "limitations", pageLabel: "5" }),
      ],
      unresolved: [],
      failed: [],
    });
    expect(md).toContain("Created 3 highlights");
    expect(md).toContain("**results**: 2 on page(s) 2, 3");
    expect(md).toContain("**limitations**: 1 on page(s) 5");
  });

  it("reports note fallbacks, duplicates, unlocated quotes, and failures", () => {
    const md = summarizeHighlightRun({
      created: [created({ kind: "note" })],
      unresolved: [
        { category: "results", quote: "seen before", reason: "duplicate" },
        { category: "data", quote: "ghost quote", reason: "not-found" },
        { category: "ethics", quote: "x", reason: "no-color" },
      ],
      failed: [{ text: "bad one", reason: "boom" }],
    });
    expect(md).toContain("page note annotation");
    expect(md).toContain("skipped as already highlighted");
    expect(md).toContain("Could not locate");
    expect(md).toContain("ghost quote");
    expect(md).toContain("no color mapped");
    expect(md).toContain("could not be written");
    expect(md).toContain("boom");
  });

  it("states plainly when nothing was created", () => {
    expect(summarizeHighlightRun({ created: [], unresolved: [], failed: [] })).toContain(
      "No new highlights were created.",
    );
  });
});
