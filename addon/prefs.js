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
pref("extensions.zotero-agent.provider.requestTimeoutMs", 30000);

// JSON-serialized color-to-category mapping; empty means built-in defaults.
pref("extensions.zotero-agent.colorSemantics", "");

// Per-item character budget for PDF full text in composed prompts (S2-03).
pref("extensions.zotero-agent.context.charBudgetPerItem", 20000);
