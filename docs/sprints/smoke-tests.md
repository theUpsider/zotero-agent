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

## Sprint 2 — workflows, result view, notes

### 7. Adapter read layer (S2-01, EIR-001, EIR-002, DAR-001)

1. Pick a library item that has an annotated PDF (highlights in ≥2 colors,
   at least one with a comment), tags, and a child note.
2. Right-click the item → AI Research Assistant → "Summarize results".
   **Expected:** the result view opens, progress shows "Reading items…", and
   the run completes; the debug log shows no adapter errors.
3. Repeat with an item that has *no* PDF and *no* annotations.
   **Expected:** the workflow still completes (metadata-only context) — no
   error about missing attachments (empty collections, not failures).

### 8. Demo script — template end-to-end (sprint DoD; FR-035, FR-036, FR-091…FR-098)

1. Configure a reachable provider (Ollama or OpenAI); Test connection green.
2. Select **two** papers → right-click → AI Research Assistant → "Summarize
   results". **Expected:** result view opens, live progress (status text +
   progress bar) updates per item (FR-094, NFR-003/006).
3. **Expected result rendering:** one section per paper with its title as a
   heading; content rendered structured (headings/lists — not a raw text
   blob, NFR-018); annotation category grouping visible in output where the
   model used it (FR-095).
4. Click "Save as note". **Expected:** "2 notes saved."; each paper now has a
   child note with the generated content (FR-055, FR-097, EIR-004).
5. Open one of the notes in Zotero and edit it. **Expected:** a plain,
   normally editable Zotero note — no plugin-proprietary markup (FR-056).
6. The view stays open; run another template from the same window via
   "Re-run". **Expected:** works without reopening (FR-098).

### 9. Free-form prompt (S2-04; FR-081, FR-089, NFR-015)

1. Select 1–2 papers → context menu → "Free prompt…". **Expected:** result
   view opens with a prompt input pane.
2. Click "Run" with an empty prompt. **Expected:** inline message "Enter a
   prompt first." — no workflow starts.
3. Enter a real question and run. **Expected:** single combined answer over
   all selected papers; "Save as note" attaches the answer to each paper.

### 10. Cancellation (S2-02; NFR-023)

1. Start a template workflow on several items against a slow model.
2. Click "Cancel" after the first item completes. **Expected:** status
   "Cancelled.", no further provider calls (watch debug log), the finished
   section stays visible, **no notes were written**, and the view remains
   usable for a re-run.

### 11. Truncation honesty (S2-03)

1. Set `extensions.zotero-agent.context.charBudgetPerItem` to a small value
   (e.g. 2000) via the config editor, pick an item with a long PDF, run any
   template. **Expected:** an orange banner in the result view naming the
   truncated item; the composed context (debug) contains the explicit
   truncation marker line.

### 12. Error mapping in the view (EIR-014, NFR-023)

1. Point the endpoint at a dead host, run a template. **Expected:** the view
   shows "Could not reach the AI service. …" — plain language, no stack
   trace, no API key fragments; no notes were written.
2. Restore the endpoint, re-run from the same window. **Expected:** works.

### 13. Menu entry points (S2-07; FR-035, FR-036, NFR-014)

1. Right-click with **no** item selected (e.g. on empty space / a note-only
   selection). **Expected:** the "AI Research Assistant" submenu is disabled.
2. The submenu appears in both the item context menu and the Tools menu,
   listing all 7 templates plus "Free prompt…".
3. Disable and re-enable the plugin. **Expected:** no duplicate or orphaned
   menu entries; the result window (if open) was closed on disable.
