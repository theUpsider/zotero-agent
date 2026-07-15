import { describe, expect, it } from "vitest";
import { mergeTags } from "../src/core/tags";

describe("mergeTags", () => {
  it("adds only tags not already present", () => {
    const { merged, added } = mergeTags(["ml", "nlp"], ["nlp", "transformers"]);
    expect(added).toEqual(["transformers"]);
    expect(merged).toEqual(["ml", "nlp", "transformers"]);
  });

  it("de-duplicates case-insensitively against existing tags (FR-064, NFR-020)", () => {
    const { added } = mergeTags(["Machine Learning"], ["machine learning", "MACHINE LEARNING"]);
    expect(added).toEqual([]);
  });

  it("de-duplicates within the suggestion list, preserving first casing", () => {
    const { added } = mergeTags([], ["Neural Nets", "neural nets", "RAG"]);
    expect(added).toEqual(["Neural Nets", "RAG"]);
  });

  it("trims whitespace and drops empty tags", () => {
    const { added } = mergeTags(["a"], ["  b  ", "", "   ", "a "]);
    expect(added).toEqual(["b"]);
  });

  it("is idempotent — re-running after a write adds nothing (S4-06)", () => {
    const first = mergeTags(["x"], ["y", "z"]);
    const second = mergeTags(first.merged, ["y", "z"]);
    expect(second.added).toEqual([]);
  });
});
