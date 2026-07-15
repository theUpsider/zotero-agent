/* Zotero bootstrapped-plugin lifecycle. Loads the bundled plugin code
 * (content/zotero-agent.js, built by esbuild) into this scope. */

var ZoteroAgent;

const CHROME_PACKAGE = "zotero-agent-view";

function log(message) {
  Zotero.debug("ZoteroAgent [bootstrap]: " + message);
}

function install(data, reason) {
  log("installed");
}

/* Zotero's own bootstrap loader (chrome://zotero/content/xpcom/plugins.js)
 * doesn't supply the `installPath` nsIFile that Firefox's AddonManager would
 * — only `rootURI` (a jar:file:...!/  or, unpacked, a plain file:// URI
 * string). Derive the underlying nsIFile from it via XPCOM instead of
 * assuming installPath exists (passing undefined there is exactly what threw
 * NS_ERROR_ILLEGAL_VALUE). */
function installFileFromRootURI(rootURI) {
  const uri = Services.io.newURI(rootURI);
  const fileURI = uri instanceof Components.interfaces.nsIJARURI ? uri.JARFile : uri;
  return fileURI.QueryInterface(Components.interfaces.nsIFileURL).file;
}

/* Gecko only recognizes the native XUL <window> document type (used by
 * resultView.xhtml, opened via window.openDialog in plugin.ts) through a
 * genuine chrome:// URI — a raw jar:file:...!/ URI (a packed .xpi's default
 * rootURI) is blocked from top-level window navigation outright (silently:
 * the window just sits at about:blank, no exception, no console output),
 * and a resource:// substitution gets further (real navigation happens) but
 * still fails an XML parse immediately after the root <window> tag, because
 * the document isn't recognized as XUL without chrome:// context — same
 * silent-until-you-look-in-Firefox's-error-page symptom. Registering our own
 * chrome.manifest content package (see addon/chrome.manifest) at startup and
 * using the resulting chrome://zotero-agent-view/content/... URI for
 * everything sidesteps both restrictions. addBootstrappedManifestLocation
 * accepts either a packed .xpi file or an unpacked directory transparently,
 * so this works the same whether Option A (install .xpi) or Option B (dev
 * source-proxy) is used (see README). */
async function startup(data, reason) {
  const { id, version, rootURI } = data;
  log("starting " + id + " " + version);
  Components.manager.addBootstrappedManifestLocation(installFileFromRootURI(rootURI));
  // Consumers append "content/..." themselves (settings pane src/scripts,
  // resultView.xhtml, ort wasm assets), so rootURI stays at the package
  // root — chrome.manifest's "content" entry is what maps .../content/...
  // through to the addon's actual content/ directory.
  const chromeRootURI = `chrome://${CHROME_PACKAGE}/`;
  Services.scriptloader.loadSubScript(chromeRootURI + "content/zotero-agent.js");
  ZoteroAgent.init({ id, version, rootURI: chromeRootURI });
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
  try {
    Components.manager.removeBootstrappedManifestLocation(installFileFromRootURI(data.rootURI));
  } catch (error) {
    log("failed to remove chrome manifest location: " + error);
  }
}

function uninstall(data, reason) {
  log("uninstalled");
}
