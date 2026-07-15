import { afterEach, describe, expect, it, vi } from "vitest";
import { noopLogger } from "../src/core/errors";
import { createHighlightWriter } from "../src/zotero/adapter";
import type { PlannedHighlight } from "../src/zotero/types";

describe("createHighlightWriter", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("gives every saveFromJSON annotation a unique Zotero object key", async () => {
    const attachment = { isPDFAttachment: () => true };
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
});
