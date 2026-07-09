/** Credential storage abstraction (S1-04, FR-019, DAR-008, NFR-011).
 * Pure interface + prefs fallback; the Zotero login-manager implementation
 * lives in src/zotero/credentials.ts and is injected like PrefStore. */

import type { PrefStore } from "./config";
import { PREFS_PREFIX } from "./config";

export interface CredentialStore {
  /** Which mechanism backs this store; shown in settings so the user knows
   * whether the key is stored securely or as a plaintext pref. */
  readonly kind: "login-manager" | "prefs-fallback";
  get(id: string): Promise<string | null>;
  set(id: string, secret: string): Promise<void>;
  remove(id: string): Promise<void>;
}

export const CREDENTIAL_IDS = {
  openaiApiKey: "provider.openaiCompatible.apiKey",
} as const;

/** Fallback storing secrets as plaintext prefs (documented in README).
 * Used only when the login manager is unavailable. */
export function prefCredentialStore(store: PrefStore): CredentialStore {
  const prefKey = (id: string) => `${PREFS_PREFIX}.credentialFallback.${id}`;
  return {
    kind: "prefs-fallback",
    get: async (id) => {
      const value = store.get(prefKey(id));
      return typeof value === "string" && value !== "" ? value : null;
    },
    set: async (id, secret) => {
      store.set(prefKey(id), secret);
    },
    remove: async (id) => {
      store.clear(prefKey(id));
    },
  };
}
