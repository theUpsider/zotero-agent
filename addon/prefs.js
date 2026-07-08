/* Default preferences for the Zotero AI Research Assistant. */

pref("extensions.zotero-agent.enabled", true);

// Active AI provider id ("openai-compatible" | "local" | ...).
pref("extensions.zotero-agent.provider.active", "openai-compatible");
pref("extensions.zotero-agent.provider.openaiCompatible.endpoint", "");
pref("extensions.zotero-agent.provider.openaiCompatible.model", "");

// JSON-serialized color-to-category mapping; empty means built-in defaults.
pref("extensions.zotero-agent.colorSemantics", "");
