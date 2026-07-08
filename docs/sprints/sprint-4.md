# Sprint 4 — Scholarly Workflows: Analysis, Notes, Tags

**Sprint goal:** The three scholarly core workflows work on single and multi-selection:
(1) category-structured paper analysis, (2) note generation from annotations/highlights and
note summarization, (3) tag suggestion and automatic tag writing. All reuse the Sprint 2
pipeline and Sprint 3 retrieval; all write results as regular Zotero objects without
per-item confirmation.

**Demo script:** Select 3 papers → "Analyze papers" → per-paper summary grouped by the 7
categories, empty categories marked "no evidence" → save as notes. Then "Generate note from
annotations" on an annotated paper → structured note grouped by color meaning. Then
"Suggest tags" → tags written to items, duplicates skipped.

**Requirements covered:** FR-003, FR-032…FR-040, FR-005, FR-006, FR-049…FR-053,
FR-007, FR-057…FR-064, EIR-003, NFR-017, NFR-019, NFR-020 (tags part), NFR-022, NFR-023,
BR-003, BR-004, BR-007, DAR-010. Quality: OP-010.

---

## Backlog (priority-sorted)

### S4-01 · Paper analysis workflow · **Must** · L
**Refs:** FR-003, FR-032, FR-033, FR-034, FR-035, FR-036, FR-037, MVP-003
"Analyze papers" workflow: for each selected item, combine retrieved PDF content with
annotations, highlights, notes, tags, metadata, and color semantics into a structured
per-paper summary. Full-PDF coverage via retrieval over all chunks (FR-032 + CR-003:
completeness through RAG, not raw token dumping).

**Acceptance criteria**
- [ ] Works from one item and from multi-selection without requiring a collection (FR-033, FR-035, FR-036).
- [ ] Context provably includes all six input classes where present (FR-034) — fixture-tested in the composer.
- [ ] Each analyzed paper yields its own structured summary in the result view (FR-037).
- [ ] Long papers analyzed within token budget via Sprint 3 retrieval (FR-032/FR-065 interplay; no truncation notice).
- [ ] Progress per paper visible during multi-item runs (NFR-003).

### S4-02 · Category-structured summaries · **Must** · M
**Refs:** FR-038, FR-039, FR-040, BR-006
Analysis output grouped by the user's configured scholarly categories. Categories without
evidence are explicitly marked, never hallucinated.

**Acceptance criteria**
- [ ] Summary sections follow the configured categories, incl. user-customized ones (FR-038) — not hardcoded to the 7 defaults.
- [ ] All 7 default categories appear when evidence exists (FR-039).
- [ ] A category with no evidence renders as "No relevant evidence found" (FR-040) — prompt instructs this and the renderer preserves it; verified with a fixture paper lacking, e.g., a data section.
- [ ] Saved note preserves the category structure as headings.

### S4-03 · Note generation from annotations & highlights · **Must** · M
**Refs:** FR-005, FR-049, FR-051, FR-052, FR-053, FR-056, MVP-005
Workflow producing a Zotero note per selected paper that structures its existing
annotations and highlights, grouped by color-category mapping.

**Acceptance criteria**
- [ ] Generated note contains a structured summary of the item's annotations (FR-051) and highlights (FR-052).
- [ ] Content grouped by the color-category mapping; unmapped colors land in an "Other" group (FR-053).
- [ ] Result shown in the result view first; saving attaches the note to the paper (FR-054/FR-055 reuse).
- [ ] Item without annotations yields a clear "nothing to process" message, not an empty AI call.
- [ ] Note is a plain Zotero note (FR-056, BR-004 — no AI labeling required).

### S4-04 · Note & annotation summarization · **Must** · M
**Refs:** FR-006, FR-050, MVP-006
Workflow summarizing an item's *existing notes* and annotations into a condensed overview
(distinct from S4-03: input = notes, output = digest).

**Acceptance criteria**
- [ ] Selected item's notes + annotations summarized into one coherent result (FR-050).
- [ ] Multi-selection produces a per-item digest section.
- [ ] Result saveable as a new note; original notes remain untouched (NFR-019).

### S4-05 · Tag analysis, suggestion & write workflow · **Must** · M
**Refs:** FR-007, FR-057…FR-064, EIR-003, NFR-017, NFR-020, BR-003, MVP-007
Tag workflow: read existing tags (FR-060), analyze content, propose additional tags
(FR-061), write them to the item after workflow start — no per-tag confirmation.

**Acceptance criteria**
- [ ] Existing tags feed into the prompt as context (FR-057); suggestions consider content, annotations, notes, metadata, and categories (FR-058).
- [ ] Tags written directly to the selected items after workflow start (FR-059, FR-062, BR-003); no per-tag dialog (FR-063, NFR-017).
- [ ] Case-insensitive duplicate detection — existing tags never duplicated (FR-064, NFR-020); unit-tested tag-merge logic.
- [ ] Result view lists which tags were added per item.

### S4-06 · Write-safety & failure handling · **Must** · S
**Refs:** NFR-019, NFR-022, NFR-023, BR-007, EIR-006, CON-005, CON-006
Hardening across all Sprint 4 writers: failed workflows must not corrupt Zotero data;
no collection/organization changes ever.

**Acceptance criteria**
- [ ] Provider failure mid-workflow: previously written items stay valid, no half-written notes/tags on the failing item (NFR-023) — fault-injection test with a fake provider that fails on item 2 of 3.
- [ ] Static check/review confirms no adapter API can touch collection membership (NFR-022, BR-007).
- [ ] All writers idempotent enough to re-run after failure without duplicating output (re-run produces new note versions only where intended, never duplicate tags).

### S4-07 · Workflow menu & UX consolidation · **Should** · S
**Refs:** NFR-014, NFR-013, FR-021
All workflows discoverable in one submenu with consistent naming; per-workflow provider
override (dropdown in result view) if cheap, else active provider only.

**Acceptance criteria**
- [ ] Context/Tools menus list: Analyze papers, Generate note from annotations, Summarize notes, Suggest tags, template prompts, Free prompt.
- [ ] Naming is task-language, no AI/RAG jargon (NFR-013).

### S4-08 · Output quality baseline (OP-010) · **Should** · S
**Refs:** OP-010, STK-010
Lightweight evaluation rubric + fixture set: 3–5 real papers with expected category
findings; manual scoring sheet to track prompt regressions.

**Acceptance criteria**
- [ ] `docs/quality/eval-rubric.md` with scoring dimensions (category accuracy, faithfulness, usefulness, no-evidence honesty).
- [ ] Baseline scores recorded for the analysis workflow on the fixture papers.
- [ ] Prompt changes from this sprint onward reference the rubric in review.

---

## Out of sprint / explicitly deferred
- Auto-highlighting (Sprint 5).
- Collection-level summary/comparison (FR-099…FR-101, post-MVP).

## Definition of Done (sprint level)
- Demo script passes on a real annotated library.
- Fault-injection tests green; duplicate-tag logic unit-tested.
- All four workflows respect BR-001 (explicit start) and write only notes/tags.
- `npm test`, `npm run typecheck`, `.xpi` install green; smoke tests documented.
