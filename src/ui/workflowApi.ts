/** Workflow API for the result view (S2-04..S2-07). Published on
 * Zotero.ZoteroAgent by plugin.ts so the result-view window (a separate scope
 * from the bootstrap sandbox) can reach plugin logic. Imports core/ and
 * workflows/ only — every AI call funnels through the orchestrator (BR-001);
 * the template list comes via workflows/ because ui/ → prompts/ is forbidden
 * (component view §3). */

import { markdownToHtml } from "../core/markdown";
import {
  listTemplateWorkflows,
  type SaveNotesOutcome,
  type WorkflowEvent,
  type WorkflowOrchestrator,
} from "../workflows/orchestrator";
import type { WorkflowResult } from "../workflows/types";
import type { ItemRef } from "../zotero/types";

/** The named scholarly workflows (S4-01..S4-05) — every mode except the two
 * generic ones (template / free-prompt). */
export type NamedWorkflowMode =
  | "analyze-papers"
  | "auto-highlight"
  | "generate-notes"
  | "summarize-notes"
  | "suggest-tags";

/** What the result view should show when it opens: which mode, which items.
 * Set by the menu handler right before opening the window. */
export interface ResultViewSession {
  mode: "template" | "free-prompt" | NamedWorkflowMode;
  templateId?: string;
  templateLabel?: string;
  /** Header label for a named workflow (S4-07). */
  title?: string;
  items: (ItemRef & { title: string })[];
}

export type StartOutcome = { ok: true } | { ok: false; message: string };

export interface WorkflowUiApi {
  templates(): { id: string; label: string }[];
  /** Fire-and-forget: outcome arrives via subscribe() events. */
  startTemplate(templateId: string, items: ItemRef[]): StartOutcome;
  startFreePrompt(prompt: string, items: ItemRef[]): StartOutcome;
  /** Start one of the named scholarly workflows (S4-01..S4-05). */
  startWorkflow(mode: NamedWorkflowMode, items: ItemRef[]): StartOutcome;
  cancel(): void;
  isRunning(): boolean;
  lastResult(): WorkflowResult | null;
  subscribe(listener: (event: WorkflowEvent) => void): () => void;
  /** Markdown → conservative HTML for the view (NFR-018). */
  renderMarkdown(markdown: string): string;
  saveAsNotes(): Promise<SaveNotesOutcome>;
  getSession(): ResultViewSession | null;
  setSession(session: ResultViewSession): void;
}

export function createWorkflowUiApi(orchestrator: WorkflowOrchestrator): WorkflowUiApi {
  let session: ResultViewSession | null = null;

  const start = (request: Parameters<WorkflowOrchestrator["run"]>[0]): StartOutcome => {
    if (orchestrator.isRunning()) {
      return { ok: false, message: "A workflow is already running. Cancel it or wait." };
    }
    // Errors surface as "failed" events; the promise itself never rejects
    // once the busy guard has passed.
    void orchestrator.run(request);
    return { ok: true };
  };

  return {
    templates: () => listTemplateWorkflows(),

    startTemplate: (templateId, items) => start({ kind: "template", templateId, items }),

    startFreePrompt: (prompt, items) => {
      if (prompt.trim() === "") {
        return { ok: false, message: "Enter a prompt first." };
      }
      return start({ kind: "free-prompt", prompt, items });
    },

    startWorkflow: (mode, items) => start({ kind: mode, items }),

    cancel: () => orchestrator.cancel(),

    isRunning: () => orchestrator.isRunning(),

    lastResult: () => orchestrator.lastResult(),

    subscribe: (listener) => orchestrator.subscribe(listener),

    renderMarkdown: (markdown) => markdownToHtml(markdown),

    saveAsNotes: () => orchestrator.saveResultAsNotes(),

    getSession: () => session,

    setSession: (next) => {
      session = next;
    },
  };
}
