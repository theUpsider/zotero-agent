/** Plugin lifecycle and window integration. UI wiring only — business logic
 * lives in the pure modules under core/, prompts/, providers/, retrieval/.
 * This file is thin Zotero glue: it builds the dependency graph (prefs,
 * credentials, registry, fetch, logger), publishes the settings and workflow
 * APIs for plugin windows, registers the pref pane (S1-06), and adds the
 * workflow menus (S2-07). */

import { parseColorSemantics } from "./core/colorSemantics";
import { getBoolPref, getStringPref, PREF_KEYS } from "./core/config";
import type { CredentialStore } from "./core/credentials";
import { CREDENTIAL_IDS } from "./core/credentials";
import { createLogger, type Logger } from "./core/errors";
import { createDefaultRegistry } from "./providers/registry";
import { createTransformersEmbedder } from "./retrieval/embeddings";
import { createIndexManager, type IndexManager } from "./retrieval/indexManager";
import { createOramaBackend } from "./retrieval/oramaBackend";
import { defaultReranker } from "./retrieval/rerank";
import { createSettingsApi, type SettingsApi } from "./ui/settingsApi";
import {
  createWorkflowUiApi,
  type NamedWorkflowMode,
  type ResultViewSession,
  type WorkflowUiApi,
} from "./ui/workflowApi";
import {
  createHighlightWriter,
  createItemContextReader,
  createNoteWriter,
  createTagWriter,
  getSelectedItemRefs,
  listAllItemRefs,
} from "./zotero/adapter";
import { createZoteroCredentialStore } from "./zotero/credentials";
import { createPluginFileStore } from "./zotero/files";
import { resolveAbortController, resolveFetch } from "./zotero/http";
import { createModelCache } from "./zotero/modelCache";
import { registerItemChangeObserver } from "./zotero/notifier";
import { zoteroPrefStore } from "./zotero/prefs";
import { createWorkflowOrchestrator, listTemplateWorkflows } from "./workflows/orchestrator";
import { ensureProviderReady, type ProviderGateDeps } from "./workflows/providerGate";
import { runRetrievalProbe, type ProbeReport } from "./retrieval/probe";

interface PluginInfo {
  id: string;
  version: string;
  rootURI: string;
}

/** Dev-only surface (S3-03): `Zotero.ZoteroAgent.dev.probeRetrieval()`, run
 * once from the Run-JavaScript console to check wasm/embedding viability in
 * a live profile. Gated by the `devTools` pref — never on by default. */
interface DevApi {
  probeRetrieval(): Promise<ProbeReport>;
}

/** Named scholarly workflows in menu order (S4-07). */
const NAMED_WORKFLOWS: { mode: NamedWorkflowMode; label: string }[] = [
  { mode: "analyze-papers", label: "Analyze papers" },
  { mode: "auto-highlight", label: "Highlight paper" },
  { mode: "generate-notes", label: "Generate note from annotations" },
  { mode: "summarize-notes", label: "Summarize notes" },
  { mode: "suggest-tags", label: "Suggest tags" },
];

const TOOLS_MENU_ID = "zotero-agent-tools-menu";
const ITEM_MENU_ID = "zotero-agent-item-menu";
const RESULT_WINDOW_NAME = "zotero-agent-result-view";
const MENU_LABEL = "AI Research Assistant";

type ZoteroAgentGlobal = { settings: SettingsApi; workflows: WorkflowUiApi; dev?: DevApi };

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
  /** Local retrieval index (S3-06); null when retrieval init failed —
   * workflows and settings fall back to Sprint 2 behavior (char truncation
   * only, no index status section). */
  private indexManager: IndexManager | null = null;
  private notifierUnregister: (() => void) | null = null;
  private retrievalBackend: ReturnType<typeof createOramaBackend> | null = null;

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
      createAbortController: resolveAbortController(),
      logger,
    };

    const reader = createItemContextReader(logger);
    const indexManager = await this.initRetrieval(prefs, logger, reader);

    const settings = createSettingsApi(deps, indexManager ?? undefined);
    const orchestrator = createWorkflowOrchestrator({
      ensureProvider: () => ensureProviderReady(deps),
      reader,
      noteWriter: createNoteWriter(logger),
      tagWriter: createTagWriter(logger),
      highlightWriter: createHighlightWriter(logger),
      prefs,
      logger,
      createAbortController: resolveAbortController(),
      ...(indexManager
        ? {
            retrieval: {
              backend: this.retrievalBackend!,
              enqueueReindex: (refs: { libraryID: number; key: string }[]) => {
                for (const ref of refs) indexManager.onItemEvent({ kind: "changed", ref });
              },
            },
          }
        : {}),
    });
    this.workflows = createWorkflowUiApi(orchestrator);
    const global: ZoteroAgentGlobal = { settings, workflows: this.workflows };
    if (getBoolPref(prefs, PREF_KEYS.devTools, false) && this.info) {
      const rootURI = this.info.rootURI;
      global.dev = {
        probeRetrieval: () =>
          runRetrievalProbe({
            wasmPaths: `${rootURI}content/ort/`,
            customCache: createModelCache(createPluginFileStore(logger), logger),
          }),
      };
    }
    (Zotero as unknown as { ZoteroAgent?: ZoteroAgentGlobal }).ZoteroAgent = global;

    this.prefPaneId = await Zotero.PreferencePanes.register({
      pluginID: this.info.id,
      src: this.info.rootURI + "content/preferences.xhtml",
      scripts: [this.info.rootURI + "content/preferences.js"],
      stylesheets: [this.info.rootURI + "content/preferences.css"],
      label: MENU_LABEL,
    });
    this.log("preferences pane registered");
  }

  /** Builds the local retrieval index (S3-01/S3-06): plugin-data-dir file
   * store -> optional local embedder (behind the `retrieval.embeddings` pref,
   * default off until the day-1 wasm probe is confirmed, see
   * src/retrieval/probe.ts) -> Orama backend -> index manager -> notifier
   * subscription. Never throws into Zotero — a failure anywhere here logs
   * and leaves retrieval null, and the rest of the plugin runs exactly as in
   * Sprint 2 (char-budget truncation only, no index status section). */
  private async initRetrieval(
    prefs: ReturnType<typeof zoteroPrefStore>,
    logger: Logger,
    reader: ReturnType<typeof createItemContextReader>,
  ): Promise<IndexManager | null> {
    if (!this.info) return null;
    if (!getBoolPref(prefs, PREF_KEYS.retrievalEnabled, true)) return null;

    try {
      const fileStore = createPluginFileStore(logger);
      let embedder = null;
      if (getBoolPref(prefs, PREF_KEYS.retrievalEmbeddings, false)) {
        embedder = await createTransformersEmbedder({
          wasmPaths: `${this.info.rootURI}content/ort/`,
          customCache: createModelCache(fileStore, logger),
          onWarning: (message) => logger.log(`[index] ${message}`),
        });
      }
      const backend = createOramaBackend({ fileStore, embedder, rerank: defaultReranker, logger });
      this.retrievalBackend = backend;

      const indexManager = createIndexManager({
        backend,
        reader,
        listAllItems: () => listAllItemRefs(logger),
        chunkOptions: () => ({ colorSemantics: parseColorSemantics(getStringPref(prefs, PREF_KEYS.colorSemantics)) }),
        logger,
      });
      void indexManager.load();
      this.notifierUnregister = registerItemChangeObserver(
        (event) => indexManager.onItemEvent(event),
        logger,
      );
      this.indexManager = indexManager;
      this.log("[index] retrieval initialized");
      return indexManager;
    } catch (error) {
      logger.error("retrieval initialization failed; falling back to Sprint 2 behavior", error);
      return null;
    }
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
    if (this.notifierUnregister) {
      this.notifierUnregister();
      this.notifierUnregister = null;
    }
    this.indexManager?.dispose();
    this.indexManager = null;
    this.retrievalBackend = null;
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

    // Scholarly workflows first, then the template prompts, then Free prompt
    // (S4-07; task-language labels, no AI/RAG jargon, NFR-013).
    for (const { mode, label } of NAMED_WORKFLOWS) {
      addEntry(label, () => this.startNamedWorkflow(window, mode, label));
    }
    popup.appendChild(doc.createXULElement("menuseparator"));
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
    const session: ResultViewSession = {
      mode: "template",
      templateId: template.id,
      templateLabel: template.label,
      items,
    };
    workflows.setSession(session);
    void this.openResultView(window, session).then(() => {
      const started = workflows.startTemplate(
        template.id,
        items.map(({ libraryID, key }) => ({ libraryID, key })),
      );
      if (!started.ok) {
        this.log(`workflow not started: ${started.message}`);
      }
    });
  }

  /** Start a named scholarly workflow (S4-01..S4-05): set the session so the
   * result view shows the right header, kick off the run, open the view. */
  private startNamedWorkflow(
    window: _ZoteroTypes.MainWindow,
    mode: NamedWorkflowMode,
    title: string,
  ): void {
    const workflows = this.workflows;
    if (!workflows) return;
    const items = getSelectedItemRefs(window);
    if (items.length === 0) return;
    const session: ResultViewSession = { mode, title, items };
    workflows.setSession(session);
    void this.openResultView(window, session).then(() => {
      const started = workflows.startWorkflow(
        mode,
        items.map(({ libraryID, key }) => ({ libraryID, key })),
      );
      if (!started.ok) {
        this.log(`workflow not started: ${started.message}`);
      }
    });
  }

  private startFreePromptWorkflow(window: _ZoteroTypes.MainWindow): void {
    const workflows = this.workflows;
    if (!workflows) return;
    const items = getSelectedItemRefs(window);
    if (items.length === 0) return;
    // The run starts from inside the view once the user entered a prompt.
    const session: ResultViewSession = { mode: "free-prompt", items };
    workflows.setSession(session);
    void this.openResultView(window, session);
  }

  /** Open (or focus) the single result-view window (FR-091, FR-098). The
   * session is passed as a dialog argument so the view can render the
   * header and per-item placeholders synchronously, before it has even
   * found the (possibly still-initializing) workflow API — a slow or
   * missed "view-ready" handshake then only delays live progress updates,
   * never leaves the window blank (S2-05 regression, recurrence found
   * 2026-07-15). The returned promise still resolves once the view has
   * subscribed to workflow events, since starting a workflow before that
   * would fire "started"/"completed" into a window nobody is listening to
   * yet. Reusing an already-open window resolves immediately since it
   * subscribed long ago. */
  private openResultView(
    window: _ZoteroTypes.MainWindow,
    session?: ResultViewSession,
  ): Promise<void> {
    if (!this.info) return Promise.resolve();
    // A window whose XUL document failed to load (e.g. a parse error) can
    // become a "dead object" wrapper — every property access on it throws
    // rather than reading false/null, so a plain truthiness/`.closed` check
    // isn't enough to detect it.
    try {
      if (this.resultWindow && !this.resultWindow.closed) {
        this.resultWindow.focus();
        // Tell the open view to pick up the new session.
        this.resultWindow.dispatchEvent(new Event("zotero-agent-session-changed"));
        return Promise.resolve();
      }
    } catch (error) {
      this.log(`stale result window reference discarded: ${error instanceof Error ? error.message : String(error)}`);
      this.resultWindow = null;
    }
    const url = this.info.rootURI + "content/resultView.xhtml";
    this.log(`opening result view: ${url}`);
    let win: Window | null = null;
    try {
      win = window.openDialog(
        url,
        RESULT_WINDOW_NAME,
        "chrome,dialog=no,resizable,centerscreen,width=780,height=620",
        session ?? null,
      );
    } catch (error) {
      this.log(`openDialog threw: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
      return Promise.resolve();
    }
    this.log(`openDialog returned: ${win ? "window" : String(win)}`);
    this.resultWindow = win;
    if (!win) return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        win.removeEventListener("zotero-agent-view-ready", onReady);
        resolve();
      };
      const onReady = () => settle();
      win.addEventListener("zotero-agent-view-ready", onReady);
      // Defensive fallback: never block a workflow start indefinitely if the
      // view's script fails to load or the ready event is somehow missed.
      win.setTimeout(() => {
        if (!settled) this.log("result view ready-event timed out; starting anyway");
        settle();
      }, 5000);
    });
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
