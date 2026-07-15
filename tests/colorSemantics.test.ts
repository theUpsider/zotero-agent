import { describe, expect, it } from "vitest";
import {
  DEFAULT_CATEGORIES,
  ZOTERO_ANNOTATION_COLORS,
  categoriesForColor,
  colorForCategory,
  configuredCategories,
  defaultColorSemantics,
  parseColorSemantics,
  serializeColorSemantics,
} from "../src/core/colorSemantics";

describe("defaultColorSemantics", () => {
  it("covers every standard Zotero annotation color", () => {
    const mapping = defaultColorSemantics();
    for (const color of Object.values(ZOTERO_ANNOTATION_COLORS)) {
      expect(mapping).toHaveProperty(color);
    }
  });

  it("assigns every default scholarly category to some color (BR-006)", () => {
    const mapping = defaultColorSemantics();
    for (const category of DEFAULT_CATEGORIES) {
      expect(colorForCategory(mapping, category)).toBeDefined();
    }
  });
});

describe("serialize/parse round-trip", () => {
  it("preserves a customized mapping", () => {
    const mapping = defaultColorSemantics();
    mapping[ZOTERO_ANNOTATION_COLORS.gray] = ["my custom category"];
    const restored = parseColorSemantics(serializeColorSemantics(mapping));
    expect(restored).toEqual(mapping);
  });

  it("preserves multiple categories per color with custom labels (FR-028, BR-005)", () => {
    const mapping = defaultColorSemantics();
    mapping[ZOTERO_ANNOTATION_COLORS.yellow] = ["methodology", "sampling strategy"];
    mapping[ZOTERO_ANNOTATION_COLORS.red] = ["limitations", "threats to validity", "bias"];
    const restored = parseColorSemantics(serializeColorSemantics(mapping));
    expect(restored).toEqual(mapping);
  });

  it("falls back to defaults for empty input", () => {
    expect(parseColorSemantics("")).toEqual(defaultColorSemantics());
  });

  it("falls back to defaults for invalid JSON", () => {
    expect(parseColorSemantics("{not json")).toEqual(defaultColorSemantics());
  });

  it("drops entries with invalid colors or category lists", () => {
    const raw = JSON.stringify({
      "#ffd400": ["methodology"],
      "not-a-color": ["x"],
      "#2ea8e5": "not-a-list",
    });
    expect(parseColorSemantics(raw)).toEqual({ "#ffd400": ["methodology"] });
  });
});

describe("configuredCategories (S4-02)", () => {
  it("returns all 7 defaults in canonical order for the default mapping (FR-039)", () => {
    expect(configuredCategories(defaultColorSemantics())).toEqual([...DEFAULT_CATEGORIES]);
  });

  it("appends custom categories after the defaults (FR-038)", () => {
    const mapping = defaultColorSemantics();
    mapping[ZOTERO_ANNOTATION_COLORS.gray] = ["ethics", "reproducibility"];
    const categories = configuredCategories(mapping);
    expect(categories.slice(0, DEFAULT_CATEGORIES.length)).toEqual([...DEFAULT_CATEGORIES]);
    expect(categories).toContain("ethics");
    expect(categories).toContain("reproducibility");
  });

  it("de-duplicates custom categories case-insensitively", () => {
    const mapping = { "#ffd400": ["Methodology", "Ethics"], "#ff6666": ["ethics"] };
    const categories = configuredCategories(mapping);
    expect(categories.filter((c) => c.toLowerCase() === "ethics")).toHaveLength(1);
  });
});

describe("lookups", () => {
  it("categoriesForColor is case-insensitive on the color", () => {
    const mapping = defaultColorSemantics();
    expect(categoriesForColor(mapping, "#FFD400")).toEqual(["methodology"]);
  });

  it("colorForCategory matches case-insensitively", () => {
    const mapping = defaultColorSemantics();
    expect(colorForCategory(mapping, "Methodology")).toBe(ZOTERO_ANNOTATION_COLORS.yellow);
  });

  it("returns empty/undefined for unknown inputs", () => {
    const mapping = defaultColorSemantics();
    expect(categoriesForColor(mapping, "#000000")).toEqual([]);
    expect(colorForCategory(mapping, "nonexistent")).toBeUndefined();
  });
});
