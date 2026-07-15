import { describe, expect, it, vi } from "vitest";
import { createWorkflowUiApi } from "../src/ui/workflowApi";
import type { WorkflowOrchestrator } from "../src/workflows/orchestrator";

function fakeOrchestrator(overrides: Partial<WorkflowOrchestrator> = {}): WorkflowOrchestrator {
  return {
    run: vi.fn(async () => {}),
    cancel: vi.fn(),
    isRunning: vi.fn(() => false),
    lastResult: vi.fn(() => null),
    subscribe: vi.fn(() => () => {}),
    saveResultAsNotes: vi.fn(async () => ({ saved: [], failed: [] })),
    ...overrides,
  };
}

const items = [{ libraryID: 1, key: "AAA" }];

describe("createWorkflowUiApi", () => {
  it("lists the predefined templates", () => {
    const api = createWorkflowUiApi(fakeOrchestrator());
    expect(api.templates()).toHaveLength(7);
  });

  it("startTemplate delegates to orchestrator.run", () => {
    const orchestrator = fakeOrchestrator();
    const api = createWorkflowUiApi(orchestrator);
    const outcome = api.startTemplate("results", items);
    expect(outcome).toEqual({ ok: true });
    expect(orchestrator.run).toHaveBeenCalledWith({
      kind: "template",
      templateId: "results",
      items,
    });
  });

  it("rejects an empty or whitespace free prompt with an inline message (S2-04)", () => {
    const orchestrator = fakeOrchestrator();
    const api = createWorkflowUiApi(orchestrator);
    for (const prompt of ["", "   ", "\n\t"]) {
      const outcome = api.startFreePrompt(prompt, items);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.message).toContain("prompt");
    }
    expect(orchestrator.run).not.toHaveBeenCalled();
  });

  it("startFreePrompt delegates a real prompt to orchestrator.run", () => {
    const orchestrator = fakeOrchestrator();
    const api = createWorkflowUiApi(orchestrator);
    expect(api.startFreePrompt("Compare methods", items)).toEqual({ ok: true });
    expect(orchestrator.run).toHaveBeenCalledWith({
      kind: "free-prompt",
      prompt: "Compare methods",
      items,
    });
  });

  it("startWorkflow delegates a named scholarly workflow to orchestrator.run (S4-05)", () => {
    const orchestrator = fakeOrchestrator();
    const api = createWorkflowUiApi(orchestrator);
    expect(api.startWorkflow("suggest-tags", items)).toEqual({ ok: true });
    expect(orchestrator.run).toHaveBeenCalledWith({ kind: "suggest-tags", items });
  });

  it("refuses to start while a workflow is running", () => {
    const orchestrator = fakeOrchestrator({ isRunning: () => true });
    const api = createWorkflowUiApi(orchestrator);
    const outcome = api.startTemplate("results", items);
    expect(outcome.ok).toBe(false);
    expect(orchestrator.run).not.toHaveBeenCalled();
  });

  it("round-trips the result-view session", () => {
    const api = createWorkflowUiApi(fakeOrchestrator());
    expect(api.getSession()).toBeNull();
    const session = {
      mode: "free-prompt" as const,
      items: [{ libraryID: 1, key: "AAA", title: "Paper A" }],
    };
    api.setSession(session);
    expect(api.getSession()).toEqual(session);
  });

  it("renders markdown to HTML for the view scope", () => {
    const api = createWorkflowUiApi(fakeOrchestrator());
    expect(api.renderMarkdown("# Hi")).toBe("<h1>Hi</h1>");
  });

  it("delegates cancel and saveAsNotes", async () => {
    const orchestrator = fakeOrchestrator();
    const api = createWorkflowUiApi(orchestrator);
    api.cancel();
    await api.saveAsNotes();
    expect(orchestrator.cancel).toHaveBeenCalled();
    expect(orchestrator.saveResultAsNotes).toHaveBeenCalled();
  });
});
