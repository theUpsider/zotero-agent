/** Zotero notifier → plain ItemChangeEvent adapter (S3-06). Annotation, note,
 * and attachment changes all arrive as `"item"` notifier events — Zotero has
 * no separate annotation/note event type — so everything resolves down to
 * the top-level regular item (`Zotero.Item.topLevelItem`) before crossing
 * into retrieval/. Tag rename/merge (`"tag"` type) can't be resolved to
 * specific items without a full re-scan, so it triggers a sweep instead. */

import type { Logger } from "../core/errors";
import type { ItemChangeEvent } from "./types";

const OBSERVED_TYPES: _ZoteroTypes.Notifier.Type[] = ["item", "item-tag", "tag"];
const OBSERVER_ID = "zotero-agent-index";

function topLevelRef(item: Zotero.Item): { libraryID: number; key: string } | null {
  const top = item.topLevelItem ?? item;
  if (!top.isRegularItem()) return null;
  return { libraryID: top.libraryID, key: top.key };
}

/** item-tag notifier ids are `"<itemID>-<tagID>"`. */
function itemIdFromItemTagId(compositeId: string): number | null {
  const itemIdPart = compositeId.split("-")[0];
  const itemId = itemIdPart ? Number(itemIdPart) : NaN;
  return Number.isInteger(itemId) ? itemId : null;
}

export function registerItemChangeObserver(
  onEvent: (event: ItemChangeEvent) => void,
  logger: Logger,
): () => void {
  const notify: _ZoteroTypes.Notifier.Notify = (event, type, ids) => {
    try {
      if (type === "tag") {
        onEvent({ kind: "sweep" });
        return;
      }

      const isRemoval = type === "item" && (event === "delete" || event === "trash");
      for (const rawId of ids) {
        let itemId: number | null;
        if (type === "item") {
          itemId = typeof rawId === "number" ? rawId : Number(rawId);
          if (!Number.isInteger(itemId)) continue;
        } else if (type === "item-tag") {
          itemId = itemIdFromItemTagId(String(rawId));
        } else {
          continue;
        }
        if (itemId === null) continue;

        const item = Zotero.Items.get(itemId);
        if (!item) {
          // Already gone and we have no other way to recover its identity
          // from a bare numeric id — reconcile everything (S3-06/S3-07).
          if (isRemoval) onEvent({ kind: "sweep" });
          continue;
        }
        const ref = topLevelRef(item);
        if (!ref) continue;
        onEvent({ kind: isRemoval ? "removed" : "changed", ref });
      }
    } catch (error) {
      logger.error("index notifier handling failed", error);
    }
  };

  const id = Zotero.Notifier.registerObserver({ notify }, OBSERVED_TYPES, OBSERVER_ID);
  return () => Zotero.Notifier.unregisterObserver(id);
}
