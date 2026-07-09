/** Prompt composer (S2-03): builds the {{context}} block from adapter output
 * — metadata header, annotations grouped by color category (FR-034), notes,
 * tags, and PDF text under an explicit per-item character budget (interim
 * until retrieval lands in Sprint 3). Pure module; imports only plain types
 * from the adapter. Output is deterministic for identical input. */

import type { ColorSemantics } from "../core/colorSemantics";
import { categoriesForColor } from "../core/colorSemantics";
import type { AnnotationInfo, ItemContext, ItemRef } from "../zotero/types";
import type { PromptTemplate } from "./templates";
import { renderTemplate } from "./templates";

export interface ComposeOptions {
  /** Max characters of PDF full text included per item. */
  pdfTextCharBudgetPerItem: number;
}

/** Records that an item's PDF text was cut (surfaced in the result view —
 * "interim honesty" per S2-03). */
export interface TruncationNote {
  itemKey: string;
  includedChars: number;
  totalChars: number;
}

export interface ComposedItemContext {
  ref: ItemRef;
  title: string;
  contextText: string;
  truncation?: TruncationNote;
}

export interface ComposedContext {
  items: ComposedItemContext[];
  /** All item sections joined; one clearly-delimited section per item (FR-036). */
  combinedText: string;
  truncations: TruncationNote[];
}

const UNCATEGORIZED = "Uncategorized";

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

function stripHtml(html: string): string {
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

function groupAnnotationsByCategory(
  annotations: AnnotationInfo[],
  mapping: ColorSemantics,
): Map<string, AnnotationInfo[]> {
  const groups = new Map<string, AnnotationInfo[]>();
  for (const annotation of annotations) {
    const categories = annotation.color ? categoriesForColor(mapping, annotation.color) : [];
    const labels =
      categories.length > 0
        ? categories
        : [annotation.color ? `${UNCATEGORIZED} (${annotation.color})` : UNCATEGORIZED];
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
  const text = annotation.text || `[${annotation.type || "annotation"} without text]`;
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
  if (item.pdfText) {
    let pdfText = item.pdfText;
    if (pdfText.length > options.pdfTextCharBudgetPerItem) {
      pdfText = truncateAtBoundary(pdfText, options.pdfTextCharBudgetPerItem);
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
  }

  const composed: ComposedItemContext = {
    ref: item.ref,
    title: m.title,
    contextText: lines.join("\n"),
  };
  if (truncation) composed.truncation = truncation;
  return composed;
}

export function composeItemContexts(
  items: ItemContext[],
  colorSemantics: ColorSemantics,
  options: ComposeOptions,
): ComposedContext {
  const composed = items.map((item) => composeItem(item, colorSemantics, options));
  return {
    items: composed,
    combinedText: composed.map((item) => item.contextText).join("\n\n"),
    truncations: composed.flatMap((item) => (item.truncation ? [item.truncation] : [])),
  };
}

export function composeTemplatePrompt(template: PromptTemplate, contextText: string): string {
  return renderTemplate(template, contextText);
}

/** Free-form prompt over the composed context (FR-081, FR-089). */
export function composeFreePrompt(userPrompt: string, contextText: string): string {
  return (
    `${userPrompt.trim()}\n\n` +
    `Answer based on the following paper content:\n\n${contextText}`
  );
}
