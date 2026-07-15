/** Workflow orchestrator (S2-02; FR-035, FR-036, BR-001, NFR-009).
 *
 * The single entry point for every AI call: run() is only ever invoked from
 * an explicit user action (menu / result-view button), calls the S1-05
 * provider gate first, then adapter → composer → provider. Progress reaches
 * the result view through a plain observer list; cancellation is cooperative
 * via AbortController, checked before each provider call (runtime view §5/§6).
 * One workflow at a time; a failing item leaves earlier sections intact and
 * never writes to Zotero (NFR-023 groundwork). */

import {
  configuredCategories,
  parseColorSemantics,
  type Category,
  type ColorSemantics,
} from "../core/colorSemantics";
import { getBoolPref, getIntPref, getStringPref, PREF_DEFAULTS, PREF_KEYS, type PrefStore } from "../core/config";
import { AgentError, toUserMessage, type ErrorCode, type Logger } from "../core/errors";
import { markdownToHtml } from "../core/markdown";
import { approxTokens } from "../core/tokens";
import {
  composeFreePrompt,
  composeItemContexts,
  composeTemplatePrompt,
  type ComposedContext,
  type ComposedItemContext,
} from "../prompts/composer";
import {
  composeAnalysisPrompt,
  composeHighlightPrompt,
  composeNoteFromAnnotationsPrompt,
  composeSummarizeNotesPrompt,
  composeTagSuggestionPrompt,
  parseTagSuggestions,
} from "../prompts/scholarly";
import { getTemplate, PROMPT_TEMPLATES, type PromptTemplate } from "../prompts/templates";
import type { AIProvider } from "../providers/types";
import type { RetrievalBackend, RetrievalResult } from "../retrieval/types";
import type {
  HighlightWriter,
  ItemContext,
  ItemContextReader,
  ItemRef,
  NoteWriter,
  TagWriter,
} from "../zotero/types";
import { parseHighlightSuggestions, planHighlights } from "./highlights";
import { summarizeHighlightRun } from "./highlightSummary";
import type { WorkflowId, WorkflowResult, WorkflowResultSection } from "./types";

export type WorkflowRunRequest =
  | { kind: "template"; templateId: string; items: ItemRef[] }
  | { kind: "free-prompt"; prompt: string; items: ItemRef[] }
  | { kind: "analyze-papers"; items: ItemRef[] }
  | { kind: "auto-highlight"; items: ItemRef[] }
  | { kind: "generate-notes"; items: ItemRef[] }
  | { kind: "summarize-notes"; items: ItemRef[] }
  | { kind: "suggest-tags"; items: ItemRef[] };

/** Per-item AI workflows share one loop (runPerItem): build a prompt from the
 * composed context, optionally short-circuit before the AI call, optionally
 * post-process the reply (tag writing). Free-prompt is the one exception —
 * a single combined call — and stays on its own path. */
interface PerItemPlan {
  buildPrompt: (item: ComposedItemContext, ctx: ItemContext) => string;
  /** Return a message to record instead of calling the provider (e.g. "no
   * annotations to process", S4-03) — never an empty AI call. */
  skip?: (ctx: ItemContext) => string | null;
  /** Transform the reply into the section markdown; used by suggest-tags to
   * write tags and report what was added (S4-05). */
  transform?: (ctx: ItemContext, markdown: string) => Promise<string>;
}

export type WorkflowEvent =
  | { type: "started"; workflowId: WorkflowId; itemCount: number }
  | { type: "progress"; message: string; fraction?: number }
  | { type: "item-completed"; section: WorkflowResultSection }
  | { type: "completed"; result: WorkflowResult }
  | { type: "failed"; code: ErrorCode; message: string }
  | { type: "cancelled" };

export interface SaveNotesOutcome {
  saved: { itemKey: string; noteKey: string }[];
  failed: { itemKey: string; message: string }[];
}

/** Optional retrieval integration (S3-05). Absent entirely = Sprint 2
 * behavior (char-budget truncation only, no retrieval passages) — orchestrator
 * tests that don't set this up keep working unchanged. */
export interface OrchestratorRetrievalDeps {
  backend: RetrievalBackend;
  /** Queue items for background (re)indexing; called for items whose PDF
   * text is over budget but not yet indexed, so the *next* run benefits. */
  enqueueReindex?: (refs: ItemRef[]) => void;
}

export interface OrchestratorDeps {
  /** S1-05 gate; plugin glue passes () => ensureProviderReady(gateDeps). */
  ensureProvider: () => Promise<AIProvider>;
  reader: ItemContextReader;
  noteWriter: NoteWriter;
  /** Required for the suggest-tags workflow (S4-05); absent = that workflow
   * fails cleanly with a config error. */
  tagWriter?: TagWriter;
  /** Required for the auto-highlight workflow (S5-02); absent = that workflow
   * fails cleanly with a config error. */
  highlightWriter?: HighlightWriter;
  prefs: PrefStore;
  logger: Logger;
  retrieval?: OrchestratorRetrievalDeps;
}

const WORKFLOW_ID_BY_KIND: Record<WorkflowRunRequest["kind"], WorkflowId> = {
  template: "prompt-template",
  "free-prompt": "free-prompt",
  "analyze-papers": "analyze-papers",
  "auto-highlight": "auto-highlight",
  "generate-notes": "generate-notes",
  "summarize-notes": "summarize-notes",
  "suggest-tags": "suggest-tags",
};

/** One-line retrieval query per workflow (S3-05): drives which passages are
 * pulled when an item's PDF text is over the token budget. */
function retrievalQueryText(
  request: WorkflowRunRequest,
  template: PromptTemplate | undefined,
  categories: Category[],
): string {
  switch (request.kind) {
    case "template":
      return (template as PromptTemplate).retrievalHint ?? (template as PromptTemplate).label;
    case "free-prompt":
      return request.prompt;
    case "analyze-papers":
    case "auto-highlight":
      return categories.join(", ");
    case "generate-notes":
      return "key annotations and highlights";
    case "summarize-notes":
      return "notes and annotations summary";
    case "suggest-tags":
      return "main topics, themes, and keywords";
  }
}

/** The prompt/skip/transform strategy for a per-item workflow. free-prompt
 * never reaches here (handled by runFreePrompt). */
function planFor(
  request: WorkflowRunRequest,
  template: PromptTemplate | undefined,
  categories: Category[],
  tagWriter: TagWriter | undefined,
): PerItemPlan {
  switch (request.kind) {
    case "template":
      return { buildPrompt: (item) => composeTemplatePrompt(template as PromptTemplate, item.contextText) };
    case "analyze-papers":
      return { buildPrompt: (item) => composeAnalysisPrompt(item.contextText, categories) };
    case "generate-notes":
      return {
        buildPrompt: (item) => composeNoteFromAnnotationsPrompt(item.contextText),
        skip: (ctx) =>
          ctx.annotations.length === 0
            ? "This item has no annotations or highlights to turn into a note."
            : null,
      };
    case "summarize-notes":
      return {
        buildPrompt: (item) => composeSummarizeNotesPrompt(item.contextText),
        skip: (ctx) =>
          ctx.notes.length === 0 && ctx.annotations.length === 0
            ? "This item has no notes or annotations to summarize."
            : null,
      };
    case "suggest-tags":
      return {
        buildPrompt: (item, ctx) => composeTagSuggestionPrompt(item.contextText, ctx.tags),
        transform: async (ctx, markdown) => {
          const { added } = await (tagWriter as TagWriter).addTags(ctx.ref, parseTagSuggestions(markdown));
          return added.length > 0
            ? `Added ${added.length} tag${added.length === 1 ? "" : "s"}: ${added.join(", ")}`
            : "No new tags were added.";
        },
      };
    case "free-prompt":
    case "auto-highlight":
      // Both run on their own path (runFreePrompt / runAutoHighlight).
      throw new AgentError("invalid-config", `${request.kind} has no per-item plan.`);
  }
}

export interface WorkflowOrchestrator {
  /** Resolves when the run reaches a terminal event (completed / failed /
   * cancelled) — outcome is delivered via events. Rejects only when a
   * workflow is already running (runtime view §6). */
  run(request: WorkflowRunRequest): Promise<void>;
  cancel(): void;
  isRunning(): boolean;
  lastResult(): WorkflowResult | null;
  subscribe(listener: (event: WorkflowEvent) => void): () => void;
  /** Save the last result as child notes, one per analyzed item (FR-055,
   * FR-092). A failing item does not block the others. */
  saveResultAsNotes(): Promise<SaveNotesOutcome>;
}

/** Template workflows for menu/UI listing; ui/ may not import prompts/
 * directly (component view §3), so the list is surfaced here. */
export function listTemplateWorkflows(): { id: string; label: string }[] {
  return PROMPT_TEMPLATES.map(({ id, label }) => ({ id, label }));
}

function truncationNotice(composed: ComposedContext): string | undefined {
  if (composed.truncations.length === 0) return undefined;
  const keys = composed.truncations.map((t) => t.itemKey).join(", ");
  return (
    `These items are not indexed yet, so the result is based on truncated text: ${keys}. ` +
    "The index is being updated in the background."
  );
}

/** Queries the retrieval backend for items whose PDF text exceeds the token
 * budget, one query per over-budget item so passage allocation stays fair
 * across a multi-item selection (S3-05). Items with no PDF text, or that
 * fit the budget, are skipped entirely — retrieval never degrades small
 * PDFs (NFR-004: full text is sent whenever it already fits). Unindexed
 * over-budget items are queued for background indexing so the *next* run
 * benefits; the composer's existing char-budget fallback covers this run. */
async function retrieveContext(
  contexts: ItemContext[],
  queryText: string,
  tokenBudgetPerItem: number,
  passagesPerItem: number,
  retrieval: OrchestratorRetrievalDeps,
  logger: Logger,
): Promise<Map<string, RetrievalResult[]>> {
  const retrievedByItem = new Map<string, RetrievalResult[]>();
  const overBudget = contexts.filter(
    (c) => c.pdfText && approxTokens(c.pdfText) > tokenBudgetPerItem,
  );
  if (overBudget.length === 0) return retrievedByItem;

  let indexedKeys: Set<string>;
  try {
    indexedKeys = new Set(await retrieval.backend.listIndexedItemKeys());
  } catch (error) {
    logger.error("listIndexedItemKeys failed; skipping retrieval for this run", error);
    return retrievedByItem;
  }

  const notIndexed: ItemRef[] = [];
  for (const context of overBudget) {
    const key = context.metadata.key;
    if (!indexedKeys.has(key)) {
      notIndexed.push(context.ref);
      continue;
    }
    try {
      const results = await retrieval.backend.query({
        text: queryText,
        itemKeys: [key],
        limit: passagesPerItem,
        mode: "hybrid",
      });
      if (results.length > 0) retrievedByItem.set(key, results);
    } catch (error) {
      logger.error(`retrieval query failed for item ${key}`, error);
    }
  }
  if (notIndexed.length > 0) retrieval.enqueueReindex?.(notIndexed);
  return retrievedByItem;
}

export function createWorkflowOrchestrator(deps: OrchestratorDeps): WorkflowOrchestrator {
  const listeners = new Set<(event: WorkflowEvent) => void>();
  let running = false;
  let controller: AbortController | null = null;
  let last: { request: WorkflowRunRequest; result: WorkflowResult } | null = null;

  const emit = (event: WorkflowEvent) => {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (error) {
        deps.logger.error("workflow listener failed", error);
      }
    }
  };

  const complete = async (
    provider: AIProvider,
    prompt: string,
    signal: AbortSignal,
  ): Promise<string> => {
    const result = await provider.complete({
      messages: [{ role: "user", content: prompt }],
      signal,
    });
    return result.text;
  };

  /** Runs a per-item plan, pushing into `sections` as each item finishes so a
   * mid-run failure leaves completed sections inspectable (NFR-023) and any
   * writes on earlier items stay valid (S4-06). */
  const runPerItem = async (
    provider: AIProvider,
    composed: ComposedContext,
    contexts: ItemContext[],
    signal: AbortSignal,
    sections: WorkflowResultSection[],
    plan: PerItemPlan,
  ): Promise<WorkflowResultSection[]> => {
    const byKey = new Map(contexts.map((c) => [c.metadata.key, c]));
    for (const [index, item] of composed.items.entries()) {
      signal.throwIfAborted();
      emit({
        type: "progress",
        message: `Working on "${item.title || item.ref.key}"…`,
        fraction: index / composed.items.length,
      });
      const ctx = byKey.get(item.ref.key);
      const skipMessage = ctx ? plan.skip?.(ctx) ?? null : null;
      let markdown: string;
      let truncated = item.truncation !== undefined;
      if (skipMessage !== null) {
        // No AI call — record the reason (S4-03/S4-04).
        markdown = skipMessage;
        truncated = false;
      } else {
        markdown = await complete(provider, plan.buildPrompt(item, ctx as ItemContext), signal);
        if (plan.transform && ctx) markdown = await plan.transform(ctx, markdown);
      }
      const section: WorkflowResultSection = { ref: item.ref, title: item.title, markdown, truncated };
      sections.push(section);
      emit({ type: "item-completed", section });
    }
    return sections;
  };

  const runFreePrompt = async (
    provider: AIProvider,
    prompt: string,
    composed: ComposedContext,
    signal: AbortSignal,
  ): Promise<WorkflowResultSection[]> => {
    signal.throwIfAborted();
    emit({ type: "progress", message: "Querying model…" });
    const markdown = await complete(
      provider,
      composeFreePrompt(prompt, composed.combinedText),
      signal,
    );
    // One answer over all items; every item gets the same note on save (FR-055).
    return composed.items.map((item) => ({
      ref: item.ref,
      title: item.title,
      markdown,
      truncated: item.truncation !== undefined,
    }));
  };

  /** Auto-highlight (S5-02): per item, ask the model for passages, resolve them
   * to PDF positions, and draw highlights. Runs to completion after the single
   * user start — no per-highlight prompt (FR-047). Each item's writes commit
   * before the next starts, so a mid-run failure leaves earlier items' created
   * highlights valid and reports the rest (NFR-023). */
  const runAutoHighlight = async (
    provider: AIProvider,
    composed: ComposedContext,
    signal: AbortSignal,
    sections: WorkflowResultSection[],
    colorSemantics: ColorSemantics,
    categories: Category[],
    highlightWriter: HighlightWriter,
  ): Promise<WorkflowResultSection[]> => {
    for (const [index, item] of composed.items.entries()) {
      signal.throwIfAborted();
      emit({
        type: "progress",
        message: `Highlighting "${item.title || item.ref.key}"…`,
        fraction: index / composed.items.length,
      });
      const targets = await highlightWriter.readTargets(item.ref);
      let markdown: string;
      if (targets.pages.length === 0) {
        markdown = "This item has no readable PDF text, so nothing was highlighted.";
      } else {
        const reply = await complete(
          provider,
          composeHighlightPrompt(item.contextText, categories),
          signal,
        );
        const suggestions = parseHighlightSuggestions(reply);
        const { planned, unresolved } = planHighlights(
          suggestions,
          targets.pages,
          colorSemantics,
          targets.existing,
        );
        signal.throwIfAborted();
        const { created, failed } = await highlightWriter.createHighlights(item.ref, planned);
        markdown = summarizeHighlightRun({ created, unresolved, failed });
      }
      const section: WorkflowResultSection = {
        ref: item.ref,
        title: item.title,
        markdown,
        truncated: item.truncation !== undefined,
      };
      sections.push(section);
      emit({ type: "item-completed", section });
    }
    return sections;
  };

  const execute = async (request: WorkflowRunRequest, signal: AbortSignal): Promise<void> => {
    const workflowId = WORKFLOW_ID_BY_KIND[request.kind];
    if (request.items.length === 0) {
      emit({ type: "failed", code: "invalid-config", message: "No items selected." });
      return;
    }
    const template = request.kind === "template" ? getTemplate(request.templateId) : undefined;
    if (request.kind === "template" && !template) {
      emit({
        type: "failed",
        code: "invalid-config",
        message: `Unknown prompt template '${request.templateId}'.`,
      });
      return;
    }
    if (request.kind === "free-prompt" && request.prompt.trim() === "") {
      emit({ type: "failed", code: "invalid-config", message: "Enter a prompt first." });
      return;
    }
    if (request.kind === "suggest-tags" && !deps.tagWriter) {
      emit({ type: "failed", code: "invalid-config", message: "Tag writing is unavailable." });
      return;
    }
    if (request.kind === "auto-highlight" && !deps.highlightWriter) {
      emit({ type: "failed", code: "invalid-config", message: "Highlighting is unavailable." });
      return;
    }

    emit({ type: "started", workflowId, itemCount: request.items.length });

    const partialSections: WorkflowResultSection[] = [];
    try {
      const provider = await deps.ensureProvider();

      emit({ type: "progress", message: "Reading items…" });
      const contexts = await deps.reader.readItemContexts(request.items);
      if (contexts.length === 0) {
        emit({ type: "failed", code: "invalid-config", message: "The selected items no longer exist." });
        return;
      }
      const colorSemantics = parseColorSemantics(getStringPref(deps.prefs, PREF_KEYS.colorSemantics));
      const categories = configuredCategories(colorSemantics);
      const tokenBudgetPerItem = getIntPref(
        deps.prefs,
        PREF_KEYS.contextTokenBudget,
        PREF_DEFAULTS[PREF_KEYS.contextTokenBudget] as number,
      );
      let retrievedByItem: Map<string, RetrievalResult[]> | undefined;
      if (deps.retrieval && getBoolPref(deps.prefs, PREF_KEYS.retrievalEnabled, true)) {
        const passagesPerItem = getIntPref(
          deps.prefs,
          PREF_KEYS.retrievalPassagesPerItem,
          PREF_DEFAULTS[PREF_KEYS.retrievalPassagesPerItem] as number,
        );
        retrievedByItem = await retrieveContext(
          contexts,
          retrievalQueryText(request, template, categories),
          tokenBudgetPerItem,
          passagesPerItem,
          deps.retrieval,
          deps.logger,
        );
      }

      const composed = composeItemContexts(contexts, colorSemantics, {
        pdfTextCharBudgetPerItem: getIntPref(
          deps.prefs,
          PREF_KEYS.contextCharBudget,
          PREF_DEFAULTS[PREF_KEYS.contextCharBudget] as number,
        ),
        tokenBudgetPerItem,
        ...(retrievedByItem ? { retrievedByItem } : {}),
      });

      let sections: WorkflowResultSection[];
      if (request.kind === "free-prompt") {
        sections = await runFreePrompt(provider, request.prompt, composed, signal);
      } else if (request.kind === "auto-highlight") {
        sections = await runAutoHighlight(
          provider,
          composed,
          signal,
          partialSections,
          colorSemantics,
          categories,
          deps.highlightWriter as HighlightWriter,
        );
      } else {
        sections = await runPerItem(
          provider,
          composed,
          contexts,
          signal,
          partialSections,
          planFor(request, template, categories, deps.tagWriter),
        );
      }

      const notice = truncationNotice(composed);
      const content =
        request.kind === "free-prompt"
          ? (sections[0]?.markdown ?? "")
          : sections.map((s) => `## ${s.title || s.ref.key}\n\n${s.markdown}`).join("\n\n");
      const result: WorkflowResult = {
        workflowId,
        content,
        sections,
        ...(notice !== undefined ? { truncationNotice: notice } : {}),
      };
      last = { request, result };
      emit({ type: "completed", result });
    } catch (error) {
      if (signal.aborted) {
        emit({ type: "cancelled" });
        return;
      }
      const code: ErrorCode = error instanceof AgentError ? error.code : "unknown";
      deps.logger.error(`workflow ${workflowId} failed (${code})`, error);
      // Earlier per-item sections stay inspectable, but nothing was written
      // to Zotero (NFR-023).
      if (partialSections.length > 0) {
        last = {
          request,
          result: { workflowId, content: "", sections: partialSections },
        };
      }
      emit({ type: "failed", code, message: toUserMessage(error) });
    }
  };

  return {
    async run(request: WorkflowRunRequest): Promise<void> {
      if (running) {
        throw new AgentError("invalid-config", "A workflow is already running.");
      }
      running = true;
      controller = new AbortController();
      try {
        await execute(request, controller.signal);
      } finally {
        running = false;
        controller = null;
      }
    },

    cancel(): void {
      controller?.abort();
    },

    isRunning(): boolean {
      return running;
    },

    lastResult(): WorkflowResult | null {
      return last?.result ?? null;
    },

    subscribe(listener: (event: WorkflowEvent) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async saveResultAsNotes(): Promise<SaveNotesOutcome> {
      const outcome: SaveNotesOutcome = { saved: [], failed: [] };
      if (!last) return outcome;
      for (const section of last.result.sections) {
        try {
          const html = markdownToHtml(section.markdown);
          const { noteKey } = await deps.noteWriter.createChildNote(section.ref, html);
          outcome.saved.push({ itemKey: section.ref.key, noteKey });
        } catch (error) {
          deps.logger.error(`saving note for ${section.ref.key} failed`, error);
          outcome.failed.push({ itemKey: section.ref.key, message: toUserMessage(error) });
        }
      }
      return outcome;
    },
  };
}
