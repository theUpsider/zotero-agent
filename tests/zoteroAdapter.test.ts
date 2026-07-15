import { afterEach, describe, expect, it, vi } from "vitest";
import { noopLogger } from "../src/core/errors";
import { createHighlightWriter } from "../src/zotero/adapter";
import type { PlannedHighlight } from "../src/zotero/types";

describe("createHighlightWriter", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("gives every saveFromJSON annotation a unique Zotero object key", async () => {
    const attachment = { isPDFAttachment: () => true, getAnnotations: () => [] };
    const item = { isPDFAttachment: () => false, getAttachments: () => [2] };
    const saveFromJSON = vi.fn(async (_attachment: unknown, json: Record<string, unknown>) => {
      if (!json.key) throw new Error("'key' not provided in JSON");
      return {};
    });
    let nextKey = 0;
    vi.stubGlobal("Zotero", {
      Items: {
        getByLibraryAndKeyAsync: vi.fn(async () => item),
        get: vi.fn(() => attachment),
      },
      PDFWorker: {},
      Annotations: { saveFromJSON },
      Utilities: { generateObjectKey: () => `KEY0000${++nextKey}` },
    });

    const planned: PlannedHighlight[] = [
      {
        category: "results",
        color: "#ffd400",
        text: "first passage",
        pageIndex: 0,
        pageLabel: "1",
      },
      {
        category: "methodology",
        color: "#2ea8e5",
        text: "second passage",
        pageIndex: 0,
        pageLabel: "1",
      },
    ];

    const result = await createHighlightWriter(noopLogger).createHighlights(
      { libraryID: 1, key: "PAPER" },
      planned,
    );

    expect(result.failed).toEqual([]);
    expect(result.created).toHaveLength(2);
    expect(saveFromJSON.mock.calls.map((call) => call[1]?.key)).toEqual([
      "KEY00001",
      "KEY00002",
    ]);
  });

  it("repairs a zero-position fallback note using open-reader character geometry", async () => {
    const text = "Moreover, we demonstrate that our model can be adapted.";
    const eraseTx = vi.fn(async () => undefined);
    const fallback = {
      annotationType: "note",
      annotationText: "",
      annotationComment: `[results] ${text}`,
      annotationColor: "#5fb236",
      annotationPageLabel: "1",
      annotationPosition: JSON.stringify({ pageIndex: 0, rects: [[0, 0, 0, 0]] }),
      eraseTx,
    };
    const attachment = {
      isPDFAttachment: () => true,
      getAnnotations: () => [fallback],
    };
    const item = { isPDFAttachment: () => false, getAttachments: () => [2] };
    const chars = [...text].map((c, index) => ({
      c,
      inlineRect: [index * 5, 700, index * 5 + 5, 710],
      rect: [index * 5, 700, index * 5 + 5, 710],
      spaceAfter: false,
      lineBreakAfter: index === 24,
      paragraphBreakAfter: false,
      ignorable: false,
    }));
    const saveFromJSON = vi.fn(async () => ({}));
    vi.stubGlobal("Zotero", {
      Items: {
        getByLibraryAndKeyAsync: vi.fn(async () => item),
        get: vi.fn(() => attachment),
      },
      PDFWorker: { getFullText: vi.fn(async () => ({ text })) },
      Reader: {
        _readers: [
          {
            itemID: 2,
            _initPromise: Promise.resolve(),
            _internalReader: {
              _primaryView: {
                _iframeWindow: {
                  PDFViewerApplication: {
                    pdfDocument: { getPageData: vi.fn(async () => ({ chars })) },
                  },
                },
              },
            },
          },
        ],
      },
      Annotations: { saveFromJSON },
      Utilities: { generateObjectKey: () => "NEWKEY01" },
    });

    const writer = createHighlightWriter(noopLogger);
    const targets = await writer.readTargets({ libraryID: 1, key: "PAPER" });
    const repairable = (targets as typeof targets & { repairable: PlannedHighlight[] }).repairable;
    expect(repairable).toHaveLength(1);

    const result = await writer.createHighlights({ libraryID: 1, key: "PAPER" }, repairable);

    expect(result.created).toEqual([expect.objectContaining({ kind: "highlight", text })]);
    expect(saveFromJSON).toHaveBeenCalledWith(
      attachment,
      expect.objectContaining({
        type: "highlight",
        text,
        position: expect.objectContaining({ pageIndex: 0, rects: expect.any(Array) }),
      }),
    );
    expect(eraseTx).toHaveBeenCalledTimes(1);
  });
});
