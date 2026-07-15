/* Preferences pane logic (S1-06, S1-07). Runs in the Zotero settings window,
 * where the shared `Zotero` object is available. All plugin logic is reached
 * through the settings API published on Zotero.ZoteroAgent by plugin.ts —
 * this script does DOM wiring only.
 *
 * Endpoint, model and active provider persist via the `preference="…"`
 * attribute binding in preferences.xhtml; the API key goes through the
 * credential store and is never written to a pref-bound field. */

(function () {
  "use strict";

  const doc = document;
  const $ = (id) => doc.getElementById(id);

  /* initAsync (credential-store probe, retrieval init, pane registration) can
   * still be running when this pane first loads, so Zotero.ZoteroAgent may
   * not exist yet. Poll briefly instead of failing permanently — otherwise
   * every control silently stays dead for the lifetime of this pane. */
  let api = null;

  function ensureReady(onReady) {
    /* Zotero loads the pane's scripts via loadSubScript BEFORE parsing and
     * inserting the pane's own XHTML fragment into the document (see
     * preferences.js _loadPane in Zotero core) — so on every load, every
     * element from preferences.xhtml, including "za-not-ready" itself, is
     * genuinely absent from the DOM at the moment this script first runs.
     * Wait for the fragment root too, not just the settings API. */
    const apiReady = () => Zotero.ZoteroAgent && Zotero.ZoteroAgent.settings;
    const domReady = () => doc.getElementById("zotero-agent-prefs") != null;
    const found = () => domReady() && apiReady();
    const existing = found();
    if (existing) {
      api = apiReady();
      onReady();
      return;
    }
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      const ready = found();
      if (ready) {
        clearInterval(timer);
        api = apiReady();
        const note = $("za-not-ready");
        if (note) note.hidden = true;
        onReady();
      } else if (attempts >= 40) {
        clearInterval(timer);
        const note = $("za-not-ready");
        if (note) note.hidden = false;
      }
    }, 250);
    window.addEventListener("unload", () => clearInterval(timer));
  }

  /* ---------- Provider section ---------- */

  function initProviderSection() {
    const popup = $("za-provider-popup");
    const menulist = $("za-provider");
    for (const { id, label } of api.listProviders()) {
      const item = doc.createXULElement("menuitem");
      item.setAttribute("label", label);
      item.setAttribute("value", id);
      popup.appendChild(item);
    }
    // Re-apply the pref-bound value now that the popup has items.
    if (menulist.getAttribute("preference")) {
      const current = Zotero.Prefs.get(
        "extensions.zotero-agent.provider.active",
        true,
      );
      if (current) menulist.value = current;
    }

    initApiKeyField();
    initTestConnection();
  }

  async function refreshKeyNote() {
    const note = $("za-key-storage-note");
    const hasKey = await api.hasApiKey();
    const secure = api.credentialStorageKind() === "login-manager";
    if (!hasKey) {
      note.textContent = "No API key saved.";
    } else if (secure) {
      note.textContent =
        "The key is stored securely in Zotero's password storage.";
    } else {
      note.textContent =
        "The key is stored in Zotero's preferences file on this computer.";
    }
  }

  function initApiKeyField() {
    const input = $("za-apikey");
    const clearButton = $("za-apikey-clear");

    api.hasApiKey().then((hasKey) => {
      if (hasKey) input.placeholder = "•••••• (saved)";
    });
    refreshKeyNote();

    input.addEventListener("change", async () => {
      await api.setApiKey(input.value);
      if (input.value !== "") {
        input.value = "";
        input.placeholder = "•••••• (saved)";
      } else {
        input.placeholder = "Leave empty for local services";
      }
      refreshKeyNote();
    });

    clearButton.addEventListener("click", async () => {
      await api.clearApiKey();
      input.value = "";
      input.placeholder = "Leave empty for local services";
      refreshKeyNote();
    });
  }

  function initTestConnection() {
    const button = $("za-test-connection");
    const result = $("za-test-result");
    button.addEventListener("click", async () => {
      button.disabled = true;
      result.textContent = "Testing…";
      result.className = "za-status";
      try {
        const outcome = await api.testConnection();
        result.textContent = outcome.message;
        result.className = outcome.ok
          ? "za-status za-ok"
          : "za-status za-error";
      } finally {
        button.disabled = false;
      }
    });
  }

  /* ---------- Color semantics section (S1-07) ---------- */

  // Set inside initColorSection(), once `api` is ready — this used to run at
  // script load time and threw on the null placeholder, aborting the whole
  // script before ensureReady() ever got a chance to run.
  let mapping = {};

  function colorName(hex) {
    const colors = api.standardColors();
    for (const name of Object.keys(colors)) {
      if (colors[name] === hex) return name;
    }
    return hex;
  }

  function persist() {
    api.setColorSemantics(mapping);
  }

  function removeCategory(color, category) {
    mapping[color] = (mapping[color] || []).filter((c) => c !== category);
    persist();
    renderColorRows();
  }

  function addCategory(color, category) {
    const value = category.trim();
    if (!value) return;
    const list = mapping[color] || (mapping[color] = []);
    if (!list.includes(value)) list.push(value);
    persist();
    renderColorRows();
  }

  /* Rename a category everywhere it is used (categories are global labels). */
  function renameCategory(oldName, newName) {
    const value = newName.trim();
    if (!value || value === oldName) return;
    for (const color of Object.keys(mapping)) {
      mapping[color] = mapping[color].map((c) => (c === oldName ? value : c));
    }
    persist();
    renderColorRows();
  }

  function makeChip(color, category) {
    const chip = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
    chip.className = "za-chip";

    const label = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
    label.textContent = category;
    label.title = "Double-click to rename";
    label.addEventListener("dblclick", () => {
      const input = doc.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "input",
      );
      input.type = "text";
      input.value = category;
      input.className = "za-chip-edit";
      chip.replaceChild(input, label);
      input.focus();
      input.select();
      const commit = () => renameCategory(category, input.value);
      input.addEventListener("change", commit);
      input.addEventListener("blur", commit);
      input.addEventListener("keydown", (event) => {
        if (event.key === "Escape") renderColorRows();
      });
    });

    const remove = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "button",
    );
    remove.textContent = "×";
    remove.className = "za-chip-remove";
    remove.title = "Remove this meaning";
    remove.addEventListener("click", () => removeCategory(color, category));

    chip.appendChild(label);
    chip.appendChild(remove);
    return chip;
  }

  function makeColorRow(color) {
    const row = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    row.className = "za-color-row";

    const swatch = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
    swatch.className = "za-swatch";
    swatch.style.backgroundColor = color;
    swatch.title = color;
    row.appendChild(swatch);

    const name = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
    name.className = "za-color-name";
    name.textContent = colorName(color);
    row.appendChild(name);

    const chips = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
    chips.className = "za-chips";
    for (const category of mapping[color] || []) {
      chips.appendChild(makeChip(color, category));
    }
    row.appendChild(chips);

    const input = doc.createElementNS("http://www.w3.org/1999/xhtml", "input");
    input.type = "text";
    input.className = "za-add-input";
    input.placeholder = "Add meaning…";
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        addCategory(color, input.value);
      }
    });
    input.addEventListener("change", () => addCategory(color, input.value));
    row.appendChild(input);

    return row;
  }

  function renderColorRows() {
    const container = $("za-color-rows");
    container.replaceChildren();
    // Standard colors first (stable order), then any custom hex entries.
    const standard = Object.values(api.standardColors());
    const custom = Object.keys(mapping).filter((c) => !standard.includes(c));
    for (const color of [...standard, ...custom]) {
      if (!(color in mapping)) mapping[color] = [];
      container.appendChild(makeColorRow(color));
    }
  }

  function initColorSection() {
    mapping = api.getColorSemantics();
    renderColorRows();
    $("za-colors-reset").addEventListener("click", () => {
      mapping = api.resetColorSemantics();
      renderColorRows();
    });
  }

  /* ---------- Local index section (S3-08) ---------- */

  function formatIndexState(s) {
    switch (s.state) {
      case "rebuilding":
        return s.progress
          ? `Rebuilding — ${s.progress.done} of ${s.progress.total}`
          : "Rebuilding…";
      case "indexing":
        return "Updating…";
      case "needs-rebuild":
        return "Needs rebuild";
      default:
        return "Up to date";
    }
  }

  function initIndexSection() {
    const coverage = $("za-index-coverage");
    const updated = $("za-index-updated");
    const progress = $("za-index-progress");
    const rebuildButton = $("za-index-rebuild");
    const cancelButton = $("za-index-cancel");
    const status = $("za-index-status");
    if (!coverage || !api.indexStatus) return;

    function refresh() {
      const s = api.indexStatus();
      if (!s) {
        coverage.textContent = "The local index is unavailable.";
        updated.textContent = "";
        status.textContent = "";
        rebuildButton.disabled = true;
        return;
      }
      coverage.textContent =
        s.totalItems != null
          ? `${s.indexedItems} of ${s.totalItems} items indexed`
          : `${s.indexedItems} items indexed`;
      updated.textContent = s.lastUpdated
        ? `Last updated: ${new Date(s.lastUpdated).toLocaleString()}`
        : "Not built yet.";
      status.textContent = formatIndexState(s);
      status.className =
        s.state === "needs-rebuild" ? "za-status za-error" : "za-status";

      const rebuilding = s.state === "rebuilding";
      progress.hidden = !rebuilding;
      cancelButton.hidden = !rebuilding;
      if (rebuilding && s.progress && s.progress.total > 0) {
        progress.max = s.progress.total;
        progress.value = s.progress.done;
      }
      rebuildButton.disabled = rebuilding;
      rebuildButton.setAttribute(
        "label",
        s.state === "needs-rebuild"
          ? "Rebuild index (needed)"
          : "Rebuild index",
      );
    }

    rebuildButton.addEventListener("click", () => {
      api.rebuildIndex();
      refresh();
    });
    cancelButton.addEventListener("click", () => {
      api.cancelIndexRebuild();
      refresh();
    });

    refresh();
    const interval = setInterval(refresh, 1000);
    window.addEventListener("unload", () => clearInterval(interval));
  }

  ensureReady(() => {
    initProviderSection();
    initColorSection();
    initIndexSection();
  });
})();
