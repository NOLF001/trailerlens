// YouTube video metadata adapter.

import { ytGet, YouTubeApiError } from "@/lib/youtube/client";
import type { VideoMeta } from "@/lib/types";
import { isMockMode } from "@/lib/env";
import { buildMockDataset } from "@/lib/mock/mock";

/** "PT1H2M15S" → 3735 */
export function parseIsoDuration(iso: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(iso ?? "");
  if (!m) return 0;
  const h = Number(m[1] ?? 0);
  const min = Number(m[2] ?? 0);
  const s = Number(m[3] ?? 0);
  return Math.round(h * 3600 + min * 60 + s);
}

interface VideosListResponse {
  items: {
    id: string;
    snippet: {
      title: string;
      channelId: string;
      channelTitle: string;
      publishedAt: string;
      thumbnails?: Record<string, { url: string; width: number; height: number }>;
    };
    contentDetails: { duration: string };
    statistics?: {
      viewCount?: string;
      likeCount?: string;
      commentCount?: string;
    };
  }[];
}

function bestThumbnail(
  thumbs: Record<string, { url: string; width: number }> | undefined,
): string {
  if (!thumbs) return "";
  const order = ["maxres", "standard", "high", "medium", "default"];
  for (const key of order) {
    if (thumbs[key]?.url) return thumbs[key]!.url;
  }
  return Object.values(thumbs)[0]?.url ?? "";
}

/**
 * Fetches video metadata. Returns null when the video does not exist or is
 * private/deleted (Data API simply omits it from `items`).
 */
export async function getVideoMeta(videoId: string): Promise<VideoMeta | null> {
  if (isMockMode()) {
    return buildMockDataset(videoId).video;
  }

  const data = await ytGet<VideosListResponse>("videos", {
    part: "snippet,contentDetails,statistics",
    id: videoId,
    maxResults: 1,
  });

  const item = data.items?.[0];
  if (!item) return null;

  return {
    id: item.id,
    title: item.snippet.title,
    channelId: item.snippet.channelId,
    channelTitle: item.snippet.channelTitle,
    thumbnailUrl: bestThumbnail(item.snippet.thumbnails),
    durationSeconds: parseIsoDuration(item.contentDetails.duration),
    viewCount: item.statistics?.viewCount != null ? Number(item.statistics.viewCount) : null,
    likeCount: item.statistics?.likeCount != null ? Number(item.statistics.likeCount) : null,
    commentCount:
      item.statistics?.commentCount != null ? Number(item.statistics.commentCount) : null,
    publishedAt: item.snippet.publishedAt ?? null,
    isMock: false,
  };
}

export { YouTubeApiError };
