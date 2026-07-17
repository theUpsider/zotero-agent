import { describe, expect, it } from "vitest";
import {
  PREF_DEFAULTS,
  PREF_KEYS,
  getBoolPref,
  getFloatPref,
  getIntPref,
  getStringPref,
  type PrefStore,
} from "../src/core/config";

export function fakeStore(values: Record<string, unknown> = {}): PrefStore {
  return {
    get: (key) => values[key],
    set: (key, value) => {
      values[key] = value;
    },
    clear: (key) => {
      delete values[key];
    },
  };
}

describe("pref helpers", () => {
  it("reads typed values from the store", () => {
    const store = fakeStore({
      [PREF_KEYS.enabled]: true,
      [PREF_KEYS.openaiEndpoint]: "http://localhost:11434/v1",
    });
    expect(getBoolPref(store, PREF_KEYS.enabled)).toBe(true);
    expect(getStringPref(store, PREF_KEYS.openaiEndpoint)).toBe(
      "http://localhost:11434/v1",
    );
  });

  it("returns fallbacks for missing or mistyped values", () => {
    const store = fakeStore({ [PREF_KEYS.openaiModel]: 42 });
    expect(getStringPref(store, PREF_KEYS.openaiModel, "default-model")).toBe(
      "default-model",
    );
    expect(getBoolPref(store, PREF_KEYS.enabled, true)).toBe(true);
  });

  it("reads integer prefs and rejects invalid values", () => {
    const store = fakeStore({ [PREF_KEYS.requestTimeoutMs]: 5000 });
    expect(getIntPref(store, PREF_KEYS.requestTimeoutMs, 30000)).toBe(5000);

    expect(
      getIntPref(
        fakeStore({ [PREF_KEYS.requestTimeoutMs]: "5000" }),
        PREF_KEYS.requestTimeoutMs,
        30000,
      ),
    ).toBe(30000);
    expect(
      getIntPref(
        fakeStore({ [PREF_KEYS.requestTimeoutMs]: Number.NaN }),
        PREF_KEYS.requestTimeoutMs,
        30000,
      ),
    ).toBe(30000);
    expect(
      getIntPref(
        fakeStore({ [PREF_KEYS.requestTimeoutMs]: -1 }),
        PREF_KEYS.requestTimeoutMs,
        30000,
      ),
    ).toBe(30000);
    expect(
      getIntPref(
        fakeStore({ [PREF_KEYS.requestTimeoutMs]: 12.7 }),
        PREF_KEYS.requestTimeoutMs,
        30000,
      ),
    ).toBe(12);
    expect(getIntPref(fakeStore(), PREF_KEYS.requestTimeoutMs, 30000)).toBe(
      30000,
    );
  });

  it("clears stored values", () => {
    const values: Record<string, unknown> = {
      [PREF_KEYS.openaiModel]: "llama3",
    };
    const store = fakeStore(values);
    store.clear(PREF_KEYS.openaiModel);
    expect(getStringPref(store, PREF_KEYS.openaiModel, "fallback")).toBe(
      "fallback",
    );
  });

  it("defines a typed default for every pref key (S1-02)", () => {
    for (const key of Object.values(PREF_KEYS)) {
      expect(PREF_DEFAULTS, `missing default for ${key}`).toHaveProperty(key);
    }
  });

  it("allows slow reasoning models five minutes by default", () => {
    expect(PREF_DEFAULTS[PREF_KEYS.requestTimeoutMs]).toBe(300_000);
  });

  it("caps auto-highlight context at 64K tokens by default", () => {
    expect(PREF_DEFAULTS[PREF_KEYS.autoHighlightContextWindowTokens]).toBe(
      65_536,
    );
  });
});

describe("getFloatPref", () => {
  it("returns a valid number as-is (no Math.floor)", () => {
    const store = fakeStore({ [PREF_KEYS.modelTemperature]: 0.7 });
    expect(getFloatPref(store, PREF_KEYS.modelTemperature)).toBe(0.7);
  });

  it("returns 0 for a stored 0 (valid temperature edge case)", () => {
    const store = fakeStore({ [PREF_KEYS.modelTemperature]: 0 });
    expect(getFloatPref(store, PREF_KEYS.modelTemperature)).toBe(0);
  });

  it("returns undefined for empty-string sentinel", () => {
    const store = fakeStore({ [PREF_KEYS.modelTemperature]: "" });
    expect(getFloatPref(store, PREF_KEYS.modelTemperature)).toBeUndefined();
  });

  it("returns undefined for null, undefined, and missing keys", () => {
    expect(
      getFloatPref(
        fakeStore({ [PREF_KEYS.modelTemperature]: null }),
        PREF_KEYS.modelTemperature,
      ),
    ).toBeUndefined();
    expect(
      getFloatPref(fakeStore({}), PREF_KEYS.modelTemperature),
    ).toBeUndefined();
    expect(
      getFloatPref(
        fakeStore({ [PREF_KEYS.modelTemperature]: undefined }),
        PREF_KEYS.modelTemperature,
      ),
    ).toBeUndefined();
  });

  it("returns undefined for non-numeric types", () => {
    expect(
      getFloatPref(
        fakeStore({ [PREF_KEYS.modelTemperature]: "0.5" }),
        PREF_KEYS.modelTemperature,
      ),
    ).toBeUndefined();
    expect(
      getFloatPref(
        fakeStore({ [PREF_KEYS.modelTemperature]: true }),
        PREF_KEYS.modelTemperature,
      ),
    ).toBeUndefined();
    expect(
      getFloatPref(
        fakeStore({ [PREF_KEYS.modelTemperature]: false }),
        PREF_KEYS.modelTemperature,
      ),
    ).toBeUndefined();
  });

  it("returns undefined for NaN, Infinity, and negative numbers", () => {
    expect(
      getFloatPref(
        fakeStore({ [PREF_KEYS.modelTemperature]: Number.NaN }),
        PREF_KEYS.modelTemperature,
      ),
    ).toBeUndefined();
    expect(
      getFloatPref(
        fakeStore({ [PREF_KEYS.modelTemperature]: Number.POSITIVE_INFINITY }),
        PREF_KEYS.modelTemperature,
      ),
    ).toBeUndefined();
    expect(
      getFloatPref(
        fakeStore({ [PREF_KEYS.modelTemperature]: -1 }),
        PREF_KEYS.modelTemperature,
      ),
    ).toBeUndefined();
  });
});
