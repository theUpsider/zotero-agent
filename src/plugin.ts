/** Plugin lifecycle and window integration. UI wiring only — business logic
 * lives in the pure modules under core/, prompts/, providers/, retrieval/.
 * This file is thin Zotero glue: it builds the dependency graph (prefs,
 * credentials, registry, fetch, logger), publishes the settings API for the
 * preferences pane, and registers the pref pane (S1-06). */

import { getSelectedItemSummaries } from "./zotero/adapter";
import { zoteroPrefStore } from "./core/config";
import { createLogger, type Logger } from "./core/errors";
import type { CredentialStore } from "./core/credentials";
import { CREDENTIAL_IDS } from "./core/credentials";
import { createDefaultRegistry } from "./providers/registry";
import type { ProviderGateDeps } from "./workflows/providerGate";
import { createSettingsApi, type SettingsApi } from "./ui/settingsApi";
import { createZoteroCredentialStore } from "./zotero/credentials";
import { resolveFetch } from "./zotero/http";

interface PluginInfo {
  id: string;
  version: string;
  rootURI: string;
}

const MENU_ITEM_ID = "zotero-agent-menuitem";

export class ZoteroAgentPlugin {
  private info: PluginInfo | null = null;
  private prefPaneId: string | null = null;
  private logger: Logger | null = null;
  /** Cached secret list for log redaction; refreshed on credential changes. */
  private knownSecrets: string[] = [];

  init(info: PluginInfo): void {
    this.info = info;
    this.logger = createLogger(
      { debug: (m) => Zotero.debug(m) },
      () => this.knownSecrets,
    );
    this.log(`initialized ${info.id} ${info.version}`);
    // Async wiring (credential-store probe, pane registration) runs behind
    // the sync bootstrap call; failures are logged, never thrown into Zotero.
    void this.initAsync().catch((error) => {
      this.logger?.error("initialization failed", error);
    });
  }

  private async initAsync(): Promise<void> {
    if (!this.info || !this.logger) return;
    const logger = this.logger;
    const prefs = zoteroPrefStore();
    const credentials = await createZoteroCredentialStore(prefs, logger);
    await this.refreshSecretCache(credentials);

    const deps: ProviderGateDeps = {
      prefs,
      credentials: this.trackingCredentialStore(credentials),
      registry: createDefaultRegistry(),
      fetch: resolveFetch(),
      logger,
    };

    const settings = createSettingsApi(deps);
    (Zotero as unknown as { ZoteroAgent?: { settings: SettingsApi } }).ZoteroAgent = {
      settings,
    };

    this.prefPaneId = await Zotero.PreferencePanes.register({
      pluginID: this.info.id,
      src: this.info.rootURI + "content/preferences.xhtml",
      scripts: [this.info.rootURI + "content/preferences.js"],
      stylesheets: [this.info.rootURI + "content/preferences.css"],
      label: "AI Research Assistant",
    });
    this.log("preferences pane registered");
  }

  /** Keep the redaction list current when the key changes via settings. */
  private trackingCredentialStore(store: CredentialStore): CredentialStore {
    const refresh = () => this.refreshSecretCache(store);
    return {
      kind: store.kind,
      get: (id) => store.get(id),
      set: async (id, secret) => {
        await store.set(id, secret);
        await refresh();
      },
      remove: async (id) => {
        await store.remove(id);
        await refresh();
      },
    };
  }

  private async refreshSecretCache(store: CredentialStore): Promise<void> {
    const key = await store.get(CREDENTIAL_IDS.openaiApiKey);
    this.knownSecrets = key ? [key] : [];
  }

  shutdown(): void {
    if (this.prefPaneId) {
      Zotero.PreferencePanes.unregister(this.prefPaneId);
      this.prefPaneId = null;
    }
    delete (Zotero as unknown as { ZoteroAgent?: unknown }).ZoteroAgent;
    this.log("shut down");
  }

  addToWindow(window: _ZoteroTypes.MainWindow): void {
    const doc = window.document;
    if (doc.getElementById(MENU_ITEM_ID)) return;

    const menu = doc.getElementById("menu_ToolsPopup") ?? doc.getElementById("menu_viewPopup");
    if (!menu) {
      this.log("no target menu found");
      return;
    }

    const menuItem = doc.createXULElement("menuitem");
    menuItem.id = MENU_ITEM_ID;
    menuItem.setAttribute("label", "AI Research Assistant: Analyze selected items");
    menuItem.addEventListener("command", () => {
      const items = getSelectedItemSummaries(window);
      this.log(`selected items: ${JSON.stringify(items)}`);
      // Placeholder until the analysis workflow exists (FG-003).
      window.alert(`Zotero AI Research Assistant\n\nSelected items: ${items.length}`);
    });
    menu.appendChild(menuItem);
  }

  addToAllWindows(): void {
    for (const win of Zotero.getMainWindows()) {
      if (!win.ZoteroPane) continue;
      this.addToWindow(win);
    }
  }

  removeFromWindow(window: _ZoteroTypes.MainWindow): void {
    window.document.getElementById(MENU_ITEM_ID)?.remove();
  }

  removeFromAllWindows(): void {
    for (const win of Zotero.getMainWindows()) {
      if (!win.ZoteroPane) continue;
      this.removeFromWindow(win);
    }
  }

  private log(message: string): void {
    this.logger?.log(message);
  }
}
