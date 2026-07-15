# Spike S2-08 — Highlight write feasibility (OP-001)

**Refs:** OP-001, FR-004, EIR-005, DEP-007, ASM-001
**Status:** Zotero source/API investigation complete; adapter contract tests
green — **visual placement/sync verification in a live profile still pending**.

## Question

Can the plugin programmatically create a *colored highlight annotation* on a
PDF attachment that renders correctly in Zotero's PDF reader and syncs like a
user-made highlight? This decides whether Sprint 5's auto-highlight stories
(FR-041…FR-049) are viable as designed.

## API surface (from Zotero source, `chrome/content/zotero/xpcom/annotations.js` and `data/item.js`)

Annotations are regular Zotero items of type `annotation`, children of a PDF
attachment. Two creation paths:

1. **`Zotero.Annotations.saveFromJSON(attachment, json, saveOptions)`** —
   the path the reader itself and importers use. `json` fields:
   - `key` (required in Zotero 9; generate with `Zotero.Utilities.generateObjectKey()`)
   - `type`: `"highlight"` (also `underline`, `note`, `image`, `ink`)
   - `color`: hex string, e.g. `"#ffd400"`
   - `text`: the highlighted text (what `annotationText` returns)
   - `comment`: optional
   - `pageLabel`: display label, e.g. `"3"`
   - `sortIndex`: `"ppppp|oooooo|ttttt"` — zero-padded pageIndex | char offset | top coordinate (reader uses it for ordering)
   - `position`: `{ "pageIndex": <0-based int>, "rects": [[x1, y1, x2, y2], …] }`
     in **PDF user-space coordinates** (origin bottom-left, points), one rect
     per highlighted line fragment. Serialized into `annotationPosition`.

2. **Constructing the item directly** — `new Zotero.Item('annotation')`, set
   `annotationType`, `annotationColor`, `annotationText`, `annotationComment`,
   `annotationPageLabel`, `annotationSortIndex`, `annotationPosition`
   (JSON string), `parentID` = attachment id, then `saveTx()`.
   `saveFromJSON` is a thin wrapper over this; prefer it — it validates and
   fills defaults.

Ownership note: annotations created by code are indistinguishable from user
annotations (`annotationAuthorName` optional). Zotero ≥7 marks external
annotations read-only only when they come from the PDF file itself; item-based
annotations are editable.

## The hard part: text → position

Creating the annotation is trivial *once we have `rects`*. Getting rects for
"highlight the sentence that says X" requires page-level character geometry:

- **`Zotero.PDFWorker` does not expose structured text.** Live Zotero source
  inspection confirmed that its public manager only exposes `getFullText`.
  Character geometry is read from an already-open reader's internal PDF
  document via `getPageData({ pageIndex }).chars`. If no reader is open, the
  page-note fallback is retained and automatically retried on a later run.
- Strategy for Sprint 5:
  1. Extract complete page text via `PDFWorker`; pack it into bounded,
     overlapping provider chunks independent of the retrieval index.
  2. Read character rectangles from the open reader.
  3. Normalize whitespace, fuzzy-find the model-quoted span in the page text
     (the model must be prompted to quote verbatim).
  4. Union the reader character rects of the matched span into line rects → `position.rects`.
  5. Compute `sortIndex` from pageIndex + match offset + top coordinate.
- Fallback when reader geometry is unavailable: preserve one **zero-position
  page-note annotation** containing `[category] text`. On a later run, detect
  it as repairable, reserve its span against duplicates, retry anchoring, save
  the replacement highlight, then erase the note. Never erase before a valid
  replacement exists (FR-103..105, NFR-023).
- A quote that still cannot be matched after whitespace, delimiter,
  ligature, dash, and end-line-hyphen normalization remains explicitly
  unresolved; no approximate wrong-location highlight is written.

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| `saveFromJSON` signature drift in Zotero 9 | low | probe script asserts the call; adapter isolates it |
| Reader character geometry API is internal/undocumented | **high** | adapter isolates it; validate rectangles; preserve and retry note fallback when unavailable |
| Quote not found after safe normalization (OCR/model paraphrase) | medium | report unresolved; never guess a rectangle |
| Sync/consistency of code-created annotations | low | they are ordinary items; verify sync in probe |
| Two-column layouts produce wrong rect unions | medium | per-line rects (not one bounding box) |

## Probe script (run via Tools → Developer → Run JavaScript, *Run as async*)

Select a PDF attachment (or an item with one) first. Creates one yellow
highlight with fixed rects on page 1 — visual position will be arbitrary;
the point is whether it renders/edits/deletes like a native highlight.

```js
var item = Zotero.getActiveZoteroPane().getSelectedItems()[0];
var att = item.isPDFAttachment() ? item
  : Zotero.Items.get(item.getAttachments()).find(a => a.isPDFAttachment());
if (!att) throw new Error("no PDF attachment selected");

var annotation = await Zotero.Annotations.saveFromJSON(att, {
  key: Zotero.Utilities.generateObjectKey(),
  type: "highlight",
  color: "#ffd400",
  text: "probe highlight (S2-08)",
  comment: "created programmatically",
  pageLabel: "1",
  sortIndex: "00000|000000|00100",
  position: { pageIndex: 0, rects: [[100, 600, 300, 615]] },
});
return `created annotation ${annotation.key} on ${att.key}`;
```

**Checklist while verifying:**
- [ ] Highlight visible at the expected spot in the PDF reader, correct color.
- [ ] Appears in the attachment's annotation sidebar with text + comment.
- [ ] Editable/deletable in the reader like a user highlight.
- [ ] Survives Zotero restart; syncs if sync is enabled.
- [x] Probe B: installed Zotero source confirms `PDFWorker` exposes
      `getFullText` but no structured-text/geometry method. Reader PDF document
      exposes `getPageData({ pageIndex }).chars`; adapter isolates this API.
- [ ] Create a fallback with the reader unavailable, reopen the PDF, rerun,
      and verify automatic replacement/removal.

## Verdict for Sprint 5 (provisional)

**Go, with repairable fallback.** Annotation creation is standard API and low
risk. Positioning depends on internal open-reader character geometry, isolated
behind `HighlightWriter`. Missing geometry produces a recoverable note, not a
final substitute for a highlight. Adapter tests cover unique keys, valid rect
creation, fallback detection, replacement ordering, and old-note deletion;
live visual/sync verification remains required.

### Probe run log

- 2026-07-15 — installed Zotero source inspected: no
  `PDFWorker.getStructuredText`; reader `getPageData().chars` path confirmed.
- Live visual placement/sync/repair run: pending.
