/* Zotero bootstrapped-plugin lifecycle. Loads the bundled plugin code
 * (content/zotero-agent.js, built by esbuild) into this scope. */

var ZoteroAgent;

function log(message) {
  Zotero.debug("ZoteroAgent [bootstrap]: " + message);
}

function install(data, reason) {
  log("installed");
}

async function startup({ id, version, rootURI }, reason) {
  log("starting " + id + " " + version);
  Services.scriptloader.loadSubScript(rootURI + "content/zotero-agent.js");
  ZoteroAgent.init({ id, version, rootURI });
  ZoteroAgent.addToAllWindows();
}

function onMainWindowLoad({ window }) {
  ZoteroAgent?.addToWindow(window);
}

function onMainWindowUnload({ window }) {
  ZoteroAgent?.removeFromWindow(window);
}

function shutdown(data, reason) {
  log("shutting down");
  if (ZoteroAgent) {
    ZoteroAgent.removeFromAllWindows();
    ZoteroAgent.shutdown();
    ZoteroAgent = undefined;
  }
}

function uninstall(data, reason) {
  log("uninstalled");
}
