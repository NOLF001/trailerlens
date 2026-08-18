import { describe, expect, it } from "vitest";
import {
  buildHypeMoments,
  buildReactionGroups,
  detectReactions,
  hypeScore,
  type HypeCommentInput,
} from "@/lib/analysis/hype";
import type { HeatSegment } from "@/lib/types";

function comment(partial: Partial<HypeCommentInput> & { id: string }): HypeCommentInput {
  return {
    author: "tester",
    text: "",
    likeCount: 0,
    timestamps: [],
    topics: [],
    ...partial,
  };
}

/** 0.9초 간격 히트맵. peakAt 근처에서 값이 최대가 됩니다. */
function heatmap(durationSeconds: number, peaks: number[]): HeatSegment[] {
  const segments: HeatSegment[] = [];
  for (let t = 0; t < durationSeconds; t += 0.9) {
    const nearest = Math.min(...peaks.map((p) => Math.abs(p - t)));
    segments.push({
      startTime: t,
      endTime: t + 0.9,
      value: Math.max(0.05, 1 - nearest / 10),
    });
  }
  return segments;
}

describe("detectReactions", () => {
  it("영어·한국어 감탄 표현을 모두 잡는다", () => {
    expect(detectReactions("this gave me goosebumps")).toContain("awe");
    expect(detectReactions("와 진짜 소름 돋았다")).toContain("awe");
  });

  it("한 댓글이 여러 유형에 들어갈 수 있다", () => {
    const kinds = detectReactions("still rewatching this masterpiece 😂");
    expect(kinds).toContain("replay");
    expect(kinds).toContain("awe");
    expect(kinds).toContain("humor");
  });

  it("표현이 없으면 빈 배열을 반환한다", () => {
    expect(detectReactions("okay")).toEqual([]);
  });
});

describe("hypeScore", () => {
  it("반응 표현이 없으면 좋아요가 많아도 0이다", () => {
    expect(hypeScore("first", 99999)).toBe(0);
  });

  it("같은 표현이면 좋아요가 많은 쪽이 높다", () => {
    expect(hypeScore("insane", 1000)).toBeGreaterThan(hypeScore("insane", 0));
  });

  it("표현이 강할수록 높다", () => {
    expect(hypeScore("goosebumps", 0)).toBeGreaterThan(hypeScore("lol", 0));
  });
});

describe("buildHypeMoments", () => {
  const DURATION = 90;

  it("영상 시작 구간(재생 시작 아티팩트)은 지점으로 뽑지 않는다", () => {
    const segments = heatmap(DURATION, [0]);
    // 0초 부근이 최대지만 아티팩트이므로 제외되어야 합니다.
    const moments = buildHypeMoments({ comments: [], heatmap: segments, durationSeconds: DURATION });
    expect(moments.every((m) => m.endSec > 2)).toBe(true);
  });

  it("지점끼리 구간이 겹치지 않는다", () => {
    const moments = buildHypeMoments({
      comments: [],
      heatmap: heatmap(DURATION, [30, 45, 70]),
      durationSeconds: DURATION,
    });
    const sorted = [...moments].sort((a, b) => a.startSec - b.startSec);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i]!.startSec).toBeGreaterThanOrEqual(sorted[i - 1]!.endSec);
    }
  });

  it("히트맵 한 칸보다 넓은 최소 구간 폭을 보장한다", () => {
    const moments = buildHypeMoments({
      comments: [],
      heatmap: heatmap(DURATION, [40]),
      durationSeconds: DURATION,
    });
    expect(moments.length).toBeGreaterThan(0);
    expect(moments.every((m) => m.endSec - m.startSec >= 4)).toBe(true);
  });

  it("히트맵만 있으면 근거를 heatmap으로 표시한다", () => {
    const moments = buildHypeMoments({
      comments: [],
      heatmap: heatmap(DURATION, [40]),
      durationSeconds: DURATION,
    });
    expect(moments[0]!.evidence).toBe("heatmap");
    expect(moments[0]!.mentionCount).toBe(0);
  });

  it("구간을 언급한 댓글이 있으면 근거로 붙고 both가 된다", () => {
    const moments = buildHypeMoments({
      comments: [
        comment({ id: "a", text: "0:40 this looks insane", likeCount: 10, timestamps: [40] }),
        comment({ id: "b", text: "0:40 소름", likeCount: 3, timestamps: [40] }),
      ],
      heatmap: heatmap(DURATION, [40]),
      durationSeconds: DURATION,
    });
    const target = moments.find((m) => m.startSec <= 40 && m.endSec >= 40);
    expect(target).toBeDefined();
    expect(target!.evidence).toBe("both");
    expect(target!.comments.length).toBeGreaterThan(0);
  });

  it("시점 하나만 적은 댓글도 근거로 인용한다", () => {
    const moments = buildHypeMoments({
      comments: [comment({ id: "bare", text: "0:40", timestamps: [40] })],
      heatmap: heatmap(DURATION, [40]),
      durationSeconds: DURATION,
    });
    const target = moments.find((m) => m.startSec <= 40 && m.endSec >= 40)!;
    expect(target.comments).toHaveLength(1);
  });

  it("타임스탬프만 나열한 댓글은 인용하지 않지만 언급 수에는 남는다", () => {
    const moments = buildHypeMoments({
      comments: [
        comment({ id: "dump", text: "0:40 0:40 0:41 0:41", timestamps: [40, 41] }),
      ],
      heatmap: heatmap(DURATION, [40]),
      durationSeconds: DURATION,
    });
    const target = moments.find((m) => m.startSec <= 40 && m.endSec >= 40)!;
    expect(target.mentionCount).toBeGreaterThan(0);
    expect(target.comments).toHaveLength(0);
  });

  it("히트맵이 없어도 댓글 타임스탬프만으로 지점을 만든다", () => {
    const moments = buildHypeMoments({
      comments: [
        comment({ id: "a", text: "1:00 goosebumps", likeCount: 5, timestamps: [60] }),
        comment({ id: "b", text: "1:00 미쳤다", likeCount: 2, timestamps: [60] }),
      ],
      heatmap: [],
      durationSeconds: DURATION,
    });
    expect(moments.length).toBeGreaterThan(0);
    expect(moments[0]!.evidence).toBe("comments");
    expect(moments[0]!.heat).toBeNull();
  });
});

describe("buildReactionGroups", () => {
  it("유형별로 묶고 분류되지 않은 댓글 수를 따로 센다", () => {
    const { groups, unclassifiedCount } = buildReactionGroups([
      comment({ id: "1", text: "goosebumps", likeCount: 5 }),
      comment({ id: "2", text: "소름 돋는다", likeCount: 1 }),
      comment({ id: "3", text: "ok" }),
    ]);
    const awe = groups.find((g) => g.kind === "awe");
    expect(awe?.count).toBe(2);
    expect(unclassifiedCount).toBe(1);
  });

  it("예시 댓글은 열광 강도 순으로 정렬된다", () => {
    const { groups } = buildReactionGroups([
      comment({ id: "low", text: "insane", likeCount: 1 }),
      comment({ id: "high", text: "insane trailer", likeCount: 5000 }),
    ]);
    const awe = groups.find((g) => g.kind === "awe")!;
    expect(awe.examples[0]!.id).toBe("high");
  });
});
