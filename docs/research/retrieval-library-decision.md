# Spike S2-09 — Retrieval / vector library decision (OP-002)

**Refs:** OP-002, EIR-016, ASM-002, ASM-006, DEP-004, NFR-010
**Status:** decided (desk research + runtime constraints); revisit only if the
Sprint 3 runtime probe of wasm loading fails.

## Constraints

1. **Runs inside Zotero 9's privileged JS environment** (Firefox 115 ESR
   chrome scope, esbuild IIFE bundle — no Node APIs, no npm at runtime,
   wasm loading possible but must be probed).
2. **Local-only** (NFR-010/BR-008): index and embeddings never leave the
   device; `retrieval/` may not import `providers/` (enforced by the
   dependency matrix + isolation philosophy).
3. **Rebuildable cache** (invariant 5): full rebuild from Zotero data must
   always work; storage in the plugin data dir (DAR-003/004).
4. **Hybrid-capable**: semantic + keyword + merged mode (FR-068…FR-071).
5. Bundle-size sane; library must be embeddable (no server).

## Candidates

| Candidate | Type | Runs in fx115 chrome scope | Hybrid (BM25+vector) | Persistence | Bundle | Notes |
|---|---|---|---|---|---|---|
| **Orama** | pure-JS search DB | yes (pure JS, no Node deps) | **yes, built-in** | JSON export/import (`@orama/plugin-data-persistence`) | ~40 kB core | typed schema; vector + full-text + hybrid modes in one query API |
| MiniSearch | pure-JS BM25 | yes | keyword only | JSON serialization | ~30 kB | excellent keyword baseline, no vectors |
| Custom flat cosine over `Float32Array` + JSON file | hand-rolled | yes | only with extra BM25 lib | manual | ~0 | fine ≤ ~50k chunks; no ANN needed at library scale |
| hnswlib-wasm / voy | wasm ANN index | **unverified** (wasm instantiation in chrome scope to probe) | vector only | binary file | 100–600 kB wasm | ANN speed unnecessary at our scale; adds a fragile runtime dependency |
| SQLite (`Zotero.DBConnection`) | embedded DB | yes (Zotero API) | FTS5 keyword possible; **no vector extension** shipped | native | 0 | good for chunk/metadata storage, not vectors |

Scale check: a large personal library ≈ 2–5k items ≈ 20–100k chunks. Flat
(exact) cosine over 100k × 384-dim `Float32Array` is ~15 M multiply-adds per
query — well under 100 ms in JS. **ANN indexes (HNSW/wasm) solve a problem we
do not have**; exact search is also simpler to rebuild and debug.

## Decision

**Orama** as the retrieval library, persisted as a JSON snapshot in the plugin
data directory, wrapped behind our `RetrievalBackend` interface
(`src/retrieval/types.ts`) so it stays swappable (S3-01 AC: an in-memory fake
passes the same interface tests).

- Keyword mode → Orama full-text (BM25).
- Semantic mode → Orama vector search over locally computed embeddings.
- Hybrid mode → Orama's native hybrid scoring (satisfies FR-070 without
  hand-merging scores).
- Rebuild = drop the JSON snapshot, re-index from Zotero (invariant 5).
- If Orama's runtime probe in Zotero surprises us (it is pure JS, so risk is
  low), the fallback is MiniSearch (keyword) + custom flat cosine (vector)
  behind the same interface — no workflow-facing change.

## Embedding model strategy (NFR-010: embeddings never leave the device)

- **Local embeddings via transformers.js (ONNX/wasm) with a small sentence
  model** (`all-MiniLM-L6-v2`, 384-dim, ~25 MB quantized) is the target for
  S3-03. Model files are downloaded once from a model host (a *model*
  download, not user content — no library data is transmitted), cached in the
  plugin data dir, then used fully offline.
- **Wasm feasibility is the open runtime question** (onnxruntime-web in fx115
  chrome scope). Probe this in the first days of Sprint 3 (S3-03), timeboxed.
- **Committed degradation path** (matches S3-03 AC "embedding failures degrade
  gracefully"): keyword-only BM25 retrieval works with zero wasm — Sprint 3
  cannot fail on the embedding runtime.
- Explicitly rejected: provider-generated embeddings (OpenAI/Ollama embedding
  endpoints). Even though Ollama is local for some users, the provider
  abstraction is a network boundary — sending chunk text there for embedding
  would violate the `retrieval/ ↛ providers/` invariant and NFR-010's intent.
  If a future requirement wants Ollama-computed embeddings, it needs its own
  reviewed design, not a shortcut through the provider layer.

## Impact on Sprint 3 backlog

- S3-01 (backend): implement over Orama + JSON persistence — **unchanged**.
- S3-02 (chunking): unchanged; chunk metadata maps 1:1 onto an Orama schema.
- S3-03 (local embeddings): add an explicit **day-1 timeboxed wasm probe**;
  keyword-only fallback is already an acceptance criterion — **confirmed**.
- S3-04 (hybrid): simplified — Orama provides hybrid natively; the optional
  rerank step remains ours — **unchanged**.
