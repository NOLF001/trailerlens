import { describe, expect, it } from "vitest";
import { buildScenes, findHeatPeaks, normalizeSegments } from "@/lib/analysis/scenes";
import type { HeatSegment } from "@/lib/types";

function bumpySegments(): HeatSegment[] {
  // Two clear bumps at ~60s and ~150s over a 200s timeline.
  const out: HeatSegment[] = [];
  for (let t = 0; t < 200; t += 2) {
    const v =
      0.1 +
      Math.exp(-((t - 60) ** 2) / 50) * 1.0 +
      Math.exp(-((t - 150) ** 2) / 50) * 0.7;
    out.push({ startTime: t, endTime: t + 2, value: v });
  }
  return out;
}

describe("normalizeSegments", () => {
  it("scales values to max 1", () => {
    const norm = normalizeSegments([
      { startTime: 0, endTime: 1, value: 5 },
      { startTime: 1, endTime: 2, value: 10 },
    ]);
    expect(Math.max(...norm.map((s) => s.value))).toBe(1);
    expect(norm[0]!.value).toBeCloseTo(0.5);
  });
});

describe("findHeatPeaks", () => {
  it("finds the two bumps as the top peaks with separation", () => {
    const peaks = findHeatPeaks(bumpySegments(), { topN: 5, minSeparationSec: 12 });
    expect(peaks.length).toBeGreaterThanOrEqual(2);
    expect(peaks[0]!.rank).toBe(1);

    const centers = peaks.slice(0, 2).map((p) => (p.startTime + p.endTime) / 2);
    expect(Math.min(...centers.map((c) => Math.abs(c - 60)))).toBeLessThan(6);
    expect(Math.min(...centers.map((c) => Math.abs(c - 150)))).toBeLessThan(6);

    // separation is enforced between any two peaks
    for (let i = 0; i < peaks.length; i++) {
      for (let j = i + 1; j < peaks.length; j++) {
        const ci = (peaks[i]!.startTime + peaks[i]!.endTime) / 2;
        const cj = (peaks[j]!.startTime + peaks[j]!.endTime) / 2;
        expect(Math.abs(ci - cj)).toBeGreaterThanOrEqual(12);
      }
    }
  });
});

describe("buildScenes", () => {
  it("merges comment timestamp clusters with heatmap intensity and ranks scenes", () => {
    const comments = [
      { id: "a", likeCount: 500, timestamps: [59, 60], topics: ["music_ost" as const], text: "0:59 BGM 미쳤다" },
      { id: "b", likeCount: 10, timestamps: [61], topics: ["music_ost" as const], text: "1:01 소름" },
      { id: "c", likeCount: 2, timestamps: [10], topics: ["other" as const], text: "0:10 시작부터 좋다" },
    ];
    const scenes = buildScenes({
      comments,
      heatmap: bumpySegments(),
      durationSeconds: 200,
      maxScenes: 5,
    });

    expect(scenes.length).toBeGreaterThanOrEqual(2);
    // The 60s scene (heavy mentions + heat bump) must rank first.
    expect(scenes[0]!.startSec).toBeLessThanOrEqual(60);
    expect(scenes[0]!.endSec).toBeGreaterThanOrEqual(60);
    expect(scenes[0]!.mentionCount).toBe(3);
    expect(scenes[0]!.topics).toContain("music_ost");
    expect(scenes[0]!.heatIntensity).toBeGreaterThan(0.5);

    // The 150s heat bump has no comment mentions but still becomes a scene.
    const heatOnly = scenes.find((s) => s.startSec >= 130 && s.startSec <= 160);
    expect(heatOnly).toBeDefined();
    expect(heatOnly!.mentionCount).toBe(0);
  });

  it("works without any heatmap (comments only)", () => {
    const scenes = buildScenes({
      comments: [
        { id: "a", likeCount: 5, timestamps: [30], topics: [], text: "0:30" },
      ],
      heatmap: [],
      durationSeconds: 100,
    });
    expect(scenes).toHaveLength(1);
    expect(scenes[0]!.heatIntensity).toBeNull();
  });
});
