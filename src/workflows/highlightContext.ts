/** Context packing for auto-highlighting. Pure and Zotero-free: it calculates
 * the request budget, serializes page-labelled PDF text, creates exhaustive
 * overlapping windows, and optionally ranks those windows from local PDF
 * retrieval passages. */

import { InvalidConfigError } from "../core/errors";
import { approxTokens, tokenBudgetToChars } from "../core/tokens";
import { composeHighlightPrompt } from "../prompts/scholarly";
import type { RetrievalResult } from "../retrieval/types";
import type { PdfPageText } from "../zotero/types";

export const DEFAULT_HIGHLIGHT_CONTEXT_TOKENS = 65_536;
export const HIGHLIGHT_WINDOW_OVERLAP_CHARS = 500;
/** Reasoning-capable local models can consume 4K hidden tokens before emitting
 * any JSON. Reserve 8K at normal context sizes; small-context models receive a
 * proportional cap in calculateHighlightRequestBudget(). */
export const HIGHLIGHT_COMPLETION_TOKENS = 8_192;
export const HIGHLIGHT_REASONING_RESERVE_TOKENS = 2_048;
export const HIGHLIGHT_SAFETY_RATIO = 0.1;
const CHAT_ENVELOPE_TOKENS = 8;

export interface HighlightRequestBudget {
  contextWindowTokens: number;
  promptOverheadTokens: number;
  completionTokens: number;
  reasoningReserveTokens: number;
  safetyTokens: number;
  payloadTokens: number;
  payloadChars: number;
}

export interface HighlightTextWindow {
  text: string;
  /** Half-open offsets in the serialized, page-labelled PDF. */
  start: number;
  end: number;
  documentOrder: number;
}

export function effectiveHighlightContextTokens(
  userCap: number,
  providerContextWindowTokens?: number,
): number {
  const validUserCap = Math.max(1, Math.floor(userCap));
  if (
    providerContextWindowTokens === undefined ||
    !Number.isFinite(providerContextWindowTokens) ||
    providerContextWindowTokens <= 0
  ) {
    return validUserCap;
  }
  return Math.min(validUserCap, Math.floor(providerContextWindowTokens));
}

/** Subtract every non-PDF part of a highlight request. Prompt overhead is
 * measured from the exact category-specific prompt string; the remaining
 * token arithmetic is conservative because text tokens use the shared chars/4
 * estimator plus a ten-percent safety margin. */
export function calculateHighlightRequestBudget(
  contextWindowTokens: number,
  category: string,
): HighlightRequestBudget {
  const promptOverheadTokens =
    approxTokens(composeHighlightPrompt("", [category])) + CHAT_ENVELOPE_TOKENS;
  const safetyTokens = Math.ceil(contextWindowTokens * HIGHLIGHT_SAFETY_RATIO);
  const completionTokens = Math.min(
    HIGHLIGHT_COMPLETION_TOKENS,
    Math.max(4_096, Math.floor(contextWindowTokens * 0.125)),
  );
  const payloadTokens =
    Math.floor(contextWindowTokens) -
    promptOverheadTokens -
    completionTokens -
    HIGHLIGHT_REASONING_RESERVE_TOKENS -
    safetyTokens;
  if (payloadTokens < 256) {
    throw new InvalidConfigError(
      "The auto-highlight context limit is too small for the prompt and response reserves.",
    );
  }
  return {
    contextWindowTokens: Math.floor(contextWindowTokens),
    promptOverheadTokens,
    completionTokens,
    reasoningReserveTokens: HIGHLIGHT_REASONING_RESERVE_TOKENS,
    safetyTokens,
    payloadTokens,
    payloadChars: tokenBudgetToChars(payloadTokens),
  };
}

export function serializeHighlightPages(pages: PdfPageText[]): string {
  return pages
    .map((page) => `[PDF page ${page.pageLabel || page.pageIndex + 1}]\n${page.text}`)
    .join("\n\n");
}

/** Fraction of the window size a cut may retreat to land on a text boundary. */
const HIGHLIGHT_WINDOW_CUT_SLACK = 0.15;

/** End a window at a paragraph, line, or word boundary near the ideal cut so
 * the model never sees a mid-word splice. Falls back to the ideal cut when no
 * whitespace exists in the slack zone. */
function boundaryCut(document: string, idealEnd: number, floor: number): number {
  if (idealEnd >= document.length) return document.length;
  const zone = document.slice(floor, idealEnd);
  const paragraph = zone.lastIndexOf("\n\n");
  if (paragraph !== -1) return floor + paragraph + 2;
  const line = zone.lastIndexOf("\n");
  if (line !== -1) return floor + line + 1;
  const word = zone.search(/\s\S*$/);
  if (word !== -1) return floor + word + 1;
  return idealEnd;
}

/** How far a window start may snap back to reach a word boundary. */
const HIGHLIGHT_WINDOW_START_SNAP_CHARS = 64;

/** Snap a window start backward to the previous word boundary so overlap never
 * begins mid-word; snapping backward only ever grows the overlap. Bounded so a
 * long unbroken run cannot balloon the overlap; a mid-word start is harmless
 * then because the previous window still shows that text whole. */
function boundaryStart(document: string, idealStart: number): number {
  if (idealStart <= 0) return 0;
  const limit = Math.max(0, idealStart - HIGHLIGHT_WINDOW_START_SNAP_CHARS);
  for (let at = idealStart; at > limit; at--) {
    if (/\s/.test(document[at - 1] as string)) return at;
  }
  return idealStart;
}

/** The whole serialized PDF is one window when possible. Otherwise maximal
 * windows advance by budget-overlap, preserving at least 500 source characters
 * across every cut — including cuts at or around PDF page boundaries. Cuts
 * prefer paragraph, then line, then word boundaries within a small slack zone
 * so quotes are never spliced mid-word at a window edge. */
export function createHighlightTextWindows(
  pages: PdfPageText[],
  maxPayloadChars: number,
): HighlightTextWindow[] {
  const document = serializeHighlightPages(pages);
  if (document === "") return [];
  const size = Math.max(HIGHLIGHT_WINDOW_OVERLAP_CHARS + 1, Math.floor(maxPayloadChars));
  if (document.length <= size) {
    return [{ text: document, start: 0, end: document.length, documentOrder: 0 }];
  }
  const windows: HighlightTextWindow[] = [];
  let start = 0;
  for (;;) {
    const idealEnd = Math.min(document.length, start + size);
    // The cut may only retreat into the slack zone, and never so far that the
    // next start (end - overlap) stops advancing.
    const floor = Math.min(
      idealEnd,
      Math.max(
        start + HIGHLIGHT_WINDOW_OVERLAP_CHARS + 1,
        idealEnd - Math.floor(size * HIGHLIGHT_WINDOW_CUT_SLACK),
      ),
    );
    const end = Math.max(floor, boundaryCut(document, idealEnd, floor));
    windows.push({
      text: document.slice(start, end),
      start,
      end,
      documentOrder: windows.length,
    });
    if (end >= document.length) break;
    start = Math.max(
      start + 1,
      boundaryStart(document, end - HIGHLIGHT_WINDOW_OVERLAP_CHARS),
    );
  }
  return windows;
}

function normalizedWords(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
}

function passageScore(windowText: string, passageText: string): number {
  const windowNormalized = windowText.toLowerCase().replace(/\s+/g, " ");
  const passageNormalized = passageText.toLowerCase().replace(/\s+/g, " ").trim();
  if (passageNormalized !== "" && windowNormalized.includes(passageNormalized)) return 1;
  const passageWords = normalizedWords(passageText);
  if (passageWords.size === 0) return 0;
  const windowWords = normalizedWords(windowText);
  let matches = 0;
  for (const word of passageWords) if (windowWords.has(word)) matches += 1;
  return matches / passageWords.size;
}

/** Retrieval affects order only. Non-PDF index content is ignored, ties keep
 * document order, and the returned array contains every input window once. */
export function rankHighlightWindows(
  windows: HighlightTextWindow[],
  results: RetrievalResult[],
): HighlightTextWindow[] {
  const passages = results.filter((result) => result.chunk.source === "pdf-text");
  if (passages.length === 0) return [...windows];
  return windows
    .map((window) => ({
      window,
      score: passages.reduce(
        (sum, result) => sum + result.score * passageScore(window.text, result.chunk.text),
        0,
      ),
    }))
    .sort(
      (left, right) =>
        right.score - left.score || left.window.documentOrder - right.window.documentOrder,
    )
    .map(({ window }) => window);
}

/** Bisect one rejected payload while retaining the same overlap guarantee. */
export function splitHighlightWindow(text: string): string[] | null {
  if (text.length <= HIGHLIGHT_WINDOW_OVERLAP_CHARS + 1) return null;
  const midpoint = Math.floor(text.length / 2);
  const halfOverlap = Math.floor(HIGHLIGHT_WINDOW_OVERLAP_CHARS / 2);
  const leftEnd = Math.min(text.length, midpoint + halfOverlap);
  const rightStart = Math.max(0, midpoint - halfOverlap);
  const left = text.slice(0, leftEnd);
  const right = text.slice(rightStart);
  if (left.length >= text.length || right.length >= text.length) return null;
  return [left, right];
}
