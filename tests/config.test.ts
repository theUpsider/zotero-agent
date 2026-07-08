import { describe, expect, it } from "vitest";
import { PREF_KEYS, getBoolPref, getStringPref, type PrefStore } from "../src/core/config";

function fakeStore(values: Record<string, unknown>): PrefStore {
  return {
    get: (key) => values[key],
    set: (key, value) => {
      values[key] = value;
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
    expect(getStringPref(store, PREF_KEYS.openaiEndpoint)).toBe("http://localhost:11434/v1");
  });

  it("returns fallbacks for missing or mistyped values", () => {
    const store = fakeStore({ [PREF_KEYS.openaiModel]: 42 });
    expect(getStringPref(store, PREF_KEYS.openaiModel, "default-model")).toBe("default-model");
    expect(getBoolPref(store, PREF_KEYS.enabled, true)).toBe(true);
  });
});
