/** Preference access. Thin wrapper around Zotero.Prefs so business logic
 * never touches the Zotero global directly (keeps modules unit-testable). */

export const PREFS_PREFIX = "extensions.zotero-agent";

export const PREF_KEYS = {
  enabled: `${PREFS_PREFIX}.enabled`,
  activeProvider: `${PREFS_PREFIX}.provider.active`,
  openaiEndpoint: `${PREFS_PREFIX}.provider.openaiCompatible.endpoint`,
  openaiModel: `${PREFS_PREFIX}.provider.openaiCompatible.model`,
  colorSemantics: `${PREFS_PREFIX}.colorSemantics`,
} as const;

export interface PrefStore {
  get(key: string): unknown;
  set(key: string, value: string | number | boolean): void;
}

/** Live store backed by Zotero.Prefs; injected as default at plugin init. */
export function zoteroPrefStore(): PrefStore {
  return {
    get: (key) => Zotero.Prefs.get(key, true),
    set: (key, value) => Zotero.Prefs.set(key, value, true),
  };
}

export function getStringPref(store: PrefStore, key: string, fallback = ""): string {
  const value = store.get(key);
  return typeof value === "string" ? value : fallback;
}

export function getBoolPref(store: PrefStore, key: string, fallback = false): boolean {
  const value = store.get(key);
  return typeof value === "boolean" ? value : fallback;
}
