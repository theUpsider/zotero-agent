# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Zotero 9 bootstrapped plugin for AI-assisted analysis of papers, annotations, highlights, tags and notes. Currently a bootstrapped skeleton: the plugin loads and shows a Tools-menu entry; providers, retrieval, and workflows are interface stubs. Development follows the sprint plan in `docs/sprints/` derived from `docs/zotero_ai_research_assistant_requirements.md` (requirement IDs like FR-xxx, BR-xxx, NFR-xxx referenced throughout code comments come from that document).

## Commands

```bash
npm test                       # all unit tests (vitest)
npx vitest run tests/colorSemantics.test.ts   # single test file
npm run test:watch             # vitest watch mode
npm run typecheck              # tsc --noEmit
npm run build                  # esbuild bundle → build/addon/
npm start                      # build + watch
npm run pack                   # build + zip → build/zotero-agent-<version>.xpi (needs `zip`)
```

There is no linter configured. Code that touches Zotero cannot be unit-tested; it is verified by manually loading the plugin into a Zotero 9 test profile (see README "Running in Zotero 9").

## Architecture

Load chain: `addon/bootstrap.js` (Zotero lifecycle hooks, plain JS, copied verbatim into the build) loads the esbuild IIFE bundle `content/zotero-agent.js` and drives it through the `ZoteroAgent` global, whose surface is `src/index.ts` → `ZoteroAgentPlugin` in `src/plugin.ts` (window/menu wiring only). `scripts/build.mjs` bundles `src/index.ts`, copies `addon/` statics, and stamps the package.json version into the manifest.

Module layers under `src/` (full dependency matrix: `docs/architecture/02-component-view.md` §3):

- `core/` — pref access helpers (`config.ts`, prefs injected via the `PrefStore` interface) and color→category semantics (`colorSemantics.ts`). Pure, depends on nothing.
- `prompts/` — predefined scholarly prompt templates with `{{context}}` substitution. Pure.
- `providers/` — `AIProvider` interface + OpenAI-compatible stub.
- `retrieval/` — `RetrievalBackend` interface for the local RAG index.
- `workflows/` — `Workflow` orchestration contracts (analyze-papers, auto-highlight, etc.).
- `zotero/` — adapter over the Zotero API (`adapter.ts`).

### Invariants (enforce in every change)

1. **Only `src/zotero/` (plus the thin `plugin.ts`/`config.ts` glue) may touch the `Zotero` global.** Everything else stays Zotero-free so it runs under vitest without a Zotero instance; pure modules get unit tests in `tests/` in the same change.
2. **`retrieval/` and `providers/` must never import each other** — embeddings/index data must physically be unable to reach a network provider (NFR-010), and indexing must never trigger network calls.
3. **Workflows depend on the `AIProvider`/`RetrievalBackend` interfaces, never concrete classes** — providers and backends are swappable via config only.
4. **External AI calls happen only on explicit user action** (BR-001); only local index updates may run in the background.
5. **Zotero is authoritative; the local index is a rebuildable cache** — never treat index data as source of truth. Plugin writes to Zotero are limited to notes, tags, and highlights.
6. No API secrets in logs, error messages, or result views.

## Docs

- `docs/architecture/` — five-view architecture docs (context, components, runtime, data, deployment); the component view's dependency table governs allowed imports.
- `docs/sprints/` — sprint backlogs with item IDs (`S<sprint>-<nn>`); the overview maps every requirement block to a sprint.
- `docs/research/zotero-9-extension-build-guide.md` — Zotero 9 plugin mechanics (referenced by section from code comments, e.g. "research guide §6.4").
