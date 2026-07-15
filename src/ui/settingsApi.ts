/** Settings-pane API (S1-06, S1-07). Published on Zotero.ZoteroAgent by
 * plugin.ts so the preferences window (a separate scope from the bootstrap
 * sandbox) can reach plugin logic. Imports core/ and workflows/ only — the
 * dependency matrix forbids ui/ → providers/; provider access goes through
 * the gate (see workflows/providerGate.ts).
 *
 * The API never hands the stored API key back to the UI (NFR-012): the pane
 * only learns whether a key exists. */

import { PREF_KEYS, getStringPref, type PrefStore } from "../core/config";
import { CREDENTIAL_IDS } from "../core/credentials";
import {
  ZOTERO_ANNOTATION_COLORS,
  defaultColorSemantics,
  parseColorSemantics,
  serializeColorSemantics,
  type ColorSemantics,
} from "../core/colorSemantics";
import type { IndexAdmin, IndexStatus } from "../retrieval/indexManager";
import {
  testConnection,
  type ProviderGateDeps,
  type TestConnectionResult,
} from "../workflows/providerGate";

export interface SettingsApi {
  listProviders(): { id: string; label: string }[];
  testConnection(): Promise<TestConnectionResult>;
  hasApiKey(): Promise<boolean>;
  /** Empty string clears the key. */
  setApiKey(key: string): Promise<void>;
  clearApiKey(): Promise<void>;
  credentialStorageKind(): "login-manager" | "prefs-fallback";
  getColorSemantics(): ColorSemantics;
  setColorSemantics(mapping: ColorSemantics): void;
  resetColorSemantics(): ColorSemantics;
  /** Standard Zotero annotation colors, name → hex (FR-026). */
  standardColors(): Record<string, string>;
  /** null when retrieval failed to initialize (S3-08) — ui/ reaches
   * retrieval/ for status only, never a concrete backend (component view §3). */
  indexStatus(): IndexStatus | null;
  rebuildIndex(): void;
  cancelIndexRebuild(): void;
}

export function createSettingsApi(deps: ProviderGateDeps, index?: IndexAdmin): SettingsApi {
  const prefs: PrefStore = deps.prefs;
  return {
    listProviders: () => deps.registry.entries(),

    testConnection: () => testConnection(deps),

    hasApiKey: async () => (await deps.credentials.get(CREDENTIAL_IDS.openaiApiKey)) !== null,

    setApiKey: async (key) => {
      if (key === "") {
        await deps.credentials.remove(CREDENTIAL_IDS.openaiApiKey);
      } else {
        await deps.credentials.set(CREDENTIAL_IDS.openaiApiKey, key);
      }
    },

    clearApiKey: () => deps.credentials.remove(CREDENTIAL_IDS.openaiApiKey),

    credentialStorageKind: () => deps.credentials.kind,

    getColorSemantics: () =>
      parseColorSemantics(getStringPref(prefs, PREF_KEYS.colorSemantics)),

    setColorSemantics: (mapping) => {
      prefs.set(PREF_KEYS.colorSemantics, serializeColorSemantics(mapping));
    },

    resetColorSemantics: () => {
      const defaults = defaultColorSemantics();
      prefs.set(PREF_KEYS.colorSemantics, serializeColorSemantics(defaults));
      return defaults;
    },

    standardColors: () => ({ ...ZOTERO_ANNOTATION_COLORS }),

    indexStatus: () => index?.status() ?? null,
    rebuildIndex: () => index?.rebuild(),
    cancelIndexRebuild: () => index?.cancelRebuild(),
  };
}
