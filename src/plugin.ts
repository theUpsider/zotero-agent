/** Plugin lifecycle and window integration. UI wiring only — business logic
 * lives in the pure modules under core/, prompts/, providers/, retrieval/.
 * This file is thin Zotero glue: it builds the dependency graph (prefs,
 * credentials, registry, fetch, logger), publishes the settings and workflow
 * APIs for plugin windows, registers the pref pane (S1-06), and adds the
 * workflow menus (S2-07). */

import { createLogger, type Logger } from "./core/errors";
import type { CredentialStore } from "./core/credentials";
import { CREDENTIAL_IDS } from "./core/credentials";
import { createDefaultRegistry } from "./providers/registry";
import { ensureProviderReady, type ProviderGateDeps } from "./workflows/providerGate";
import { createWorkflowOrchestrator, listTemplateWorkflows } from "./workflows/orchestrator";
import { createSettingsApi, type SettingsApi } from "./ui/settingsApi";
import { createWorkflowUiApi, type WorkflowUiApi } from "./ui/workflowApi";
import {
  createItemContextReader,
  createNoteWriter,
  getSelectedItemRefs,
} from "./zotero/adapter";
import { createZoteroCredentialStore } from "./zotero/credentials";
import { resolveFetch } from "./zotero/http";
import { zoteroPrefStore } from "./zotero/prefs";

interface PluginInfo {
  id: string;
  version: string;
  rootURI: string;
}

const TOOLS_MENU_ID = "zotero-agent-tools-menu";
const ITEM_MENU_ID = "zotero-agent-item-menu";
const RESULT_WINDOW_NAME = "zotero-agent-result-view";
const MENU_LABEL = "AI Research Assistant";

type ZoteroAgentGlobal = { settings: SettingsApi; workflows: WorkflowUiApi };

export class ZoteroAgentPlugin {
  private info: PluginInfo | null = null;
  private prefPaneId: string | null = null;
  private logger: Logger | null = null;
  private workflows: WorkflowUiApi | null = null;
  private resultWindow: Window | null = null;
  /** Per-window teardown callbacks (menu elements + popup listeners). */
  private windowCleanups = new Map<Window, (() => void)[]>();
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
    const orchestrator = createWorkflowOrchestrator({
      ensureProvider: () => ensureProviderReady(deps),
      reader: createItemContextReader(logger),
      noteWriter: createNoteWriter(logger),
      prefs,
      logger,
    });
    this.workflows = createWorkflowUiApi(orchestrator);
    (Zotero as unknown as { ZoteroAgent?: ZoteroAgentGlobal }).ZoteroAgent = {
      settings,
      workflows: this.workflows,
    };

    this.prefPaneId = await Zotero.PreferencePanes.register({
      pluginID: this.info.id,
      src: this.info.rootURI + "content/preferences.xhtml",
      scripts: [this.info.rootURI + "content/preferences.js"],
      stylesheets: [this.info.rootURI + "content/preferences.css"],
      label: MENU_LABEL,
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
    if (this.resultWindow && !this.resultWindow.closed) {
      this.resultWindow.close();
    }
    this.resultWindow = null;
    delete (Zotero as unknown as { ZoteroAgent?: unknown }).ZoteroAgent;
    this.log("shut down");
  }

  addToWindow(window: _ZoteroTypes.MainWindow): void {
    if (this.windowCleanups.has(window)) return;
    const cleanups: (() => void)[] = [];

    const toolsPopup =
      window.document.getElementById("menu_ToolsPopup") ??
      window.document.getElementById("menu_viewPopup");
    if (toolsPopup) {
      cleanups.push(this.addWorkflowMenu(window, toolsPopup, TOOLS_MENU_ID));
    }
    const itemPopup = window.document.getElementById("zotero-itemmenu");
    if (itemPopup) {
      cleanups.push(this.addWorkflowMenu(window, itemPopup, ITEM_MENU_ID));
    }
    if (cleanups.length === 0) {
      this.log("no target menus found");
      return;
    }
    this.windowCleanups.set(window, cleanups);
  }

  /** Submenu with the template workflows and "Free prompt…" (S2-07,
   * NFR-014); disabled while no regular item is selected. Returns teardown. */
  private addWorkflowMenu(
    window: _ZoteroTypes.MainWindow,
    parentPopup: Element,
    menuId: string,
  ): () => void {
    const doc = window.document;

    const menu = doc.createXULElement("menu");
    menu.id = menuId;
    menu.setAttribute("label", MENU_LABEL);
    const popup = doc.createXULElement("menupopup");
    menu.appendChild(popup);

    const addEntry = (label: string, onCommand: () => void) => {
      const menuItem = doc.createXULElement("menuitem");
      menuItem.setAttribute("label", label);
      menuItem.addEventListener("command", onCommand);
      popup.appendChild(menuItem);
    };

    // listTemplateWorkflows() is pure/synchronous, so the menu is complete
    // even when addToWindow runs before initAsync has finished.
    for (const template of listTemplateWorkflows()) {
      addEntry(template.label, () => this.startTemplateWorkflow(window, template));
    }
    popup.appendChild(doc.createXULElement("menuseparator"));
    addEntry("Free prompt…", () => this.startFreePromptWorkflow(window));

    // Grey the submenu out while the selection has no regular items (S2-07).
    const onPopupShowing = (event: Event) => {
      if (event.target !== parentPopup) return;
      if (getSelectedItemRefs(window).length > 0) {
        menu.removeAttribute("disabled");
      } else {
        menu.setAttribute("disabled", "true");
      }
    };
    parentPopup.addEventListener("popupshowing", onPopupShowing);
    parentPopup.appendChild(menu);

    return () => {
      parentPopup.removeEventListener("popupshowing", onPopupShowing);
      menu.remove();
    };
  }

  private startTemplateWorkflow(
    window: _ZoteroTypes.MainWindow,
    template: { id: string; label: string },
  ): void {
    const workflows = this.workflows;
    if (!workflows) return;
    const items = getSelectedItemRefs(window);
    if (items.length === 0) return;
    workflows.setSession({
      mode: "template",
      templateId: template.id,
      templateLabel: template.label,
      items,
    });
    const started = workflows.startTemplate(
      template.id,
      items.map(({ libraryID, key }) => ({ libraryID, key })),
    );
    if (!started.ok) {
      this.log(`workflow not started: ${started.message}`);
    }
    this.openResultView(window);
  }

  private startFreePromptWorkflow(window: _ZoteroTypes.MainWindow): void {
    const workflows = this.workflows;
    if (!workflows) return;
    const items = getSelectedItemRefs(window);
    if (items.length === 0) return;
    // The run starts from inside the view once the user entered a prompt.
    workflows.setSession({ mode: "free-prompt", items });
    this.openResultView(window);
  }

  /** Open (or focus) the single result-view window (FR-091, FR-098). */
  private openResultView(window: _ZoteroTypes.MainWindow): void {
    if (!this.info) return;
    if (this.resultWindow && !this.resultWindow.closed) {
      this.resultWindow.focus();
      // Tell the open view to pick up the new session.
      this.resultWindow.dispatchEvent(new Event("zotero-agent-session-changed"));
      return;
    }
    this.resultWindow = window.openDialog(
      this.info.rootURI + "content/resultView.xhtml",
      RESULT_WINDOW_NAME,
      "chrome,dialog=no,resizable,centerscreen,width=780,height=620",
    );
  }

  addToAllWindows(): void {
    for (const win of Zotero.getMainWindows()) {
      if (!win.ZoteroPane) continue;
      this.addToWindow(win);
    }
  }

  removeFromWindow(window: _ZoteroTypes.MainWindow): void {
    for (const cleanup of this.windowCleanups.get(window) ?? []) cleanup();
    this.windowCleanups.delete(window);
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
