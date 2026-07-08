# Zotero AI Research Assistant

Zotero 9 extension for AI-assisted analysis of papers, annotations, highlights, tags and notes.
Requirements: [`docs/zotero_ai_research_assistant_requirements.md`](docs/zotero_ai_research_assistant_requirements.md) ·
Build guide: [`docs/research/zotero-9-extension-build-guide.md`](docs/research/zotero-9-extension-build-guide.md)

## Status

Bootstrapped skeleton. Runnable plugin (menu entry, selected-item access, debug logging),
module layout, and unit-test setup are in place. Architecture planning is the next step;
providers, retrieval, and workflows are interface stubs.

## Prerequisites

- Node.js LTS
- Zotero 9 (separate test profile recommended)
- `zip` (for `.xpi` packaging)

## Commands

```bash
npm install        # once
npm test           # unit tests (vitest)
npm run typecheck  # tsc --noEmit
npm run build      # bundle plugin into build/addon/
npm start          # build + watch (rebuild on change)
npm run pack       # build + package build/zotero-agent-<version>.xpi
```

## Running in Zotero 9

Option A — install the `.xpi`:

1. `npm run pack`
2. Zotero → Tools → Plugins → gear menu → *Install Plugin From File…* → select `build/zotero-agent-0.1.0.xpi`

Option B — load from source (dev, hot rebuild via `npm start`):

1. `npm run build`
2. Close Zotero. In your Zotero profile folder, create `extensions/zotero-agent@davidvfischer.github.io`
   (a plain file, no extension) containing one line — the absolute path to `build/addon`:
   ```
   /home/david/dev/zotero-agent/build/addon
   ```
3. Delete the `extensions.lastAppBuildId` and `extensions.lastAppVersion` lines from the profile's `prefs.js`.
4. Start Zotero (`zotero -purgecaches -ZoteroDebugText` for debug output). After code changes, restart Zotero.

Smoke test: Tools menu → *AI Research Assistant: Analyze selected items* shows the count of selected items.

## Project structure

```
addon/            static plugin files copied into the build
  manifest.json   Zotero 9 manifest (version stamped from package.json)
  bootstrap.js    lifecycle hooks; loads the bundle
  prefs.js        default preferences
src/
  index.ts        bundle entry — exposes the ZoteroAgent global for bootstrap.js
  plugin.ts       window/UI integration (menu entry, cleanup)
  core/           config (pref access) + color-category semantics (pure, tested)
  prompts/        predefined scholarly prompt templates (pure, tested)
  providers/      AI provider abstraction + OpenAI-compatible stub
  retrieval/      local index/RAG backend interface (stub)
  workflows/      workflow orchestration contracts (stub)
  zotero/         Zotero API adapter — only module touching the Zotero global
tests/            vitest unit tests for the pure modules
scripts/build.mjs esbuild bundle + static copy + .xpi packaging
docs/             requirements and research documents
```

Design rules baked into the layout (from requirements §15): business logic stays free of the
Zotero global so it is unit-testable; providers and the retrieval backend are replaceable
behind interfaces; the local index is a rebuildable cache, never the authoritative source;
external AI calls only ever happen on explicit user action.
