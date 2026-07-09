import { describe, expect, it } from "vitest";
import { CREDENTIAL_IDS, prefCredentialStore } from "../src/core/credentials";
import { PREF_KEYS, type PrefStore } from "../src/core/config";

function fakeStore(values: Record<string, unknown> = {}): PrefStore {
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

describe("prefCredentialStore", () => {
  it("round-trips a secret", async () => {
    const store = prefCredentialStore(fakeStore());
    await store.set(CREDENTIAL_IDS.openaiApiKey, "sk-test");
    expect(await store.get(CREDENTIAL_IDS.openaiApiKey)).toBe("sk-test");
  });

  it("returns null for missing or empty secrets", async () => {
    const values: Record<string, unknown> = {};
    const store = prefCredentialStore(fakeStore(values));
    expect(await store.get(CREDENTIAL_IDS.openaiApiKey)).toBeNull();
    await store.set(CREDENTIAL_IDS.openaiApiKey, "");
    expect(await store.get(CREDENTIAL_IDS.openaiApiKey)).toBeNull();
  });

  it("remove clears the underlying pref", async () => {
    const values: Record<string, unknown> = {};
    const store = prefCredentialStore(fakeStore(values));
    await store.set(CREDENTIAL_IDS.openaiApiKey, "sk-test");
    await store.remove(CREDENTIAL_IDS.openaiApiKey);
    expect(await store.get(CREDENTIAL_IDS.openaiApiKey)).toBeNull();
    expect(Object.keys(values)).toHaveLength(0);
  });

  it("writes under the documented fallback key (matches PREF_KEYS)", async () => {
    const values: Record<string, unknown> = {};
    const store = prefCredentialStore(fakeStore(values));
    await store.set(CREDENTIAL_IDS.openaiApiKey, "sk-test");
    expect(values[PREF_KEYS.openaiApiKeyFallback]).toBe("sk-test");
  });

  it("reports its kind as prefs-fallback", () => {
    expect(prefCredentialStore(fakeStore()).kind).toBe("prefs-fallback");
  });
});
