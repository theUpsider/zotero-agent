/** Prompt composer (S2-03, extended S3-05): builds the {{context}} block from
 * adapter output — metadata header, annotations grouped by color category
 * (FR-034), notes, tags, and PDF text. When an item's PDF text exceeds the
 * token budget, retrieved passages replace it (S3-05); the character-budget
 * truncation from S2-03 remains the fallback for items the index hasn't
 * covered yet. Pure module; imports only plain types from the adapter and
 * retrieval/ (never a concrete backend). Output is deterministic for
 * identical input. */

import type { ColorSemantics } from "../core/colorSemantics";
import { categoriesForColor } from "../core/colorSemantics";
import { stripHtml, truncateAtBoundary } from "../core/text";
import { approxTokens, tokenBudgetToChars } from "../core/tokens";
import type { RetrievalResult } from "../retrieval/types";
import type { AnnotationInfo, ItemContext, ItemRef } from "../zotero/types";
import type { PromptTemplate } from "./templates";
import { renderTemplate } from "./templates";

// Re-exported for existing test/import compatibility; canonical impl in core/text.ts.
export { truncateAtBoundary };

export interface ComposeOptions {
  /** Max characters of PDF full text included per item (S2-03 fallback cap;
   * still applies when the item isn't indexed yet, see contextSource below). */
  pdfTextCharBudgetPerItem: number;
  /** Soft token budget for an item's PDF-text section (S3-05, NFR-004). When
   * set and exceeded, retrieved passages replace full text if available. */
  tokenBudgetPerItem?: number;
  /** Retrieved passages keyed by item key, used when an item's PDF text
   * exceeds tokenBudgetPerItem. An item absent from this map is treated as
   * "not indexed yet" and falls back to char-budget truncation. */
  retrievedByItem?: Map<string, RetrievalResult[]>;
}

/** Records that an item's PDF text was cut (surfaced in the result view —
 * "interim honesty" per S2-03; now only reached when the item isn't indexed). */
export interface TruncationNote {
  itemKey: string;
  includedChars: number;
  totalChars: number;
}

/** How an item's PDF-text section was produced (S3-05). */
export type ContextSource =
  | "retrieval"
  | "full-text"
  | "truncated-full-text"
  | "no-pdf";

export interface ComposedItemContext {
  ref: ItemRef;
  title: string;
  contextText: string;
  truncation?: TruncationNote;
  contextSource: ContextSource;
}

export interface ComposedContext {
  items: ComposedItemContext[];
  /** All item sections joined; one clearly-delimited section per item (FR-036). */
  combinedText: string;
  truncations: TruncationNote[];
}

const UNCATEGORIZED = "Uncategorized";

function groupAnnotationsByCategory(
  annotations: AnnotationInfo[],
  mapping: ColorSemantics,
): Map<string, AnnotationInfo[]> {
  const groups = new Map<string, AnnotationInfo[]>();
  for (const annotation of annotations) {
    const categories = annotation.color
      ? categoriesForColor(mapping, annotation.color)
      : [];
    const labels =
      categories.length > 0
        ? categories
        : [
            annotation.color
              ? `${UNCATEGORIZED} (${annotation.color})`
              : UNCATEGORIZED,
          ];
    for (const label of labels) {
      const group = groups.get(label) ?? [];
      group.push(annotation);
      groups.set(label, group);
    }
  }
  return groups;
}

function formatAnnotation(annotation: AnnotationInfo): string {
  const page = annotation.pageLabel ? ` (p. ${annotation.pageLabel})` : "";
  const comment = annotation.comment ? ` — Comment: ${annotation.comment}` : "";
  const text =
    annotation.text || `[${annotation.type || "annotation"} without text]`;
  return `- "${text}"${page}${comment}`;
}

function composeItem(
  item: ItemContext,
  mapping: ColorSemantics,
  options: ComposeOptions,
): ComposedItemContext {
  const m = item.metadata;
  const lines: string[] = [];

  lines.push(`=== Item: ${m.title || "(untitled)"} (${m.key}) ===`);
  const headerFields: [string, string][] = [
    ["Type", m.itemType],
    ["Authors", m.creators.join(", ")],
    ["Year", m.year],
    ["Publication", m.publication],
    ["DOI", m.doi],
    ["URL", m.url],
  ];
  for (const [label, value] of headerFields) {
    if (value) lines.push(`${label}: ${value}`);
  }
  if (m.abstract) lines.push(`Abstract: ${m.abstract}`);
  if (item.tags.length > 0) lines.push(`Tags: ${item.tags.join(", ")}`);

  if (item.annotations.length > 0) {
    lines.push("", "Annotations (grouped by category):");
    // Sort group labels for deterministic output regardless of map order.
    const groups = groupAnnotationsByCategory(item.annotations, mapping);
    for (const label of [...groups.keys()].sort()) {
      lines.push(`[${label}]`);
      for (const annotation of groups.get(label) ?? []) {
        lines.push(formatAnnotation(annotation));
      }
    }
  }

  if (item.notes.length > 0) {
    lines.push("", "Notes:");
    for (const note of item.notes) {
      const text = stripHtml(note.html);
      if (text) lines.push(`--- Note: ${note.title || "(untitled)"} ---`, text);
    }
  }

  let truncation: TruncationNote | undefined;
  let contextSource: ContextSource = "no-pdf";
  if (item.pdfText) {
    const overCharBudget =
      item.pdfText.length > options.pdfTextCharBudgetPerItem;
    const overTokenBudget =
      options.tokenBudgetPerItem !== undefined &&
      approxTokens(item.pdfText) > options.tokenBudgetPerItem;

    if (!overCharBudget && !overTokenBudget) {
      lines.push("", "Full text:", item.pdfText);
      contextSource = "full-text";
    } else {
      const passages = options.retrievedByItem?.get(m.key);
      if (
        options.tokenBudgetPerItem !== undefined &&
        passages &&
        passages.length > 0
      ) {
        lines.push("", "Relevant passages (retrieved for this question):");
        const budgetChars = tokenBudgetToChars(options.tokenBudgetPerItem);
        let used = 0;
        for (const { chunk } of passages) {
          const label = chunk.page ? `[p. ${chunk.page}]` : "[passage]";
          const line = `${label} "${chunk.text}"`;
          if (used > 0 && used + line.length > budgetChars) break;
          lines.push(line);
          used += line.length;
        }
        contextSource = "retrieval";
      } else {
        let pdfText = item.pdfText;
        if (overCharBudget) {
          pdfText = truncateAtBoundary(
            pdfText,
            options.pdfTextCharBudgetPerItem,
          );
          truncation = {
            itemKey: m.key,
            includedChars: pdfText.length,
            totalChars: item.pdfText.length,
          };
        }
        lines.push("", "Full text:", pdfText);
        if (truncation) {
          lines.push(
            `[Note: full text truncated to ${truncation.includedChars} of ${truncation.totalChars} characters]`,
          );
        }
        contextSource = truncation ? "truncated-full-text" : "full-text";
      }
    }
  }

  const composed: ComposedItemContext = {
    ref: item.ref,
    title: m.title,
    contextText: lines.join("\n"),
    contextSource,
  };
  if (truncation) composed.truncation = truncation;
  return composed;
}

export function composeItemContexts(
  items: ItemContext[],
  colorSemantics: ColorSemantics,
  options: ComposeOptions,
): ComposedContext {
  const composed = items.map((item) =>
    composeItem(item, colorSemantics, options),
  );
  return {
    items: composed,
    combinedText: composed.map((item) => item.contextText).join("\n\n"),
    truncations: composed.flatMap((item) =>
      item.truncation ? [item.truncation] : [],
    ),
  };
}

export function composeTemplatePrompt(
  template: PromptTemplate,
  contextText: string,
): string {
  return renderTemplate(template, contextText);
}

/** One-line role shared across all free-prompt runs. No task-specific
 * instructions — the user writes those in their own prompt. */
export function getFreePromptSystemPrompt(): string {
  return (
    "You are a scholarly research assistant. Answer questions based on the provided paper " +
    "content. Write in well-structured Markdown with level-2 headings where appropriate. " +
    "Use only the provided content — do not invent information or cite sources not present " +
    "in the papers. If the provided content does not contain the answer, say so clearly."
  );
}

/** Free-form prompt over the composed context (FR-081, FR-089).
 * The preamble is now in the system prompt — user message is just the user's
 * question + paper content. */
export function composeFreePrompt(
  userPrompt: string,
  contextText: string,
): string {
  return `${userPrompt.trim()}\n\n${contextText}`;
}
