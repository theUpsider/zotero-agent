import { describe, expect, it, vi } from "vitest";
import type { PrefStore } from "../src/core/config";
import { AuthenticationError, noopLogger, ProviderResponseError } from "../src/core/errors";
import type { AIProvider, CompletionRequest } from "../src/providers/types";
import type { RetrievalBackend, RetrievalQuery, RetrievalResult } from "../src/retrieval/types";
import {
  createWorkflowOrchestrator,
  listTemplateWorkflows,
  type OrchestratorRetrievalDeps,
  type WorkflowEvent,
  type WorkflowOrchestrator,
} from "../src/workflows/orchestrator";
import type { ItemContext, ItemContextReader, ItemRef, NoteWriter } from "../src/zotero/types";
import { itemContext, metadata } from "./fixtures/items";

function fakePrefs(values: Record<string, unknown> = {}): PrefStore {
  const store = new Map(Object.entries(values));
  return {
    get: (key) => store.get(key),
    set: (key, value) => void store.set(key, value),
    clear: (key) => void store.delete(key),
  };
}

function fakeProvider(
  complete: (request: CompletionRequest) => Promise<{ text: string }> = async () => ({
    text: "generated **answer**",
  }),
): AIProvider {
  return {
    id: "fake",
    label: "Fake",
    validateConfig: async () => ({ ok: true, message: "ok" }),
    complete: vi.fn(complete),
  };
}

function fakeReader(contexts: ItemContext[]): ItemContextReader {
  return { readItemContexts: vi.fn(async () => contexts) };
}

function fakeNoteWriter(): NoteWriter & { createChildNote: ReturnType<typeof vi.fn> } {
  let counter = 0;
  return {
    createChildNote: vi.fn(async () => ({ noteKey: `NOTE${++counter}` })),
  };
}

const refs: ItemRef[] = [
  { libraryID: 1, key: "AAA" },
  { libraryID: 1, key: "BBB" },
];

const twoItems = [
  itemContext({ ref: { libraryID: 1, key: "AAA" }, metadata: metadata({ key: "AAA", title: "Paper A" }) }),
  itemContext({ ref: { libraryID: 1, key: "BBB" }, metadata: metadata({ key: "BBB", title: "Paper B" }) }),
];

function fakeBackend(
  query: (q: RetrievalQuery) => Promise<RetrievalResult[]> = async () => [],
  indexedKeys: string[] = [],
): RetrievalBackend & { query: ReturnType<typeof vi.fn> } {
  return {
    indexItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
    query: vi.fn(query),
    rebuild: vi.fn(async () => undefined),
    listIndexedItemKeys: vi.fn(async () => indexedKeys),
    stats: vi.fn(async () => ({ itemCount: indexedKeys.length, chunkCount: 0, vectorSearch: false })),
  };
}

function setup(overrides: {
  provider?: AIProvider;
  ensureProvider?: () => Promise<AIProvider>;
  reader?: ItemContextReader;
  contexts?: ItemContext[];
  prefs?: Record<string, unknown>;
  retrieval?: OrchestratorRetrievalDeps;
} = {}) {
  const provider = overrides.provider ?? fakeProvider();
  const reader = overrides.reader ?? fakeReader(overrides.contexts ?? twoItems);
  const noteWriter = fakeNoteWriter();
  const orchestrator = createWorkflowOrchestrator({
    ensureProvider: overrides.ensureProvider ?? (async () => provider),
    reader,
    noteWriter,
    prefs: fakePrefs(overrides.prefs),
    logger: noopLogger,
    ...(overrides.retrieval ? { retrieval: overrides.retrieval } : {}),
  });
  const events: WorkflowEvent[] = [];
  orchestrator.subscribe((event) => events.push(event));
  return { orchestrator, events, provider, reader, noteWriter };
}

const eventTypes = (events: WorkflowEvent[]) => events.map((e) => e.type);

describe("listTemplateWorkflows", () => {
  it("lists the 7 predefined templates with labels", () => {
    const templates = listTemplateWorkflows();
    expect(templates).toHaveLength(7);
    expect(templates.map((t) => t.id)).toContain("results");
    expect(templates.every((t) => t.label.length > 0)).toBe(true);
  });
});

describe("template workflow run", () => {
  it("emits started → progress → item-completed per item → completed", async () => {
    const { orchestrator, events, provider } = setup();
    await orchestrator.run({ kind: "template", templateId: "results", items: refs });

    expect(eventTypes(events)).toEqual([
      "started",
      "progress", // reading items
      "progress", // querying item 1
      "item-completed",
      "progress", // querying item 2
      "item-completed",
      "completed",
    ]);
    expect(provider.complete).toHaveBeenCalledTimes(2);
    const completed = events.at(-1) as Extract<WorkflowEvent, { type: "completed" }>;
    expect(completed.result.sections).toHaveLength(2);
    expect(completed.result.content).toContain("## Paper A");
    expect(completed.result.content).toContain("## Paper B");
    expect(orchestrator.lastResult()).toBe(completed.result);
  });

  it("sends the composed per-item context to the provider", async () => {
    const prompts: string[] = [];
    const provider = fakeProvider(async (request) => {
      prompts.push(request.messages[0]!.content);
      return { text: "ok" };
    });
    const { orchestrator } = setup({ provider });
    await orchestrator.run({ kind: "template", templateId: "results", items: refs });

    expect(prompts[0]).toContain("Summarize the key results");
    expect(prompts[0]).toContain("=== Item: Paper A (AAA) ===");
    expect(prompts[0]).not.toContain("Paper B");
    expect(prompts[1]).toContain("=== Item: Paper B (BBB) ===");
  });

  it("fails with a mapped message when the provider gate rejects, without reading items", async () => {
    const reader = fakeReader(twoItems);
    const { orchestrator, events } = setup({
      reader,
      ensureProvider: async () => {
        throw new AuthenticationError("nope");
      },
    });
    await orchestrator.run({ kind: "template", templateId: "results", items: refs });

    expect(eventTypes(events)).toEqual(["started", "failed"]);
    const failed = events.at(-1) as Extract<WorkflowEvent, { type: "failed" }>;
    expect(failed.code).toBe("auth-failed");
    expect(failed.message).toContain("API key");
    expect(failed.message).not.toContain("nope");
    expect(reader.readItemContexts).not.toHaveBeenCalled();
  });

  it("keeps earlier sections and writes nothing when a later item fails", async () => {
    let call = 0;
    const provider = fakeProvider(async () => {
      call += 1;
      if (call === 2) throw new ProviderResponseError("boom");
      return { text: "first ok" };
    });
    const { orchestrator, events, noteWriter } = setup({ provider });
    await orchestrator.run({ kind: "template", templateId: "results", items: refs });

    expect(eventTypes(events)).toEqual([
      "started",
      "progress",
      "progress",
      "item-completed",
      "progress",
      "failed",
    ]);
    expect(orchestrator.lastResult()?.sections).toHaveLength(1);
    expect(orchestrator.lastResult()?.sections[0]?.ref.key).toBe("AAA");
    expect(noteWriter.createChildNote).not.toHaveBeenCalled();
  });

  it("cancellation stops further provider calls and emits cancelled", async () => {
    const { orchestrator, events, provider } = setup();
    let unsubscribe: () => void = () => {};
    unsubscribe = orchestrator.subscribe((event) => {
      if (event.type === "item-completed") {
        orchestrator.cancel();
        unsubscribe();
      }
    });
    await orchestrator.run({ kind: "template", templateId: "results", items: refs });

    expect(provider.complete).toHaveBeenCalledTimes(1);
    expect(eventTypes(events).at(-1)).toBe("cancelled");
  });

  it("rejects a second run while one is in flight", async () => {
    let release: () => void = () => {};
    const provider = fakeProvider(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ text: "slow" });
        }),
    );
    const { orchestrator } = setup({ provider, contexts: [twoItems[0]!] });
    const oneRef = [refs[0]!];
    const first = orchestrator.run({ kind: "template", templateId: "results", items: oneRef });

    await expect(
      orchestrator.run({ kind: "template", templateId: "results", items: oneRef }),
    ).rejects.toThrow("already running");
    expect(orchestrator.isRunning()).toBe(true);

    await vi.waitFor(() => expect(provider.complete).toHaveBeenCalled());
    release();
    await first;
    expect(orchestrator.isRunning()).toBe(false);
  });

  it("fails cleanly on an unknown template id", async () => {
    const { orchestrator, events, provider } = setup();
    await orchestrator.run({ kind: "template", templateId: "no-such", items: refs });
    expect(eventTypes(events)).toEqual(["failed"]);
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it("fails cleanly on an empty selection", async () => {
    const { orchestrator, events } = setup();
    await orchestrator.run({ kind: "template", templateId: "results", items: [] });
    expect(eventTypes(events)).toEqual(["failed"]);
  });

  it("surfaces a truncation notice when an item's PDF text was cut", async () => {
    const bigItem = itemContext({
      ref: { libraryID: 1, key: "AAA" },
      metadata: metadata({ key: "AAA" }),
      pdfText: "word ".repeat(10000),
      pdfTextSource: "pdf-worker",
    });
    const { orchestrator, events } = setup({ contexts: [bigItem] });
    await orchestrator.run({
      kind: "template",
      templateId: "results",
      items: [{ libraryID: 1, key: "AAA" }],
    });
    const completed = events.at(-1) as Extract<WorkflowEvent, { type: "completed" }>;
    expect(completed.result.truncationNotice).toContain("AAA");
    expect(completed.result.sections[0]?.truncated).toBe(true);
  });
});

describe("retrieval-augmented context (S3-05)", () => {
  const bigItem = (key: string) =>
    itemContext({
      ref: { libraryID: 1, key },
      metadata: metadata({ key }),
      pdfText: "word ".repeat(10000),
      pdfTextSource: "pdf-worker",
    });

  it("uses retrieved passages and drops the truncation notice when the item is indexed", async () => {
    const backend = fakeBackend(
      async () => [
        {
          chunk: { itemKey: "AAA", source: "pdf-text", text: "the important finding", chunkId: "AAA:pdf-text:0" },
          score: 1,
        },
      ],
      ["AAA"],
    );
    const prompts: string[] = [];
    const provider = fakeProvider(async (request) => {
      prompts.push(request.messages[0]!.content);
      return { text: "ok" };
    });
    const { orchestrator, events } = setup({
      provider,
      contexts: [bigItem("AAA")],
      retrieval: { backend },
    });
    await orchestrator.run({ kind: "template", templateId: "results", items: [{ libraryID: 1, key: "AAA" }] });

    expect(backend.query).toHaveBeenCalledWith(
      expect.objectContaining({ itemKeys: ["AAA"], mode: "hybrid" }),
    );
    expect(prompts[0]).toContain("the important finding");
    const completed = events.at(-1) as Extract<WorkflowEvent, { type: "completed" }>;
    expect(completed.result.truncationNotice).toBeUndefined();
    expect(completed.result.sections[0]?.truncated).toBe(false);
  });

  it("falls back to the truncation notice and enqueues reindexing when the item isn't indexed", async () => {
    const backend = fakeBackend(async () => [], []);
    const enqueueReindex = vi.fn();
    const { orchestrator, events } = setup({
      contexts: [bigItem("AAA")],
      retrieval: { backend, enqueueReindex },
    });
    await orchestrator.run({ kind: "template", templateId: "results", items: [{ libraryID: 1, key: "AAA" }] });

    expect(enqueueReindex).toHaveBeenCalledWith([{ libraryID: 1, key: "AAA" }]);
    const completed = events.at(-1) as Extract<WorkflowEvent, { type: "completed" }>;
    expect(completed.result.truncationNotice).toContain("AAA");
  });

  it("does not query the backend at all when no item is over budget", async () => {
    const backend = fakeBackend();
    const { orchestrator } = setup({ retrieval: { backend } });
    await orchestrator.run({ kind: "template", templateId: "results", items: refs });
    expect(backend.query).not.toHaveBeenCalled();
  });

  it("keeps Sprint 2 behavior unchanged when no retrieval dep is configured", async () => {
    const { orchestrator, events } = setup({ contexts: [bigItem("AAA")] });
    await orchestrator.run({ kind: "template", templateId: "results", items: [{ libraryID: 1, key: "AAA" }] });
    const completed = events.at(-1) as Extract<WorkflowEvent, { type: "completed" }>;
    expect(completed.result.truncationNotice).toContain("AAA");
  });
});

describe("free-prompt workflow run", () => {
  it("makes a single provider call over the combined context", async () => {
    const prompts: string[] = [];
    const provider = fakeProvider(async (request) => {
      prompts.push(request.messages[0]!.content);
      return { text: "combined answer" };
    });
    const { orchestrator, events } = setup({ provider });
    await orchestrator.run({ kind: "free-prompt", prompt: "Compare the methods", items: refs });

    expect(provider.complete).toHaveBeenCalledTimes(1);
    expect(prompts[0]).toContain("Compare the methods");
    expect(prompts[0]).toContain("=== Item: Paper A (AAA) ===");
    expect(prompts[0]).toContain("=== Item: Paper B (BBB) ===");
    const completed = events.at(-1) as Extract<WorkflowEvent, { type: "completed" }>;
    expect(completed.result.workflowId).toBe("free-prompt");
    expect(completed.result.content).toBe("combined answer");
    // Save targets: one section per analyzed item (FR-055).
    expect(completed.result.sections.map((s) => s.ref.key)).toEqual(["AAA", "BBB"]);
  });

  it("rejects an empty prompt without calling the provider", async () => {
    const { orchestrator, events, provider } = setup();
    await orchestrator.run({ kind: "free-prompt", prompt: "   ", items: refs });
    expect(eventTypes(events)).toEqual(["failed"]);
    expect(provider.complete).not.toHaveBeenCalled();
  });
});

describe("saveResultAsNotes", () => {
  async function completedOrchestrator(): Promise<{
    orchestrator: WorkflowOrchestrator;
    noteWriter: ReturnType<typeof fakeNoteWriter>;
  }> {
    const provider = fakeProvider(async () => ({ text: "# Heading\n\n- point" }));
    const { orchestrator, noteWriter } = setup({ provider });
    await orchestrator.run({ kind: "template", templateId: "results", items: refs });
    return { orchestrator, noteWriter };
  }

  it("writes one HTML note per section to the correct item", async () => {
    const { orchestrator, noteWriter } = await completedOrchestrator();
    const outcome = await orchestrator.saveResultAsNotes();

    expect(outcome.saved).toEqual([
      { itemKey: "AAA", noteKey: "NOTE1" },
      { itemKey: "BBB", noteKey: "NOTE2" },
    ]);
    expect(noteWriter.createChildNote).toHaveBeenCalledTimes(2);
    const [ref, html] = noteWriter.createChildNote.mock.calls[0]!;
    expect(ref).toEqual({ libraryID: 1, key: "AAA" });
    expect(html).toContain("<h1>Heading</h1>");
    expect(html).toContain("<li>point</li>");
  });

  it("a failing write does not block the remaining notes", async () => {
    const { orchestrator, noteWriter } = await completedOrchestrator();
    noteWriter.createChildNote.mockRejectedValueOnce(new Error("db locked"));
    const outcome = await orchestrator.saveResultAsNotes();

    expect(outcome.failed).toHaveLength(1);
    expect(outcome.failed[0]?.itemKey).toBe("AAA");
    expect(outcome.saved).toEqual([{ itemKey: "BBB", noteKey: "NOTE1" }]);
  });

  it("returns an empty outcome when nothing has run", async () => {
    const { orchestrator, noteWriter } = setup();
    const outcome = await orchestrator.saveResultAsNotes();
    expect(outcome).toEqual({ saved: [], failed: [] });
    expect(noteWriter.createChildNote).not.toHaveBeenCalled();
  });
});
