/** Color-to-category semantics (FR-002, FR-023..FR-031, BR-005, BR-006).
 * Pure module: no Zotero access, fully unit-testable. Persistence goes
 * through serialize/parse with the pref store handled by the caller. */

/** Default scholarly categories required by BR-006. */
export const DEFAULT_CATEGORIES = [
  "methodology",
  "results",
  "literature",
  "limitations",
  "research question",
  "data",
  "open points",
] as const;

export type Category = string;

/** Standard Zotero annotation colors (Zotero 7+ reader palette). */
export const ZOTERO_ANNOTATION_COLORS = {
  yellow: "#ffd400",
  red: "#ff6666",
  green: "#5fb236",
  blue: "#2ea8e5",
  purple: "#a28ae5",
  magenta: "#e56eee",
  orange: "#f19837",
  gray: "#aaaaaa",
} as const;

export type ColorHex = string;

/** One color may carry one or more semantic categories (BR-005). */
export type ColorSemantics = Record<ColorHex, Category[]>;

/** Default mapping: one default category per standard color, gray unassigned. */
export function defaultColorSemantics(): ColorSemantics {
  const c = ZOTERO_ANNOTATION_COLORS;
  return {
    [c.yellow]: ["methodology"],
    [c.red]: ["limitations"],
    [c.green]: ["results"],
    [c.blue]: ["literature"],
    [c.purple]: ["research question"],
    [c.magenta]: ["data"],
    [c.orange]: ["open points"],
    [c.gray]: [],
  };
}

export function serializeColorSemantics(mapping: ColorSemantics): string {
  return JSON.stringify(mapping);
}

/** Parse persisted mapping; invalid or empty input falls back to defaults
 * (FR-031 reset behaviour doubles as corruption recovery). */
export function parseColorSemantics(raw: string): ColorSemantics {
  if (!raw.trim()) return defaultColorSemantics();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return defaultColorSemantics();
    }
    const result: ColorSemantics = {};
    for (const [color, categories] of Object.entries(parsed)) {
      if (!isHexColor(color) || !Array.isArray(categories)) continue;
      result[color.toLowerCase()] = categories.filter(
        (c): c is string => typeof c === "string" && c.trim().length > 0,
      );
    }
    return Object.keys(result).length > 0 ? result : defaultColorSemantics();
  } catch {
    return defaultColorSemantics();
  }
}

/** The scholarly categories the user works with (S4-02; FR-038, BR-006): the
 * required defaults followed by any custom categories introduced through the
 * color mapping, de-duplicated case-insensitively. Defaults keep their
 * canonical order so analysis output is stable and the 7 required categories
 * always appear (FR-039). */
export function configuredCategories(mapping: ColorSemantics): Category[] {
  const result: Category[] = [...DEFAULT_CATEGORIES];
  const seen = new Set(result.map((c) => c.toLowerCase()));
  for (const categories of Object.values(mapping)) {
    for (const category of categories) {
      const label = category.trim();
      const key = label.toLowerCase();
      if (label && !seen.has(key)) {
        seen.add(key);
        result.push(label);
      }
    }
  }
  return result;
}

/** Categories mapped to a color; unknown colors yield an empty list. */
export function categoriesForColor(mapping: ColorSemantics, color: ColorHex): Category[] {
  return mapping[color.toLowerCase()] ?? [];
}

/** First color mapped to a category, for automatic highlight creation (FR-045). */
export function colorForCategory(mapping: ColorSemantics, category: Category): ColorHex | undefined {
  const needle = category.trim().toLowerCase();
  for (const [color, categories] of Object.entries(mapping)) {
    if (categories.some((c) => c.trim().toLowerCase() === needle)) return color;
  }
  return undefined;
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}
