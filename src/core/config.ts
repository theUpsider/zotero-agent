/** Preference access. Thin wrapper around Zotero.Prefs so business logic
 * never touches the Zotero global directly (keeps modules unit-testable).
 *
 * OP-006 decided: plugin configuration is stored in Zotero prefs under
 * PREFS_PREFIX. This file is the single source of truth for key names and
 * defaults (DAR-002, DAR-007) — no ad-hoc pref strings elsewhere. */

export const PREFS_PREFIX = "extensions.zotero-agent";

export const PREF_KEYS = {
  enabled: `${PREFS_PREFIX}.enabled`,
  activeProvider: `${PREFS_PREFIX}.provider.active`,
  openaiEndpoint: `${PREFS_PREFIX}.provider.openaiCompatible.endpoint`,
  openaiModel: `${PREFS_PREFIX}.provider.openaiCompatible.model`,
  /** Plaintext API-key fallback, written by prefCredentialStore only when the
   * Zotero login manager is unavailable (DAR-008); documented in the README.
   * Not pre-declared in prefs.js so a fresh profile never contains a
   * key-shaped entry. */
  openaiApiKeyFallback: `${PREFS_PREFIX}.credentialFallback.provider.openaiCompatible.apiKey`,
  colorSemantics: `${PREFS_PREFIX}.colorSemantics`,
  requestTimeoutMs: `${PREFS_PREFIX}.provider.requestTimeoutMs`,
} as const;

/** Typed defaults for every key; invalid stored values fall back to these. */
export const PREF_DEFAULTS: Record<string, string | number | boolean> = {
  [PREF_KEYS.enabled]: true,
  [PREF_KEYS.activeProvider]: "openai-compatible",
  [PREF_KEYS.openaiEndpoint]: "",
  [PREF_KEYS.openaiModel]: "",
  [PREF_KEYS.openaiApiKeyFallback]: "",
  [PREF_KEYS.colorSemantics]: "",
  [PREF_KEYS.requestTimeoutMs]: 30000,
};

export interface PrefStore {
  get(key: string): unknown;
  set(key: string, value: string | number | boolean): void;
  clear(key: string): void;
}

/** Live store backed by Zotero.Prefs; injected as default at plugin init. */
export function zoteroPrefStore(): PrefStore {
  return {
    get: (key) => Zotero.Prefs.get(key, true),
    set: (key, value) => Zotero.Prefs.set(key, value, true),
    clear: (key) => Zotero.Prefs.clear(key, true),
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

export function getIntPref(store: PrefStore, key: string, fallback: number): number {
  const value = store.get(key);
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return Math.floor(value);
}
