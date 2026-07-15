# Output Quality Rubric (OP-010, S4-08)

Lightweight, manual scoring sheet to catch prompt regressions in the scholarly
workflows (analysis, note generation, summarization, tags). Not automated — the
outputs are non-deterministic model text; this rubric is applied by a human
reviewer against a small fixed fixture set. Reference it in review whenever a
Sprint 4+ prompt changes.

## Fixture set

3–5 real, openly-licensed papers loaded in a Zotero test profile, each with a
handful of colored annotations covering several categories. Record here so runs
are comparable over time:

| # | Citation / DOI | Notes (annotations present, categories exercised) |
|---|----------------|---------------------------------------------------|
| 1 | _TBD_ | |
| 2 | _TBD_ | |
| 3 | _TBD_ | |

> Fixtures are chosen once and kept stable; changing them resets the baseline.

## Scoring dimensions

Score each analyzed paper 1–5 per dimension (5 best):

1. **Category accuracy** — content lands under the correct configured category
   heading; nothing miscategorized (FR-038/FR-039).
2. **Faithfulness** — claims are supported by the paper/annotations; no invented
   findings, numbers, or citations.
3. **Usefulness** — a researcher could act on the summary without reopening the
   PDF; appropriate level of detail.
4. **No-evidence honesty** — categories without support are marked exactly
   "No relevant evidence found", never padded or hallucinated (FR-040).

Optional per-workflow notes: tag relevance (S4-05), color grouping correctness
(S4-03), digest concision (S4-04).

## Baseline

Run the **Analyze papers** workflow on each fixture with the active provider and
record scores. This establishes the regression baseline; a later prompt change
should not lower any dimension without a documented reason.

| # | Category accuracy | Faithfulness | Usefulness | No-evidence honesty | Reviewer / date |
|---|-------------------|--------------|------------|---------------------|-----------------|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |

> **Status:** rubric and sheet defined (S4-08). Baseline scores are filled in by
> running the workflow against a live provider in a Zotero profile — a manual
> step that cannot run in the build/CI environment.

## Highlight quality (S5-07, OP-009)

Applies to the **Highlight paper** workflow. Score each fixture 1–5 per
dimension (5 best):

1. **Span precision** — highlighted spans cover the intended passage exactly:
   not truncated mid-clause, not over-extended into neighbouring sentences
   (FR-042/FR-043). Passages reported as "could not locate" count against this.
2. **Category correctness** — each highlight's color matches the passage's true
   category per the color mapping; multi-category passages take the most
   relevant color (FR-044/FR-045).
3. **Coverage** — the notable passages a researcher would highlight are found,
   without flooding the page with low-value highlights (precision over recall).
   Include evidence beyond the first context-budget window; auto-highlight
   page chunks must cover the complete PDF independently of index state.
4. **Non-duplication** — a re-run and existing user highlights produce no
   overlapping duplicates (FR-046); verified via smoke test 20.
5. **Anchor integrity and repair** — real highlights have nonzero per-line
   rectangles at the quoted text. Unanchored plugin notes persist until a
   replacement succeeds, then disappear without duplication (FR-103..105).

| # | Span precision | Category correctness | Coverage | Non-duplication | Anchor/repair | Reviewer / date |
|---|----------------|----------------------|----------|-----------------|---------------|-----------------|
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |

### Acceptance thresholds (release gate)

Agreed "good enough for release" bar for the highlight workflow, averaged over
the fixture set:

- **Category correctness ≥ 4** — miscolored highlights mislead the reader, so
  this is the hard gate; a single systematic miscategorization blocks release.
- **Span precision ≥ 3.5** and **Coverage ≥ 3** — some imprecise or missed
  spans are acceptable for an assistive feature the user can edit.
- **Non-duplication = 5** — non-negotiable: a re-run must never double-highlight
  (data-quality issue, not a taste issue).
- **Anchor integrity and repair = 5** — zero-position notes must never be
  reported as final highlights; replacement must be save-before-delete.

A fixture falling below any threshold is recorded with a note; release proceeds
only when the fixture-set averages meet the bar or the shortfall is consciously
accepted and documented here.

> **Status:** rubric and thresholds defined (S5-07). Baseline highlight scores
> are filled in by running **Highlight paper** against a live provider on the
> fixture papers — a manual step outside CI.
