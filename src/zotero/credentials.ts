/** Login-manager credential store (S1-04; FR-019, DAR-008, NFR-011).
 * Only this file (under src/zotero/) touches Mozilla platform globals; the
 * rest of the plugin sees the CredentialStore interface from core/. */

import type { PrefStore } from "../core/config";
import { prefCredentialStore, type CredentialStore } from "../core/credentials";
import type { Logger } from "../core/errors";

const ORIGIN = "chrome://zotero-agent";
const HTTP_REALM = "zotero-agent";

/* Mozilla platform globals available in the bootstrap sandbox. */
declare const Services: any;
declare const Components: any;

async function findLogin(id: string): Promise<any | null> {
  const logins: any[] = await Services.logins.searchLoginsAsync({
    origin: ORIGIN,
    httpRealm: HTTP_REALM,
  });
  return logins.find((login) => login.username === id) ?? null;
}

export function loginManagerCredentialStore(): CredentialStore {
  return {
    kind: "login-manager",
    get: async (id) => {
      const login = await findLogin(id);
      return login ? String(login.password) : null;
    },
    set: async (id, secret) => {
      const existing = await findLogin(id);
      if (existing) Services.logins.removeLogin(existing);
      const loginInfo = Components.classes[
        "@mozilla.org/login-manager/loginInfo;1"
      ].createInstance(Components.interfaces.nsILoginInfo);
      loginInfo.init(ORIGIN, null, HTTP_REALM, id, secret, "", "");
      await Services.logins.addLoginAsync(loginInfo);
    },
    remove: async (id) => {
      const existing = await findLogin(id);
      if (existing) Services.logins.removeLogin(existing);
    },
  };
}

/** Probe the login manager once at startup; fall back to plaintext prefs when
 * it is unavailable (documented in README — S1-04 escape hatch). */
export async function createZoteroCredentialStore(
  prefs: PrefStore,
  logger: Logger,
): Promise<CredentialStore> {
  try {
    await Services.logins.searchLoginsAsync({ origin: ORIGIN, httpRealm: HTTP_REALM });
    logger.log("credential store: login manager");
    return loginManagerCredentialStore();
  } catch (error) {
    logger.error("credential store: login manager unavailable, using prefs fallback", error);
    return prefCredentialStore(prefs);
  }
}
