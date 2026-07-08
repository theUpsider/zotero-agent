/** Workflow orchestration contracts (FG-003..FG-012). Workflows are always
 * user-initiated (BR-001); only local index updates may run in the background
 * (BR-002). Concrete workflows arrive with the architecture milestone. */

export type WorkflowId =
  | "analyze-papers"
  | "auto-highlight"
  | "generate-notes"
  | "summarize-notes"
  | "suggest-tags"
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

export interface WorkflowResult {
  workflowId: WorkflowId;
  /** Markdown/HTML result for the result view, savable as a Zotero note (FR-092). */
  content: string;
}

export interface Workflow {
  readonly id: WorkflowId;
  run(context: WorkflowContext, onProgress: (p: WorkflowProgress) => void): Promise<WorkflowResult>;
}
