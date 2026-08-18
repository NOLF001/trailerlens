import { describe, expect, it } from "vitest";
import { clusterTimestamps, parseTimestamps } from "@/lib/analysis/timestamps";

describe("parseTimestamps", () => {
  const DURATION = 4000; // ~1h6m

  it("parses m:ss and mm:ss", () => {
    expect(parseTimestamps("3:11 장면 최고", DURATION).map((t) => t.seconds)).toEqual([191]);
    expect(parseTimestamps("03:11 replay", DURATION).map((t) => t.seconds)).toEqual([191]);
  });

  it("parses h:mm:ss", () => {
    expect(parseTimestamps("1:02:15 부분", DURATION).map((t) => t.seconds)).toEqual([3735]);
  });

  it("parses ranges as both endpoints", () => {
    expect(parseTimestamps("2:57-3:09 구간 미쳤다", DURATION).map((t) => t.seconds)).toEqual([
      177, 189,
    ]);
  });

  it("parses Korean formats", () => {
    expect(parseTimestamps("2분 47초에 나옴", DURATION).map((t) => t.seconds)).toEqual([167]);
    expect(parseTimestamps("1시간 2분 지점", DURATION).map((t) => t.seconds)).toEqual([3720]);
  });

  it("rejects invalid clock values", () => {
    expect(parseTimestamps("12:60", DURATION)).toEqual([]);
    expect(parseTimestamps("1:02:75", DURATION)).toEqual([]);
  });

  it("drops timestamps outside the video duration", () => {
    const short = 222; // 3:42
    expect(parseTimestamps("10:00 대박", short)).toEqual([]);
    expect(parseTimestamps("3:41 소름", short).map((t) => t.seconds)).toEqual([221]);
  });

  it("dedupes repeated mentions of the same second", () => {
    expect(parseTimestamps("1:00 1:00 1:00", DURATION)).toHaveLength(1);
  });
});

describe("clusterTimestamps", () => {
  it("merges adjacent bins into a single cluster", () => {
    const mentions = [58, 59, 60, 61, 62].map((s) => ({ seconds: s, weight: 1 }));
    const clusters = clusterTimestamps(mentions, { binSize: 4 });
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.count).toBe(5);
    expect(clusters[0]!.startSec).toBeLessThanOrEqual(58);
    expect(clusters[0]!.endSec).toBeGreaterThanOrEqual(62);
  });

  it("keeps far-apart mentions separate and sorts by weight", () => {
    const mentions = [
      { seconds: 10, weight: 1 },
      { seconds: 11, weight: 1 },
      { seconds: 120, weight: 10 },
    ];
    const clusters = clusterTimestamps(mentions, { binSize: 4 });
    expect(clusters).toHaveLength(2);
    expect(clusters[0]!.weight).toBe(10); // heaviest first
  });
});
