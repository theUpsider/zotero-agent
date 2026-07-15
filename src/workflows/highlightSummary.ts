/** Result-view summary for an auto-highlight run (S5-02 AC#4). Pure string
 * assembly — no Zotero — so it is unit-tested. Groups created highlights by
 * category with page numbers, and honestly reports fallbacks, duplicates
 * skipped, quotes that could not be anchored, and write failures (NFR-023). */

import type { CreatedHighlight } from "../zotero/types";
import type { UnresolvedHighlight } from "./highlights";

export interface HighlightRunReport {
  created: CreatedHighlight[];
  unresolved: UnresolvedHighlight[];
  failed: { text: string; reason: string }[];
}

function pageList(highlights: CreatedHighlight[]): string {
  const labels = [...new Set(highlights.map((h) => h.pageLabel))];
  return labels.join(", ");
}

export function summarizeHighlightRun(report: HighlightRunReport): string {
  const { created, unresolved, failed } = report;
  const lines: string[] = [];

  const notes = created.filter((c) => c.kind === "note");

  if (created.length === 0) {
    lines.push("No new highlights were created.");
  } else {
    lines.push(`Created ${created.length} highlight${created.length === 1 ? "" : "s"}:`);
    lines.push("");
    const byCategory = new Map<string, CreatedHighlight[]>();
    for (const highlight of created) {
      const list = byCategory.get(highlight.category) ?? [];
      list.push(highlight);
      byCategory.set(highlight.category, list);
    }
    for (const [category, list] of byCategory) {
      lines.push(`- **${category}**: ${list.length} on page(s) ${pageList(list)}`);
    }
  }

  if (notes.length > 0) {
    lines.push("");
    lines.push(
      `${notes.length} passage${notes.length === 1 ? " was" : "s were"} added as page note ` +
        "annotation(s) because exact highlight positions could not be computed.",
    );
  }

  const duplicates = unresolved.filter((u) => u.reason === "duplicate");
  if (duplicates.length > 0) {
    lines.push("");
    lines.push(
      `${duplicates.length} passage${duplicates.length === 1 ? "" : "s"} skipped as already ` +
        "highlighted.",
    );
  }

  const notFound = unresolved.filter((u) => u.reason === "not-found");
  if (notFound.length > 0) {
    lines.push("");
    lines.push("Could not locate these suggested passages in the PDF text:");
    for (const item of notFound) lines.push(`- [${item.category}] “${item.quote}”`);
  }

  const noColor = unresolved.filter((u) => u.reason === "no-color");
  if (noColor.length > 0) {
    lines.push("");
    lines.push("These categories have no color mapped, so nothing was highlighted for them:");
    for (const item of noColor) lines.push(`- ${item.category}`);
  }

  if (failed.length > 0) {
    lines.push("");
    lines.push("Some highlights could not be written:");
    for (const item of failed) lines.push(`- “${item.text}” — ${item.reason}`);
  }

  return lines.join("\n");
}
