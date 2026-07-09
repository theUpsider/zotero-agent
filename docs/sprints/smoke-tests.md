# Manual smoke tests

Code that touches Zotero cannot be unit-tested; these scripts are run manually
against a Zotero 9 test profile (see README "Running in Zotero 9"). Record the
Zotero version and date when running a full pass.

## Sprint 1 — settings, provider, color semantics

### 1. Install & pane registration

1. `npm run pack`, install `build/zotero-agent-<version>.xpi` via Tools → Plugins.
2. Open Edit → Settings. **Expected:** a pane "AI Research Assistant" appears
   with the sections "AI Provider" and "Highlight colors".
3. Disable the plugin in the plugins manager. **Expected:** the pane disappears
   from settings without a restart; re-enabling brings it back.

### 2. Provider config persistence (FR-017, FR-018, DAR-007)

1. In the pane, enter an endpoint URL (e.g. `http://localhost:11434/v1`) and a
   model (e.g. `llama3`).
2. Restart Zotero, reopen the pane. **Expected:** both values are still there.

### 3. Test connection matrix (S1-05, FR-020, FR-022, EIR-014)

Each case must produce a *distinct, plain-language* message — no stack traces,
no jargon, no API key fragments.

| # | Setup | Expected message (gist) |
|---|-------|--------------------------|
| a | Ollama running, valid model, no key | "Connected. Model '…' is available." (green) |
| b | Ollama running, model name that is not pulled | "The model '…' was not found on this endpoint." |
| c | Endpoint pointing at a host that does not exist / machine offline | "Could not reach the AI service. …" |
| d | `https://api.openai.com/v1` with an invalid API key | "The AI service rejected the API key. …" |
| e | Empty endpoint field | "The provider is not fully configured. …" |

### 4. Credential storage (S1-04, FR-019, DAR-008, NFR-011)

1. Enter an API key in the pane. **Expected:** the field clears, the placeholder
   shows "•••••• (saved)", and the note says where the key is stored.
2. Close Zotero. Open the profile's `prefs.js` in a text editor and search for
   the key. **Expected:** absent when the note said "stored securely"
   (login-manager path). Present only if the note said "preferences file"
   (documented fallback).
3. Reopen settings, click "Remove key". **Expected:** note changes to
   "No API key saved."; Test connection against OpenAI now reports the auth
   message (d above).

### 5. Color semantics (S1-07, FR-023…FR-031)

1. **Expected on first open:** 8 color rows (yellow, red, green, blue, purple,
   magenta, orange, gray) with swatches; 7 scholarly default categories
   assigned, gray unassigned (BR-006).
2. Remap: remove "methodology" from yellow, add it to gray.
3. Add a custom category "field notes" to blue — blue now has two meanings
   (FR-028, BR-005).
4. Rename: double-click "results" and rename it to "findings". **Expected:**
   renamed everywhere it appears.
5. Restart Zotero. **Expected:** all changes from 2–4 persisted (FR-030).
6. Click "Reset to defaults". **Expected:** the 7 default categories restored
   exactly (FR-031).

### 6. No secrets in logs (NFR-012)

1. Start Zotero from a terminal with debug output
   (`zotero -ZoteroDebugText 2>&1 | tee /tmp/zotero.log`).
2. Save an API key and run Test connection (success and failure cases).
3. `grep <key> /tmp/zotero.log`. **Expected:** no match; log lines are
   prefixed `[zotero-agent]`.
