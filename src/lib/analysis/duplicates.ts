// Duplicate detection over normalized comment text.
// Comments sharing the same non-trivial canonical form get a duplicateGroupId.

import { createHash } from "node:crypto";

export interface DedupInput {
  id: string;
  normalizedText: string;
}

export interface DedupResult {
  /** commentId → groupId (only for members of groups with 2+ comments). */
  groups: Map<string, string>;
  duplicateCount: number; // number of comments beyond the first in each group
}

export function assignDuplicateGroups(comments: DedupInput[]): DedupResult {
  const byText = new Map<string, string[]>();

  for (const c of comments) {
    const key = c.normalizedText;
    if (!key || key.length < 6) continue; // trivial text is not "duplicated"
    const list = byText.get(key) ?? [];
    list.push(c.id);
    byText.set(key, list);
  }

  const groups = new Map<string, string>();
  let duplicateCount = 0;

  for (const [text, ids] of byText) {
    if (ids.length < 2) continue;
    const groupId = createHash("sha1").update(text).digest("hex").slice(0, 16);
    for (const id of ids) groups.set(id, groupId);
    duplicateCount += ids.length - 1;
  }

  return { groups, duplicateCount };
}
