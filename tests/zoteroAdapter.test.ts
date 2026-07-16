import { afterEach, describe, expect, it, vi } from "vitest";
import { noopLogger } from "../src/core/errors";
import { createHighlightWriter } from "../src/zotero/adapter";
import type { PlannedHighlight } from "../src/zotero/types";

describe("createHighlightWriter", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("opens the PDF reader in the background and creates real positioned highlights", async () => {
    const attachment = { isPDFAttachment: () => true, getAnnotations: () => [] };
    const item = { isPDFAttachment: () => false, getAttachments: () => [2] };
    const text = "first passage";
    const chars = [...text].map((c, index) => ({
      c,
      inlineRect: [index * 5, 700, index * 5 + 5, 710],
      rect: [index * 5, 700, index * 5 + 5, 710],
      lineBreakAfter: index === text.length - 1,
      ignorable: false,
    }));
    const saveFromJSON = vi.fn(async (_attachment: unknown, json: Record<string, unknown>) => {
      if (!json.key) throw new Error("'key' not provided in JSON");
      return {};
    });
    const close = vi.fn();
    const reader = {
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
      close,
    };
    const readers: unknown[] = [];
    const open = vi.fn(async () => {
      readers.push(reader);
      return reader;
    });
    vi.stubGlobal("Zotero", {
      Items: {
        getByLibraryAndKeyAsync: vi.fn(async () => item),
        get: vi.fn(() => attachment),
      },
      PDFWorker: {},
      Reader: { _readers: readers, open },
      Annotations: { saveFromJSON },
      Utilities: { generateObjectKey: () => "KEY00001" },
    });

    const planned: PlannedHighlight[] = [
      {
        category: "results",
        color: "#ffd400",
        text,
        pageIndex: 0,
        pageLabel: "1",
      },
    ];

    const result = await createHighlightWriter(noopLogger).createHighlights(
      { libraryID: 1, key: "PAPER" },
      planned,
    );

    expect(result.failed).toEqual([]);
    expect(result.created).toEqual([expect.objectContaining({ kind: "highlight", text })]);
    expect(open).toHaveBeenCalledWith(2, undefined, { openInBackground: true });
    expect(saveFromJSON).toHaveBeenCalledWith(
      attachment,
      expect.objectContaining({
        key: "KEY00001",
        type: "highlight",
        text,
        position: { pageIndex: 0, rects: expect.any(Array) },
      }),
    );
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("reports unavailable geometry instead of creating zero-position note annotations", async () => {
    const attachment = { isPDFAttachment: () => true, getAnnotations: () => [] };
    const item = { isPDFAttachment: () => false, getAttachments: () => [2] };
    const saveFromJSON = vi.fn(async () => ({}));
    const reader = {
      itemID: 2,
      _initPromise: Promise.resolve(),
      _internalReader: { _primaryView: {} },
      close: vi.fn(),
    };
    vi.stubGlobal("Zotero", {
      Items: {
        getByLibraryAndKeyAsync: vi.fn(async () => item),
        get: vi.fn(() => attachment),
      },
      PDFWorker: {},
      Reader: { _readers: [], open: vi.fn(async () => reader) },
      Annotations: { saveFromJSON },
      Utilities: { generateObjectKey: () => "KEY00001" },
    });

    const result = await createHighlightWriter(noopLogger).createHighlights(
      { libraryID: 1, key: "PAPER" },
      [{ category: "results", color: "#ffd400", text: "passage", pageIndex: 0, pageLabel: "1" }],
    );

    expect(result.created).toEqual([]);
    expect(result.failed).toEqual([
      expect.objectContaining({ text: "passage", reason: expect.stringContaining("coordinates") }),
    ]);
    expect(saveFromJSON).not.toHaveBeenCalled();
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
