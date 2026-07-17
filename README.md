# Zotero AI Research Assistant

Zotero 9 extension for AI-assisted analysis of papers, annotations, highlights, tags and notes.
Requirements: [`docs/zotero_ai_research_assistant_requirements.md`](docs/zotero_ai_research_assistant_requirements.md) ·
Build guide: [`docs/research/zotero-9-extension-build-guide.md`](docs/research/zotero-9-extension-build-guide.md) ·
Architecture: [`docs/architecture/06-holistic-architecture.md`](docs/architecture/06-holistic-architecture.md) ·
Sprint plan: [`docs/sprints/`](docs/sprints/)

## Status

MVP complete (Sprints 1–5): settings pane (provider + highlight-color meanings),
OpenAI-compatible provider (OpenAI, Ollama, LM Studio, vLLM) with "Test connection"
validation and secure credential storage; a local, offline retrieval index for
large PDFs; the scholarly workflows (analyze papers, generate/summarize notes,
suggest tags) and **auto-highlighting** — the model identifies passages per
category in a dedicated model pass and writes colored highlights into the PDF,
with duplicate suppression and automatic repair of earlier unanchored note
fallbacks when reader geometry becomes available. New runs acquire reader
geometry automatically and create only positioned highlights.
Sprint plan: [`docs/sprints/`](docs/sprints/) · manual test scripts:
[`docs/sprints/smoke-tests.md`](docs/sprints/smoke-tests.md) · MVP traceability:
[`docs/sprints/mvp-acceptance.md`](docs/sprints/mvp-acceptance.md)

## Prerequisites

- Node.js LTS
- Zotero 9 (separate test profile recommended)
- `zip` (for `.xpi` packaging)
- `pdftotext` from Poppler (only for the opt-in local-model PDF E2E test)

## Commands

```bash
npm install        # once
npm test           # unit tests (vitest)
npm run test:e2e:local # two real PDFs via localhost:1234 Nemotron (opt-in)
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

For auto-highlighting, the plugin reuses an open PDF reader or opens a temporary
background reader to obtain the character rectangles needed to anchor real
highlights. If geometry is unavailable, the affected passage is reported as a
placement failure; the plugin never presents a zero-position note as a created
highlight. Earlier page-note fallbacks remain repairable.

Auto-highlighting sends the complete, page-labelled PDF in one request per
category whenever it fits the effective context window. The effective window
is the lower of provider-reported model metadata and the configurable 65,536
token cap, after prompt, output/reasoning, and estimation-safety reserves.
Larger PDFs are scanned exhaustively in maximal windows with 500-character
overlap. The local index may rank likely windows first for each category, but
never removes a window or limits coverage. Missing or failed retrieval silently
falls back to document order. If the provider rejects an estimated context
size, only that failed window is split and retried.

## Releasing (S5-05)

The version is single-sourced from `package.json` and stamped into `manifest.json`
and `update.json` at build time — never edit versions in the manifests by hand.

1. Bump `version` in `package.json` (e.g. `0.1.0` → `0.1.1`) and commit.
2. `npm test && npm run typecheck` — both must be green.
3. `npm run pack`. This writes:
   - `build/zotero-agent-<version>.xpi` — the installable add-on;
   - `build/update.json` — the Zotero update manifest.
4. Create a GitHub release tagged `v<version>` and attach the `.xpi` as an asset
   (the `.xpi` download URL must match `update.json`'s `update_link`).
5. Upload `build/update.json` to the fixed **`release`** tag — the URL in
   `manifest.json`'s `update_url`. Zotero's updater polls this file, so every
   release refreshes it while the `.xpi` lives on its own `v<version>` tag.

Existing installs then see the new version through Tools → Plugins → *Check for
Updates*. Verify on a clean Zotero 9 profile that a fresh install via the `.xpi`
works following this README, and that an older install updates to the new version.

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
| `provider.requestTimeoutMs` | `300000` | HTTP timeout for provider calls (5 minutes) |
| `autoHighlight.contextWindowTokens` | `65536` | User cap for auto-highlight context; a lower provider-reported limit wins |
| `autoHighlight.windowTokens` | `6000` | PDF text per auto-highlight request; small windows keep verbatim quotes accurate, larger PDFs use more windows |
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
docs/             requirements, architecture (5 views + holistic reference), sprint plan, and research documents
```

Design rules baked into the layout (from requirements §15): business logic stays free of the
Zotero global so it is unit-testable; providers and the retrieval backend are replaceable
behind interfaces; the local index is a rebuildable cache, never the authoritative source;
external AI calls only ever happen on explicit user action.
