/** Reader-toolbar button injection (S5-08).
 *
 * Injects an "AI Highlight" button into every Zotero PDF reader toolbar so
 * users can trigger auto-highlight directly from the reader instead of only
 * via the right-click context menu (FR-004, FR-041). Pure DOM injection —
 * no Zotero business logic lives here; the host callback wires the click to
 * the workflow orchestrator through plugin.ts.
 *
 * Architecture invariant: this module lives under src/zotero/ because it
 * directly accesses the Zotero.Reader global and manipulates reader iframe
 * DOMs. It does NOT import from providers/, retrieval/, or workflows/.
 */

import type { ItemRef } from "./types";

// ── Internal Zotero reader types (defensive cast, same pattern as adapter.ts) ──

interface InternalReader {
  _primaryView?: {
    _iframeWindow?: Window;
  };
}

interface ReaderInfo {
  itemID: number;
  _initPromise?: Promise<unknown>;
  _waitForReader?: () => Promise<void>;
  _internalReader?: InternalReader;
}

interface ReaderManager {
  _readers?: ReaderInfo[];
}

// ── Public interface ──

export interface ReaderToolbarHost {
  /** Called when the user clicks the AI Highlight button in a reader toolbar.
   * Receives the top-level item ref so the host can start the auto-highlight
   * workflow without needing to look it up again. */
  onHighlightClick(ref: ItemRef): void;
}

// ── Constants ──

const BUTTON_ID = "zotero-agent-highlight-btn";
const POLL_INTERVAL_MS = 800;

/** SVG sparkle icon to distinguish the AI button from native annotation tools. */
const BUTTON_HTML = `
<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5">
  <path d="M8 1.5l.9 2.7a3 3 0 0 0 1.9 1.9l2.7.9-2.7.9a3 3 0 0 0-1.9 1.9L8 12.5l-.9-2.7a3 3 0 0 0-1.9-1.9L2.5 7l2.7-.9a3 3 0 0 0 1.9-1.9L8 1.5z"/>
  <path d="M12.5 1l.3 1.2c.15.5.55.9 1 1L15 3.5l-1.2.3c-.45.1-.85.5-1 1L12.5 6l-.3-1.2a1.5 1.5 0 0 0-1-1L10 3.5l1.2-.3c.45-.1.85-.5 1-1L12.5 1z"/>
</svg>
<span>AI Highlight</span>`;

// ── Helpers ──

/** Look up the top-level regular item for a reader's attachment. */
function topLevelRef(reader: ReaderInfo): ItemRef | null {
  try {
    const attachment = Zotero.Items.get(reader.itemID);
    if (!attachment) return null;
    const top = attachment.topLevelItem ?? attachment;
    if (!top.isRegularItem()) return null;
    return { libraryID: top.libraryID, key: top.key };
  } catch {
    return null;
  }
}

/** Inject the AI Highlight button into the given reader's toolbar iframe.
 * Idempotent — safe to call on already-injected readers. Returns true when
 * the button is present after the call (either newly created or previously
 * existing). */
function injectButton(
  reader: ReaderInfo,
  onClick: () => void,
  logger: {
    log: (msg: string) => void;
    error: (msg: string, err?: unknown) => void;
  },
): boolean {
  const iframeWin = reader._internalReader?._primaryView?._iframeWindow;
  if (!iframeWin) return false;

  try {
    const doc = iframeWin.document;
    if (doc.getElementById(BUTTON_ID)) return true; // already injected

    // Zotero's reader toolbar has #toolbarViewer with left/right sections.
    // The annotation tools live in #toolbarViewerRight; we prepend our button
    // there so it appears before the native tools.
    const toolbarRight = doc.getElementById("toolbarViewerRight");
    if (!toolbarRight) return false;

    // Firefox chrome documents don't have a flexible enough innerHTML setter
    // on XHTML documents, so we build the button with DOM APIs.
    const container = doc.createElement("div");
    container.id = BUTTON_ID;
    container.className = "zotero-agent-toolbar-button";
    container.setAttribute(
      "title",
      "AI Highlight — automatically highlight key passages",
    );

    // Parse the SVG+text HTML into DOM nodes via a temporary container.
    const tmp = doc.createElement("div");
    tmp.innerHTML = BUTTON_HTML;

    // Move children from tmp into container.
    while (tmp.firstChild) {
      container.appendChild(tmp.firstChild);
    }

    // Style the button to look like the native toolbar buttons.
    container.style.cssText =
      "display:inline-flex;align-items:center;gap:4px;cursor:pointer;" +
      "padding:2px 6px;border-radius:3px;font-size:12px;color:var(--fill-primary,#2b2b2b);" +
      "border:1px solid transparent;background:transparent;";

    // Hover effect via mouse events (avoiding stylesheet injection complexity).
    container.addEventListener("mouseenter", () => {
      container.style.background = "var(--fill-quarternary, #e0e0e0)";
    });
    container.addEventListener("mouseleave", () => {
      container.style.background = "transparent";
    });

    container.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });

    toolbarRight.insertBefore(container, toolbarRight.firstChild);
    logger.log(
      `injected AI Highlight button into reader for item ${reader.itemID}`,
    );
    return true;
  } catch (err) {
    // Cross-origin or dead-object iframe — normal during tab teardown.
    return false;
  }
}

// ── Public API ──

/**
 * Start watching for Zotero PDF readers and inject an "AI Highlight" button
 * into each reader's toolbar. New readers are detected automatically; existing
 * readers that open later also get the button.
 *
 * Returns a cleanup function that stops the watcher and removes injected
 * buttons from all known readers.
 */
export function injectReaderToolbars(
  _window: _ZoteroTypes.MainWindow,
  host: ReaderToolbarHost,
  logger: {
    log: (msg: string) => void;
    error: (msg: string, err?: unknown) => void;
  },
): () => void {
  // Track which reader itemIDs we've already injected into so we don't
  // re-inject after a reader reload or poll cycle.
  const injected = new Set<number>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const tryInjectAll = () => {
    if (stopped) return;
    const manager = Zotero.Reader as unknown as ReaderManager;
    const readers = manager._readers;
    if (!readers) return;

    for (const reader of readers) {
      if (injected.has(reader.itemID)) continue;
      // Wait for the reader's initialisation to settle before touching its
      // iframe — the toolbar may not be in the DOM yet.
      const ready = reader._initPromise ?? Promise.resolve();
      ready
        .then(() => reader._waitForReader?.())
        .catch(() => {}) // reader teardown races
        .then(() => {
          if (stopped || injected.has(reader.itemID)) return;
          const ref = topLevelRef(reader);
          if (!ref) return;
          const ok = injectButton(
            reader,
            () => host.onHighlightClick(ref),
            logger,
          );
          if (ok) injected.add(reader.itemID);
        })
        .catch(() => {}); // dead reader — ignore
    }

    // Prune stale entries: readers that have been closed.
    const activeIDs = new Set(readers.map((r) => r.itemID));
    for (const id of injected) {
      if (!activeIDs.has(id)) injected.delete(id);
    }
  };

  // Initial sweep — some readers may already be open when the window loads.
  tryInjectAll();

  // Poll for new readers. MutationObserver-based detection is tempting but
  // fragile: Zotero's tab container is complex XUL, and the reader iframe is
  // deeply nested. Polling Zotero.Reader._readers is simple and reliable.
  timer = setInterval(tryInjectAll, POLL_INTERVAL_MS);

  return () => {
    stopped = true;
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    // Remove injected buttons from every reader we touched.
    const manager = Zotero.Reader as unknown as ReaderManager;
    for (const reader of manager._readers ?? []) {
      try {
        const doc =
          reader._internalReader?._primaryView?._iframeWindow?.document;
        if (!doc) continue;
        const btn = doc.getElementById(BUTTON_ID);
        if (btn) btn.remove();
      } catch {
        // dead iframe — nothing to clean up.
      }
    }
    injected.clear();
  };
}
