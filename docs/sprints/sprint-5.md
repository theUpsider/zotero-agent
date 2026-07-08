# Sprint 5 — Auto-Highlighting, Offline & Release

**Sprint goal:** The auto-highlighting workflow creates colored highlights in PDFs according
to the color semantics; offline behavior is verified for all local paths; the plugin ships
as a releasable, documented `.xpi` with update manifest. MVP complete (MVP-001…MVP-014).

**Demo script:** Select an unannotated paper → "Highlight paper" → AI identifies passages per
category → colored highlights appear in the PDF reader, colors match the mapping, no
duplicates on re-run. Then: disconnect network → local workflows (index query, result
viewing, local model) still work; external provider fails with a clear message. Install
release `.xpi` from scratch.

**Requirements covered:** FR-004, FR-041…FR-048, EIR-005, NFR-020 (highlights part),
NFR-028…NFR-032, NFR-023, FR-022, ASM-007, OP-009. Stretch: FR-014/FR-015 per S1-08 outcome.

**Precondition:** S2-08 spike confirmed highlight writes are feasible (otherwise this sprint
re-plans: highlight suggestions rendered as a note with page references instead).

---

## Backlog (priority-sorted)

### S5-01 · Passage identification for categories · **Must** · L
**Refs:** FR-041, FR-042, FR-043, FR-045
Workflow step: AI identifies text passages relevant to each configured category, returning
exact quotes + approximate location; resolver maps quotes to PDF text positions (strategy
from S2-08 findings). Most-relevant color chosen when several categories match (FR-045).

**Acceptance criteria**
- [ ] For a fixture paper, passages returned for methodology/results/etc. with exact text spans that exist in the PDF (fuzzy-match tolerance defined and tested).
- [ ] Passage→position resolver unit-tested against extracted page text fixtures (pure module).
- [ ] Multi-category passage gets exactly one color: the most relevant category's (FR-045); tie-breaking rule documented.
- [ ] Unresolvable passages (quote not found in PDF text) are reported in the result view, not silently dropped.

### S5-02 · Highlight creation in Zotero · **Must** · L
**Refs:** FR-004, FR-044, FR-047, FR-048, EIR-005, MVP-004, OP-009
Adapter write path: create Zotero highlight annotations at resolved positions using the
mapped color. Runs to completion after user start — no per-highlight confirmation.

**Acceptance criteria** (these implement OP-009)
- [ ] Created highlights are visible in the Zotero PDF reader at the correct text spans with the category-mapped color (FR-044, EIR-005).
- [ ] Whole workflow runs after a single user start; zero further prompts (FR-047).
- [ ] Created highlights are regular Zotero annotations: user can edit color, add comment, delete (FR-048).
- [ ] Result view summarizes created highlights per category with page numbers.
- [ ] Failure mid-run leaves already-created highlights valid and reports the rest (NFR-023).

### S5-03 · Highlight duplicate prevention · **Must** · M
**Refs:** FR-046, NFR-020
Before creating, compare against existing highlights (span overlap threshold). Re-running
the workflow must not double-highlight.

**Acceptance criteria**
- [ ] Re-run on an already-highlighted paper creates no equivalent duplicates (FR-046) — smoke-tested.
- [ ] Overlap detection (span intersection ≥ threshold on same page) unit-tested as a pure module.
- [ ] Manually created user highlights on the same span also count as existing (no AI duplicate over user work).

### S5-04 · Offline behavior verification & gaps · **Must** · M
**Refs:** NFR-028…NFR-032, FR-022, MVP-014, ASM-007
Systematic offline pass: local index query, viewing previously generated results, local
model workflows work offline; external-provider workflows fail fast with the S1 message.

**Acceptance criteria**
- [ ] With network disabled: index queries work (NFR-030), previously generated notes/results viewable (NFR-031), no feature errors out on startup (NFR-032).
- [ ] Local model (Ollama on localhost) workflow completes offline (NFR-029).
- [ ] External provider selected + offline → immediate clear message, no hang (FR-022).
- [ ] Offline test checklist added to `docs/sprints/smoke-tests.md`.

### S5-05 · Release engineering · **Must** · M
**Refs:** EIR-001, DEP-001, update_url in manifest
GitHub release pipeline: tagged release with `.xpi` + `update.json` at the manifest's
`update_url`, versioning from `package.json`, changelog, README install docs finalized.

**Acceptance criteria**
- [ ] `update.json` served at the manifest URL; Zotero's plugin updater detects a new version (tested with two versions).
- [ ] Fresh install on a clean Zotero 9 profile via released `.xpi` works following README only.
- [ ] Version bump flow documented (single source: `package.json`).

### S5-06 · Hardening & bug-fix buffer · **Must** · M
**Refs:** NFR-019, NFR-023, cross-cutting
Reserved capacity (~20%) for defects from Sprints 1–4, error-path polish, and the MVP
acceptance pass.

**Acceptance criteria**
- [ ] All MVP-001…MVP-014 requirements checked against the implementation in a traceability pass; result recorded in `docs/sprints/mvp-acceptance.md`.
- [ ] No known data-corrupting or crash bugs open at sprint end.

### S5-07 · Highlight quality criteria & eval · **Should** · S
**Refs:** OP-009, OP-010, S4-08 rubric
Extend the eval rubric to highlights: precision of spans, category correctness, coverage.
Score the fixture papers.

**Acceptance criteria**
- [ ] Rubric extended; baseline highlight scores recorded for fixture papers.
- [ ] Acceptance thresholds for "good enough for release" agreed and documented.

### S5-08 · Stretch: Codex / Copilot provider · **Could** · L
**Refs:** FR-014, FR-015, EIR-009, EIR-010, S1-08 outcome
Only if S1-08 concluded "go": implement as additional providers behind the existing
abstraction. Otherwise closed as "not technically feasible" (the requirements'
"where technically feasible" clause).

**Acceptance criteria**
- [ ] Provider passes the same registry/interface tests as the OpenAI-compatible one.
- [ ] Configurable entirely via settings UI (EIR-013); no workflow code changes (NFR-026).

---

## Contingency
If S2-08 found highlight writes infeasible: S5-01 stays (passage identification), S5-02/03
are replaced by "highlight report note" — a generated note listing passages + pages + category
colors for manual highlighting. FR-004 then needs a documented requirement deviation.

## Definition of Done (sprint level = MVP done)
- Full demo script passes on a clean profile with a real library.
- MVP traceability pass complete (`mvp-acceptance.md`), all Must-items across sprints closed or consciously descoped with rationale.
- Release published: tagged, `.xpi` + `update.json`, README current.
- `npm test`, `npm run typecheck` green; smoke-test suite documented and executed.
