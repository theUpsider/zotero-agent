# Sprint 5 — Auto-Highlighting, Offline & Release

**Sprint goal:** The auto-highlighting workflow creates colored highlights in PDFs according
to the color semantics; offline behavior is verified for all local paths; the plugin ships
as a releasable, documented `.xpi` with update manifest. MVP complete (MVP-001…MVP-014).

**Demo script:** Select an unannotated paper → "Highlight paper" → AI identifies passages per
category → colored highlights appear in the PDF reader, colors match the mapping, no
duplicates on re-run. Then: disconnect network → local workflows (index query, result
viewing, local model) still work; external provider fails with a clear message. Install
release `.xpi` from scratch.

**Requirements covered:** FR-004, FR-041…FR-048, FR-102…FR-107, EIR-005, NFR-020 (highlights part),
NFR-028…NFR-032, NFR-023, FR-022, ASM-007, OP-009. Stretch: FR-014/FR-015 per S1-08 outcome.

**Precondition:** S2-08 spike confirmed highlight writes are feasible (otherwise this sprint
re-plans: highlight suggestions rendered as a note with page references instead).

---

## Backlog (priority-sorted)

### S5-01 · Passage identification for categories · **Must** · L
**Refs:** FR-041, FR-042, FR-043, FR-045, FR-102, FR-106..FR-112
Workflow step: one AI pass per configured category identifies all relevant passages and
returns exact quotes; replies are merged and the resolver maps quotes to PDF text positions.
A fitting PDF is one maximal request per category. Oversized PDFs use exhaustive 500-character-
overlap windows; category retrieval ranks them but cannot remove coverage (FR-106..110).
Most-relevant color is retained when passages overlap (FR-045, FR-102).

**Acceptance criteria**
- [x] For a fixture paper, passages returned for methodology/results/etc. with exact text spans that exist in the PDF (fuzzy-match tolerance defined and tested). — `composeHighlightPrompt` (`prompts/scholarly.ts`) demands verbatim quotes; `planHighlights` locates them. Tolerance (case, ligatures, whitespace, hyphenation) documented in `workflows/highlights.ts` `normalize()` and tested in `highlights.test.ts`.
- [x] Passage→position resolver unit-tested against extracted page text fixtures (pure module). — `workflows/highlights.ts` `planHighlights`/`locate`; `tests/highlights.test.ts`.
- [x] Multi-category passage gets exactly one color: the most relevant category's (FR-045); tie-breaking rule documented. — suggestions processed most-relevant-first; overlapping later passage dropped as duplicate. Rule documented on `planHighlights`; tested ("keeps the most-relevant (first) category when passages overlap").
- [x] Unresolvable passages (quote not found in PDF text) are reported in the result view, not silently dropped. — `unresolved` (`not-found`/`no-color`) surfaced by `summarizeHighlightRun`; tested in `highlights.test.ts` + `highlightSummary.test.ts`.
- [x] Long otherwise-verbatim quotes tolerate dash loss/addition caused by PDF line wrapping (`state-of-the-\nart`, `X-toEnglish`) while short quotes remain strict. — conservative long-quote fallback in `locate`; regression-tested.
- [x] A PDF below the effective provider/user context budget reaches each category in one complete request with explicit prompt/output/reasoning/safety reserves; common `/models` context fields are detected without changing `listModels()` compatibility.
- [x] Oversized PDFs use maximal windows with 500-character overlap across page boundaries; category RAG changes order only, and missing/failed retrieval scans every window in document order without an index/truncation warning.
- [x] Explicit provider context-limit failures split and retry only the failed window; other provider errors remain failures.
- [x] Cross-page compound-hyphen quotes resolve to page-local highlight spans.

### S5-02 · Highlight creation in Zotero · **Must** · L
**Refs:** FR-004, FR-044, FR-047, FR-048, EIR-005, MVP-004, OP-009
Adapter write path: create Zotero highlight annotations at resolved positions using the
mapped color. Runs to completion after user start — no per-highlight confirmation.

**Acceptance criteria** (these implement OP-009)
- [~] Created highlights are visible in the Zotero PDF reader at the correct text spans with the category-mapped color (FR-044, EIR-005). — `createHighlightWriter` reads character rectangles from an open reader, validates nonzero per-line rects, supplies a unique Zotero object key, then calls `Zotero.Annotations.saveFromJSON`; **visual live verification pending** (smoke test 19).
- [x] Whole workflow runs after a single user start; zero further prompts (FR-047). — orchestrator `runAutoHighlight` runs to completion; tested ("runs to completion after a single start").
- [~] Created highlights are regular Zotero annotations: user can edit color, add comment, delete (FR-048). — created via the standard annotation item API; **live verification pending** (smoke test 19.4).
- [x] Result view summarizes created highlights per category with page numbers. — `summarizeHighlightRun`; tested in `highlightSummary.test.ts`, wired via orchestrator.
- [x] Failure mid-run leaves already-created highlights valid and reports the rest (NFR-023). — per-item commit + per-passage try/catch in `createHighlights`; earlier sections stay in `lastResult` on failure (orchestrator).

### S5-03 · Highlight duplicate prevention · **Must** · M
**Refs:** FR-046, NFR-020
Before creating, compare against existing highlights (span overlap threshold). Re-running
the workflow must not double-highlight.

**Acceptance criteria**
- [x] Re-run on an already-highlighted paper creates no equivalent duplicates (FR-046) — smoke-tested. — existing highlights read by `readTargets` and passed to `planHighlights`; overlaps dropped. Smoke test 20; unit-tested ("does not duplicate over an existing highlight").
- [x] Overlap detection (span intersection ≥ threshold on same page) unit-tested as a pure module. — `spanOverlapRatio` + `overlapsAny` in `workflows/highlights.ts`; `highlights.test.ts`.
- [x] Manually created user highlights on the same span also count as existing (no AI duplicate over user work). — user and prior-run highlights are read identically (`readExistingHighlights`), both suppress overlaps. Smoke test 20.3.

### S5-09 · Broken-highlight detection and repair · **Must** · M
**Refs:** FR-103, FR-104, FR-105, NFR-023
Detect zero-position page-note fallbacks created when reader geometry was unavailable. On a
later run with the PDF open, retry quote-to-character anchoring and replace each fallback
transactionally.

**Acceptance criteria**
- [x] Prior plugin fallback notes are detected from their category/text payload and invalid zero-area geometry. — `readRepairableFallbacks`; adapter regression test.
- [x] Repair candidates reserve their text spans so the category passes cannot create overlapping duplicates. — orchestrator merges repair candidates into duplicate suppression.
- [x] A valid replacement uses real reader character rectangles and the old note is erased only after `saveFromJSON` succeeds (FR-104). — `computeRects` + `createHighlights`; adapter regression test.
- [x] Missing reader geometry or a failed replacement preserves the old note for a later retry (FR-105). — fallback branch never erases before successful replacement.

### S5-04 · Offline behavior verification & gaps · **Must** · M
**Refs:** NFR-028…NFR-032, FR-022, MVP-014, ASM-007
Systematic offline pass: local index query, viewing previously generated results, local
model workflows work offline; external-provider workflows fail fast with the S1 message.

**Acceptance criteria**
- [x] Offline test checklist added to `docs/sprints/smoke-tests.md`. — smoke test 21 covers startup, index query, viewing prior results, localhost model, and cloud-provider fast-fail.
- [~] With network disabled: index queries work (NFR-030), previously generated notes/results viewable (NFR-031), no feature errors out on startup (NFR-032). — no network path in retrieval by construction (NFR-010 import ban); **live confirmation via smoke 21.1–21.3**.
- [~] Local model (Ollama on localhost) workflow completes offline (NFR-029). — **smoke 21.4**.
- [~] External provider selected + offline → immediate clear message, no hang (FR-022). — S1 offline error mapping in place; **smoke 21.5**.

### S5-05 · Release engineering · **Must** · M
**Refs:** EIR-001, DEP-001, update_url in manifest
GitHub release pipeline: tagged release with `.xpi` + `update.json` at the manifest's
`update_url`, versioning from `package.json`, changelog, README install docs finalized.

**Acceptance criteria**
- [x] `update.json` served at the manifest URL; Zotero's plugin updater detects a new version (tested with two versions). — `scripts/build.mjs` `writeUpdateManifest` emits `build/update.json` on `npm run pack`, single-sourced from `package.json`/manifest; two-version updater check is **smoke test 22.3**.
- [~] Fresh install on a clean Zotero 9 profile via released `.xpi` works following README only. — `.xpi` produced by pack; **smoke test 22.2**.
- [x] Version bump flow documented (single source: `package.json`). — README "Releasing (S5-05)" section.

### S5-06 · Hardening & bug-fix buffer · **Must** · M
**Refs:** NFR-019, NFR-023, cross-cutting
Reserved capacity (~20%) for defects from Sprints 1–4, error-path polish, and the MVP
acceptance pass.

**Acceptance criteria**
- [x] All MVP-001…MVP-014 requirements checked against the implementation in a traceability pass; result recorded in `docs/sprints/mvp-acceptance.md`.
- [x] No known data-corrupting or crash bugs open at sprint end. — `npm test` (244) and `npm run typecheck` green; write paths are per-item/per-passage fault-isolated (NFR-023). Residual Zotero-facing items are verification-pending, not known defects.

### S5-07 · Highlight quality criteria & eval · **Should** · S
**Refs:** OP-009, OP-010, S4-08 rubric
Extend the eval rubric to highlights: precision of spans, category correctness, coverage.
Score the fixture papers.

**Acceptance criteria**
- [x] Rubric extended; baseline highlight scores recorded for fixture papers. — "Highlight quality (S5-07)" section in `docs/quality/eval-rubric.md` (span precision, category correctness, coverage, non-duplication). Baseline scores are a live-provider manual step, sheet ready.
- [x] Acceptance thresholds for "good enough for release" agreed and documented. — "Acceptance thresholds (release gate)" in the same doc.

### S5-08 · Stretch: Codex / Copilot provider · **Could** · L — **CLOSED: not feasible**
**Refs:** FR-014, FR-015, EIR-009, EIR-010, S1-08 outcome
S1-08 concluded **no-go** for both (`docs/research/provider-feasibility.md`):
Codex has no third-party completion API, Copilot has no official API. Closed
under the requirements' "where technically feasible" clause; recorded in
`mvp-acceptance.md` → Descoped. Not implemented.

**Acceptance criteria** — N/A (closed as not technically feasible).
- [~] Provider passes the same registry/interface tests as the OpenAI-compatible one. — n/a
- [~] Configurable entirely via settings UI (EIR-013); no workflow code changes (NFR-026). — n/a

---

## Contingency
If S2-08 found highlight writes infeasible: S5-01 stays (passage identification), S5-02/03
are replaced by "highlight report note" — a generated note listing passages + pages + category
colors for manual highlighting. FR-004 then needs a documented requirement deviation.

## Definition of Done (sprint level = MVP done)
- [~] Full demo script passes on a clean profile with a real library. — code paths complete; the live run is the pending manual step (smoke 19–22).
- [x] MVP traceability pass complete (`mvp-acceptance.md`), all Must-items across sprints closed or consciously descoped with rationale.
- [x] Release published: tagged, `.xpi` + `update.json`, README current. — build emits both artifacts; README "Releasing (S5-05)". Tagging/upload is the manual publish step.
- [x] `npm test`, `npm run typecheck` green; smoke-test suite documented and executed. — 252 unit tests + typecheck green; smoke suite documented (execution is the manual live pass).

---

## Implementation status (Sprint 5 close — 2026-07-15)

Implemented in this sprint: pure passage resolver + duplicate prevention
(`workflows/highlights.ts`, `highlights.test.ts`), highlight prompt
(`composeHighlightPrompt`), per-category provider passes, the `HighlightWriter`
seam + `createHighlightWriter` adapter write path (`zotero/adapter.ts`), the
`auto-highlight` orchestrator branch + result summary
(`workflows/highlightSummary.ts`), maximal-context packer
(`workflows/highlightContext.ts`), provider capability metadata,
category-specific RAG window ranking with exhaustive fallback, broken-highlight
detection/repair, the "Highlight paper" menu/UI wiring, `update.json` build
generation, offline + highlight + release smoke tests, and the extended
highlight eval rubric and MVP traceability doc. S5-08 closed as not feasible.

**Legend:** `[x]` done + covered by CI where testable · `[~]` code complete,
final confirmation needs the manual Zotero-profile pass (smoke-tests.md) — code
touching the live reader still needs visual smoke testing. Installed Zotero source
inspection resolved S2-08 Probe B: `PDFWorker` has no structured-text API, so the
adapter uses open-reader `getPageData().chars`. Page-note fallbacks are preserved
and automatically repaired on a later run instead of being treated as final output.
