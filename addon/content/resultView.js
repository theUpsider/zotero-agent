/* Result view window (S2-05; FR-091..FR-098, NFR-003/006/018). Runs in a
 * plugin chrome window opened by plugin.ts. All plugin logic is reached
 * through the workflow API published on Zotero.ZoteroAgent — this script does
 * DOM wiring only. Errors arrive pre-mapped as plain-language messages
 * (EIR-014); raw errors and secrets never reach this scope. */

(function () {
  "use strict";

  /* The window is opened from the Zotero main window, so the shared Zotero
   * object is reachable via the opener; the XPCOM service is the fallback
   * when the opener is already gone. */
  const Zotero =
    (window.opener && window.opener.Zotero) ||
    Components.classes["@zotero.org/Zotero;1"].getService(Components.interfaces.nsISupports)
      .wrappedJSObject;

  const doc = document;
  const $ = (id) => doc.getElementById(id);

  /* initAsync (credential-store probe, retrieval init, orchestrator wiring)
   * can still be running when this window opens, so Zotero.ZoteroAgent may
   * not exist yet. Poll briefly instead of failing permanently — a one-shot
   * check here previously meant every button silently stayed dead and the
   * "view-ready" handshake below never fired, so plugin.ts would time out
   * and start the workflow with nobody listening. */
  let api = null;

  function ensureReady(onReady) {
    const found = () => Zotero && Zotero.ZoteroAgent && Zotero.ZoteroAgent.workflows;
    const existing = found();
    if (existing) {
      api = existing;
      onReady();
      return;
    }
    const note = $("za-not-ready");
    let attempts = 0;
    // Must settle before plugin.ts's own 5s "view-ready" wait
    // (see openResultView) gives up and starts the workflow blind — a longer
    // cap here would silently reopen the original empty-modal race.
    const maxAttempts = 18;
    const timer = setInterval(() => {
      attempts += 1;
      const ready = found();
      if (ready) {
        clearInterval(timer);
        api = ready;
        if (note) note.hidden = true;
        onReady();
      } else if (attempts >= maxAttempts) {
        clearInterval(timer);
        if (note) note.hidden = false;
      }
    }, 250);
    window.addEventListener("unload", () => clearInterval(timer));
  }

  let session = null;
  let hasSections = false;

  /* ---------- rendering helpers ---------- */

  function setStatus(text) {
    $("za-status").textContent = text;
  }

  function setProgress(fraction) {
    const bar = $("za-progress");
    bar.hidden = false;
    if (typeof fraction === "number") {
      bar.value = Math.round(fraction * 100);
    } else {
      bar.removeAttribute("value"); // indeterminate
    }
  }

  function setRunningUi(running) {
    $("za-cancel").hidden = !running;
    $("za-save").disabled = running || !api.lastResult();
    $("za-copy").disabled = running || !api.lastResult();
    $("za-rerun").disabled = running;
    $("za-prompt-run").disabled = running;
    if (!running) $("za-progress").hidden = true;
  }

  function clearResults() {
    $("za-results").replaceChildren();
    $("za-error").hidden = true;
    $("za-truncation-note").hidden = true;
    $("za-save-result").textContent = "";
    hasSections = false;
  }

  function appendSection(title, markdown) {
    const container = doc.createElement("div");
    container.className = "za-section";
    if (title) {
      const heading = doc.createElement("h2");
      heading.textContent = title;
      container.appendChild(heading);
    }
    const body = doc.createElement("div");
    body.className = "za-section-body";
    /* renderMarkdown HTML-escapes all input before applying markup, so model
     * output cannot inject markup here. */
    body.innerHTML = api.renderMarkdown(markdown);
    container.appendChild(body);
    $("za-results").appendChild(container);
    hasSections = true;
  }

  function showHeader() {
    session = api.getSession();
    const titles = session ? session.items.map((i) => i.title || i.key).join(", ") : "";
    if (session && session.mode === "free-prompt") {
      $("za-run-title").textContent = "Free prompt";
      $("za-prompt-pane").hidden = false;
    } else if (session) {
      $("za-run-title").textContent = session.title || session.templateLabel || "Analysis";
      $("za-prompt-pane").hidden = true;
    }
    $("za-item-list").textContent = titles;
  }

  /* ---------- workflow events ---------- */

  function onEvent(event) {
    switch (event.type) {
      case "started":
        clearResults();
        setRunningUi(true);
        setStatus("Starting…");
        setProgress(undefined);
        break;
      case "progress":
        setStatus(event.message);
        setProgress(event.fraction);
        break;
      case "item-completed":
        appendSection(event.section.title, event.section.markdown);
        break;
      case "completed":
        /* Template sections streamed in via item-completed; a free-prompt
         * answer arrives only here. */
        if (!hasSections) appendSection("", event.result.content);
        if (event.result.truncationNotice) {
          const note = $("za-truncation-note");
          note.textContent = event.result.truncationNotice;
          note.hidden = false;
        }
        setStatus("Done.");
        setRunningUi(false);
        break;
      case "failed": {
        const block = $("za-error");
        block.textContent = event.message;
        block.hidden = false;
        setStatus("Failed.");
        setRunningUi(false);
        break;
      }
      case "cancelled":
        setStatus("Cancelled.");
        setRunningUi(false);
        break;
    }
  }

  /* ---------- actions ---------- */

  function currentItems() {
    return session ? session.items.map((i) => ({ libraryID: i.libraryID, key: i.key })) : [];
  }

  function runFreePrompt() {
    const input = $("za-prompt-input");
    const error = $("za-prompt-error");
    error.textContent = "";
    const outcome = api.startFreePrompt(input.value, currentItems());
    if (!outcome.ok) error.textContent = outcome.message;
  }

  function rerun() {
    if (!session) return;
    if (session.mode === "free-prompt") {
      runFreePrompt();
    } else if (session.templateId) {
      const outcome = api.startTemplate(session.templateId, currentItems());
      if (!outcome.ok) setStatus(outcome.message);
    } else {
      /* Named scholarly workflow (Analyze papers, Suggest tags, …). */
      const outcome = api.startWorkflow(session.mode, currentItems());
      if (!outcome.ok) setStatus(outcome.message);
    }
  }

  async function saveAsNotes() {
    const button = $("za-save");
    button.disabled = true;
    try {
      const outcome = await api.saveAsNotes();
      const parts = [];
      if (outcome.saved.length > 0) {
        parts.push(
          outcome.saved.length === 1
            ? "Note saved."
            : `${outcome.saved.length} notes saved.`,
        );
      }
      for (const failure of outcome.failed) {
        parts.push(`Saving failed for ${failure.itemKey}: ${failure.message}`);
      }
      $("za-save-result").textContent = parts.join(" ") || "Nothing to save yet.";
    } finally {
      button.disabled = false;
    }
  }

  function copyResult() {
    const result = api.lastResult();
    if (!result) return;
    Zotero.Utilities.Internal.copyTextToClipboard(result.content);
    $("za-save-result").textContent = "Copied to clipboard.";
  }

  /* ---------- wiring ---------- */

  ensureReady(() => {
    $("za-prompt-run").addEventListener("click", runFreePrompt);
    $("za-prompt-input").addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) runFreePrompt();
    });
    $("za-cancel").addEventListener("click", () => api.cancel());
    $("za-save").addEventListener("click", saveAsNotes);
    $("za-copy").addEventListener("click", copyResult);
    $("za-rerun").addEventListener("click", rerun);

    const unsubscribe = api.subscribe(onEvent);
    window.addEventListener("unload", unsubscribe);

    /* Tells plugin.ts it is safe to start a workflow now: events emitted
     * before this point (e.g. the synchronous "started" event) would
     * otherwise be lost and the modal would appear empty. */
    window.dispatchEvent(new Event("zotero-agent-view-ready"));

    /* plugin.ts dispatches this when the user starts a new workflow while the
     * window is already open (single reusable window, FR-098). */
    window.addEventListener("zotero-agent-session-changed", () => {
      showHeader();
      if (!api.isRunning()) {
        clearResults();
        setStatus("");
        setRunningUi(false);
      }
    });

    showHeader();
    if (api.isRunning()) {
      setRunningUi(true);
      setStatus("Running…");
      setProgress(undefined);
    } else {
      /* The run can finish before this window's readiness poll succeeds
       * (plugin.ts's ready-event wait times out and starts blind) — every
       * "completed" event fires with nobody subscribed yet. Backfill from
       * lastResult() here instead of leaving the window empty. */
      const result = api.lastResult();
      if (result) {
        for (const section of result.sections) {
          appendSection(section.title, section.markdown);
        }
        if (!hasSections) appendSection("", result.content);
        if (result.truncationNotice) {
          const note = $("za-truncation-note");
          note.textContent = result.truncationNotice;
          note.hidden = false;
        }
        setStatus("Done.");
      } else {
        setStatus(session && session.mode === "free-prompt" ? "Enter a prompt to start." : "");
      }
      setRunningUi(false);
    }
  });
})();
