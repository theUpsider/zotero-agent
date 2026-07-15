/* Default preferences for the Zotero AI Research Assistant.
 * OP-006 decided: configuration lives in Zotero prefs. The single source of
 * key names and typed defaults is PREF_KEYS/PREF_DEFAULTS in
 * src/core/config.ts — keep this file in sync with it.
 *
 * Note: the credential fallback pref (…credentialFallback.*) is deliberately
 * not declared here; it is only created at runtime when the login manager is
 * unavailable, so a fresh profile never contains a key-shaped entry. */

pref("extensions.zotero-agent.enabled", true);

// Active AI provider id ("openai-compatible" | ...).
pref("extensions.zotero-agent.provider.active", "openai-compatible");
pref("extensions.zotero-agent.provider.openaiCompatible.endpoint", "");
pref("extensions.zotero-agent.provider.openaiCompatible.model", "");

// Request timeout for provider HTTP calls, in milliseconds.
pref("extensions.zotero-agent.provider.requestTimeoutMs", 300000);

// Maximum model context auto-highlighting may use. A lower provider-reported
// context window takes precedence.
pref("extensions.zotero-agent.autoHighlight.contextWindowTokens", 65536);

// JSON-serialized color-to-category mapping; empty means built-in defaults.
pref("extensions.zotero-agent.colorSemantics", "");

// Per-item character budget for PDF full text in composed prompts; fallback
// cap used when an item isn't indexed yet (S2-03; retained by S3-05).
pref("extensions.zotero-agent.context.charBudgetPerItem", 20000);

// Soft per-item token budget; over this, retrieval passages replace full
// text when the item is indexed (S3-05).
pref("extensions.zotero-agent.context.tokenBudgetPerItem", 4000);

// Local retrieval index (S3-06).
pref("extensions.zotero-agent.retrieval.enabled", true);
// Local embeddings on/off; defaults off until the day-1 wasm runtime probe
// (S3-03) is confirmed in a live Zotero profile. Retrieval always falls back
// to keyword-only when this is off or embedding fails.
pref("extensions.zotero-agent.retrieval.embeddings", false);
// Max retrieved passages considered per over-budget item (S3-05).
pref("extensions.zotero-agent.retrieval.passagesPerItem", 12);

// Exposes Zotero.ZoteroAgent.dev.probeRetrieval() for the day-1 wasm runtime
// probe (S3-03); off by default, dev/QA only.
pref("extensions.zotero-agent.devTools", false);
