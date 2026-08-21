// 좋아요 순 댓글 분석 — 모든 값이 실제로 센 수치여야 합니다.
// 여기서 검증하는 것은 "숫자가 원본과 맞는가"입니다.

import { describe, expect, it } from "vitest";
import { buildLikedAnalysis, type LikedInput } from "@/lib/analysis/liked";
import type { Topic } from "@/lib/types";

function c(
  id: string,
  likeCount: number,
  text = "",
  topics: Topic[] = [],
  publishedAt = "2025-01-01T00:00:00.000Z",
): LikedInput {
  return { id, author: `a${id}`, text, likeCount, publishedAt, isReply: false, topics };
}

describe("buildLikedAnalysis", () => {
  it("좋아요 내림차순으로 줄을 세운다", () => {
    const r = buildLikedAnalysis([c("1", 5), c("2", 100), c("3", 50)]);
    expect(r.ranking.map((x) => x.id)).toEqual(["2", "3", "1"]);
  });

  it("좋아요가 같으면 먼저 올라온 댓글이 앞에 온다 — 순서가 흔들리지 않게", () => {
    const r = buildLikedAnalysis([
      c("late", 10, "", [], "2025-06-01T00:00:00.000Z"),
      c("early", 10, "", [], "2025-01-01T00:00:00.000Z"),
    ]);
    expect(r.ranking.map((x) => x.id)).toEqual(["early", "late"]);
  });

  it("합계와 비율이 원본과 일치한다", () => {
    const r = buildLikedAnalysis([c("1", 30), c("2", 70)]);
    expect(r.totalComments).toBe(2);
    expect(r.totalLikes).toBe(100);
    expect(r.ranking[0].likeShare).toBeCloseTo(0.7);
    expect(r.ranking[1].likeShare).toBeCloseTo(0.3);
  });

  it("집계 범위를 넘는 댓글은 자르되 전체 합계는 그대로 둔다", () => {
    const input = Array.from({ length: 30 }, (_, i) => c(String(i), i + 1));
    const r = buildLikedAnalysis(input, { scope: 10 });

    expect(r.scope).toBe(10);
    expect(r.totalComments).toBe(30);
    // 전체 좋아요는 1..30 합 = 465, 상위 10개는 21..30 합 = 255
    expect(r.totalLikes).toBe(465);
    expect(r.scopeLikeShare).toBeCloseTo(255 / 465);
  });

  it("좋아요 집중도는 실제 상위 N개 합에서 나온다", () => {
    const input = [c("big", 900), ...Array.from({ length: 100 }, (_, i) => c(`s${i}`, 1))];
    const r = buildLikedAnalysis(input);
    const top10 = r.concentration.find((x) => x.topN === 10)!;
    // 900 + 9 = 909, 전체는 1000
    expect(top10.likeShare).toBeCloseTo(0.909);
  });

  it("댓글이 없으면 0으로 나누지 않는다", () => {
    const r = buildLikedAnalysis([]);
    expect(r.totalLikes).toBe(0);
    expect(r.scopeLikeShare).toBe(0);
    expect(r.ranking).toEqual([]);
  });

  it("좋아요가 전부 0이어도 비율이 NaN이 되지 않는다", () => {
    const r = buildLikedAnalysis([c("1", 0), c("2", 0)]);
    expect(r.ranking.every((x) => x.likeShare === 0)).toBe(true);
    expect(r.scopeLikeShare).toBe(0);
  });
});

describe("그룹 집계", () => {
  it("반응 유형은 댓글 본문 표현으로 판정하고 좋아요 합 순으로 정렬한다", () => {
    const r = buildLikedAnalysis([
      c("1", 100, "this gave me goosebumps"),
      c("2", 10, "can't wait for release"),
      c("3", 50, "absolutely insane"),
    ]);

    const awe = r.reactionGroups.find((g) => g.key === "awe")!;
    expect(awe.count).toBe(2);
    expect(awe.likeTotal).toBe(150);
    // 좋아요 합이 가장 큰 그룹이 맨 앞
    expect(r.reactionGroups[0].key).toBe("awe");
  });

  it("분류 표현이 없는 댓글은 어느 유형에도 넣지 않고 따로 센다", () => {
    const r = buildLikedAnalysis([c("1", 10, "ok"), c("2", 5, "goosebumps")]);
    expect(r.unmatchedReactionCount).toBe(1);
  });

  it("주제 집계에서 '기타'는 빼고 센다 — 무엇을 좋아했는지 알려주지 못하므로", () => {
    const r = buildLikedAnalysis([
      c("1", 10, "", ["other"]),
      c("2", 20, "", ["music_ost", "other"]),
    ]);
    expect(r.topicGroups.map((g) => g.key)).toEqual(["music_ost"]);
    expect(r.topicGroups[0].likeTotal).toBe(20);
  });

  it("그룹 비율은 집계 범위의 좋아요 합을 분모로 쓴다", () => {
    const r = buildLikedAnalysis([
      c("1", 75, "goosebumps"),
      c("2", 25, "lol funny"),
    ]);
    const awe = r.reactionGroups.find((g) => g.key === "awe")!;
    expect(awe.likeShare).toBeCloseTo(0.75);
  });
});

describe("반복된 표현", () => {
  it("두 개 이상의 댓글에 나온 단어만 센다", () => {
    const r = buildLikedAnalysis([
      c("1", 10, "samurai combat looks great"),
      c("2", 20, "samurai vibes"),
      c("3", 5, "unrelated word here"),
    ]);
    const terms = r.keywords.map((k) => k.term);
    expect(terms).toContain("samurai");
    expect(terms).not.toContain("unrelated");
  });

  it("한 댓글에서 같은 단어를 반복해도 1회로 센다 — 도배가 표를 흔들지 않게", () => {
    const r = buildLikedAnalysis([
      c("1", 10, "hype hype hype hype hype"),
      c("2", 10, "hype"),
    ]);
    const hype = r.keywords.find((k) => k.term === "hype")!;
    expect(hype.commentCount).toBe(2);
    expect(hype.likeTotal).toBe(20);
  });

  it("기능어와 타임스탬프는 표현에서 제외한다", () => {
    const r = buildLikedAnalysis([
      c("1", 10, "the music at 1:23 is the best"),
      c("2", 10, "the music at 1:23 again"),
    ]);
    const terms = r.keywords.map((k) => k.term);
    expect(terms).toContain("music");
    expect(terms).not.toContain("the");
    expect(terms).not.toContain("1:23");
    expect(terms).not.toContain("123");
  });

  it("한국어는 조사를 떼고 같은 단어로 묶는다", () => {
    const r = buildLikedAnalysis([
      c("1", 10, "그래픽이 미쳤다"),
      c("2", 10, "그래픽은 진짜 좋다"),
    ]);
    const terms = r.keywords.map((k) => k.term);
    expect(terms).toContain("그래픽");
  });
});
