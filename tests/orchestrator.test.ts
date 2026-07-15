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
import type {
  HighlightWriter,
  ItemContext,
  ItemContextReader,
  ItemRef,
  NoteWriter,
  PlannedHighlight,
  TagWriter,
} from "../src/zotero/types";
import { annotation, itemContext, metadata } from "./fixtures/items";

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

/** Echoes the suggested tags back as "added"; deduplication against real
 * existing tags is covered separately in tags.test.ts. */
function fakeTagWriter(): TagWriter & { addTags: ReturnType<typeof vi.fn> } {
  return {
    addTags: vi.fn(async (_ref: ItemRef, tags: string[]) => ({ added: tags })),
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

/** Records the highlights it is asked to draw; every planned passage succeeds
 * as a real highlight unless a failure is configured. Page text is fixed so
 * the pure resolver can locate quotes (the resolver itself is covered in
 * highlights.test.ts). */
function fakeHighlightWriter(
  pageText = "The results show a 42% improvement over the baseline. A key limitation is the small sample.",
): HighlightWriter & { createHighlights: ReturnType<typeof vi.fn> } {
  return {
    readTargets: vi.fn(async () => ({
      pages: [{ pageIndex: 0, pageLabel: "1", text: pageText }],
      existing: [],
    })),
    createHighlights: vi.fn(async (_ref: ItemRef, planned: PlannedHighlight[]) => ({
      created: planned.map((p) => ({ ...p, kind: "highlight" as const })),
      failed: [],
    })),
  };
}

function setup(overrides: {
  provider?: AIProvider;
  ensureProvider?: () => Promise<AIProvider>;
  reader?: ItemContextReader;
  contexts?: ItemContext[];
  prefs?: Record<string, unknown>;
  retrieval?: OrchestratorRetrievalDeps;
  tagWriter?: TagWriter;
  highlightWriter?: HighlightWriter;
} = {}) {
  const provider = overrides.provider ?? fakeProvider();
  const reader = overrides.reader ?? fakeReader(overrides.contexts ?? twoItems);
  const noteWriter = fakeNoteWriter();
  const tagWriter = overrides.tagWriter ?? fakeTagWriter();
  const orchestrator = createWorkflowOrchestrator({
    ensureProvider: overrides.ensureProvider ?? (async () => provider),
    reader,
    noteWriter,
    tagWriter,
    ...(overrides.highlightWriter ? { highlightWriter: overrides.highlightWriter } : {}),
    prefs: fakePrefs(overrides.prefs),
    logger: noopLogger,
    ...(overrides.retrieval ? { retrieval: overrides.retrieval } : {}),
  });
  const events: WorkflowEvent[] = [];
  orchestrator.subscribe((event) => events.push(event));
  return { orchestrator, events, provider, reader, noteWriter, tagWriter };
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

describe("analyze-papers workflow (S4-01/S4-02)", () => {
  it("produces one structured section per item using the configured categories", async () => {
    const prompts: string[] = [];
    const provider = fakeProvider(async (request) => {
      prompts.push(request.messages[0]!.content);
      return { text: "## methodology\n\nDetails." };
    });
    const { orchestrator, events } = setup({ provider });
    await orchestrator.run({ kind: "analyze-papers", items: refs });

    expect(eventTypes(events)).toEqual([
      "started",
      "progress",
      "progress",
      "item-completed",
      "progress",
      "item-completed",
      "completed",
    ]);
    // FR-039 (all 7 defaults listed) + FR-040 (no-evidence instruction, FR-038 not hardcoded).
    expect(prompts[0]).toContain("- methodology");
    expect(prompts[0]).toContain("- open points");
    expect(prompts[0]).toContain("No relevant evidence found");
    expect(prompts[0]).toContain("=== Item: Paper A (AAA) ===");
    const completed = events.at(-1) as Extract<WorkflowEvent, { type: "completed" }>;
    expect(completed.result.workflowId).toBe("analyze-papers");
    expect(completed.result.sections).toHaveLength(2);
    expect(completed.result.content).toContain("## Paper A");
  });
});

describe("generate-notes workflow (S4-03)", () => {
  it("calls the model with the annotation-grouping prompt when annotations exist", async () => {
    const prompts: string[] = [];
    const provider = fakeProvider(async (request) => {
      prompts.push(request.messages[0]!.content);
      return { text: "## Methodology\n\n- a point" };
    });
    const annotated = itemContext({
      ref: { libraryID: 1, key: "AAA" },
      metadata: metadata({ key: "AAA", title: "Paper A" }),
      annotations: [annotation({ text: "key claim" })],
    });
    const { orchestrator, events } = setup({ provider, contexts: [annotated] });
    await orchestrator.run({ kind: "generate-notes", items: [{ libraryID: 1, key: "AAA" }] });

    expect(prompts[0]).toContain("annotations and highlights");
    const completed = events.at(-1) as Extract<WorkflowEvent, { type: "completed" }>;
    expect(completed.result.sections[0]?.markdown).toContain("a point");
  });

  it("skips the AI call with a clear message when the item has no annotations (S4-03 AC4)", async () => {
    const bare = itemContext({
      ref: { libraryID: 1, key: "AAA" },
      metadata: metadata({ key: "AAA" }),
      annotations: [],
    });
    const { orchestrator, events, provider } = setup({ contexts: [bare] });
    await orchestrator.run({ kind: "generate-notes", items: [{ libraryID: 1, key: "AAA" }] });

    expect(provider.complete).not.toHaveBeenCalled();
    const completed = events.at(-1) as Extract<WorkflowEvent, { type: "completed" }>;
    expect(completed.result.sections[0]?.markdown).toContain("no annotations");
  });
});

describe("summarize-notes workflow (S4-04)", () => {
  it("skips items with neither notes nor annotations without calling the provider", async () => {
    const bare = itemContext({
      ref: { libraryID: 1, key: "AAA" },
      metadata: metadata({ key: "AAA" }),
      notes: [],
      annotations: [],
    });
    const { orchestrator, events, provider } = setup({ contexts: [bare] });
    await orchestrator.run({ kind: "summarize-notes", items: [{ libraryID: 1, key: "AAA" }] });

    expect(provider.complete).not.toHaveBeenCalled();
    const completed = events.at(-1) as Extract<WorkflowEvent, { type: "completed" }>;
    expect(completed.result.sections[0]?.markdown).toContain("no notes or annotations");
  });
});

describe("suggest-tags workflow (S4-05)", () => {
  const annotated = (key: string, title: string) =>
    itemContext({
      ref: { libraryID: 1, key },
      metadata: metadata({ key, title }),
      tags: ["reading-list"],
    });

  it("parses the reply, writes tags to the item, and reports what was added", async () => {
    const provider = fakeProvider(async () => ({ text: "machine learning, rag" }));
    const { orchestrator, events, tagWriter } = setup({
      provider,
      contexts: [annotated("AAA", "Paper A")],
      tagWriter: fakeTagWriter(),
    });
    await orchestrator.run({ kind: "suggest-tags", items: [{ libraryID: 1, key: "AAA" }] });

    expect(tagWriter.addTags).toHaveBeenCalledWith(
      { libraryID: 1, key: "AAA" },
      ["machine learning", "rag"],
    );
    const completed = events.at(-1) as Extract<WorkflowEvent, { type: "completed" }>;
    expect(completed.result.sections[0]?.markdown).toBe("Added 2 tags: machine learning, rag");
  });

  it("reports when no new tags were added", async () => {
    const provider = fakeProvider(async () => ({ text: "" }));
    const { orchestrator, events } = setup({
      provider,
      contexts: [annotated("AAA", "Paper A")],
    });
    await orchestrator.run({ kind: "suggest-tags", items: [{ libraryID: 1, key: "AAA" }] });
    const completed = events.at(-1) as Extract<WorkflowEvent, { type: "completed" }>;
    expect(completed.result.sections[0]?.markdown).toBe("No new tags were added.");
  });

  it("fails cleanly when no tag writer is configured", async () => {
    const orchestrator = createWorkflowOrchestrator({
      ensureProvider: async () => fakeProvider(),
      reader: fakeReader([annotated("AAA", "Paper A")]),
      noteWriter: fakeNoteWriter(),
      prefs: fakePrefs(),
      logger: noopLogger,
    });
    const events: WorkflowEvent[] = [];
    orchestrator.subscribe((e) => events.push(e));
    await orchestrator.run({ kind: "suggest-tags", items: [{ libraryID: 1, key: "AAA" }] });
    expect(eventTypes(events)).toEqual(["failed"]);
  });
});

describe("write-safety on partial failure (S4-06)", () => {
  it("keeps tags written to earlier items and writes nothing to the failing item", async () => {
    let call = 0;
    const provider = fakeProvider(async () => {
      call += 1;
      if (call === 2) throw new ProviderResponseError("boom");
      return { text: "alpha, beta" };
    });
    const contexts = [
      itemContext({ ref: { libraryID: 1, key: "AAA" }, metadata: metadata({ key: "AAA", title: "Paper A" }) }),
      itemContext({ ref: { libraryID: 1, key: "BBB" }, metadata: metadata({ key: "BBB", title: "Paper B" }) }),
    ];
    const tagWriter = fakeTagWriter();
    const { orchestrator, events } = setup({ provider, contexts, tagWriter });
    await orchestrator.run({ kind: "suggest-tags", items: refs });

    // Item 1 written; item 2 (the failing one) never reached the writer (NFR-023).
    expect(tagWriter.addTags).toHaveBeenCalledTimes(1);
    expect(tagWriter.addTags).toHaveBeenCalledWith({ libraryID: 1, key: "AAA" }, ["alpha", "beta"]);
    expect(eventTypes(events).at(-1)).toBe("failed");
    expect(orchestrator.lastResult()?.sections).toHaveLength(1);
    expect(orchestrator.lastResult()?.sections[0]?.ref.key).toBe("AAA");
  });
});

describe("auto-highlight workflow (S5-02)", () => {
  const reply = JSON.stringify([
    { category: "results", quote: "42% improvement over the baseline" },
    { category: "limitations", quote: "small sample" },
  ]);

  it("resolves passages, writes highlights, and summarizes per category", async () => {
    const highlightWriter = fakeHighlightWriter();
    const { orchestrator, events } = setup({
      provider: fakeProvider(async () => ({ text: reply })),
      contexts: [twoItems[0]!],
      highlightWriter,
    });
    await orchestrator.run({ kind: "auto-highlight", items: [refs[0]!] });

    expect(eventTypes(events).at(-1)).toBe("completed");
    expect(highlightWriter.createHighlights).toHaveBeenCalledTimes(1);
    const planned = highlightWriter.createHighlights.mock.calls[0]![1] as PlannedHighlight[];
    expect(planned.map((p) => p.category)).toEqual(["results", "limitations"]);
    const section = orchestrator.lastResult()!.sections[0]!;
    expect(section.markdown).toContain("Created 2 highlights");
    expect(section.markdown).toContain("**results**");
    expect(section.markdown).toContain("**limitations**");
  });

  it("runs to completion after a single start — no per-highlight prompt (FR-047)", async () => {
    const highlightWriter = fakeHighlightWriter();
    const { orchestrator } = setup({
      provider: fakeProvider(async () => ({ text: reply })),
      contexts: [twoItems[0]!],
      highlightWriter,
    });
    await orchestrator.run({ kind: "auto-highlight", items: [refs[0]!] });
    // One model call, one write call, zero interactive prompts.
    expect(highlightWriter.readTargets).toHaveBeenCalledTimes(1);
    expect(highlightWriter.createHighlights).toHaveBeenCalledTimes(1);
  });

  it("fails cleanly when no highlight writer is configured", async () => {
    const { orchestrator, events } = setup({ contexts: [twoItems[0]!] });
    await orchestrator.run({ kind: "auto-highlight", items: [refs[0]!] });
    const failed = events.at(-1) as Extract<WorkflowEvent, { type: "failed" }>;
    expect(failed.type).toBe("failed");
    expect(failed.message).toContain("Highlighting is unavailable");
  });

  it("never substitutes retrieved passages for full text, even over budget (verbatim quoting needs the real text)", async () => {
    const backend = fakeBackend(async () => [
      {
        chunk: { itemKey: "AAA", source: "pdf-text", text: "an unrelated snippet", chunkId: "AAA:pdf-text:0" },
        score: 1,
      },
    ], ["AAA"]);
    const bigItem = itemContext({
      ref: { libraryID: 1, key: "AAA" },
      metadata: metadata({ key: "AAA" }),
      pdfText: "word ".repeat(10000) + "the smoking gun sentence",
      pdfTextSource: "pdf-worker",
    });
    const highlightWriter = fakeHighlightWriter();
    const prompts: string[] = [];
    const provider = fakeProvider(async (request) => {
      prompts.push(request.messages[0]!.content);
      return { text: reply };
    });
    const { orchestrator } = setup({
      provider,
      contexts: [bigItem],
      highlightWriter,
      retrieval: { backend },
    });
    await orchestrator.run({ kind: "auto-highlight", items: [{ libraryID: 1, key: "AAA" }] });

    expect(backend.query).not.toHaveBeenCalled();
    expect(prompts[0]).not.toContain("an unrelated snippet");
  });

  it("reports items whose PDF text cannot be read", async () => {
    const highlightWriter: HighlightWriter = {
      readTargets: vi.fn(async () => ({ pages: [], existing: [] })),
      createHighlights: vi.fn(async () => ({ created: [], failed: [] })),
    };
    const { orchestrator } = setup({
      provider: fakeProvider(async () => ({ text: reply })),
      contexts: [twoItems[0]!],
      highlightWriter,
    });
    await orchestrator.run({ kind: "auto-highlight", items: [refs[0]!] });
    expect(highlightWriter.createHighlights).not.toHaveBeenCalled();
    expect(orchestrator.lastResult()!.sections[0]!.markdown).toContain("no readable PDF text");
  });
});
