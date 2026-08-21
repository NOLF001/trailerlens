// 열광 지점 직접 편집 — 자동 탐지 위에 사용자가 손댄 내용을 덮는 규칙.
// 자동 지점은 재계산할 때마다 경계가 미세하게 달라지므로, 편집은 id가 아니라
// "시간 구간 겹침"으로 다시 이어 붙습니다.

import { describe, expect, it } from "vitest";
import { buildHypeMoments, type HypeCommentInput } from "@/lib/analysis/hype";
import type { HeatSegment, MomentEdit } from "@/lib/types";

function comment(partial: Partial<HypeCommentInput> & { id: string }): HypeCommentInput {
  return { author: "t", text: "", likeCount: 0, timestamps: [], topics: [], ...partial };
}

function heatmap(durationSeconds: number, peaks: number[]): HeatSegment[] {
  const segments: HeatSegment[] = [];
  for (let t = 0; t < durationSeconds; t += 0.9) {
    const nearest = Math.min(...peaks.map((p) => Math.abs(p - t)));
    segments.push({ startTime: t, endTime: t + 0.9, value: Math.max(0.05, 1 - nearest / 10) });
  }
  return segments;
}

function edit(partial: Partial<MomentEdit> & { id: string }): MomentEdit {
  return {
    startSec: 0,
    endSec: 0,
    description: null,
    origin: "manual",
    hidden: false,
    ...partial,
  };
}

const DURATION = 120;
const COMMENTS = [
  comment({ id: "c1", text: "goosebumps", likeCount: 50, timestamps: [30] }),
  comment({ id: "c2", text: "insane", likeCount: 30, timestamps: [31] }),
  comment({ id: "c3", text: "so good", likeCount: 10, timestamps: [90] }),
];
const HEATMAP = heatmap(DURATION, [30, 90]);

function build(edits: MomentEdit[] = []) {
  return buildHypeMoments({
    comments: COMMENTS,
    heatmap: HEATMAP,
    durationSeconds: DURATION,
    edits,
  });
}

describe("직접 추가한 지점", () => {
  it("자동 탐지 결과에 더해져 함께 나온다", () => {
    const before = build();
    const after = build([edit({ id: "e1", startSec: 60, endSec: 70 })]);

    expect(after.length).toBe(before.length + 1);
    const manual = after.find((m) => m.origin === "manual");
    expect(manual).toMatchObject({ startSec: 60, endSec: 70, evidence: "manual" });
    // 자동 지점은 그대로 남아 있어야 합니다.
    expect(after.filter((m) => m.origin === "auto").length).toBe(before.length);
  });

  it("설명과 편집 id를 그대로 달고 나온다", () => {
    const [manual] = build([
      edit({ id: "e1", startSec: 60, endSec: 70, description: "말 타고 달리는 장면" }),
    ]).filter((m) => m.origin === "manual");

    expect(manual.description).toBe("말 타고 달리는 장면");
    expect(manual.editId).toBe("e1");
  });

  it("구간 안의 댓글을 근거로 집계한다", () => {
    const [manual] = build([edit({ id: "e1", startSec: 28, endSec: 34 })]).filter(
      (m) => m.origin === "manual",
    );
    // 30초·31초를 언급한 댓글 두 개가 이 구간에 들어옵니다.
    expect(manual.mentionCount).toBe(2);
    expect(manual.comments.map((c) => c.id).sort()).toEqual(["c1", "c2"]);
  });

  it("영상 길이를 넘는 구간은 잘라낸다", () => {
    const [manual] = build([edit({ id: "e1", startSec: 110, endSec: 999 })]).filter(
      (m) => m.origin === "manual",
    );
    expect(manual.endSec).toBe(DURATION);
  });

  it("같은 장면이 자동·수동으로 두 번 뜨지 않는다", () => {
    // 30초 근처는 자동으로도 잡히는 구간입니다. 사용자가 직접 지정하면
    // 사용자 쪽만 남아야 합니다.
    const after = build([edit({ id: "e1", startSec: 28, endSec: 34 })]);
    const overlapping = after.filter((m) => m.startSec < 34 && m.endSec > 28);
    expect(overlapping.length).toBe(1);
    expect(overlapping[0].origin).toBe("manual");
  });
});

describe("자동 지점에 붙인 편집", () => {
  it("겹치는 구간을 찾아 설명을 달아준다", () => {
    const auto = build().find((m) => m.startSec <= 30 && m.endSec >= 30);
    expect(auto).toBeDefined();

    // 편집 당시보다 경계가 살짝 밀려도 겹치기만 하면 다시 붙어야 합니다.
    const after = build([
      edit({
        id: "e1",
        origin: "auto",
        startSec: auto!.startSec + 1,
        endSec: auto!.endSec - 1,
        description: "칼을 뽑는 순간",
      }),
    ]);

    const same = after.find((m) => m.startSec <= 30 && m.endSec >= 30);
    expect(same?.description).toBe("칼을 뽑는 순간");
    expect(same?.origin).toBe("auto");
  });

  it("숨김 표시한 자동 지점은 목록에서 빠진다", () => {
    const auto = build().find((m) => m.startSec <= 30 && m.endSec >= 30)!;
    const after = build([
      edit({
        id: "e1",
        origin: "auto",
        startSec: auto.startSec,
        endSec: auto.endSec,
        hidden: true,
      }),
    ]);

    expect(after.some((m) => m.startSec < auto.endSec && m.endSec > auto.startSec)).toBe(
      false,
    );
  });

  it("숨긴 수동 지점은 아예 나오지 않는다", () => {
    const after = build([
      edit({ id: "e1", startSec: 60, endSec: 70, hidden: true }),
    ]);
    expect(after.some((m) => m.origin === "manual")).toBe(false);
  });
});

describe("순위", () => {
  it("편집이 없으면 기존 동작과 같다", () => {
    expect(build([])).toEqual(build());
  });

  it("rank는 항상 1부터 빈틈없이 다시 매겨진다", () => {
    const after = build([
      edit({ id: "e1", startSec: 60, endSec: 70 }),
      edit({ id: "e2", startSec: 100, endSec: 110 }),
    ]);
    expect(after.map((m) => m.rank)).toEqual(after.map((_, i) => i + 1));
  });
});
