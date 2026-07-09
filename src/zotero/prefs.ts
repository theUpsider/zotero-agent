/** Live PrefStore backed by Zotero.Prefs (research guide §6.5). Lives under
 * src/zotero/ so core/config.ts stays free of the Zotero global; injected as
 * the default store at plugin init. */

import type { PrefStore } from "../core/config";

export function zoteroPrefStore(): PrefStore {
  return {
    get: (key) => Zotero.Prefs.get(key, true),
    set: (key, value) => Zotero.Prefs.set(key, value, true),
    clear: (key) => Zotero.Prefs.clear(key, true),
  };
}
