import { describe, expect, it, vi } from "vitest";
import {
  analyzeCommentBatch,
  batchAnalysisSchema,
  ClaudeAnalysisError,
  mockAnalyzeComment,
} from "@/lib/analysis/claude";

const VIDEO = { title: "Test Trailer", channelTitle: "Studio", durationSeconds: 222 };

const COMMENTS = [
  { id: "c1", text: "0:58 진짜 소름 돋았다. 무조건 산다", likeCount: 120, isReply: false },
  { id: "c2", text: "카일은 어디 갔나요... 실망", likeCount: 5, isReply: false },
];

function validPayload() {
  return JSON.stringify({
    analyses: [
      {
        commentId: "c1",
        sentiment: "positive",
        emotions: ["excitement"],
        topics: ["purchase_intent"],
        mentionedCharacters: [],
        mentionedGamesOrMedia: [],
        mentionedTimestampSeconds: [58],
        impressiveReason: "특정 장면 연출에 감탄",
        concernReason: null,
        confidence: 0.9,
      },
      {
        commentId: "c2",
        sentiment: "negative",
        emotions: ["concern", "nostalgia"],
        topics: ["existing_character_absence"],
        mentionedCharacters: ["카일"],
        mentionedGamesOrMedia: [],
        mentionedTimestampSeconds: [],
        impressiveReason: null,
        concernReason: "전작 주인공 부재에 대한 실망",
        confidence: 0.85,
      },
    ],
  });
}

describe("batchAnalysisSchema (Zod validation)", () => {
  it("accepts a valid payload and clamps confidence", () => {
    const parsed = batchAnalysisSchema.parse(JSON.parse(validPayload()));
    expect(parsed.analyses).toHaveLength(2);

    const clamped = batchAnalysisSchema.parse({
      analyses: [{ ...parsed.analyses[0], confidence: 1.7 }],
    });
    expect(clamped.analyses[0]!.confidence).toBe(1);
  });

  it("rejects unknown enum values", () => {
    const bad = JSON.parse(validPayload()) as { analyses: Record<string, unknown>[] };
    bad.analyses[0]!.sentiment = "ecstatic";
    expect(batchAnalysisSchema.safeParse(bad).success).toBe(false);
  });
});

describe("analyzeCommentBatch retry behavior", () => {
  it("retries on invalid JSON, then bad schema, then succeeds", async () => {
    const caller = vi
      .fn<(s: string, u: string) => Promise<string>>()
      .mockResolvedValueOnce("this is not json")
      .mockResolvedValueOnce(JSON.stringify({ analyses: [{ commentId: "c1" }] }))
      .mockResolvedValueOnce(validPayload());

    const results = await analyzeCommentBatch(COMMENTS, VIDEO, { caller, maxRetries: 2 });
    expect(caller).toHaveBeenCalledTimes(3);
    expect(results).toHaveLength(2);
    expect(results[0]!.sentiment).toBe("positive");
    expect(results[1]!.topics).toContain("existing_character_absence");

    // corrective feedback was appended on retries
    const lastUserText = caller.mock.calls[2]![1];
    expect(lastUserText).toMatch(/failed schema validation|not valid JSON/);
  });

  it("throws ClaudeAnalysisError after exhausting retries", async () => {
    const caller = vi.fn().mockResolvedValue("still not json");
    await expect(
      analyzeCommentBatch(COMMENTS, VIDEO, { caller, maxRetries: 1 }),
    ).rejects.toBeInstanceOf(ClaudeAnalysisError);
    expect(caller).toHaveBeenCalledTimes(2);
  });

  it("never sends author identifiers to the model", async () => {
    const caller = vi.fn().mockResolvedValue(validPayload());
    await analyzeCommentBatch(COMMENTS, VIDEO, { caller });
    const userText = caller.mock.calls[0]![1] as string;
    expect(userText).not.toMatch(/author|channelId/i);
  });

  it("clamps model-provided timestamps to the video duration", async () => {
    const payload = JSON.parse(validPayload()) as {
      analyses: { mentionedTimestampSeconds: number[] }[];
    };
    payload.analyses[0]!.mentionedTimestampSeconds = [58, 9999];
    const caller = vi.fn().mockResolvedValue(JSON.stringify(payload));
    const results = await analyzeCommentBatch(COMMENTS, VIDEO, { caller });
    expect(results[0]!.mentionedTimestampSeconds).toEqual([58]);
  });
});

describe("mockAnalyzeComment (deterministic fallback)", () => {
  it("classifies Korean purchase-intent + timestamp comments", () => {
    const r = mockAnalyzeComment(
      { id: "x", text: "0:58 소름... 예약 구매 간다", likeCount: 3, isReply: false },
      222,
    );
    expect(r.topics).toContain("purchase_intent");
    expect(r.sentiment).toBe("positive");
    expect(r.mentionedTimestampSeconds).toEqual([58]);
  });
});
