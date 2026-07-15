# Spike S2-08 — Highlight write feasibility (OP-001)

**Refs:** OP-001, FR-004, EIR-005, DEP-007, ASM-001
**Status:** desk research done; probe script ready — **manual verification in a
live Zotero 9 profile still pending** (run the script below and record results).

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

- **`Zotero.PDFWorker`** (pdf-worker module) is the in-process bridge to
  pdf.js. Beyond `getFullText(itemID)`, the worker supports structured
  extraction with per-character/word positions (the same machinery Zotero
  uses to import Mendeley/Citavi annotations, which also arrive as *quotes*
  and must be located in the PDF — precedent that quote→rects works).
- Strategy for Sprint 5:
  1. Extract page text + glyph rectangles via the PDF worker for the target page(s).
  2. Normalize whitespace, fuzzy-find the model-quoted span in the page text
     (the model must be prompted to quote verbatim).
  3. Union the glyph rects of the matched span into line rects → `position.rects`.
  4. Compute `sortIndex` from pageIndex + match offset + top coordinate.
- Fallback when the quote cannot be located (OCR noise, hyphenation): create a
  **page-level note annotation** with the suggested text instead of a
  highlight, and report it as "could not anchor" (keeps NFR-023 honesty).

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| `saveFromJSON` signature drift in Zotero 9 | low | probe script asserts the call; adapter isolates it |
| PDF worker's positional extraction API is internal/undocumented | **high** | probe B below; if unusable, ship the note-annotation fallback first |
| Quote not found verbatim (ligatures, hyphenation, OCR) | medium | normalization + fuzzy window match; fallback annotation |
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
- [ ] Probe B: inspect `Zotero.PDFWorker` in the dev console
      (`Object.getOwnPropertyNames(Zotero.PDFWorker)`) and record which
      structured-extraction methods exist in this build.

## Verdict for Sprint 5 (provisional)

**Go, with re-scope guard.** Annotation *creation* is standard API and low
risk. The text→position mapping is the real work: plan it as its own story in
Sprint 5, sized L, with the note-annotation fallback as the committed baseline
so the sprint cannot fail on rect math. Re-check this verdict after the manual
probe run and record the results (Zotero version, date, outcomes) below.

### Probe run log

_(pending — fill in after running the probe in a Zotero 9 test profile)_
