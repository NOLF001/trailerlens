import { describe, expect, it } from "vitest";
import { assignDuplicateGroups } from "@/lib/analysis/duplicates";

describe("assignDuplicateGroups", () => {
  it("groups identical normalized text and counts extras", () => {
    const { groups, duplicateCount } = assignDuplicateGroups([
      { id: "a", normalizedText: "와 이건 진짜 미쳤다" },
      { id: "b", normalizedText: "와 이건 진짜 미쳤다" },
      { id: "c", normalizedText: "와 이건 진짜 미쳤다" },
      { id: "d", normalizedText: "완전 다른 댓글입니다" },
    ]);
    expect(groups.get("a")).toBeDefined();
    expect(groups.get("a")).toBe(groups.get("b"));
    expect(groups.get("b")).toBe(groups.get("c"));
    expect(groups.has("d")).toBe(false);
    expect(duplicateCount).toBe(2); // 3 copies → 2 extras
  });

  it("ignores trivial short texts", () => {
    const { groups } = assignDuplicateGroups([
      { id: "a", normalizedText: "굿" },
      { id: "b", normalizedText: "굿" },
    ]);
    expect(groups.size).toBe(0);
  });
});
