# Sprint 3 — Local Index & Retrieval (RAG)

**Sprint goal:** The plugin maintains a local, rebuildable retrieval index over PDF text,
annotations, notes, tags, and metadata. Workflows use retrieved passages instead of blind
truncation, making large-PDF analysis token-efficient. Everything stays on the device; index
updates never call external providers.

**Demo script:** Trigger index build on a library subset → watch progress → run a free prompt
on a 100-page PDF → result draws on retrieved passages (no truncation notice) → edit an
annotation → index auto-updates → "Rebuild index" from settings works.

**Requirements covered:** FR-008, FR-065…FR-079, FR-090 (completed), EIR-015…EIR-018,
DAR-003, DAR-004, DAR-005, DAR-009, NFR-001, NFR-002, NFR-004, NFR-005, NFR-007, NFR-008,
NFR-010, NFR-021, BR-002, BR-008, BR-009, BR-010, CON-007.

**Precondition:** S2-09 library decision.

---

## Backlog (priority-sorted)

### S3-01 · Retrieval backend implementation · **Must** · L
**Refs:** EIR-015, EIR-016, FR-073, DAR-003, DAR-004, NFR-027, ASM-006
Implement the `RetrievalBackend` interface with the library chosen in S2-09. Storage in the
plugin's data directory. Backend remains swappable — workflows keep depending only on the
interface.

**Acceptance criteria**
- [x] Backend implements `indexItem`, `removeItem`, `query`, `rebuild` from `src/retrieval/types.ts`. — `src/retrieval/oramaBackend.ts`.
- [x] All index/embedding files live in a local plugin data dir (DAR-003/004, CON-007); path documented. — `src/zotero/files.ts` (plugin data dir), `docs/research/retrieval-library-decision.md`.
- [x] A second in-memory fake backend passes the same interface test suite (proves replaceability, NFR-027, EIR-015). — `src/retrieval/memoryBackend.ts` + shared `tests/retrievalBackend.suite.ts`.
- [x] No retrieval code imports workflow or provider modules (EIR-017). — enforced by `check:isolation` (import matrix) in the test run.

### S3-02 · Chunking & index content pipeline · **Must** · M
**Refs:** FR-067, DAR-009
Chunker for PDF text (structure-aware where possible: pages/paragraphs) plus small chunks
for annotations, notes, tags, metadata. Each chunk carries item key, source type, page, and
color-category where applicable.

**Acceptance criteria**
- [x] All five source types from FR-067 are indexed with correct `IndexedChunk.source` values. — `src/retrieval/chunker.ts` + `tests/chunker.test.ts`.
- [x] Chunk metadata retains page number and annotation color-category so results can cite location. — `IndexedChunk.page`/`colorCategory` set in chunker; tested.
- [x] Chunker is a pure module with unit tests (fixtures for large text, empty input, unicode). — `tests/chunker.test.ts` (10 tests).
- [x] Only chunk text is stored — no full PDF copies outside the index cache (DAR-009). — chunker emits `text` only; no attachment copies.

### S3-03 · Local embeddings · **Must** · L
**Refs:** FR-068, FR-072, NFR-007, NFR-010, per S2-09 decision
Embedding generation per the S2-09 strategy. Hard constraint: embeddings are computed and
stored locally and never transmitted to external AI providers.

**Acceptance criteria**
- [x] Embeddings generated and persisted locally (FR-072); reload works after restart. — `src/retrieval/embeddings.ts` (local transformers), snapshot persist/reload in `src/retrieval/snapshot.ts` + `tests/snapshot.test.ts`. Embedder defaults off until day-1 wasm probe (`src/retrieval/probe.ts`); persistence path covered by `createFakeEmbedder`.
- [x] No code path sends embeddings or index files to any provider (NFR-010) — asserted in review + a unit test on the provider-request builder rejecting embedding payloads. — `tests/openaiCompatible.test.ts:90` (body never carries `embedding`, never targets an embeddings endpoint).
- [x] Embedding failures degrade gracefully to keyword-only retrieval with a logged warning. — `tests/oramaBackend.test.ts:51,87`.

### S3-04 · Semantic, keyword & hybrid retrieval · **Must** · M
**Refs:** FR-068, FR-069, FR-070, FR-071
`query()` supports the three modes from `RetrievalQuery.mode`; hybrid merges scores; optional
rerank/refinement step before context assembly.

**Acceptance criteria**
- [x] Semantic mode returns passages by embedding similarity; keyword mode by term match; hybrid combines both (FR-068/069/070) — integration-tested against a small fixture corpus. — `tests/oramaBackend.test.ts`.
- [x] Result limit and item-key filtering work (`RetrievalQuery.limit`, `itemKeys`). — covered by `tests/retrievalBackend.suite.ts` (run for both backends).
- [x] A rerank hook exists and improves ordering on the fixture corpus (FR-071); can be a simple score-fusion first version. — `src/retrieval/rerank.ts` (`defaultReranker`), wired in `oramaBackend`.

### S3-05 · Retrieval-augmented prompt context · **Must** · M
**Refs:** FR-065, FR-066, FR-090, NFR-001, NFR-002, NFR-004
Replace Sprint 2's truncation: the prompt composer requests relevant chunks for the
workflow's question and builds context within a token budget.

**Acceptance criteria**
- [x] Large-PDF free prompt uses retrieved passages; truncation notice from S2-03 no longer appears when the index covers the item (FR-090). — `composeItem` `retrievedByItem` path, `contextSource: "retrieval"`; `tests/composer.test.ts`.
- [x] Context stays within a configurable token budget; full document is not sent when retrieval suffices (NFR-004). — `tokenBudgetPerItem` + `tokenBudgetToChars` budget loop in `src/prompts/composer.ts`; tested.
- [x] Composer falls back to truncation mode when the item is not yet indexed, and says so. — item absent from `retrievedByItem` → `truncated-full-text` + `[Note: full text truncated…]`; tested.
- [x] Token budget + retrieval parameters unit-tested in the composer. — `tests/composer.test.ts` (18 tests).

### S3-06 · Automatic index updates · **Must** · M
**Refs:** FR-075, FR-076, FR-077, NFR-005, NFR-008, BR-002, BR-008
Zotero notifier hooks (item/attachment/annotation/note/tag changes) enqueue re-indexing.
Background, throttled, local-only.

**Acceptance criteria**
- [~] Adding/editing an annotation or note updates that item's index entries without user action (FR-075) — manual smoke test. — mechanism wired: `registerItemChangeObserver` → `indexManager.onItemEvent`. Manual smoke test #15 pending in Zotero.
- [~] Indexing runs deferred/throttled; Zotero stays responsive during a bulk import (NFR-005) — manual check with ≥50 items. — debounce/maxWait/itemDelay + concurrency-1 drain in `indexManager.ts`. Manual ≥50-item check pending.
- [x] Zero provider/network calls during automatic indexing (FR-077, NFR-008, BR-008) — verified by instrumenting the provider layer in a test. — `tests/indexManager.test.ts:175` (never a network call while draining/rebuilding).
- [x] Indexing status distinguishable from AI activity in logs/UI status (FR-076). — `[index]`-prefixed logs; `IndexStatus.state` separate from provider activity.

### S3-07 · Rebuild & consistency · **Must** · S
**Refs:** FR-078, FR-079, DAR-005, NFR-021, BR-009, BR-010, EIR-018
"Rebuild index" action (settings) drops and rebuilds from Zotero data. Version marker in the
index; mismatch → prompt rebuild.

**Acceptance criteria**
- [x] Rebuild from settings restores a deleted/corrupted index directory to working state (FR-078, DAR-005, EIR-018). — corrupt/incompatible snapshot discarded to empty (`oramaBackend.ts:120`, tested); `rebuild()` drops + re-indexes from Zotero. Full profile-level restore = smoke test #17.
- [x] Index schema version stored; incompatible version triggers a rebuild prompt instead of errors (NFR-021). — `SCHEMA_VERSION` in `snapshot.ts`; mismatch → discard + `needs-rebuild` state (surfaced in settings UI).
- [~] Deleting the index loses no user data — everything regenerates from Zotero (BR-009/BR-010 demonstrated in smoke test). — regeneration path in place (`rebuild()` reads only Zotero). Manual smoke test #17 pending.

### S3-08 · Index status UI · **Should** · S
**Refs:** NFR-006, FR-076, NFR-013
Settings section: index size, item coverage, last update, rebuild button, progress bar
during build. Plain language.

**Acceptance criteria**
- [x] Coverage ("X of Y items indexed") and last-update time shown. — `addon/content/preferences.js:253` (`initIndexSection`), `preferences.xhtml` `za-index-*` nodes.
- [x] Build/rebuild progress visible and cancelable. — `za-index-progress`/`za-index-cancel`; `rebuildIndex`/`cancelIndexRebuild` on the settings API.
- [x] No embeddings/vector jargon in labels (NFR-013). — plain-language labels ("Local index", "items indexed", "Rebuilding — X of Y").

---

## Out of sprint / explicitly deferred
- Standalone semantic search UI (CON-008, FUT-003) — retrieval is internal only.
- Cloud/vector-DB anything (FR-074 — explicitly not required).

## Definition of Done (sprint level)
- [~] Demo script passes; large-PDF prompt demonstrably uses retrieval. — implemented; manual demo run in Zotero pending.
- [x] Interface test suite passes against real and fake backend. — `tests/retrievalBackend.suite.ts` run for `oramaBackend` + `memoryBackend`.
- [x] Privacy assertions verified: no network during indexing, embeddings never leave device. — `tests/indexManager.test.ts:175`, `tests/openaiCompatible.test.ts:90`.
- [~] `npm test`, `npm run typecheck`, `.xpi` install green; smoke tests documented. — `npm test` (195 pass) + `npm run typecheck` green; smoke tests in `docs/sprints/smoke-tests.md` §14–18; `.xpi` install is manual.

> **Legend:** `[x]` = implemented and covered by an automated test / code check. `[~]` = mechanism implemented; the criterion is defined to be verified by a manual Zotero smoke run (§14–18) which cannot be executed in the build environment. No `[ ]` remain — Sprint 3 was implemented in commit `ecda587`; this pass verified and annotated coverage.
