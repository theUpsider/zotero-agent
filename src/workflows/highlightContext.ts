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
export const HIGHLIGHT_COMPLETION_TOKENS = 4_096;
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
  const payloadTokens =
    Math.floor(contextWindowTokens) -
    promptOverheadTokens -
    HIGHLIGHT_COMPLETION_TOKENS -
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
    completionTokens: HIGHLIGHT_COMPLETION_TOKENS,
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

/** The whole serialized PDF is one window when possible. Otherwise fixed-size
 * maximal windows advance by budget-overlap, preserving 500 source characters
 * across every cut — including cuts at or around PDF page boundaries. */
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
  const step = size - HIGHLIGHT_WINDOW_OVERLAP_CHARS;
  for (let start = 0; start < document.length; start += step) {
    const end = Math.min(document.length, start + size);
    windows.push({
      text: document.slice(start, end),
      start,
      end,
      documentOrder: windows.length,
    });
    if (end === document.length) break;
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
