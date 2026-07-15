/** Auto-highlight passage resolution & duplicate prevention (S5-01, S5-03;
 * FR-041..FR-046). Pure module: string matching + geometry-free span logic,
 * no Zotero, no provider, no network. The model quotes passages verbatim; this
 * module locates each quote in the extracted page text, assigns the category's
 * color, and drops anything that overlaps an existing or already-planned
 * highlight. The adapter turns a PlannedHighlight's matched `text` back into
 * PDF glyph rects — the one step that needs Zotero. Everything here is
 * unit-tested against page-text fixtures. */

import { colorForCategory, type Category, type ColorSemantics } from "../core/colorSemantics";
import type {
  ExistingHighlight,
  PdfPageText,
  PlannedHighlight,
} from "../zotero/types";

/** A model-suggested passage before resolution (S5-01). */
export interface HighlightSuggestion {
  category: Category;
  quote: string;
}

/** A suggestion that could not be placed — surfaced in the result view, never
 * silently dropped (S5-01 AC#4). */
export interface UnresolvedHighlight {
  category: Category;
  quote: string;
  reason: "not-found" | "no-color" | "duplicate";
}

export interface HighlightPlan {
  planned: PlannedHighlight[];
  unresolved: UnresolvedHighlight[];
}

export interface PlanOptions {
  /** Fraction of the shorter span that must intersect for two highlights on
   * the same page to count as the same (S5-03). Default 0.5. */
  overlapThreshold?: number;
}

/** Parse the model's passage reply (S5-01). Primary format is a JSON array of
 * `{ "category", "quote" }`; tolerates a ```json fence, leading prose, and
 * trailing commentary by extracting the outermost bracketed array. Falls back
 * to line form `- [category] verbatim quote` when JSON is absent. Entries
 * missing a category or quote are skipped; the caller reports totals. */
export function parseHighlightSuggestions(text: string): HighlightSuggestion[] {
  const fromJson = parseJsonSuggestions(text);
  if (fromJson.length > 0) return fromJson;
  return parseLineSuggestions(text);
}

function parseJsonSuggestions(text: string): HighlightSuggestion[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const suggestions: HighlightSuggestion[] = [];
  for (const entry of parsed) {
    if (entry === null || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const category = typeof record.category === "string" ? record.category.trim() : "";
    const quote = typeof record.quote === "string" ? record.quote.trim() : "";
    if (category && quote) suggestions.push({ category, quote });
  }
  return suggestions;
}

const LINE_RE = /^\s*(?:[-*+•]|\d+[.)])?\s*\[([^\]]+)\]\s*(.+?)\s*$/;

function parseLineSuggestions(text: string): HighlightSuggestion[] {
  const suggestions: HighlightSuggestion[] = [];
  for (const line of text.split("\n")) {
    const match = LINE_RE.exec(line);
    if (!match) continue;
    const category = (match[1] ?? "").trim();
    const quote = (match[2] ?? "").replace(/^["'`]+|["'`]+$/g, "").trim();
    if (category && quote) suggestions.push({ category, quote });
  }
  return suggestions;
}

/** Common ligatures so a PDF's "ﬁ" matches a model's "fi". */
const LIGATURES: Record<string, string> = {
  "ﬀ": "ff",
  "ﬁ": "fi",
  "ﬂ": "fl",
  "ﬃ": "ffi",
  "ﬄ": "ffl",
  "ﬅ": "st",
  "ﬆ": "st",
};

/** Dash and quote variants a model tends to substitute (typographic
 * formatting habits) for the plain ASCII characters a PDF extraction
 * actually contains — folded to a canonical form so an otherwise-verbatim
 * quote still resolves (S5-01). Quote/bracket delimiters are ignored entirely:
 * models commonly omit one while leaving every word unchanged. */
const PUNCTUATION_VARIANTS: Record<string, string> = {
  "‐": "-", // hyphen
  "‑": "-", // non-breaking hyphen
  "‒": "-", // figure dash
  "–": "-", // en dash
  "—": "-", // em dash
  "−": "-", // minus sign
  "‘": "'", // left single quote
  "’": "'", // right single quote
  "“": '"', // left double quote
  "”": '"', // right double quote
};

/** Normalize page text into a canonical form plus a map from each normalized
 * character back to its index in the original string, so a match in normalized
 * space can be sliced verbatim from the original. Tolerance (documented for
 * S5-01): case, ligatures, collapsed/ës whitespace, soft hyphens, and end-of-
 * line hyphenation (a "-" before whitespace is dropped). */
interface Normalized {
  text: string;
  /** map[i] = original index of normalized char i; map[len] = original length. */
  map: number[];
}

function normalize(original: string, ignoreHyphens = false): Normalized {
  const out: string[] = [];
  const map: number[] = [];
  let prevWasSpace = false;
  for (let i = 0; i < original.length; i++) {
    const ch = original[i] as string;
    if (ch === "­") continue; // soft hyphen: always drop
    const canonicalPunctuation = PUNCTUATION_VARIANTS[ch] ?? ch;
    if (/^[()[\]{}"'`]$/.test(canonicalPunctuation)) continue;
    // End-of-line hyphenation: a hyphen directly before whitespace joins.
    if ((ch === "-" || PUNCTUATION_VARIANTS[ch] === "-") && /\s/.test(original[i + 1] ?? "")) {
      // skip the hyphen and the following run of whitespace
      let j = i + 1;
      while (j < original.length && /\s/.test(original[j] as string)) j++;
      i = j - 1;
      continue;
    }
    if (ignoreHyphens && canonicalPunctuation === "-") continue;
    if (/\s/.test(ch)) {
      if (prevWasSpace || out.length === 0) continue;
      out.push(" ");
      map.push(i);
      prevWasSpace = true;
      continue;
    }
    prevWasSpace = false;
    const expansion = LIGATURES[ch] ?? canonicalPunctuation.toLowerCase();
    for (const c of expansion) {
      out.push(c);
      map.push(i);
    }
  }
  // Trim a trailing collapsed space.
  while (out.length > 0 && out[out.length - 1] === " ") {
    out.pop();
    map.pop();
  }
  map.push(original.length);
  return { text: out.join(""), map };
}

/** Where a quote resolved on a page: verbatim substring + normalized span. */
interface Location {
  pageIndex: number;
  pageLabel: string;
  /** Exact substring of the page's original text. */
  text: string;
  /** [start, end) in that page's normalized text — used for overlap only. */
  normStart: number;
  normEnd: number;
}

/** Locate a quote across pages, returning the first (lowest page, then lowest
 * offset) match, or null. Whitespace/ligature/hyphenation differences are
 * absorbed by normalization (see {@link normalize}); the quote must otherwise
 * appear verbatim, which is what the prompt instructs. */
function locateWithNormalization(
  pages: NormalizedPage[],
  quote: string,
  ignoreHyphens: boolean,
): Location | null {
  const needle = normalize(quote, ignoreHyphens).text;
  if (needle.length === 0) return null;
  for (const page of pages) {
    const normalizedPage = ignoreHyphens ? normalize(page.text, true) : page.normalized;
    const at = normalizedPage.text.indexOf(needle);
    if (at === -1) continue;
    const origStart = normalizedPage.map[at];
    const origEnd = normalizedPage.map[at + needle.length];
    return {
      pageIndex: page.pageIndex,
      pageLabel: page.pageLabel,
      text: page.text.slice(origStart, origEnd),
      normStart: at,
      normEnd: at + needle.length,
    };
  }
  return null;
}

function locate(pages: NormalizedPage[], quote: string): Location | null {
  const strict = locateWithNormalization(pages, quote, false);
  if (strict) return strict;
  // Long quotes remain highly discriminative even after ignoring hyphens.
  // This repairs PDF line-wrap/model drift such as "X-to-\nEnglish" vs
  // "X-toEnglish" without making short phrase matching dangerously broad.
  if (normalize(quote).text.replace(/\s/g, "").length < 40) return null;
  return locateWithNormalization(pages, quote, true);
}

interface NormalizedPage {
  pageIndex: number;
  pageLabel: string;
  text: string;
  normalized: Normalized;
}

/** Overlap ratio of two [start,end) spans against the shorter one; 0 when
 * disjoint. Same-page comparison only (the caller keys by page). */
export function spanOverlapRatio(
  a: { start: number; end: number },
  b: { start: number; end: number },
): number {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  if (end <= start) return 0;
  const shorter = Math.min(a.end - a.start, b.end - b.start);
  return shorter <= 0 ? 0 : (end - start) / shorter;
}

interface Span {
  pageIndex: number;
  start: number;
  end: number;
}

function overlapsAny(candidate: Span, taken: Span[], threshold: number): boolean {
  for (const span of taken) {
    if (span.pageIndex !== candidate.pageIndex) continue;
    if (spanOverlapRatio(candidate, span) >= threshold) return true;
  }
  return false;
}

/** Resolve model passages into deduplicated, colored highlights (S5-01/S5-03).
 *
 * Suggestions are processed in the order the model returned them — most
 * relevant first — so the multi-category tie-break is deterministic: when two
 * suggestions resolve to the same/overlapping span, the earlier (more relevant)
 * one wins and the later is dropped as a duplicate (FR-045). A passage that
 * overlaps an existing highlight (user- or plugin-made) is likewise dropped so
 * a re-run never double-highlights and the AI never highlights over the user's
 * work (FR-046). Unplaceable passages are returned in `unresolved`, never
 * dropped silently (S5-01 AC#4). */
export function planHighlights(
  suggestions: HighlightSuggestion[],
  pages: PdfPageText[],
  colorSemantics: ColorSemantics,
  existing: ExistingHighlight[],
  options: PlanOptions = {},
): HighlightPlan {
  const threshold = options.overlapThreshold ?? 0.5;
  const normalizedPages: NormalizedPage[] = pages.map((page) => ({
    pageIndex: page.pageIndex,
    pageLabel: page.pageLabel,
    text: page.text,
    normalized: normalize(page.text),
  }));

  // Resolve existing highlights to spans up front so overlap tests are cheap.
  const taken: Span[] = [];
  for (const highlight of existing) {
    const onPage = normalizedPages.filter((p) => p.pageIndex === highlight.pageIndex);
    const found = locate(onPage, highlight.text);
    if (found) taken.push({ pageIndex: found.pageIndex, start: found.normStart, end: found.normEnd });
  }

  const planned: PlannedHighlight[] = [];
  const unresolved: UnresolvedHighlight[] = [];

  for (const suggestion of suggestions) {
    const color = colorForCategory(colorSemantics, suggestion.category);
    if (!color) {
      unresolved.push({ ...suggestion, reason: "no-color" });
      continue;
    }
    const found = locate(normalizedPages, suggestion.quote);
    if (!found) {
      unresolved.push({ ...suggestion, reason: "not-found" });
      continue;
    }
    const span: Span = { pageIndex: found.pageIndex, start: found.normStart, end: found.normEnd };
    if (overlapsAny(span, taken, threshold)) {
      unresolved.push({ ...suggestion, reason: "duplicate" });
      continue;
    }
    taken.push(span);
    planned.push({
      pageIndex: found.pageIndex,
      pageLabel: found.pageLabel,
      category: suggestion.category,
      color,
      text: found.text,
    });
  }

  return { planned, unresolved };
}
