// 저장 공간을 3개 영상 분량으로 제한합니다. 새 영상이 분석 대기열에 들어갈 때마다
// 가장 최근에 분석된 영상 3개만 남기고 그 이전 영상들을 통째로(댓글 포함) 지웁니다.
// Video를 지우면 onDelete: Cascade로 Comment/Analysis/SceneCluster/HeatmapSegment가
// 함께 정리됩니다.
//
// previewEviction()은 실제로 지우지 않고 "지금 이 영상을 분석하면 어떤 영상이
// 밀려날지"만 미리 계산합니다 — 자동 삭제 전에 사용자에게 경고 팝업을 띄우기
// 위한 용도입니다.

import { prisma } from "@/lib/db";

const KEEP_VIDEOS = 3;
const ACTIVE_STATUSES = ["queued", "running", "canceling"];

/**
 * 보존 대상에서 밀려날 videoId 목록을 계산합니다.
 * `candidateVideoId`를 주면 "아직 분석 기록이 없는 이 영상이 방금 추가됐다고
 * 가정할 때" 밀려나는 영상까지 시뮬레이션합니다 (실제로 아무것도 지우지 않음).
 */
async function computeEvictionCandidates(candidateVideoId?: string): Promise<string[]> {
  const protectedIds = await prisma.analysis.findMany({
    where: { status: { in: ACTIVE_STATUSES } },
    distinct: ["videoId"],
    select: { videoId: true },
  });

  const recent = await prisma.analysis.findMany({
    distinct: ["videoId"],
    orderBy: { createdAt: "desc" },
    select: { videoId: true },
  });

  let orderedIds = recent.map((a) => a.videoId);
  if (candidateVideoId && !orderedIds.includes(candidateVideoId)) {
    // 아직 존재하지 않는 영상이면 "지금 막 분석을 시작해서 가장 최신"이라고
    // 가정하고 맨 앞에 끼워 넣습니다.
    orderedIds = [candidateVideoId, ...orderedIds];
  }

  const keep = new Set<string>(protectedIds.map((a) => a.videoId));
  for (const videoId of orderedIds) {
    if (keep.size >= KEEP_VIDEOS) break;
    keep.add(videoId);
  }

  return orderedIds.filter((id) => !keep.has(id));
}

export async function pruneOldVideos(): Promise<void> {
  const staleIds = await computeEvictionCandidates();
  if (staleIds.length === 0) return;

  await prisma.video.deleteMany({ where: { id: { in: staleIds } } });
}

export interface EvictionPreview {
  id: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
}

/**
 * `videoId`에 대해 새 분석을 시작했을 때 자동으로 삭제될 영상들을 미리 알려줍니다.
 * 이미 분석 기록이 있는 영상(재분석)은 절대 다른 영상을 밀어내지 않으므로 항상 빈
 * 배열을 반환합니다.
 */
export async function previewEviction(videoId: string): Promise<EvictionPreview[]> {
  const existing = await prisma.video.findUnique({
    where: { id: videoId },
    select: { id: true },
  });
  if (existing) return [];

  const staleIds = (await computeEvictionCandidates(videoId)).filter((id) => id !== videoId);
  if (staleIds.length === 0) return [];

  return prisma.video.findMany({
    where: { id: { in: staleIds } },
    select: { id: true, title: true, channelTitle: true, thumbnailUrl: true },
  });
}
