# Architecture Documentation

Five perspectives on the Zotero AI Research Assistant, derived from
`docs/zotero_ai_research_assistant_requirements.md` (esp. §15) and aligned with the sprint
plan in `docs/sprints/`. Diagrams are Mermaid (rendered by GitHub/most viewers).

| # | Document | View | Main diagrams |
|---|---|---|---|
| 1 | [Context & Scope](01-context-view.md) | system context, trust boundaries, quality drivers | context diagram |
| 2 | [Components & Modules](02-component-view.md) | building blocks, `src/` mapping, dependency rules | component diagram |
| 3 | [Runtime & Behavior](03-runtime-view.md) | key scenarios, workflow lifecycle, concurrency | 4 sequence diagrams, state machine |
| 4 | [Data & Persistence](04-data-view.md) | data model, storage map, privacy classification | class diagram, data-flow diagram |
| 5 | [Deployment & Cross-Cutting](05-deployment-crosscutting-view.md) | build/release, error handling, security, offline, testing, decision log | deployment diagram |

## Reading order

New to the project: 1 → 2 → 3. Implementing a sprint item: 2 (where does it live) +
3 (how does it interact) + the sprint file. Reviewing privacy/data safety: 1 §4 + 4 §3 +
5 §3.2.

## Invariants (the short list)

1. External AI calls only on explicit user start (BR-001) — single orchestrator entry point.
2. Embeddings/index never leave the device (NFR-010) — `retrieval/` cannot import `providers/`.
3. Zotero is authoritative; the index is a rebuildable cache (BR-009/010).
4. Only `src/zotero/` touches the `Zotero` global; writes limited to notes/tags/highlights.
5. Providers and retrieval backends are swappable behind interfaces (NFR-026/027).

## Open decisions

Tracked in the [decision log](05-deployment-crosscutting-view.md#4-architecture-decision-log-seed);
the three open ones (retrieval library, highlight write strategy, Codex/Copilot) resolve
via the spikes S2-09, S2-08, S1-08.
