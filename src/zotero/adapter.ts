/** Zotero adapter: the only module that talks to Zotero's JavaScript API
 * (EIR-001..EIR-006). Keeps the rest of the codebase testable without a
 * running Zotero instance. */

export interface SelectedItemSummary {
  key: string;
  title: string;
}

export function getSelectedItemSummaries(window: _ZoteroTypes.MainWindow): SelectedItemSummary[] {
  const pane = window.ZoteroPane;
  const items = pane.getSelectedItems();
  return items.map((item) => ({
    key: item.key,
    title: String(item.getField("title") ?? ""),
  }));
}

export interface AnnotationSummary {
  text: string;
  comment: string;
  color: string;
}

/** Read annotations of an item's PDF attachments (research guide §6.4). */
export async function getItemAnnotations(item: Zotero.Item): Promise<AnnotationSummary[]> {
  const annotations: AnnotationSummary[] = [];
  const attachmentIDs = item.isAttachment() ? [item.id] : item.getAttachments();
  for (const id of attachmentIDs) {
    const attachment = Zotero.Items.get(id);
    if (!attachment.isPDFAttachment()) continue;
    for (const annotation of attachment.getAnnotations()) {
      annotations.push({
        text: annotation.annotationText ?? "",
        comment: annotation.annotationComment ?? "",
        color: annotation.annotationColor ?? "",
      });
    }
  }
  return annotations;
}
