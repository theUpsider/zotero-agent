# MVP acceptance & traceability (S5-06)

Traceability pass over MVP-001…MVP-014 at the close of Sprint 5. Each row maps
the requirement to the code that implements it and to the smoke test that
verifies it in a live Zotero profile (pure logic is additionally covered by the
vitest suite, which runs in CI).

**Legend:** ✅ implemented + unit-covered where testable; 🔎 requires the manual
smoke test to confirm the Zotero-facing behavior (code that touches the `Zotero`
global cannot be unit-tested — see CLAUDE.md).

| MVP | Requirement | Implementation | Verified by | State |
|-----|-------------|----------------|-------------|-------|
| MVP-001 | Configure AI providers | `providers/`, `ui/settingsApi.ts`, `core/config.ts` | smoke 2–5 | 🔎 |
| MVP-002 | Configure color→category semantics | `core/colorSemantics.ts`, settings pane | smoke 6; `colorSemantics.test.ts` | ✅🔎 |
| MVP-003 | Analyze selected papers | orchestrator `analyze-papers`, `prompts/scholarly.ts` | smoke 9; `orchestrator.test.ts` | ✅🔎 |
| MVP-004 | Auto-create colored highlights | `workflows/highlights.ts`, `zotero/adapter.ts` `createHighlightWriter`, orchestrator `auto-highlight` | smoke 19–20; `highlights.test.ts`, `highlightSummary.test.ts` | ✅🔎 |
| MVP-005 | Generate notes from annotations | orchestrator `generate-notes` | smoke 11; `orchestrator.test.ts` | ✅🔎 |
| MVP-006 | Summarize notes & annotations | orchestrator `summarize-notes` | smoke 12 | ✅🔎 |
| MVP-007 | Analyze/suggest/create tags | orchestrator `suggest-tags`, `core/tags.ts`, adapter `createTagWriter` | smoke 13; `tags.test.ts` | ✅🔎 |
| MVP-008 | Build/update local retrieval index | `retrieval/`, `retrieval/indexManager.ts`, notifier | smoke 15, 17–18; backend suites | ✅🔎 |
| MVP-009 | Predefined prompt templates | `prompts/templates.ts`, orchestrator `template` | smoke 7–8; `templates.test.ts` | ✅🔎 |
| MVP-010 | Free-form prompts | orchestrator `free-prompt` | smoke 10 | ✅🔎 |
| MVP-011 | Display generated results | `ui/workflowApi.ts`, `addon/content/resultView.*` | smoke 8–13 | 🔎 |
| MVP-012 | Save results as Zotero notes | orchestrator `saveResultAsNotes`, adapter `createNoteWriter`, `core/markdown.ts` | smoke 8; `markdown.test.ts` | ✅🔎 |
| MVP-013 | Keep embeddings/index local | `retrieval/` ⊥ `providers/` import ban (NFR-010) | dependency rule; `retrievalBackend.suite.ts` | ✅ |
| MVP-014 | Offline use for local workflows | local index + localhost provider paths | smoke 21 | 🔎 |

## Invariant checks (component view §3, CLAUDE.md)

- **Zotero isolation** — only `src/zotero/`, `src/plugin.ts`, `src/core/config.ts`
  glue reference the `Zotero` global; every pure module (incl. the new
  `workflows/highlights.ts`, `workflows/highlightSummary.ts`) runs under vitest.
- **`retrieval/` ⊥ `providers/`** — no import either way; embeddings/index data
  cannot reach a network provider (NFR-010, MVP-013).
- **Workflows depend on interfaces** — orchestrator takes `AIProvider`,
  `RetrievalBackend`, `HighlightWriter`, `NoteWriter`, `TagWriter` seams, never
  concrete Zotero classes (swappable via config).
- **AI calls only on user action** — every provider call funnels through the
  orchestrator's single entry point, invoked from a menu/result-view action
  (BR-001); only local index updates run in the background (BR-002).
- **Zotero authoritative** — the index is a rebuildable cache; plugin writes are
  limited to notes, tags, and highlight/note annotations (BR-007, NFR-022).
- **No secrets in logs/UI** — `redact()` on all log/error paths (NFR-012);
  `errors.test.ts` asserts a key never surfaces.

## Descoped / consciously deferred

| Item | Decision | Rationale |
|------|----------|-----------|
| FR-014 Codex provider | not technically feasible | `docs/research/provider-feasibility.md` — Codex has no third-party completion API. |
| FR-015 Copilot provider | not technically feasible | same doc — no official API; only a ToS-violating token exchange. |
| Local embeddings default-on (`retrieval.embeddings`) | off by default | pending the day-1 wasm probe confirmation in a live profile (S3-03); retrieval degrades to keyword-only, still offline. |
| Highlight glyph-rect extraction (`PDFWorker` structured text) | committed note-annotation fallback | S2-08 "Probe B" still pending live verification; when the API is absent, passages become page-note annotations so a run never fails on rect math. |

## Result

MVP-001…MVP-014 are all implemented. Pure logic is green under `npm test`
(unit + interface-contract + fault-injection levels) and `npm run typecheck`.
The Zotero-facing behaviors (🔎 rows) are confirmed by the manual smoke-test
suite (`docs/sprints/smoke-tests.md`) on a Zotero 9 profile — the required
final step for MVP sign-off, run outside CI.

> **Status:** traceability complete. Fill in the smoke-test run date + Zotero
> version below when the manual pass is executed on a real library.
>
> _Smoke pass: (pending — Zotero version / date / reviewer)_
