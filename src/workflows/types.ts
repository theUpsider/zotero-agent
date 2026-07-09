/** Workflow orchestration contracts (FG-003..FG-012). Workflows are always
 * user-initiated (BR-001); only local index updates may run in the background
 * (BR-002). */

import type { ItemRef } from "../zotero/types";

export type WorkflowId =
  | "analyze-papers"
  | "auto-highlight"
  | "generate-notes"
  | "summarize-notes"
  | "suggest-tags"
  | "prompt-template"
  | "free-prompt";

export interface WorkflowContext {
  /** Zotero item keys the user selected before starting the workflow. */
  itemKeys: string[];
}

export interface WorkflowProgress {
  message: string;
  /** 0..1 where known; undefined for indeterminate steps (NFR-003). */
  fraction?: number;
}

/** One per-item slice of a workflow result (FR-036, FR-055). */
export interface WorkflowResultSection {
  ref: ItemRef;
  title: string;
  /** Generated markdown for this item; rendered in the view and converted to
   * HTML when saved as a note. */
  markdown: string;
  /** True when the item's PDF text was cut to the context budget (S2-03). */
  truncated: boolean;
}

export interface WorkflowResult {
  workflowId: WorkflowId;
  /** Full markdown result for the result view, savable as Zotero notes (FR-092). */
  content: string;
  sections: WorkflowResultSection[];
  /** Human-readable notice when any item's context was truncated (S2-03). */
  truncationNotice?: string;
}

export interface Workflow {
  readonly id: WorkflowId;
  run(context: WorkflowContext, onProgress: (p: WorkflowProgress) => void): Promise<WorkflowResult>;
}
