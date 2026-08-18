// YouTube Analytics API adapter (channel-owner mode).
// Requires an OAuth access token with the yt-analytics.readonly scope, and the
// signed-in Google account must own the channel that uploaded the video.

import type { HeatSegment } from "@/lib/types";

const ANALYTICS_BASE = "https://youtubeanalytics.googleapis.com/v2/reports";

export class AnalyticsError extends Error {
  constructor(
    message: string,
    public readonly status: number | null = null,
  ) {
    super(message);
    this.name = "AnalyticsError";
  }
}

interface AnalyticsResponse {
  columnHeaders?: { name: string }[];
  rows?: (number | string)[][];
}

export interface RetentionPoint {
  elapsedVideoTimeRatio: number;
  audienceWatchRatio: number;
  relativeRetentionPerformance: number | null;
}

/**
 * Fetches audience retention for a video the authenticated user owns.
 * Ratios are converted to seconds using the video duration.
 */
export async function getOwnerRetention(
  accessToken: string,
  videoId: string,
  durationSeconds: number,
): Promise<{ points: RetentionPoint[]; segments: HeatSegment[] }> {
  const params = new URLSearchParams({
    ids: "channel==MINE",
    startDate: "2000-01-01",
    endDate: new Date().toISOString().slice(0, 10),
    metrics: "audienceWatchRatio,relativeRetentionPerformance",
    dimensions: "elapsedVideoTimeRatio",
    filters: `video==${videoId};audienceType==ORGANIC`,
    sort: "elapsedVideoTimeRatio",
  });

  const res = await fetch(`${ANALYTICS_BASE}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      detail = body.error?.message ?? "";
    } catch {
      // ignore
    }
    throw new AnalyticsError(
      `YouTube Analytics 요청 실패 (HTTP ${res.status}) ${detail}`.trim(),
      res.status,
    );
  }

  const data = (await res.json()) as AnalyticsResponse;
  const headers = (data.columnHeaders ?? []).map((h) => h.name);
  const idx = {
    ratio: headers.indexOf("elapsedVideoTimeRatio"),
    watch: headers.indexOf("audienceWatchRatio"),
    relative: headers.indexOf("relativeRetentionPerformance"),
  };

  const points: RetentionPoint[] = (data.rows ?? []).map((row) => ({
    elapsedVideoTimeRatio: Number(row[idx.ratio] ?? 0),
    audienceWatchRatio: Number(row[idx.watch] ?? 0),
    relativeRetentionPerformance:
      idx.relative >= 0 && row[idx.relative] != null ? Number(row[idx.relative]) : null,
  }));

  if (points.length === 0) {
    throw new AnalyticsError(
      "Analytics 데이터가 없습니다. 채널 소유자 계정인지, 영상에 충분한 시청 데이터가 쌓였는지 확인하세요.",
    );
  }

  // Convert ratio buckets → absolute seconds and normalize watch ratio to 0..1.
  const maxWatch = Math.max(...points.map((p) => p.audienceWatchRatio), 0.0001);
  const step = durationSeconds / points.length;
  const segments: HeatSegment[] = points.map((p) => ({
    startTime: Math.min(durationSeconds, p.elapsedVideoTimeRatio * durationSeconds),
    endTime: Math.min(durationSeconds, p.elapsedVideoTimeRatio * durationSeconds + step),
    value: p.audienceWatchRatio / maxWatch,
  }));

  return { points, segments };
}
