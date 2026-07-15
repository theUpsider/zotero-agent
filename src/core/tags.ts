/** Case-insensitive tag merge (S4-05; FR-064, NFR-020, BR-003). Pure module —
 * no Zotero access, fully unit-testable. Existing casing wins; a suggested tag
 * that differs from an existing (or an already-accepted) tag only by case or
 * surrounding whitespace is a duplicate and is dropped, so re-running a tag
 * workflow after a failure never produces duplicate tags (S4-06). */

export interface TagMerge {
  /** Existing tags followed by the newly accepted ones, in order. */
  merged: string[];
  /** Only the tags that were not already present (case-insensitively). */
  added: string[];
}

export function mergeTags(existing: string[], suggested: string[]): TagMerge {
  const seen = new Set(existing.map((tag) => tag.trim().toLowerCase()));
  const added: string[] = [];
  for (const raw of suggested) {
    const tag = raw.trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    added.push(tag);
  }
  return { merged: [...existing, ...added], added };
}
