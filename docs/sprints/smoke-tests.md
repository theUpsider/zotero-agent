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

## Sprint 3 — local index & retrieval

### 14. Day-1 runtime probe (S3-03 gate)

1. Set `extensions.zotero-agent.devTools` to `true` in the config editor,
   restart. Tools → Developer → Run JavaScript:
   `await Zotero.ZoteroAgent.dev.probeRetrieval()` (see `src/retrieval/probe.ts`;
   dev hook wiring is part of this sprint's plugin.ts changes).
2. **Expected:** a `ProbeReport` object. `oramaOk: true` always (pure JS).
   Record `wasmOk`/`embedOk`/`dim`/`elapsedMs` — this is the evidence that
   decides whether `extensions.zotero-agent.retrieval.embeddings` can default
   to `true` in a future sprint. If `wasmOk: false`, note the `error` field
   and confirm retrieval still works keyword-only (test 16).

### 15. Automatic index updates (S3-06; FR-075, NFR-005, FR-077, NFR-008)

1. With the plugin running, edit or add a highlight/annotation on a PDF, or
   add a tag to an item. **Expected:** within a few seconds the debug log
   shows `[index]`-prefixed lines for that item — no user action beyond the
   edit itself (FR-075).
2. Import or add ≥50 items in one batch. **Expected:** Zotero's UI stays
   responsive throughout (no beachball/freeze) — indexing runs deferred and
   throttled (NFR-005).
3. Watch the debug log during steps 1–2. **Expected:** zero HTTP/provider
   log lines during indexing — only `[index]` activity, never a provider
   call, unless a workflow was explicitly run at the same time (FR-076,
   FR-077, NFR-008).

### 16. Retrieval-augmented large-PDF prompt (S3-05; FR-090, NFR-004)

1. Add a 100+ page PDF to an item, let it index (check the settings pane —
   test 18), then run a free-form prompt on that item.
2. **Expected:** the result does **not** show the S2-03 truncation notice;
   the debug log / composed context shows a "Relevant passages" section
   instead of the full text.
3. Immediately add the *same* PDF as a **new**, not-yet-indexed item and
   repeat. **Expected:** the old truncation-style fallback notice appears
   ("not indexed yet … based on truncated text"), and the item is enqueued
   for indexing (repeat after a few seconds — notice should then disappear).
4. This works identically whether `retrieval.embeddings` is on or off — with
   it off, retrieval runs keyword-only (BM25), which is enough to avoid
   blind truncation.

### 17. Rebuild & consistency (S3-07; FR-078, FR-079, BR-009, BR-010)

1. Quit Zotero. Delete the `zotero-agent/` folder inside the Zotero data
   directory (`Zotero.DataDirectory.dir`, shown in Zotero's Advanced
   settings). Restart.
2. **Expected:** the plugin starts normally (empty index, no error dialog);
   a large-PDF prompt falls back to truncation until re-indexed.
3. Open settings → "Local index" → "Rebuild index". **Expected:** progress
   bar advances, "Rebuilding — X of Y" updates, and on completion coverage
   shows all items indexed again with no data loss (everything regenerated
   from Zotero — BR-009/BR-010).
4. Click "Rebuild index" again and immediately "Cancel". **Expected:** the
   manager returns to "Up to date"/idle state without hanging.

### 18. Index status UI (S3-08; NFR-006, NFR-013)

1. Open settings → "Local index". **Expected:** plain-language coverage
   ("X of Y items indexed"), "Last updated" time, Rebuild button — no
   mention of "embeddings" or "vectors" anywhere in the pane.
2. Trigger a rebuild (test 17) and watch the pane while it runs.
   **Expected:** progress bar and "Rebuilding — done of total" text update
   roughly once a second without reopening the pane.

## Sprint 5 — auto-highlighting, offline, release

### 19. Auto-highlight a paper (S5-01/S5-02/S5-09; FR-004, FR-041..FR-048, FR-102..FR-107, EIR-005, OP-009)

1. Open the target PDF in Zotero's reader, then select its parent item with
   few/no existing highlights. Item menu (or
   Tools) → *AI Research Assistant* → **Highlight paper**.
2. **Expected:** the run completes after the single click — no per-highlight
   confirmation (FR-047). The result view summarizes created highlights grouped
   by category with page numbers (S5-02 AC#4).
3. In the already-open PDF reader, **expected:** colored highlights appear on
   the quoted passages; each color matches the category→color mapping in the
   settings pane (FR-044, EIR-005). Passages the model quoted but that could not
   be located in the PDF text are listed in the result view, not silently
   dropped (S5-01 AC#4).
4. Right-click a created highlight in the reader. **Expected:** it behaves like
   a normal Zotero annotation — you can change its color, add a comment, and
   delete it (FR-048).
5. Include a sentence split across a visual line, preferably with end-line
   hyphenation. **Expected:** normalized matching still produces per-line
   highlight rectangles at the copied passage; Zotero's own search behavior is
   not used for anchoring.
6. If the summary reports "added as page note annotation(s)", close/reopen the
   PDF reader and rerun. **Expected:** the existing zero-position plugin note is
   detected, replaced by a real highlight, and removed only after replacement
   succeeds. No second fallback note is created (FR-103..105).
7. Use a PDF longer than the configured context character budget and place a
   known passage near the end. **Expected:** the passage can be suggested from
   a later page chunk; result has no "not indexed", "truncated text", or
   "index updated in background" notice (FR-106/107), regardless of index count.

### 20. Highlight duplicate prevention (S5-03; FR-046, NFR-020)

1. Run **Highlight paper** on the same item again.
2. **Expected:** no visually duplicated highlights appear; the result view
   reports passages "skipped as already highlighted" (FR-046).
3. Manually add your own highlight over a sentence, then run **Highlight paper**
   once more. **Expected:** the AI does not create an overlapping highlight on
   the span you already highlighted (no AI duplicate over user work).
4. With one plugin fallback note present, rerun with the PDF open. **Expected:**
   its span is reserved during duplicate detection; exactly one real highlight
   remains after repair.

### 21. Offline pass (S5-04; NFR-028..032, FR-022, ASM-007)

Run with the machine's network disabled (airplane mode / pull the cable).
Record the Zotero version and date.

1. **Startup offline** — restart Zotero with the plugin installed and no
   network. **Expected:** Zotero and the plugin start with no error dialog; the
   settings pane opens normally (NFR-032).
2. **Index query offline** — run a free-form prompt or **Analyze papers** on a
   large, already-indexed PDF. **Expected:** retrieval still selects passages
   (no crash, no truncation notice) — the index is fully local (NFR-030).
3. **View prior results offline** — reopen the result view / open notes saved
   from an earlier run. **Expected:** previously generated notes and results are
   viewable (NFR-031).
4. **Local model offline** — with the provider set to a localhost model (e.g.
   Ollama at `http://localhost:11434/v1`), run any workflow. **Expected:** it
   completes normally (NFR-029).
5. **Cloud provider offline** — set the provider to a cloud endpoint and run a
   workflow. **Expected:** it fails fast with the S1 "provider unavailable —
   you are offline" message; no hang, no partial write (FR-022).

### 22. Release install & update (S5-05; EIR-001, DEP-001)

1. `npm run pack`. Confirm `build/zotero-agent-<version>.xpi` and
   `build/update.json` are produced; the `.xpi` version and `update.json`
   `update_link` both match `package.json`.
2. **Fresh install** — on a clean Zotero 9 profile, install the `.xpi` following
   the README only. **Expected:** the plugin loads and the settings pane appears
   (no manual steps beyond the README).
3. **Update detection** — publish two versions (bump `package.json`, re-pack,
   upload the `.xpi` to its `vX.Y.Z` tag and `update.json` to the `release`
   tag). With the older version installed, Tools → Plugins → *Check for
   Updates*. **Expected:** Zotero detects and installs the newer version.
