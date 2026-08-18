// Scene construction: merges timestamp-mention clusters with the (optional)
// replay heatmap, and detects heatmap peaks.

import type { HeatPeak, HeatSegment, Topic } from "@/lib/types";
import { clusterTimestamps, type TimestampCluster } from "@/lib/analysis/timestamps";
import { likeWeight } from "@/lib/utils";

export function normalizeSegments(segments: HeatSegment[]): HeatSegment[] {
  if (segments.length === 0) return [];
  const max = Math.max(...segments.map((s) => s.value));
  if (max <= 0) return segments.map((s) => ({ ...s, value: 0 }));
  return segments.map((s) => ({ ...s, value: s.value / max }));
}

/**
 * Finds the top-N peak segments, enforcing a minimum separation so one broad
 * bump doesn't fill all slots.
 */
export function findHeatPeaks(
  segments: HeatSegment[],
  { topN = 5, minSeparationSec = 12 }: { topN?: number; minSeparationSec?: number } = {},
): HeatPeak[] {
  const sorted = [...normalizeSegments(segments)].sort((a, b) => b.value - a.value);
  const peaks: HeatPeak[] = [];

  for (const seg of sorted) {
    if (peaks.length >= topN) break;
    const center = (seg.startTime + seg.endTime) / 2;
    const tooClose = peaks.some(
      (p) => Math.abs((p.startTime + p.endTime) / 2 - center) < minSeparationSec,
    );
    if (tooClose) continue;
    peaks.push({ ...seg, rank: peaks.length + 1 });
  }

  return peaks;
}

/** Mean heat intensity over [startSec, endSec], or null without heatmap. */
export function heatOverRange(
  segments: HeatSegment[],
  startSec: number,
  endSec: number,
): number | null {
  if (segments.length === 0) return null;
  const overlapping = segments.filter(
    (s) => s.endTime > startSec && s.startTime < endSec,
  );
  if (overlapping.length === 0) return 0;
  return overlapping.reduce((sum, s) => sum + s.value, 0) / overlapping.length;
}

export interface SceneCommentInput {
  id: string;
  likeCount: number;
  timestamps: number[];
  topics: Topic[];
  text: string;
}

export interface SceneDraft {
  key: string; // stable within one build: scene-1 ...
  rank: number;
  startSec: number;
  endSec: number;
  mentionCount: number;
  likeWeighted: number;
  heatIntensity: number | null;
  topics: Topic[];
  exampleTexts: string[];
}

/**
 * Builds ranked scenes from comment timestamp mentions + heatmap.
 * - Timestamp mentions are clustered into 4s bins (merged when adjacent).
 * - Heatmap peaks with no comment mentions still become scenes.
 * - Rank = like-weighted mentions (normalized) + heat intensity.
 */
export function buildScenes({
  comments,
  heatmap,
  durationSeconds,
  maxScenes = 8,
}: {
  comments: SceneCommentInput[];
  heatmap: HeatSegment[];
  durationSeconds: number;
  maxScenes?: number;
}): SceneDraft[] {
  const mentions = comments.flatMap((c) =>
    c.timestamps.map((seconds) => ({ seconds, weight: likeWeight(c.likeCount) })),
  );

  const clusters = clusterTimestamps(mentions, { binSize: 4, durationSeconds });
  const normalized = normalizeSegments(heatmap);
  const peaks = findHeatPeaks(normalized, { topN: 5 });

  interface Candidate {
    startSec: number;
    endSec: number;
    cluster: TimestampCluster | null;
    heat: number | null;
  }

  const candidates: Candidate[] = clusters.map((cl) => ({
    startSec: cl.startSec,
    endSec: cl.endSec,
    cluster: cl,
    heat: heatOverRange(normalized, cl.startSec - 2, cl.endSec + 2),
  }));

  // Heat peaks not covered by any mention cluster become their own scenes.
  for (const peak of peaks) {
    const center = (peak.startTime + peak.endTime) / 2;
    const covered = candidates.some(
      (c) => center >= c.startSec - 4 && center <= c.endSec + 4,
    );
    if (!covered) {
      candidates.push({
        startSec: Math.max(0, Math.floor(peak.startTime)),
        endSec: Math.min(durationSeconds, Math.ceil(peak.endTime)),
        cluster: null,
        heat: peak.value,
      });
    }
  }

  const maxWeight = Math.max(...candidates.map((c) => c.cluster?.weight ?? 0), 0.0001);

  const scored = candidates
    .map((c) => {
      const weightScore = (c.cluster?.weight ?? 0) / maxWeight;
      const heatScore = c.heat ?? 0;
      return { ...c, score: weightScore + heatScore };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxScenes);

  return scored.map((c, i) => {
    const memberComments = c.cluster
      ? comments.filter((cm) =>
          cm.timestamps.some((t) => t >= c.startSec - 2 && t <= c.endSec + 2),
        )
      : [];

    const topicCounter = new Map<Topic, number>();
    for (const cm of memberComments) {
      for (const t of cm.topics) topicCounter.set(t, (topicCounter.get(t) ?? 0) + 1);
    }
    const topics = [...topicCounter.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => t);

    const exampleTexts = memberComments
      .sort((a, b) => b.likeCount - a.likeCount)
      .slice(0, 3)
      .map((cm) => cm.text.slice(0, 200));

    return {
      key: `scene-${i + 1}`,
      rank: i + 1,
      startSec: c.startSec,
      endSec: c.endSec,
      mentionCount: c.cluster?.count ?? 0,
      likeWeighted: c.cluster?.weight ?? 0,
      heatIntensity: c.heat,
      topics,
      exampleTexts,
    };
  });
}
