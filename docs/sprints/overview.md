# Sprint Plan — Zotero AI Research Assistant

**Source:** [`../zotero_ai_research_assistant_requirements.md`](../zotero_ai_research_assistant_requirements.md) (v0.1, 2026-07-08)
**Scope:** MVP (MVP-001 … MVP-014). Post-MVP items (FR-099…FR-101, FUT-*) are explicitly out.
**Baseline:** Bootstrapped plugin skeleton exists (buildable `.xpi`, test setup, interface stubs for providers/retrieval/workflows).

---

## Slicing rationale

Sprints are cut along the **dependency chain**, not along the requirements document's chapter
structure. Every sprint ends with something demonstrable inside Zotero.

1. Nothing works without a **configured, validated AI provider** and persisted settings → Sprint 1.
2. Every workflow needs **Zotero read access, prompt execution, a result view, and note saving**.
   The free-prompt workflow is the thinnest possible end-to-end slice through all layers → Sprint 2.
3. Token-efficient analysis of large PDFs needs the **local index/RAG** before the heavy analysis
   workflows land → Sprint 3.
4. The scholarly core workflows (**paper analysis, note generation, note summarization, tags**)
   reuse everything from Sprints 1–3 → Sprint 4.
5. **Auto-highlighting** is the highest-risk write operation (OP-001) and is isolated in the last
   sprint together with **offline verification and release hardening** → Sprint 5.

**Risk front-loading:** feasibility spikes run 1–3 sprints before the feature they de-risk
(highlight-write spike in Sprint 2 → implementation in Sprint 5; retrieval-library spike in
Sprint 2 → index in Sprint 3; Codex/Copilot spike in Sprint 1 → stretch item in Sprint 5).

## Prioritization scheme

Each backlog item carries a **MoSCoW** priority *within its sprint*:

- **Must** — sprint goal fails without it; MVP-critical (maps to an MVP-0xx requirement).
- **Should** — needed for MVP, but the sprint demo survives if it slips one sprint.
- **Could** — value-add or stretch ("where technically feasible" requirements).

Backlogs are **sorted by priority, then by dependency order**. Item IDs: `S<sprint>-<nn>`.
Sizes are rough t-shirt estimates (S ≈ ≤1 day, M ≈ 2–3 days, L ≈ 4+ days).

## Sprint overview

| Sprint | Theme | Sprint goal (demo) | Key requirements |
|---|---|---|---|
| [1](sprint-1.md) | Provider & configuration foundation | Configure an OpenAI-compatible provider + color semantics in a settings UI; validation catches broken config | FR-001, FR-002, FR-013…FR-031, EIR-007…EIR-014, DAR-002/006/007/008 |
| [2](sprint-2.md) | Zotero access & first end-to-end workflow | Select items → run template or free prompt → see result → save as Zotero note | FR-009, FR-010, FR-035/036, FR-080…FR-098, EIR-001…EIR-004, BR-001 |
| [3](sprint-3.md) | Local index & retrieval (RAG) | Index builds/updates automatically and locally; retrieval feeds prompt context; rebuild works | FR-008, FR-065…FR-079, EIR-015…EIR-018, DAR-003/004/005, NFR-007…NFR-010 |
| [4](sprint-4.md) | Scholarly workflows: analysis, notes, tags | Category-structured paper analysis, note generation/summarization, tag suggestion+write on multi-selection | FR-003, FR-005, FR-006, FR-007, FR-032…FR-040, FR-049…FR-064 |
| [5](sprint-5.md) | Auto-highlighting, offline, release | AI creates colored highlights per color semantics; offline paths verified; installable signed-off release | FR-004, FR-041…FR-048, EIR-005, NFR-028…NFR-032 |

## Cross-cutting requirements (every sprint)

These are architectural invariants enforced continuously, not backlog items:

| Requirement | Rule |
|---|---|
| NFR-024, NFR-025 | Modular architecture; Zotero integration / providers / retrieval / workflows / UI stay separated (already reflected in `src/` layout). |
| NFR-026, NFR-027 | Providers and retrieval backend replaceable behind interfaces — no workflow may import a concrete provider/backend. |
| BR-001, NFR-009 | External AI calls only after explicit user action. Enforced at the workflow orchestrator, tested per workflow. |
| BR-009, BR-010 | Zotero is authoritative; local index is a rebuildable cache. No feature may treat index data as source of truth. |
| NFR-012 | No API secrets in logs, error messages, or result views. Checked in code review each sprint. |
| Testing | Pure modules get unit tests in the same sprint; Zotero-touching code gets a documented manual smoke-test script per sprint. |

## Requirement coverage map

| Requirement block | Sprint |
|---|---|
| FR-001, FR-013…FR-022 (provider config) | 1 |
| FR-014, FR-015 / EIR-009, EIR-010 (Codex, Copilot) | Spike in 1 → stretch in 5 |
| FR-002, FR-023…FR-031 (color semantics) | 1 |
| FR-009, FR-080…FR-090 (templates, free prompt) | 2 |
| FR-010, FR-091…FR-098 (result view, save note) | 2 |
| FR-035, FR-036 (workflow entry points) | 2 |
| FR-008, FR-065…FR-079 (index/RAG) | 3 |
| FR-003, FR-032…FR-040 (paper analysis) | 4 |
| FR-005, FR-006, FR-049…FR-056 (notes) | 4 (save-note plumbing already in 2) |
| FR-007, FR-057…FR-064 (tags) | 4 |
| FR-004, FR-041…FR-048 (auto-highlights) | 5 (feasibility spike in 2) |
| EIR-001…EIR-006 (Zotero interface) | 2 (EIR-005 in 5) |
| EIR-007…EIR-014 (provider interface) | 1 |
| EIR-015…EIR-018 (retrieval interface) | 3 |
| DAR-001…DAR-010 | 1 (config/credentials), 2 (links), 3 (index data) |
| NFR-001…NFR-006 (performance/progress) | 2 (progress), 3 (token efficiency) |
| NFR-007…NFR-012 (security/privacy) | 1 (credentials), 3 (local data) |
| NFR-013…NFR-018 (usability) | 1 (config UI), 2 (results), 4 (no per-item confirm) |
| NFR-019…NFR-023 (reliability) | 4, 5 |
| NFR-028…NFR-032 (offline) | 5 |
| FR-099…FR-101, FUT-* | out of plan (post-MVP) |

## Open points from the requirements (§13.3) — where they land

| OP | Handling |
|---|---|
| OP-001 highlight-write feasibility | Spike S2-08 → implementation Sprint 5 |
| OP-002 choose retrieval/vector library | Spike S2-09 → decision gate for Sprint 3 |
| OP-003 / OP-004 Copilot / Codex feasibility | Spike S1-08 → Could-item S5-08 |
| OP-005 target Zotero versions | **Closed:** Zotero 9.0–9.0.* (manifest) |
| OP-006 config storage/format | Sprint 1 (prefs-based, S1-02) |
| OP-007 UI concept | Incremental: settings UI Sprint 1, result view Sprint 2 |
| OP-008 default color mapping | **Closed in code:** `src/core/colorSemantics.ts` `defaultColorSemantics()` — confirm in Sprint 1 review |
| OP-009 acceptance criteria for generated highlights | Defined in Sprint 5 backlog (S5-02/S5-03) |
| OP-010 output quality evaluation | Sprint 4 (S4-08, lightweight rubric) |
