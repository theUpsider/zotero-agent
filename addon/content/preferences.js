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

  const api = Zotero.ZoteroAgent && Zotero.ZoteroAgent.settings;
  if (!api) {
    const note = $("za-not-ready");
    if (note) note.hidden = false;
    return;
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
      const current = Zotero.Prefs.get("extensions.zotero-agent.provider.active", true);
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
      note.textContent = "The key is stored securely in Zotero's password storage.";
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

    clearButton.addEventListener("command", async () => {
      await api.clearApiKey();
      input.value = "";
      input.placeholder = "Leave empty for local services";
      refreshKeyNote();
    });
  }

  function initTestConnection() {
    const button = $("za-test-connection");
    const result = $("za-test-result");
    button.addEventListener("command", async () => {
      button.disabled = true;
      result.textContent = "Testing…";
      result.className = "za-status";
      try {
        const outcome = await api.testConnection();
        result.textContent = outcome.message;
        result.className = outcome.ok ? "za-status za-ok" : "za-status za-error";
      } finally {
        button.disabled = false;
      }
    });
  }

  /* ---------- Color semantics section (S1-07) ---------- */

  let mapping = api.getColorSemantics();

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
      const input = doc.createElementNS("http://www.w3.org/1999/xhtml", "input");
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

    const remove = doc.createElementNS("http://www.w3.org/1999/xhtml", "button");
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
    renderColorRows();
    $("za-colors-reset").addEventListener("command", () => {
      mapping = api.resetColorSemantics();
      renderColorRows();
    });
  }

  initProviderSection();
  initColorSection();
})();
