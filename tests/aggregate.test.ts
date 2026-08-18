import { describe, expect, it } from "vitest";
import {
  cleanComments,
  computeStatsVariant,
  type AggregateComment,
} from "@/lib/analysis/aggregate";
import { likeWeight } from "@/lib/utils";

function makeComment(overrides: Partial<AggregateComment>): AggregateComment {
  return {
    id: Math.random().toString(36).slice(2),
    isReply: false,
    authorKey: "author-1",
    likeCount: 0,
    publishedAt: "2026-08-01T10:00:00Z",
    detectedLanguage: "ko",
    timestamps: [],
    duplicateGroupId: null,
    spamProbability: 0,
    shortOrEmoji: false,
    analyzed: true,
    sentiment: "positive",
    emotions: [],
    topics: ["other"],
    ...overrides,
  };
}

describe("likeWeight", () => {
  it("is 1 + log1p(likes) and dampens viral comments", () => {
    expect(likeWeight(0)).toBe(1);
    expect(likeWeight(Math.E - 1)).toBeCloseTo(2, 10);
    // 10,000 likes weighs ~9.2x, not 10,000x — one hit comment can't dominate.
    expect(likeWeight(10_000)).toBeLessThan(11);
  });
});

describe("computeStatsVariant", () => {
  it("computes counts, shares and like-weighted topic influence deterministically", () => {
    const comments: AggregateComment[] = [
      makeComment({ id: "a", topics: ["music_ost"], likeCount: 100, authorKey: "u1" }),
      makeComment({ id: "b", topics: ["music_ost"], likeCount: 0, authorKey: "u2" }),
      makeComment({
        id: "c",
        topics: ["character_design"],
        sentiment: "negative",
        likeCount: 0,
        authorKey: "u3",
      }),
      makeComment({
        id: "d",
        isReply: true,
        analyzed: false,
        sentiment: null,
        topics: [],
        authorKey: "u1",
        timestamps: [58, 60],
      }),
    ];

    const stats = computeStatsVariant(comments);

    expect(stats.totalComments).toBe(4);
    expect(stats.topLevelCount).toBe(3);
    expect(stats.replyCount).toBe(1);
    expect(stats.uniqueAuthors).toBe(3);
    expect(stats.analyzedCount).toBe(3);
    expect(stats.timestampMentionCount).toBe(2);
    expect(stats.likeTotal).toBe(100);
    expect(stats.avgLikesPerComment).toBe(25);
    expect(stats.sentimentCounts.positive).toBe(2);
    expect(stats.sentimentCounts.negative).toBe(1);

    const music = stats.topics.find((t) => t.topic === "music_ost")!;
    expect(music.count).toBe(2);
    expect(music.share).toBeCloseTo(2 / 3);

    // like-weighted influence: music gets w(100)+w(0), design gets w(0)
    const totalW = likeWeight(100) + likeWeight(0) + likeWeight(0);
    expect(music.likeWeighted).toBeCloseTo(likeWeight(100) + 1);
    expect(music.likeWeightedShare).toBeCloseTo((likeWeight(100) + 1) / totalW);

    const design = stats.topics.find((t) => t.topic === "character_design")!;
    expect(design.negativeShare).toBe(1);
  });

  it("aggregates comments per day", () => {
    const stats = computeStatsVariant([
      makeComment({ publishedAt: "2026-08-01T01:00:00Z" }),
      makeComment({ publishedAt: "2026-08-01T20:00:00Z" }),
      makeComment({ publishedAt: "2026-08-03T09:00:00Z" }),
    ]);
    expect(stats.commentsPerDay).toEqual([
      { date: "2026-08-01", count: 2 },
      { date: "2026-08-03", count: 1 },
    ]);
  });
});

describe("cleanComments", () => {
  it("removes spam and keeps only the most-liked member of each duplicate group", () => {
    const comments: AggregateComment[] = [
      makeComment({ id: "dup-low", duplicateGroupId: "g1", likeCount: 2 }),
      makeComment({ id: "dup-high", duplicateGroupId: "g1", likeCount: 50 }),
      makeComment({ id: "spam", spamProbability: 0.95 }),
      makeComment({ id: "ok" }),
    ];
    const cleaned = cleanComments(comments);
    const ids = cleaned.map((c) => c.id).sort();
    expect(ids).toEqual(["dup-high", "ok"]);
  });
});
