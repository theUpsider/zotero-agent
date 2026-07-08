# Sprint 2 — Zotero Access & First End-to-End Workflow

**Sprint goal:** A user selects one or more items in Zotero, runs a predefined prompt template
or a free-form prompt against the configured provider, watches progress, sees the structured
result in a result view, and saves it as a Zotero note attached to the item. This is the
thinnest full slice through UI → orchestrator → Zotero adapter → provider → result → note.

**Demo script:** Select 2 papers → context menu "AI Assistant → Summarize results" (template) →
progress shown → result view opens → "Save as note" → note appears under the item.
Repeat with a free-form prompt.

**Requirements covered:** FR-009, FR-010, FR-035, FR-036, FR-080…FR-090 (FR-090 partially —
"retrieved context" arrives with Sprint 3), FR-091…FR-098, FR-054…FR-056, EIR-001…EIR-004,
EIR-006, DAR-001, DAR-010, NFR-003, NFR-006, NFR-009, NFR-013…NFR-015, NFR-018, BR-001.
Spikes: OP-001 (highlight write), OP-002 (retrieval library).

---

## Backlog (priority-sorted)

### S2-01 · Zotero adapter: read layer · **Must** · M
**Refs:** EIR-001, EIR-002, DAR-001, FR-034 (input side)
Extend `src/zotero/adapter.ts`: for selected items read metadata, tags, notes, annotations
(text, comment, color, page), highlights, and extracted PDF full text
(`Zotero.PDFWorker`/full-text cache). Return plain serializable structures — no Zotero
objects leak past the adapter.

**Acceptance criteria**
- [ ] For a selected item the adapter returns metadata, tags, notes, annotations with color + page, and PDF text where an attachment exists.
- [ ] Items without PDF / without annotations yield empty collections, not errors.
- [ ] Output types are plain interfaces in `src/zotero/types.ts`; nothing outside `src/zotero/` touches the `Zotero` global (enforced by review + a grep check in CI script).
- [ ] Manual smoke test on a real library item documented.

### S2-02 · Workflow orchestrator core · **Must** · M
**Refs:** FR-035, FR-036, BR-001, NFR-009, NFR-023 (foundation), §15.2 Workflow Orchestrator
Implement the `Workflow` contract runner: takes workflow id + selected item keys, enforces
provider-ready gate (S1-05), assembles context via adapter, calls provider, emits progress
events, returns `WorkflowResult`. Cancellable.

**Acceptance criteria**
- [ ] Workflows run only on explicit user action; no code path triggers a provider call otherwise (BR-001, NFR-009) — verified by review checklist.
- [ ] Progress events (started / step / finished / failed) are emitted and consumable by UI (NFR-006).
- [ ] A failing provider call leaves no partial writes and surfaces a mapped error message (NFR-023 groundwork).
- [ ] Cancellation stops further provider calls.
- [ ] Orchestrator unit-tested with fake provider + fake adapter (no Zotero global).

### S2-03 · Prompt composition: templates + context · **Must** · M
**Refs:** FR-009, FR-080, FR-082…FR-088, FR-034 (composition)
Wire the existing 7 templates (`src/prompts/templates.ts`) into a prompt composer that
builds `{{context}}` from adapter output: metadata header, annotations grouped by
color-category, notes, tags, PDF text (truncated with a char budget until RAG lands in
Sprint 3 — truncation must be explicit in the result).

**Acceptance criteria**
- [ ] Composer renders any of the 7 templates with real item context; unit-tested with fixture items.
- [ ] Context includes color-category labels from the user's mapping (FR-034).
- [ ] Oversized PDF text is truncated deterministically and the result view states that truncation happened (interim honesty until Sprint 3).
- [ ] Multi-item selection produces one clearly-delimited context section per item (FR-036).

### S2-04 · Free-form prompt workflow · **Must** · S
**Refs:** FR-081, FR-089, FR-090 (context part deferred), NFR-015
Input field (dialog or result-view pane) for a custom prompt executed over the selected
items' composed context.

**Acceptance criteria**
- [ ] User can enter a free prompt for the current selection and run it (FR-089).
- [ ] Prompt runs through the same orchestrator + composer path as templates (single pipeline).
- [ ] Empty prompt is rejected with an inline message.

### S2-05 · Result view · **Must** · L
**Refs:** FR-010, FR-091, FR-094, FR-095, FR-096, FR-098, NFR-003, NFR-006, NFR-018
Plugin result window/pane: shows workflow progress while running, then the generated
result as readable structured content (markdown-rendered), per-item sections, and action
buttons (save as note, copy, re-run).

**Acceptance criteria**
- [ ] Progress state visible during execution; updates live from orchestrator events (FR-094, NFR-003/006).
- [ ] Results render structured (headings/lists), not raw text blobs (NFR-018).
- [ ] Category-grouped output renders grouped (FR-095) — verified with a template result.
- [ ] View stays open for continued work after the workflow ends (FR-098).
- [ ] Errors render as human-readable messages in the view (EIR-014), never raw stack traces or secrets.

### S2-06 · Save result as Zotero note · **Must** · M
**Refs:** FR-092, FR-093, FR-096, FR-097, FR-054, FR-055, FR-056, EIR-003, EIR-004, DAR-010
Write layer in the adapter: create a child note on the originating item from a generated
result (HTML from markdown). Generated notes are regular Zotero notes.

**Acceptance criteria**
- [ ] "Save as note" attaches the note to the correct item (EIR-004, FR-097, DAR-010).
- [ ] Multi-item results save one note per item (FR-055).
- [ ] Result is viewable before saving; saving is optional (FR-054, FR-096, FR-093).
- [ ] Created notes have no plugin-proprietary format — open and edit normally in Zotero (FR-056).
- [ ] Adapter write code does not touch collections or item locations (EIR-006).

### S2-07 · Workflow entry points in UI · **Must** · S
**Refs:** FR-035, FR-036, NFR-014
Item context menu + Tools menu: submenu listing the 7 template workflows and "Free prompt…".
Replaces the skeleton's placeholder menu item. Disabled when selection is empty.

**Acceptance criteria**
- [ ] Context menu on item selection offers all template workflows and free prompt (NFR-014).
- [ ] Works for single and multi-selection (FR-035, FR-036); disabled with no selection.
- [ ] Menu entries cleaned up on plugin shutdown (no leaks across plugin reload).

### S2-08 · Spike: highlight write feasibility · **Must** · S (timeboxed 1–2 days)
**Refs:** OP-001, FR-004 (de-risk), EIR-005, DEP-007, ASM-001
Prototype creating a colored highlight annotation on a PDF attachment via Zotero APIs
(`Zotero.Annotations`/`annotationPosition`). Determines Sprint 5 approach.

**Acceptance criteria**
- [ ] Throwaway script/branch demonstrates a programmatically created highlight visible in the Zotero PDF reader, or documents precisely why not.
- [ ] Findings (API surface, position format, text-to-position mapping strategy, risks) written to `docs/research/highlight-write-feasibility.md`.
- [ ] Sprint 5 highlight stories confirmed or re-scoped based on outcome.

### S2-09 · Spike: retrieval/vector library selection · **Must** · S (timeboxed 1–2 days)
**Refs:** OP-002, EIR-016, ASM-002, ASM-006, DEP-004
Evaluate embeddable options for the Zotero runtime (e.g. file-based vector store,
SQLite-based, pure-JS HNSW, wasm) against: runs in Zotero's JS environment, local-only,
rebuildable, hybrid-search-capable.

**Acceptance criteria**
- [ ] `docs/research/retrieval-library-decision.md` with candidates, criteria matrix, and a decision.
- [ ] Decision covers embedding model strategy (local model? provider-generated? — with NFR-010 constraint noted: embeddings never leave device).
- [ ] Sprint 3 backlog confirmed/adjusted against the decision.

---

## Out of sprint / explicitly deferred
- Retrieval-augmented context (FR-090 second half) — Sprint 3.
- Category-*structured paper analysis* workflow (FR-037…FR-040) — Sprint 4 (templates here are single-aspect prompts).
- Any Zotero writes beyond notes (tags Sprint 4, highlights Sprint 5).

## Definition of Done (sprint level)
- Demo script passes end-to-end against a real provider (Ollama or OpenAI).
- Orchestrator, composer, and adapters unit-tested where Zotero-free; smoke tests documented.
- `npm test`, `npm run typecheck`, `.xpi` install all green.
- Both spike documents merged; Sprint 3/5 plans adjusted if findings demand it.
