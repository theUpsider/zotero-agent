/** Scholarly workflow prompt builders (S4-01..S4-05). Pure module: string
 * assembly only — no Zotero, no provider, no retrieval backend. The per-item
 * context block is produced by the composer (composeItemContexts); these
 * functions wrap it with the task instructions for each workflow so the
 * orchestrator only has to pick a builder.
 *
 * Each workflow has a `get*SystemPrompt()` function returning the system
 * message (role + full formatting instructions) and a `compose*()` function
 * returning the user message (task framing + paper context). */

import type { Category } from "../core/colorSemantics";

/** Exact marker a category with no evidence must render as (FR-040). The
 * renderer preserves it verbatim; tests assert the prompt instructs it. */
export const NO_EVIDENCE = "No relevant evidence found";

// ── System prompts ──────────────────────────────────────────────────────────

/** Role + formatting instructions for the paper-analysis workflow. */
export function getAnalysisSystemPrompt(categories: Category[]): string {
  const headings = categories.map((c) => `"## ${c}"`).join(", ");
  return (
    "You are a scholarly paper analyst. Write a structured analysis for a researcher.\n\n" +
    `Organize the analysis under exactly these category headings, in this order, each as a level-2 Markdown heading: ${headings}.\n\n` +
    "Rules:\n" +
    "- For each heading, summarize what the paper contributes using only the provided content " +
    "(metadata, abstract, annotations, notes, tags, and full text or retrieved passages).\n" +
    "- Do not invent information or add categories beyond those listed.\n" +
    `- If the content has no relevant evidence for a category, write exactly "${NO_EVIDENCE}" under that heading.`
  );
}

/** Role + instructions for the auto-highlight workflow.
 * JSON format constraints are enforced via structured outputs (response_format),
 * not repeated here — this prompt describes the task semantics only. */
export function getHighlightSystemPrompt(categories: Category[]): string {
  const list = categories.map((c) => `- ${c}`).join("\n");
  return (
    "You identify key passages in academic papers that a researcher would highlight.\n\n" +
    "For each notable point, select the single most relevant category and quote the passage " +
    "verbatim from the paper text — copy the exact words, do not paraphrase, summarize, or fix typos.\n\n" +
    "Use only these categories:\n" +
    `${list}\n\n` +
    "Rules:\n" +
    "- Keep each quote to a single sentence or clause (roughly 5–40 words).\n" +
    "- Assign exactly one category per passage: the most relevant one.\n" +
    "- List the most important passages first.\n" +
    "- Only highlight passages with clear category relevance; if the paper has none, return an empty array."
  );
}

/** Role + instructions for generating notes from annotations. */
export function getNoteFromAnnotationsSystemPrompt(): string {
  return (
    "You are a note organizer. Create a structured note from a paper's existing annotations and " +
    "highlights for later review.\n\n" +
    "Rules:\n" +
    '- Group points by the color-category labels found in the "Annotations (grouped by category)" ' +
    'section, each group under a level-2 Markdown heading ("## <category>").\n' +
    '- Put annotations shown as "Uncategorized" under a "## Other" heading.\n' +
    "- Summarize and lightly rephrase each annotation; keep its page reference.\n" +
    "- Use only the annotations, highlights, and notes provided; add nothing else."
  );
}

/** Role + instructions for summarizing existing notes and annotations. */
export function getSummarizeNotesSystemPrompt(): string {
  return (
    "You are a note summarizer. Condense a paper's existing notes and annotations into one " +
    "coherent overview a reader can use to recall the key points.\n\n" +
    "Rules:\n" +
    "- Base the summary on the notes and annotations already recorded below.\n" +
    "- Do not re-analyze the full paper from scratch.\n" +
    "- Write in well-structured Markdown."
  );
}

/** Role + instructions for suggesting tags. Existing tags are supplied so the
 * model does not re-propose them (FR-057). */
export function getTagSuggestionSystemPrompt(existingTags: string[]): string {
  const existing = existingTags.length > 0 ? existingTags.join(", ") : "(none)";
  return (
    "You are a subject-matter tagger for academic papers. Suggest concise, descriptive tags " +
    "based on the paper's content, annotations, notes, metadata, and categories.\n\n" +
    `Existing tags (do not repeat these): ${existing}\n\n` +
    "Rules:\n" +
    "- Return only new tags as a single comma-separated line, most important first.\n" +
    "- At most 10 tags.\n" +
    "- Use short lowercase keywords or phrases.\n" +
    "- If no useful new tag applies, return an empty line."
  );
}

// ── User prompts (task + context) ───────────────────────────────────────────

/** Category-structured paper analysis (S4-01/S4-02; FR-032, FR-037..FR-040).
 * User message: task framing + paper context. */
export function composeAnalysisPrompt(
  contextText: string,
  _categories: Category[],
): string {
  return `Analyze this paper and write a structured summary.\n\nPaper content:\n${contextText}`;
}

/** Passage identification for auto-highlighting (S5-01; FR-041..FR-043,
 * FR-045). User message: paper content window only. The model's task
 * semantics live in the system prompt; JSON schema is enforced via
 * structured outputs (response_format) in the provider layer. */
export function composeHighlightPrompt(contextText: string): string {
  return `Paper content:\n${contextText}`;
}

/** Structured note from an item's annotations & highlights (S4-03; FR-051..FR-053).
 * User message: task framing + paper context. */
export function composeNoteFromAnnotationsPrompt(contextText: string): string {
  return `Create a structured note from this paper's annotations and highlights.\n\nPaper content:\n${contextText}`;
}

/** Condensed digest of an item's *existing* notes and annotations (S4-04; FR-050).
 * User message: task framing + content. */
export function composeSummarizeNotesPrompt(contextText: string): string {
  return `Summarize this item's notes and annotations into a coherent overview.\n\nContent:\n${contextText}`;
}

/** Tag suggestion (S4-05; FR-057, FR-058, FR-061). User message: task framing
 * + paper content. Existing-tag context is in the system prompt. */
export function composeTagSuggestionPrompt(contextText: string): string {
  return `Suggest new tags for this paper.\n\nContent:\n${contextText}`;
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
