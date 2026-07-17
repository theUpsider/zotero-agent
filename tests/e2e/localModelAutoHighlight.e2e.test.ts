import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { noopLogger } from "../../src/core/errors";
import { defaultColorSemantics } from "../../src/core/colorSemantics";
import { OpenAICompatibleProvider } from "../../src/providers/openaiCompatible";
import {
  composeHighlightPrompt,
  getHighlightSystemPrompt,
} from "../../src/prompts/scholarly";
import {
  parseHighlightSuggestions,
  planHighlights,
} from "../../src/workflows/highlights";
import {
  HIGHLIGHT_COMPLETION_TOKENS,
  splitHighlightWindow,
} from "../../src/workflows/highlightContext";
import type { PdfPageText } from "../../src/zotero/types";
import type { AIProvider } from "../../src/providers/types";
import type { HighlightSuggestion } from "../../src/workflows/highlights";

const ENDPOINT =
  process.env.ZOTERO_AGENT_E2E_ENDPOINT ?? "http://127.0.0.1:1234/v1";
const MODEL =
  process.env.ZOTERO_AGENT_E2E_MODEL ?? "nvidia/nemotron-3-nano-omni";
const FIXTURE_DIR = resolve("test-pdfs");
// Keep the E2E below the runtime's normal per-request window. Nemotron is a
// reasoning model, so a large prompt can spend a 4k completion entirely on
// hidden reasoning and legitimately return an empty, length-truncated answer.
const REQUEST_CHARS = 1_800;

function extractPages(path: string): PdfPageText[] {
  // `-layout` interleaves columns horizontally, creating text the Zotero-style
  // resolver can never anchor as a contiguous passage. `-raw` preserves the
  // content-stream reading order and form-feed page boundaries.
  const text = execFileSync("pdftotext", ["-raw", path, "-"], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return text
    .split("\f")
    .map((page, pageIndex) => ({
      pageIndex,
      pageLabel: String(pageIndex + 1),
      text: page.trim(),
    }))
    .filter((page) => page.text.length > 0);
}

/** Pick a substantial content page rather than a title/references page. The
 * writer test covers Zotero geometry; this live E2E isolates the real-model
 * contract that its suggested quotes can be resolved against extracted PDF
 * text. */
function representativePage(pages: PdfPageText[]): PdfPageText {
  const candidates = pages.filter(
    (page) =>
      page.text.length >= 1_500 &&
      /\b(method|result|study|review|analysis|propos(?:e|ed))\b/i.test(
        page.text,
      ),
  );
  return (candidates[0] ??
    pages.find((page) => page.text.length >= 1_500) ??
    pages[0]) as PdfPageText;
}

async function suggestWithTruncationRecovery(
  provider: AIProvider,
  text: string,
  depth = 0,
): Promise<HighlightSuggestion[]> {
  const categories = [
    "methodology",
    "results",
    "literature",
    "limitations",
    "data",
  ];
  const result = await provider.complete({
    messages: [
      { role: "system", content: getHighlightSystemPrompt(categories) },
      { role: "user", content: composeHighlightPrompt(text) },
    ],
    maxTokens: HIGHLIGHT_COMPLETION_TOKENS,
    temperature: 0,
  });
  const parsed = parseHighlightSuggestions(result.text);
  if (!result.truncated || depth >= 3) return parsed;
  const halves = splitHighlightWindow(text);
  if (!halves) return parsed;
  const recovered: HighlightSuggestion[] = [];
  for (const half of halves) {
    recovered.push(
      ...(await suggestWithTruncationRecovery(provider, half, depth + 1)),
    );
  }
  return [...parsed, ...recovered];
}

describe.skipIf(process.env.ZOTERO_AGENT_E2E !== "1")(
  "auto-highlight with the local OpenAI-compatible model",
  () => {
    const pdfs = readdirSync(FIXTURE_DIR)
      .filter((name) => name.toLowerCase().endsWith(".pdf"))
      .sort();

    it("has the two checked-in PDF fixtures", () => {
      expect(pdfs).toHaveLength(2);
    });

    for (const pdf of pdfs) {
      it(
        `returns placeable verbatim highlights for ${pdf}`,
        async () => {
          const pages = extractPages(resolve(FIXTURE_DIR, pdf));
          const page = representativePage(pages);
          const requestPage = {
            ...page,
            text: page.text.slice(0, REQUEST_CHARS),
          };
          const provider = new OpenAICompatibleProvider(
            {
              id: "openai-compatible",
              endpoint: ENDPOINT,
              model: MODEL,
              timeoutMs: 5 * 60_000,
            },
            { fetch: globalThis.fetch, logger: noopLogger },
          );

          const suggestions = await suggestWithTruncationRecovery(
            provider,
            `[PDF page ${requestPage.pageLabel}]\n${requestPage.text}`,
          );
          const plan = planHighlights(
            suggestions,
            [requestPage],
            defaultColorSemantics(),
            [],
          );

          const diagnostic = JSON.stringify(
            { suggestions, unresolved: plan.unresolved },
            null,
            2,
          );
          expect(suggestions.length, diagnostic).toBeGreaterThan(0);
          expect(plan.planned.length, diagnostic).toBeGreaterThan(0);
          expect(
            plan.unresolved.filter((entry) => entry.reason === "not-found"),
          ).toEqual([]);
        },
        6 * 60_000,
      );
    }
  },
);
