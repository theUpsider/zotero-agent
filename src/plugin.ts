/** Plugin lifecycle and window integration. UI wiring only — business logic
 * lives in the pure modules under core/, prompts/, providers/, retrieval/. */

import { getSelectedItemSummaries } from "./zotero/adapter";

interface PluginInfo {
  id: string;
  version: string;
  rootURI: string;
}

const MENU_ITEM_ID = "zotero-agent-menuitem";

export class ZoteroAgentPlugin {
  private info: PluginInfo | null = null;

  init(info: PluginInfo): void {
    this.info = info;
    this.log(`initialized ${info.id} ${info.version}`);
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
    Zotero.debug(`ZoteroAgent: ${message}`);
  }
}
