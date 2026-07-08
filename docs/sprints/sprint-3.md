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
- [ ] Backend implements `indexItem`, `removeItem`, `query`, `rebuild` from `src/retrieval/types.ts`.
- [ ] All index/embedding files live in a local plugin data dir (DAR-003/004, CON-007); path documented.
- [ ] A second in-memory fake backend passes the same interface test suite (proves replaceability, NFR-027, EIR-015).
- [ ] No retrieval code imports workflow or provider modules (EIR-017).

### S3-02 · Chunking & index content pipeline · **Must** · M
**Refs:** FR-067, DAR-009
Chunker for PDF text (structure-aware where possible: pages/paragraphs) plus small chunks
for annotations, notes, tags, metadata. Each chunk carries item key, source type, page, and
color-category where applicable.

**Acceptance criteria**
- [ ] All five source types from FR-067 are indexed with correct `IndexedChunk.source` values.
- [ ] Chunk metadata retains page number and annotation color-category so results can cite location.
- [ ] Chunker is a pure module with unit tests (fixtures for large text, empty input, unicode).
- [ ] Only chunk text is stored — no full PDF copies outside the index cache (DAR-009).

### S3-03 · Local embeddings · **Must** · L
**Refs:** FR-068, FR-072, NFR-007, NFR-010, per S2-09 decision
Embedding generation per the S2-09 strategy. Hard constraint: embeddings are computed and
stored locally and never transmitted to external AI providers.

**Acceptance criteria**
- [ ] Embeddings generated and persisted locally (FR-072); reload works after restart.
- [ ] No code path sends embeddings or index files to any provider (NFR-010) — asserted in review + a unit test on the provider-request builder rejecting embedding payloads.
- [ ] Embedding failures degrade gracefully to keyword-only retrieval with a logged warning.

### S3-04 · Semantic, keyword & hybrid retrieval · **Must** · M
**Refs:** FR-068, FR-069, FR-070, FR-071
`query()` supports the three modes from `RetrievalQuery.mode`; hybrid merges scores; optional
rerank/refinement step before context assembly.

**Acceptance criteria**
- [ ] Semantic mode returns passages by embedding similarity; keyword mode by term match; hybrid combines both (FR-068/069/070) — integration-tested against a small fixture corpus.
- [ ] Result limit and item-key filtering work (`RetrievalQuery.limit`, `itemKeys`).
- [ ] A rerank hook exists and improves ordering on the fixture corpus (FR-071); can be a simple score-fusion first version.

### S3-05 · Retrieval-augmented prompt context · **Must** · M
**Refs:** FR-065, FR-066, FR-090, NFR-001, NFR-002, NFR-004
Replace Sprint 2's truncation: the prompt composer requests relevant chunks for the
workflow's question and builds context within a token budget.

**Acceptance criteria**
- [ ] Large-PDF free prompt uses retrieved passages; truncation notice from S2-03 no longer appears when the index covers the item (FR-090).
- [ ] Context stays within a configurable token budget; full document is not sent when retrieval suffices (NFR-004).
- [ ] Composer falls back to truncation mode when the item is not yet indexed, and says so.
- [ ] Token budget + retrieval parameters unit-tested in the composer.

### S3-06 · Automatic index updates · **Must** · M
**Refs:** FR-075, FR-076, FR-077, NFR-005, NFR-008, BR-002, BR-008
Zotero notifier hooks (item/attachment/annotation/note/tag changes) enqueue re-indexing.
Background, throttled, local-only.

**Acceptance criteria**
- [ ] Adding/editing an annotation or note updates that item's index entries without user action (FR-075) — manual smoke test.
- [ ] Indexing runs deferred/throttled; Zotero stays responsive during a bulk import (NFR-005) — manual check with ≥50 items.
- [ ] Zero provider/network calls during automatic indexing (FR-077, NFR-008, BR-008) — verified by instrumenting the provider layer in a test.
- [ ] Indexing status distinguishable from AI activity in logs/UI status (FR-076).

### S3-07 · Rebuild & consistency · **Must** · S
**Refs:** FR-078, FR-079, DAR-005, NFR-021, BR-009, BR-010, EIR-018
"Rebuild index" action (settings) drops and rebuilds from Zotero data. Version marker in the
index; mismatch → prompt rebuild.

**Acceptance criteria**
- [ ] Rebuild from settings restores a deleted/corrupted index directory to working state (FR-078, DAR-005, EIR-018).
- [ ] Index schema version stored; incompatible version triggers a rebuild prompt instead of errors (NFR-021).
- [ ] Deleting the index loses no user data — everything regenerates from Zotero (BR-009/BR-010 demonstrated in smoke test).

### S3-08 · Index status UI · **Should** · S
**Refs:** NFR-006, FR-076, NFR-013
Settings section: index size, item coverage, last update, rebuild button, progress bar
during build. Plain language.

**Acceptance criteria**
- [ ] Coverage ("X of Y items indexed") and last-update time shown.
- [ ] Build/rebuild progress visible and cancelable.
- [ ] No embeddings/vector jargon in labels (NFR-013).

---

## Out of sprint / explicitly deferred
- Standalone semantic search UI (CON-008, FUT-003) — retrieval is internal only.
- Cloud/vector-DB anything (FR-074 — explicitly not required).

## Definition of Done (sprint level)
- Demo script passes; large-PDF prompt demonstrably uses retrieval.
- Interface test suite passes against real and fake backend.
- Privacy assertions verified: no network during indexing, embeddings never leave device.
- `npm test`, `npm run typecheck`, `.xpi` install green; smoke tests documented.
