// 저장 공간을 3개 영상 분량으로 제한합니다. 새 영상이 분석 대기열에 들어갈 때마다
// 가장 최근에 분석된 영상 3개만 남기고 그 이전 영상들을 통째로(댓글 포함) 지웁니다.
// Video를 지우면 onDelete: Cascade로 Comment/Analysis/SceneCluster/HeatmapSegment가
// 함께 정리됩니다.

import { prisma } from "@/lib/db";

const KEEP_VIDEOS = 3;
const ACTIVE_STATUSES = ["queued", "running", "canceling"];

export async function pruneOldVideos(): Promise<void> {
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

  const keep = new Set<string>(protectedIds.map((a) => a.videoId));
  for (const { videoId } of recent) {
    if (keep.size >= KEEP_VIDEOS) break;
    keep.add(videoId);
  }

  const staleIds = recent.map((a) => a.videoId).filter((id) => !keep.has(id));
  if (staleIds.length === 0) return;

  await prisma.video.deleteMany({ where: { id: { in: staleIds } } });
}
