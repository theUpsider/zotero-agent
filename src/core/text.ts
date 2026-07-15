/** Pure text utilities shared by prompts/ and retrieval/ (both need
 * boundary-safe truncation and HTML stripping; retrieval/ may not import
 * prompts/, so this lives in core/). */

/** Cut text at the budget, backing off to the previous paragraph or word
 * boundary so the cut is deterministic and never mid-word. */
export function truncateAtBoundary(text: string, budget: number): string {
  if (text.length <= budget) return text;
  const slice = text.slice(0, budget);
  const paragraphBreak = slice.lastIndexOf("\n\n");
  if (paragraphBreak > budget * 0.5) return slice.slice(0, paragraphBreak);
  const wordBreak = slice.search(/\s\S*$/);
  return wordBreak > 0 ? slice.slice(0, wordBreak) : slice;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}
