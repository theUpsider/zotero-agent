/** Preference key names, defaults, and the PrefStore seam. The live store
 * backed by Zotero.Prefs lives in src/zotero/prefs.ts so this module never
 * touches the Zotero global (keeps modules unit-testable).
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
  /** User ceiling for auto-highlight model context. Provider-reported limits,
   * when lower, take precedence. */
  autoHighlightContextWindowTokens: `${PREFS_PREFIX}.autoHighlight.contextWindowTokens`,
  /** Per-request text window for auto-highlight passes. Kept well below the
   * context ceiling because verbatim-quote fidelity degrades on very large
   * inputs; the context ceiling stays an upper safety bound. */
  autoHighlightWindowTokens: `${PREFS_PREFIX}.autoHighlight.windowTokens`,
  /** Per-item character budget for PDF full text in composed prompts; fallback
   * cap used when an item isn't indexed yet (S2-03; retained by S3-05). */
  contextCharBudget: `${PREFS_PREFIX}.context.charBudgetPerItem`,
  /** Soft per-item token budget; over this, retrieval passages replace full
   * text when the item is indexed (S3-05, NFR-004). */
  contextTokenBudget: `${PREFS_PREFIX}.context.tokenBudgetPerItem`,
  /** Master switch for the local retrieval index (S3-05/S3-06). */
  retrievalEnabled: `${PREFS_PREFIX}.retrieval.enabled`,
  /** Local embeddings on/off; auto-degrades to keyword-only on failure
   * regardless of this pref. Defaults off until the day-1 wasm runtime probe
   * (S3-03) is confirmed in a live Zotero profile. */
  retrievalEmbeddings: `${PREFS_PREFIX}.retrieval.embeddings`,
  /** Max retrieved passages considered per over-budget item (S3-05). */
  retrievalPassagesPerItem: `${PREFS_PREFIX}.retrieval.passagesPerItem`,
  /** Exposes `Zotero.ZoteroAgent.dev.probeRetrieval()` for the day-1 wasm
   * runtime probe (S3-03); off by default, dev/QA only. */
  devTools: `${PREFS_PREFIX}.devTools`,
  /** Sampling temperature (0–2). Omitted from API requests when unset, so the
   * provider default applies. */
  modelTemperature: `${PREFS_PREFIX}.model.temperature`,
  /** Nucleus sampling threshold (0–1). Omitted from API requests when unset. */
  modelTopP: `${PREFS_PREFIX}.model.topP`,
  /** Global ceiling for per-request max output tokens. Per-request budgets
   * (e.g. auto-highlight) take precedence when they are tighter. Omitted when
   * unset. */
  modelMaxOutputTokens: `${PREFS_PREFIX}.model.maxOutputTokens`,
} as const;

/** Typed defaults for every key; invalid stored values fall back to these. */
export const PREF_DEFAULTS: Record<string, string | number | boolean> = {
  [PREF_KEYS.enabled]: true,
  [PREF_KEYS.activeProvider]: "openai-compatible",
  [PREF_KEYS.openaiEndpoint]: "",
  [PREF_KEYS.openaiModel]: "",
  [PREF_KEYS.openaiApiKeyFallback]: "",
  [PREF_KEYS.colorSemantics]: "",
  [PREF_KEYS.requestTimeoutMs]: 300_000,
  [PREF_KEYS.autoHighlightContextWindowTokens]: 65_536,
  [PREF_KEYS.autoHighlightWindowTokens]: 6_000,
  [PREF_KEYS.contextCharBudget]: 20000,
  [PREF_KEYS.contextTokenBudget]: 4000,
  [PREF_KEYS.retrievalEnabled]: true,
  [PREF_KEYS.retrievalEmbeddings]: false,
  [PREF_KEYS.retrievalPassagesPerItem]: 12,
  [PREF_KEYS.devTools]: false,
  [PREF_KEYS.modelTemperature]: "",
  [PREF_KEYS.modelTopP]: "",
  [PREF_KEYS.modelMaxOutputTokens]: "",
};

export interface PrefStore {
  get(key: string): unknown;
  set(key: string, value: string | number | boolean): void;
  clear(key: string): void;
}

export function getStringPref(
  store: PrefStore,
  key: string,
  fallback = "",
): string {
  const value = store.get(key);
  return typeof value === "string" ? value : fallback;
}

export function getBoolPref(
  store: PrefStore,
  key: string,
  fallback = false,
): boolean {
  const value = store.get(key);
  return typeof value === "boolean" ? value : fallback;
}

export function getIntPref(
  store: PrefStore,
  key: string,
  fallback: number,
): number {
  const value = store.get(key);
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return Math.floor(value);
}

/** Read a float-valued preference. Returns `undefined` when the stored value
 * is empty, missing, or not a non-negative finite number — callers treat
 * `undefined` as "not configured" and omit the parameter from API requests.
 * Unlike `getIntPref`, this preserves decimal precision (needed for
 * temperature and topP). */
export function getFloatPref(
  store: PrefStore,
  key: string,
): number | undefined {
  const value = store.get(key);
  if (value === "" || value === null || value === undefined) return undefined;
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}
