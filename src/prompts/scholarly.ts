/** Scholarly workflow prompt builders (S4-01..S4-05). Pure module: string
 * assembly only — no Zotero, no provider, no retrieval backend. The per-item
 * context block is produced by the composer (composeItemContexts); these
 * functions wrap it with the task instructions for each workflow so the
 * orchestrator only has to pick a builder. */

import type { Category } from "../core/colorSemantics";

/** Exact marker a category with no evidence must render as (FR-040). The
 * renderer preserves it verbatim; tests assert the prompt instructs it. */
export const NO_EVIDENCE = "No relevant evidence found";

/** Category-structured paper analysis (S4-01/S4-02; FR-032, FR-037..FR-040).
 * Headings follow the *configured* categories, not the hardcoded defaults. */
export function composeAnalysisPrompt(contextText: string, categories: Category[]): string {
  const headings = categories.map((category) => `- ${category}`).join("\n");
  return (
    "Analyze the following paper and write a structured summary for a researcher.\n\n" +
    "Organize the summary under exactly these category headings, in this order, each as a " +
    'level-2 Markdown heading ("## <category>"):\n' +
    `${headings}\n\n` +
    "For each category, summarize what this paper contributes to it, using only the provided " +
    "content (metadata, abstract, annotations, highlights, notes, tags, and full text or " +
    "retrieved passages). Do not invent information and do not add categories. If the content " +
    `has no relevant evidence for a category, write exactly "${NO_EVIDENCE}" under that heading.\n\n` +
    `Paper content:\n${contextText}`
  );
}

/** Passage identification for auto-highlighting (S5-01; FR-041..FR-043,
 * FR-045). Asks the model to return short verbatim quotes tagged with the most
 * relevant category, ordered most-relevant first so the resolver's tie-break
 * keeps the best category when passages overlap (FR-045). Verbatim quoting is
 * mandatory — the resolver locates each quote in the extracted PDF text, so a
 * paraphrase cannot be placed. */
export function composeHighlightPrompt(contextText: string, categories: Category[]): string {
  const list = categories.map((category) => `- ${category}`).join("\n");
  return (
    "Identify the passages in the following paper that a researcher would highlight, one per " +
    "notable point, and assign each to the single most relevant category.\n\n" +
    "Use only these categories:\n" +
    `${list}\n\n` +
    "Rules:\n" +
    "- Quote each passage VERBATIM from the paper text — copy the exact words, do not paraphrase, " +
    "summarize, or fix typos. A quote that is not an exact substring cannot be placed.\n" +
    "- Keep each quote to a single sentence or clause (roughly 5–40 words).\n" +
    "- Assign exactly one category per passage: the most relevant one. List the most important " +
    "passages first.\n" +
    "- Only highlight passages with clear category relevance; if the paper has none, return an " +
    "empty array.\n\n" +
    'Return ONLY a JSON array, each element `{ "category": "<one of the categories>", "quote": ' +
    '"<verbatim text>" }`. No prose before or after.\n\n' +
    `Paper content:\n${contextText}`
  );
}

/** Structured note from an item's annotations & highlights (S4-03; FR-051..FR-053). */
export function composeNoteFromAnnotationsPrompt(contextText: string): string {
  return (
    "Create a structured note that organizes this paper's existing annotations and highlights " +
    "for later review.\n\n" +
    'Group the points by the color-category meaning shown in the "Annotations (grouped by ' +
    'category)" section below, each group under a level-2 Markdown heading ("## <category>"). ' +
    'Put annotations shown as "Uncategorized" under a "## Other" heading. Summarize and lightly ' +
    "rephrase each annotation and keep its page reference. Use only the annotations, highlights, " +
    "and notes provided; add nothing else.\n\n" +
    `Paper content:\n${contextText}`
  );
}

/** Condensed digest of an item's *existing* notes and annotations (S4-04; FR-050). */
export function composeSummarizeNotesPrompt(contextText: string): string {
  return (
    "Summarize this item's existing notes and annotations into one coherent, condensed overview " +
    "a reader can use to recall the key points. Base the summary on the notes and annotations " +
    "already recorded below; do not re-analyze the full paper from scratch.\n\n" +
    `Content:\n${contextText}`
  );
}

/** Tag suggestion (S4-05; FR-057, FR-058, FR-061). Existing tags are supplied
 * as context so the model does not re-propose them (FR-057). */
export function composeTagSuggestionPrompt(contextText: string, existingTags: string[]): string {
  const existing = existingTags.length > 0 ? existingTags.join(", ") : "(none)";
  return (
    "Suggest concise subject tags for this paper based on its content, annotations, notes, " +
    "metadata, and categories.\n\n" +
    `Existing tags (do not repeat these): ${existing}\n\n` +
    "Return only new tags as a single comma-separated line, most important first, at most 10 " +
    "tags. Use short lowercase keywords or phrases. If no useful new tag applies, return an " +
    "empty line.\n\n" +
    `Content:\n${contextText}`
  );
}

const MAX_TAG_LENGTH = 60;

/** Parse a model's tag reply into individual tags (S4-05). Tolerates a comma-
 * or newline-separated list, bullet/numbered markers, a leading "Tags:" label,
 * and wrapping quotes; drops empties, over-long entries, and case-insensitive
 * duplicates. Casing is preserved — the authoritative dedup against existing
 * tags happens in mergeTags. */
export function parseTagSuggestions(text: string): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/^\s*(?:suggested\s+)?tags?\s*:/i, "");
    for (const rawToken of line.split(",")) {
      const token = rawToken
        .replace(/^\s*(?:[-*+•]|\d+[.)])\s+/, "") // leading bullet / number marker
        .trim()
        .replace(/\.+$/, "") // trailing period(s)
        .replace(/^["'`]+|["'`]+$/g, "") // wrapping quotes
        .trim();
      if (!token || token.length > MAX_TAG_LENGTH) continue;
      const key = token.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      tags.push(token);
    }
  }
  return tags;
}
