import { describe, expect, it } from "vitest";
import {
  composeAnalysisPrompt,
  composeHighlightPrompt,
  composeNoteFromAnnotationsPrompt,
  composeSummarizeNotesPrompt,
  composeTagSuggestionPrompt,
  NO_EVIDENCE,
  parseTagSuggestions,
} from "../src/prompts/scholarly";

describe("composeHighlightPrompt (S5-01)", () => {
  it("lists the configured categories and demands verbatim JSON output", () => {
    const prompt = composeHighlightPrompt("CONTEXT", ["methodology", "results"]);
    expect(prompt).toContain("- methodology");
    expect(prompt).toContain("- results");
    expect(prompt).toContain("VERBATIM");
    expect(prompt).toContain("JSON array");
    expect(prompt).toContain('"quote"');
    expect(prompt).toContain("most relevant");
    expect(prompt).toContain("CONTEXT");
  });
});

describe("composeAnalysisPrompt (S4-01/S4-02)", () => {
  it("lists the configured categories as headings and demands the no-evidence marker", () => {
    const prompt = composeAnalysisPrompt("CONTEXT", ["methodology", "results", "ethics"]);
    expect(prompt).toContain("- methodology");
    expect(prompt).toContain("- ethics"); // custom category, not a hardcoded default (FR-038)
    expect(prompt).toContain(NO_EVIDENCE);
    expect(prompt).toContain('"## <category>"');
    expect(prompt).toContain("CONTEXT");
    expect(prompt).toContain("Do not invent");
  });
});

describe("composeNoteFromAnnotationsPrompt (S4-03)", () => {
  it("groups by color category and routes unmapped colors to Other (FR-053)", () => {
    const prompt = composeNoteFromAnnotationsPrompt("CTX");
    expect(prompt).toContain("Other");
    expect(prompt).toContain("Uncategorized");
    expect(prompt).toContain("page reference");
    expect(prompt).toContain("CTX");
  });
});

describe("composeSummarizeNotesPrompt (S4-04)", () => {
  it("summarizes existing notes/annotations rather than the full paper", () => {
    const prompt = composeSummarizeNotesPrompt("CTX");
    expect(prompt).toContain("existing notes and annotations");
    expect(prompt).toContain("do not re-analyze the full paper");
    expect(prompt).toContain("CTX");
  });
});

describe("composeTagSuggestionPrompt (S4-05)", () => {
  it("feeds existing tags in as do-not-repeat context (FR-057)", () => {
    const prompt = composeTagSuggestionPrompt("CTX", ["ml", "nlp"]);
    expect(prompt).toContain("do not repeat these): ml, nlp");
    expect(prompt).toContain("comma-separated");
  });

  it("marks empty existing tags as (none)", () => {
    expect(composeTagSuggestionPrompt("CTX", [])).toContain("(none)");
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
    expect(parseTagSuggestions(text)).toEqual(["deep learning", "attention", "rag"]);
  });

  it("strips wrapping quotes and trailing periods, de-dupes case-insensitively", () => {
    expect(parseTagSuggestions('"NLP", nlp, `rag`.')).toEqual(["NLP", "rag"]);
  });

  it("keeps keywords that merely begin with a digit", () => {
    expect(parseTagSuggestions("3d printing, 5g")).toEqual(["3d printing", "5g"]);
  });

  it("drops empties and improbably long entries", () => {
    const long = "x".repeat(80);
    expect(parseTagSuggestions(`, ok, ${long}`)).toEqual(["ok"]);
  });

  it("returns nothing for an empty reply", () => {
    expect(parseTagSuggestions("\n  \n")).toEqual([]);
  });
});
