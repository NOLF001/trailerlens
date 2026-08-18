// DB row → API payload serializers (BigInt-safe).

import type { Analysis, Video } from "@prisma/client";
import type { AnalysisMode, AnalysisStatus, AnalysisStatusPayload, Report, VideoMeta } from "@/lib/types";
import { safeJsonParse } from "@/lib/utils";

export function serializeVideo(v: Video): VideoMeta {
  return {
    id: v.id,
    title: v.title,
    channelId: v.channelId,
    channelTitle: v.channelTitle,
    thumbnailUrl: v.thumbnailUrl,
    durationSeconds: v.durationSeconds,
    viewCount: v.viewCount != null ? Number(v.viewCount) : null,
    likeCount: v.likeCount,
    commentCount: v.commentCount,
    publishedAt: v.publishedAt?.toISOString() ?? null,
    isMock: v.isMock,
  };
}

export function serializeAnalysis(
  a: Analysis & { video?: Video | null },
): AnalysisStatusPayload {
  return {
    id: a.id,
    videoId: a.videoId,
    mode: a.mode as AnalysisMode,
    status: a.status as AnalysisStatus,
    currentStep: a.currentStep,
    stepProgress: a.stepProgress,
    error: a.error,
    failedStep: a.failedStep,
    attempts: a.attempts,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    completedAt: a.completedAt?.toISOString() ?? null,
    video: a.video ? serializeVideo(a.video) : null,
    report:
      a.status === "completed" ? safeJsonParse<Report | null>(a.reportJson, null) : null,
  };
}
