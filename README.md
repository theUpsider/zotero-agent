# Zotero AI Research Assistant

Zotero 9 extension for AI-assisted analysis of papers, annotations, highlights, tags and notes.
Requirements: [`docs/zotero_ai_research_assistant_requirements.md`](docs/zotero_ai_research_assistant_requirements.md) ·
Build guide: [`docs/research/zotero-9-extension-build-guide.md`](docs/research/zotero-9-extension-build-guide.md)

## Status

Sprint 1 complete: settings pane (provider + highlight-color meanings), working
OpenAI-compatible provider (OpenAI, Ollama, LM Studio, vLLM) with "Test connection"
validation, secure credential storage, and typed error/status plumbing.
Retrieval and workflows are still interface stubs (Sprints 2–3).
Sprint plan: [`docs/sprints/`](docs/sprints/) · manual test scripts:
[`docs/sprints/smoke-tests.md`](docs/sprints/smoke-tests.md)

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
Full manual test scripts: [`docs/sprints/smoke-tests.md`](docs/sprints/smoke-tests.md).

## Configuration

Open Edit → Settings → *AI Research Assistant*. Configuration is stored in Zotero
preferences (decision OP-006); the single source of key names and defaults is
`PREF_KEYS`/`PREF_DEFAULTS` in `src/core/config.ts`:

| Pref (under `extensions.zotero-agent.`) | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Master switch |
| `provider.active` | `openai-compatible` | Active AI provider id |
| `provider.openaiCompatible.endpoint` | `""` | Base URL, e.g. `http://localhost:11434/v1` |
| `provider.openaiCompatible.model` | `""` | Model id, e.g. `llama3` |
| `provider.requestTimeoutMs` | `30000` | HTTP timeout for provider calls |
| `colorSemantics` | `""` | JSON color→category mapping (empty = defaults) |

### Credential storage

The API key is **not** kept in preferences when avoidable. On startup the plugin
probes Zotero's login manager (secure password storage); if available, keys are
stored there. If the login manager is unavailable, the key falls back to a
plaintext preference (`extensions.zotero-agent.credentialFallback.*`) — the
settings pane shows which mechanism is active under the key field. Keys never
appear in logs, error messages, or the UI; all provider error paths run through
a redaction helper (NFR-012).

## Project structure

```
addon/            static plugin files copied into the build
  manifest.json   Zotero 9 manifest (version stamped from package.json)
  bootstrap.js    lifecycle hooks; loads the bundle
  prefs.js        default preferences
  content/        preferences pane (xhtml/js/css) — runs in the settings window
src/
  index.ts        bundle entry — exposes the ZoteroAgent global for bootstrap.js
  plugin.ts       glue: dependency wiring, settings API, pref-pane registration
  core/           config, color semantics, typed errors/redaction, credentials (pure, tested)
  prompts/        predefined scholarly prompt templates (pure, tested)
  providers/      AI provider abstraction, registry, OpenAI-compatible provider (pure, tested)
  retrieval/      local index/RAG backend interface (stub)
  workflows/      provider gate (ensureProviderReady/testConnection) + workflow contracts
  ui/             settings API published to the preferences pane
  zotero/         Zotero adapter, login-manager credentials, fetch resolver —
                  the only modules touching Zotero/Mozilla globals
tests/            vitest unit tests for the pure modules (fixtures, no live HTTP)
scripts/build.mjs esbuild bundle + static copy + .xpi packaging
docs/             requirements and research documents
```

Design rules baked into the layout (from requirements §15): business logic stays free of the
Zotero global so it is unit-testable; providers and the retrieval backend are replaceable
behind interfaces; the local index is a rebuildable cache, never the authoritative source;
external AI calls only ever happen on explicit user action.
