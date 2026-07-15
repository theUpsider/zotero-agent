/** Workflow orchestrator (S2-02; FR-035, FR-036, BR-001, NFR-009).
 *
 * The single entry point for every AI call: run() is only ever invoked from
 * an explicit user action (menu / result-view button), calls the S1-05
 * provider gate first, then adapter → composer → provider. Progress reaches
 * the result view through a plain observer list; cancellation is cooperative
 * via AbortController, checked before each provider call (runtime view §5/§6).
 * One workflow at a time; a failing item leaves earlier sections intact and
 * never writes to Zotero (NFR-023 groundwork). */

import { parseColorSemantics } from "../core/colorSemantics";
import { getBoolPref, getIntPref, getStringPref, PREF_DEFAULTS, PREF_KEYS, type PrefStore } from "../core/config";
import { AgentError, toUserMessage, type ErrorCode, type Logger } from "../core/errors";
import { markdownToHtml } from "../core/markdown";
import { approxTokens } from "../core/tokens";
import {
  composeFreePrompt,
  composeItemContexts,
  composeTemplatePrompt,
  type ComposedContext,
} from "../prompts/composer";
import { getTemplate, PROMPT_TEMPLATES, type PromptTemplate } from "../prompts/templates";
import type { AIProvider } from "../providers/types";
import type { RetrievalBackend, RetrievalResult } from "../retrieval/types";
import type { ItemContext, ItemContextReader, ItemRef, NoteWriter } from "../zotero/types";
import type { WorkflowId, WorkflowResult, WorkflowResultSection } from "./types";

export type WorkflowRunRequest =
  | { kind: "template"; templateId: string; items: ItemRef[] }
  | { kind: "free-prompt"; prompt: string; items: ItemRef[] };

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
  prefs: PrefStore;
  logger: Logger;
  retrieval?: OrchestratorRetrievalDeps;
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

  /** Pushes into `sections` as items finish so a mid-run failure leaves the
   * completed sections inspectable (NFR-023). */
  const runTemplate = async (
    provider: AIProvider,
    template: PromptTemplate,
    composed: ComposedContext,
    signal: AbortSignal,
    sections: WorkflowResultSection[],
  ): Promise<WorkflowResultSection[]> => {
    for (const [index, item] of composed.items.entries()) {
      signal.throwIfAborted();
      emit({
        type: "progress",
        message: `Querying model for "${item.title || item.ref.key}"…`,
        fraction: index / composed.items.length,
      });
      const markdown = await complete(
        provider,
        composeTemplatePrompt(template, item.contextText),
        signal,
      );
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

  const execute = async (request: WorkflowRunRequest, signal: AbortSignal): Promise<void> => {
    const workflowId: WorkflowId = request.kind === "template" ? "prompt-template" : "free-prompt";
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
      const tokenBudgetPerItem = getIntPref(
        deps.prefs,
        PREF_KEYS.contextTokenBudget,
        PREF_DEFAULTS[PREF_KEYS.contextTokenBudget] as number,
      );
      let retrievedByItem: Map<string, RetrievalResult[]> | undefined;
      if (deps.retrieval && getBoolPref(deps.prefs, PREF_KEYS.retrievalEnabled, true)) {
        const queryText =
          request.kind === "template"
            ? (template as PromptTemplate).retrievalHint ?? (template as PromptTemplate).label
            : request.prompt;
        const passagesPerItem = getIntPref(
          deps.prefs,
          PREF_KEYS.retrievalPassagesPerItem,
          PREF_DEFAULTS[PREF_KEYS.retrievalPassagesPerItem] as number,
        );
        retrievedByItem = await retrieveContext(
          contexts,
          queryText,
          tokenBudgetPerItem,
          passagesPerItem,
          deps.retrieval,
          deps.logger,
        );
      }

      const composed = composeItemContexts(
        contexts,
        parseColorSemantics(getStringPref(deps.prefs, PREF_KEYS.colorSemantics)),
        {
          pdfTextCharBudgetPerItem: getIntPref(
            deps.prefs,
            PREF_KEYS.contextCharBudget,
            PREF_DEFAULTS[PREF_KEYS.contextCharBudget] as number,
          ),
          tokenBudgetPerItem,
          ...(retrievedByItem ? { retrievedByItem } : {}),
        },
      );

      const sections =
        request.kind === "template"
          ? await runTemplate(provider, template as PromptTemplate, composed, signal, partialSections)
          : await runFreePrompt(provider, request.prompt, composed, signal);

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
