import { describe, expect, it } from "vitest";
import {
  composeAnalysisPrompt,
  composeHighlightPrompt,
  composeNoteFromAnnotationsPrompt,
  composeSummarizeNotesPrompt,
  composeTagSuggestionPrompt,
  getAnalysisSystemPrompt,
  getHighlightSystemPrompt,
  getNoteFromAnnotationsSystemPrompt,
  getSummarizeNotesSystemPrompt,
  getTagSuggestionSystemPrompt,
  NO_EVIDENCE,
  parseTagSuggestions,
} from "../src/prompts/scholarly";

describe("getHighlightSystemPrompt", () => {
  it("lists the categories and describes verbatim quoting rules", () => {
    const prompt = getHighlightSystemPrompt(["methodology", "results"]);
    expect(prompt).toContain("- methodology");
    expect(prompt).toContain("- results");
    expect(prompt).toContain("verbatim");
    expect(prompt).toContain("most relevant");
    expect(prompt).toContain("5–40 words");
  });
});

describe("composeHighlightPrompt (S5-01)", () => {
  it("wraps the paper content without inline JSON format instructions", () => {
    const prompt = composeHighlightPrompt("CONTEXT");
    expect(prompt).toContain("Paper content:");
    expect(prompt).toContain("CONTEXT");
    expect(prompt).not.toContain("VERBATIM");
    expect(prompt).not.toContain("JSON array");
  });
});

describe("getAnalysisSystemPrompt", () => {
  it("lists headings and the no-evidence marker (FR-040)", () => {
    const prompt = getAnalysisSystemPrompt([
      "methodology",
      "results",
      "ethics",
    ]);
    expect(prompt).toContain('"## methodology"');
    expect(prompt).toContain('"## ethics"');
    expect(prompt).toContain(NO_EVIDENCE);
    expect(prompt).toContain("Do not invent");
  });
});

describe("composeAnalysisPrompt (S4-01/S4-02)", () => {
  it("wraps the paper content concisely", () => {
    const prompt = composeAnalysisPrompt("CONTEXT", ["methodology"]);
    expect(prompt).toContain("Analyze this paper");
    expect(prompt).toContain("CONTEXT");
    expect(prompt).not.toContain("Do not invent");
  });
});

describe("getNoteFromAnnotationsSystemPrompt", () => {
  it("groups by color category and routes unmapped colors to Other (FR-053)", () => {
    const prompt = getNoteFromAnnotationsSystemPrompt();
    expect(prompt).toContain("Other");
    expect(prompt).toContain("Uncategorized");
  });
});

describe("composeNoteFromAnnotationsPrompt (S4-03)", () => {
  it("wraps the paper content concisely", () => {
    const prompt = composeNoteFromAnnotationsPrompt("CTX");
    expect(prompt).toContain("annotations and highlights");
    expect(prompt).toContain("CTX");
  });
});

describe("getSummarizeNotesSystemPrompt", () => {
  it("tells the model to use existing notes, not re-analyze", () => {
    const prompt = getSummarizeNotesSystemPrompt();
    expect(prompt).toContain("existing notes and annotations");
    expect(prompt).toContain("Do not re-analyze");
  });
});

describe("composeSummarizeNotesPrompt (S4-04)", () => {
  it("wraps the content concisely", () => {
    const prompt = composeSummarizeNotesPrompt("CTX");
    expect(prompt).toContain("coherent overview");
    expect(prompt).toContain("CTX");
  });
});

describe("getTagSuggestionSystemPrompt", () => {
  it("lists existing tags as do-not-repeat context (FR-057)", () => {
    const prompt = getTagSuggestionSystemPrompt(["ml", "nlp"]);
    expect(prompt).toContain("do not repeat these");
    expect(prompt).toContain("ml, nlp");
    expect(prompt).toContain("comma-separated");
  });

  it("marks empty existing tags as (none)", () => {
    expect(getTagSuggestionSystemPrompt([])).toContain("(none)");
  });
});

describe("composeTagSuggestionPrompt (S4-05)", () => {
  it("wraps the paper content concisely", () => {
    const prompt = composeTagSuggestionPrompt("CTX");
    expect(prompt).toContain("Suggest");
    expect(prompt).toContain("CTX");
    expect(prompt).not.toContain("do not repeat");
  });
});

describe("parseTagSuggestions (S4-05)", () => {
  it("parses a plain comma-separated line", () => {
    expect(parseTagSuggestions("machine learning, nlp, transformers")).toEqual([
      "machine learning",
      "nlp",
      "transformers",
    ]);
  });

  it("parses a bulleted / numbered list and strips a Tags: label", () => {
    const text = "Tags:\n- deep learning\n2) attention\n* rag";
    expect(parseTagSuggestions(text)).toEqual([
      "deep learning",
      "attention",
      "rag",
    ]);
  });

  it("strips wrapping quotes and trailing periods, de-dupes case-insensitively", () => {
    expect(parseTagSuggestions('"NLP", nlp, `rag`.')).toEqual(["NLP", "rag"]);
  });

  it("keeps keywords that merely begin with a digit", () => {
    expect(parseTagSuggestions("3d printing, 5g")).toEqual([
      "3d printing",
      "5g",
    ]);
  });

  it("drops empties and improbably long entries", () => {
    const long = "x".repeat(80);
    expect(parseTagSuggestions(`, ok, ${long}`)).toEqual(["ok"]);
  });

  it("returns nothing for an empty reply", () => {
    expect(parseTagSuggestions("\n  \n")).toEqual([]);
  });
});
