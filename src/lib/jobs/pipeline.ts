// The 7-step analysis pipeline. DB-backed, resumable, cancelable, idempotent.
//
//  1 영상 확인          — metadata fetch + Video upsert
//  2 댓글 수집          — commentThreads pagination (checkpoint: pageToken)
//  3 답글 수집          — reply backfill happens inline with step 2; this step
//                         verifies counts and records collection notices
//  4 언어 및 중복 분석   — language / normalize / timestamps / dedup / spam
//  5 Claude 배치 분석    — map step over pending comments only (resume-safe)
//  6 장면 연결          — heatmap resolution + timestamp clustering
//  7 보고서 생성        — deterministic aggregation + narratives + report JSON

import { prisma } from "@/lib/db";
import { isMockMode, isMockClaude } from "@/lib/env";
import { getVideoMeta } from "@/lib/youtube/metadata";
import {
  collectCommentPage,
  isCommentsDisabledError,
  YouTubeApiError,
} from "@/lib/youtube/comments";
import { getYtdlpHeatmap } from "@/lib/youtube/ytdlp";
import { buildHypeReport, type HypeCommentInput } from "@/lib/analysis/hype";
import { buildMockDataset } from "@/lib/mock/mock";
import {
  isShortOrEmojiOnly,
  normalizeForDedup,
} from "@/lib/analysis/normalize";
import { detectLanguage } from "@/lib/analysis/language";
import { parseTimestamps } from "@/lib/analysis/timestamps";
import { assignDuplicateGroups } from "@/lib/analysis/duplicates";
import { spamProbability } from "@/lib/analysis/spam";
import {
  analyzeCommentBatch,
  generateNarratives,
  buildDynamicNameMatchers,
  DEFAULT_BATCH_SIZE,
  type NarrativeInput,
} from "@/lib/analysis/claude";
import {
  achievedMarginOfError,
  requiredSampleSize,
} from "@/lib/analysis/sampling";
import {
  cleanComments,
  computeStatsVariant,
  type AggregateComment,
} from "@/lib/analysis/aggregate";
import {
  buildScenes,
  findHeatPeaks,
  normalizeSegments,
} from "@/lib/analysis/scenes";
import { buildReportPayload } from "@/lib/analysis/report";
import { safeJsonParse } from "@/lib/utils";
import type {
  AnalysisMode,
  HeatSegment,
  HeatmapSource,
  RawComment,
  SceneInfo,
  Sentiment,
  Topic,
  VideoMeta,
} from "@/lib/types";
import type { Comment as CommentRow, Video as VideoRow } from "@prisma/client";

const QUICK_MAX_PAGES = 2; // ≈ 200 threads + replies
const QUICK_MAX_ANALYZED = 150;

// 표본 분석 모드 기본값: 95% 신뢰수준, 오차범위 ±3%p, 초대형 답글 스레드 가드
const SAMPLE_MARGIN_OF_ERROR = 0.03;
const SAMPLE_MAX_REPLIES_PER_THREAD = 200;

export class CancelledError extends Error {
  constructor() {
    super("analysis canceled");
    this.name = "CancelledError";
  }
}

interface Checkpoint {
  pageToken?: string | null;
  collectDone?: boolean;
  pagesCollected?: number;
  /** sample mode: current collection phase ("relevance" → "time"). */
  samplePhase?: "relevance" | "time";
}

async function loadCheckpoint(analysisId: string): Promise<Checkpoint> {
  const a = await prisma.analysis.findUnique({
    where: { id: analysisId },
    select: { checkpoint: true },
  });
  return safeJsonParse<Checkpoint>(a?.checkpoint, {});
}

async function saveCheckpoint(analysisId: string, patch: Checkpoint) {
  const current = await loadCheckpoint(analysisId);
  await prisma.analysis.update({
    where: { id: analysisId },
    data: { checkpoint: JSON.stringify({ ...current, ...patch }) },
  });
}

async function setProgress(analysisId: string, step: number, progress: number) {
  await prisma.analysis.update({
    where: { id: analysisId },
    data: { currentStep: step, stepProgress: Math.min(1, Math.max(0, progress)) },
  });
}

/** Throws CancelledError when the user requested cancellation. */
async function checkCancel(analysisId: string) {
  const a = await prisma.analysis.findUnique({
    where: { id: analysisId },
    select: { status: true },
  });
  if (!a || a.status === "canceling" || a.status === "canceled") {
    throw new CancelledError();
  }
}

function videoRowToMeta(v: VideoRow): VideoMeta {
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

async function upsertVideo(meta: VideoMeta) {
  const data = {
    title: meta.title,
    channelId: meta.channelId,
    channelTitle: meta.channelTitle,
    thumbnailUrl: meta.thumbnailUrl,
    durationSeconds: meta.durationSeconds,
    viewCount: meta.viewCount != null ? BigInt(meta.viewCount) : null,
    likeCount: meta.likeCount,
    commentCount: meta.commentCount,
    publishedAt: meta.publishedAt ? new Date(meta.publishedAt) : null,
    isMock: meta.isMock,
    fetchedAt: new Date(),
  };
  await prisma.video.upsert({
    where: { id: meta.id },
    create: { id: meta.id, ...data },
    update: data,
  });
}

async function upsertComments(videoId: string, comments: RawComment[]) {
  // Chunked upserts keep transaction sizes reasonable on SQLite.
  const CHUNK = 50;
  for (let i = 0; i < comments.length; i += CHUNK) {
    const chunk = comments.slice(i, i + CHUNK);
    await prisma.$transaction(
      chunk.map((c) =>
        prisma.comment.upsert({
          where: { id: c.id },
          create: {
            id: c.id,
            videoId,
            parentId: c.parentId,
            authorDisplayName: c.authorDisplayName,
            authorChannelId: c.authorChannelId,
            textOriginal: c.textOriginal,
            likeCount: c.likeCount,
            publishedAt: new Date(c.publishedAt),
            updatedAt: new Date(c.updatedAt),
            isReply: c.isReply,
          },
          update: {
            likeCount: c.likeCount,
            textOriginal: c.textOriginal,
            updatedAt: new Date(c.updatedAt),
          },
        }),
      ),
    );
  }
}

// ── Steps ────────────────────────────────────────────────────────────────────

async function stepVerifyVideo(analysisId: string, videoId: string): Promise<VideoMeta> {
  await setProgress(analysisId, 1, 0.1);
  const meta = await getVideoMeta(videoId);
  if (!meta) {
    throw new Error(
      "영상을 찾을 수 없습니다. 삭제되었거나 비공개 영상일 수 있습니다.",
    );
  }
  await upsertVideo(meta);
  await setProgress(analysisId, 1, 1);
  return meta;
}

/**
 * Sample-mode collection: gathers enough comments for a ±3%p margin of error
 * at 95% confidence (finite population correction applied), drawing half from
 * top(relevance) comments and the rest from newest(time) comments.
 */
async function stepCollectSample(
  analysisId: string,
  video: VideoMeta,
): Promise<{ notices: string[] }> {
  const notices: string[] = [];
  const checkpoint = await loadCheckpoint(analysisId);
  const target = requiredSampleSize(video.commentCount, SAMPLE_MARGIN_OF_ERROR);

  if (!checkpoint.collectDone) {
    let phase: "relevance" | "time" = checkpoint.samplePhase ?? "relevance";
    let pageToken: string | null = checkpoint.pageToken ?? null;
    let skippedReplies = 0;
    const halfTarget = Math.ceil(target / 2);

    try {
      for (;;) {
        await checkCancel(analysisId);
        const page = await collectCommentPage(video.id, pageToken ?? undefined, {
          order: phase,
          maxRepliesPerThread: SAMPLE_MAX_REPLIES_PER_THREAD,
        });
        await upsertComments(video.id, page.comments);
        skippedReplies += page.skippedReplyThreads;
        pageToken = page.nextPageToken;

        const collected = await prisma.comment.count({ where: { videoId: video.id } });
        await setProgress(analysisId, 2, Math.min(0.95, collected / target));

        const phaseDone =
          phase === "relevance"
            ? collected >= halfTarget || !pageToken
            : collected >= target || !pageToken;

        if (phaseDone) {
          if (phase === "relevance") {
            phase = "time";
            pageToken = null;
          } else {
            break;
          }
        }
        await saveCheckpoint(analysisId, { samplePhase: phase, pageToken });
      }
    } catch (e) {
      if (isCommentsDisabledError(e)) {
        throw new Error("이 영상은 댓글이 비활성화되어 있어 분석할 수 없습니다.");
      }
      throw e;
    }

    if (skippedReplies > 0) {
      notices.push(
        `답글이 ${SAMPLE_MAX_REPLIES_PER_THREAD}개를 넘는 대형 스레드 ${skippedReplies}개는 표본 모드에서 화면에 표시된 일부 답글만 포함했습니다.`,
      );
    }
    await saveCheckpoint(analysisId, { collectDone: true, pageToken: null });
  }

  const collected = await prisma.comment.count({ where: { videoId: video.id } });
  const margin = achievedMarginOfError(video.commentCount, collected);
  const populationText =
    video.commentCount != null ? `약 ${video.commentCount.toLocaleString()}개` : "미상";
  notices.push(
    `통계 표본 분석: 전체 댓글 ${populationText} 중 ${collected.toLocaleString()}개를 표본 수집했습니다. 동일 크기의 무작위 표본 기준 95% 신뢰수준 오차범위는 약 ±${(margin * 100).toFixed(1)}%p입니다.`,
  );
  notices.push(
    "표본은 인기순+최신순 댓글에서 추출한 준표본으로, 완전한 무작위 표본이 아닙니다 (YouTube API는 무작위 추출을 지원하지 않습니다). 오차범위는 참고치로 해석하세요.",
  );

  await setProgress(analysisId, 3, 1); // replies were backfilled inline
  return { notices };
}

async function stepCollectComments(
  analysisId: string,
  video: VideoMeta,
  mode: AnalysisMode,
): Promise<{ notices: string[] }> {
  if (mode === "sample" && !isMockMode()) {
    return stepCollectSample(analysisId, video);
  }

  const notices: string[] = [];
  const checkpoint = await loadCheckpoint(analysisId);

  if (checkpoint.collectDone) {
    await setProgress(analysisId, 3, 1);
    return { notices };
  }

  if (isMockMode()) {
    const { comments } = buildMockDataset(video.id);
    await setProgress(analysisId, 2, 0.3);
    await upsertComments(video.id, comments);
    await saveCheckpoint(analysisId, { collectDone: true, pageToken: null });
    await setProgress(analysisId, 3, 1);
    return { notices };
  }

  let pageToken: string | null | undefined = checkpoint.pageToken ?? null;
  let pages = checkpoint.pagesCollected ?? 0;
  const maxPages = mode === "quick" ? QUICK_MAX_PAGES : Infinity;
  const expected = video.commentCount ?? null;

  try {
    do {
      await checkCancel(analysisId);
      const page = await collectCommentPage(video.id, pageToken ?? undefined);
      await upsertComments(video.id, page.comments);
      pages += 1;
      pageToken = page.nextPageToken;
      await saveCheckpoint(analysisId, { pageToken, pagesCollected: pages });

      const collected = await prisma.comment.count({ where: { videoId: video.id } });
      const progress = expected
        ? Math.min(0.95, collected / Math.max(1, expected))
        : Math.min(0.95, pages / (pages + 3));
      await setProgress(analysisId, 2, progress);

      if (pages >= maxPages && pageToken) {
        notices.push(
          "빠른 분석 모드: 최신 댓글 일부만 수집했습니다. 전체 댓글 분석은 '전체 댓글 심층 분석'을 사용하세요.",
        );
        break;
      }
    } while (pageToken);
  } catch (e) {
    if (isCommentsDisabledError(e)) {
      throw new Error("이 영상은 댓글이 비활성화되어 있어 분석할 수 없습니다.");
    }
    if (e instanceof YouTubeApiError && e.reason === "quotaExceeded") {
      throw new Error(
        "YouTube API 일일 쿼터를 초과했습니다. 내일 다시 시도하거나 '재시도'로 이어서 수집할 수 있습니다.",
      );
    }
    throw e;
  }

  await saveCheckpoint(analysisId, { collectDone: true, pageToken: null });
  await setProgress(analysisId, 3, 1); // replies were backfilled inline
  return { notices };
}

async function stepEnrichComments(analysisId: string, video: VideoMeta) {
  await setProgress(analysisId, 4, 0.05);

  const comments = await prisma.comment.findMany({
    where: { videoId: video.id },
    select: {
      id: true,
      textOriginal: true,
      authorChannelId: true,
      authorDisplayName: true,
      detectedLanguage: true,
    },
  });

  // Per-author duplicate counts feed the spam heuristic.
  const perAuthorText = new Map<string, number>();
  const normalized = comments.map((c) => {
    const norm = normalizeForDedup(c.textOriginal);
    const authorKey = `${c.authorChannelId ?? c.authorDisplayName}::${norm}`;
    perAuthorText.set(authorKey, (perAuthorText.get(authorKey) ?? 0) + 1);
    return { ...c, norm, authorKey };
  });

  const dedup = assignDuplicateGroups(
    normalized.map((c) => ({ id: c.id, normalizedText: c.norm })),
  );

  // Representative = most-liked member of each duplicate group; other members
  // are flagged so the explorer can hide "extra copies" without losing the original.
  const likeById = new Map<string, number>();
  const rowsWithLikes = await prisma.comment.findMany({
    where: { videoId: video.id },
    select: { id: true, likeCount: true },
  });
  for (const r of rowsWithLikes) likeById.set(r.id, r.likeCount);

  const representativeByGroup = new Map<string, string>();
  for (const [commentId, groupId] of dedup.groups) {
    const current = representativeByGroup.get(groupId);
    if (
      !current ||
      (likeById.get(commentId) ?? 0) > (likeById.get(current) ?? 0)
    ) {
      representativeByGroup.set(groupId, commentId);
    }
  }

  const CHUNK = 50;
  for (let i = 0; i < normalized.length; i += CHUNK) {
    await checkCancel(analysisId);
    const chunk = normalized.slice(i, i + CHUNK);
    await prisma.$transaction(
      chunk.map((c) =>
        prisma.comment.update({
          where: { id: c.id },
          data: {
            detectedLanguage: detectLanguage(c.textOriginal),
            normalizedText: c.norm,
            extractedTimestamps: JSON.stringify(
              parseTimestamps(c.textOriginal, video.durationSeconds).map((t) => t.seconds),
            ),
            duplicateGroupId: dedup.groups.get(c.id) ?? null,
            isDuplicateExtra:
              dedup.groups.has(c.id) &&
              representativeByGroup.get(dedup.groups.get(c.id)!) !== c.id,
            spamProbability: spamProbability({
              text: c.textOriginal,
              authorDuplicateCount: (perAuthorText.get(c.authorKey) ?? 1) - 1,
            }),
          },
        }),
      ),
    );
    await setProgress(analysisId, 4, 0.05 + 0.95 * ((i + chunk.length) / normalized.length));
  }

  await setProgress(analysisId, 4, 1);
}

async function stepClaudeAnalysis(
  analysisId: string,
  video: VideoMeta,
  mode: AnalysisMode,
): Promise<{ notices: string[] }> {
  const notices: string[] = [];
  await setProgress(analysisId, 5, 0.02);

  // Comments that failed on an earlier attempt go back in the queue — otherwise
  // the "'재시도'로 이어서 분석할 수 있습니다" notice would never actually retry them.
  await prisma.comment.updateMany({
    where: { videoId: video.id, analysisStatus: "failed" },
    data: { analysisStatus: "pending" },
  });

  // Quick mode: analyze only the most-liked top-level comments.
  if (mode === "quick") {
    const targets = await prisma.comment.findMany({
      where: { videoId: video.id, analysisStatus: "pending", isReply: false },
      orderBy: { likeCount: "desc" },
      take: QUICK_MAX_ANALYZED,
      select: { id: true },
    });
    const targetIds = new Set(targets.map((t) => t.id));
    await prisma.comment.updateMany({
      where: {
        videoId: video.id,
        analysisStatus: "pending",
        id: { notIn: [...targetIds] },
      },
      data: { analysisStatus: "skipped" },
    });
    if (targetIds.size > 0) {
      notices.push(
        `빠른 분석 모드: 좋아요 상위 ${targetIds.size.toLocaleString()}개 댓글만 Claude로 분석했습니다.`,
      );
    }
  }

  const pending = await prisma.comment.findMany({
    where: { videoId: video.id, analysisStatus: "pending" },
    orderBy: { likeCount: "desc" },
    select: { id: true, textOriginal: true, likeCount: true, isReply: true },
  });

  if (pending.length === 0) {
    await setProgress(analysisId, 5, 1);
    return { notices };
  }

  const videoCtx = {
    title: video.title,
    channelTitle: video.channelTitle,
    durationSeconds: video.durationSeconds,
  };

  // mock 모드에서는 댓글 전체를 기준으로 한 번만 만들어 모든 배치에서
  // 재사용합니다. 배치(12개)마다 새로 만들면 빈도 기반 캐릭터 추출의
  // 표본이 너무 작아집니다.
  const mockNameMatchers = isMockClaude()
    ? buildDynamicNameMatchers(
        videoCtx,
        pending.map((c) => c.textOriginal),
      )
    : undefined;

  let failedCount = 0;
  for (let i = 0; i < pending.length; i += DEFAULT_BATCH_SIZE) {
    await checkCancel(analysisId);
    const batch = pending.slice(i, i + DEFAULT_BATCH_SIZE);

    try {
      const results = await analyzeCommentBatch(
        batch.map((c) => ({
          id: c.id,
          text: c.textOriginal,
          likeCount: c.likeCount,
          isReply: c.isReply,
        })),
        videoCtx,
        { mockNameMatchers },
      );

      await prisma.$transaction(
        results.map((r) =>
          prisma.comment.update({
            where: { id: r.commentId },
            data: {
              analysisStatus: "analyzed",
              sentiment: r.sentiment,
              emotions: JSON.stringify(r.emotions),
              topics: JSON.stringify(r.topics),
              mentionedCharacters: JSON.stringify(r.mentionedCharacters),
              mentionedGamesOrMedia: JSON.stringify(r.mentionedGamesOrMedia),
              mentionedTimestampSeconds: JSON.stringify(r.mentionedTimestampSeconds),
              impressiveReason: r.impressiveReason,
              concernReason: r.concernReason,
              confidence: r.confidence,
              analyzedAt: new Date(),
            },
          }),
        ),
      );
    } catch (e) {
      if (e instanceof CancelledError) throw e;
      failedCount += batch.length;
      await prisma.comment.updateMany({
        where: { id: { in: batch.map((c) => c.id) } },
        data: { analysisStatus: "failed" },
      });
      // Too many failures → abort the step so the user can retry.
      if (failedCount > pending.length / 2 && failedCount > 50) {
        throw new Error(
          `Claude 분석 실패가 과도합니다 (${failedCount}개). 마지막 오류: ${(e as Error).message}`,
        );
      }
    }

    await setProgress(
      analysisId,
      5,
      Math.min(0.99, (i + batch.length) / pending.length),
    );
  }

  if (failedCount > 0) {
    notices.push(
      `${failedCount.toLocaleString()}개 댓글은 Claude 분석에 실패했습니다. '재시도'로 이어서 분석할 수 있습니다.`,
    );
  }

  await setProgress(analysisId, 5, 1);
  return { notices };
}

interface HeatmapResolution {
  source: HeatmapSource | "none";
  segments: HeatSegment[];
  notices: string[];
}

async function resolveHeatmap(video: VideoMeta): Promise<HeatmapResolution> {
  const notices: string[] = [];

  // Priority: owner Analytics > manual upload > yt-dlp > mock.
  for (const source of ["owner", "manual"] as const) {
    const rows = await prisma.heatmapSegment.findMany({
      where: { videoId: video.id, source },
      orderBy: { startTime: "asc" },
    });
    if (rows.length > 0) {
      return {
        source,
        segments: normalizeSegments(
          rows.map((r) => ({ startTime: r.startTime, endTime: r.endTime, value: r.value })),
        ),
        notices,
      };
    }
  }

  const ytdlp = await getYtdlpHeatmap(video.id);
  if (ytdlp && ytdlp.length > 0) {
    await prisma.heatmapSegment.deleteMany({
      where: { videoId: video.id, source: "ytdlp" },
    });
    await prisma.heatmapSegment.createMany({
      data: ytdlp.map((s) => ({
        videoId: video.id,
        source: "ytdlp",
        startTime: s.startTime,
        endTime: s.endTime,
        value: s.value,
      })),
    });
    notices.push("반복 재생 데이터는 비공식 공개 히트맵(yt-dlp)에서 가져왔습니다.");
    return { source: "ytdlp", segments: normalizeSegments(ytdlp), notices };
  }

  if (isMockMode()) {
    const segments = buildMockDataset(video.id).heatmap;
    return { source: "mock", segments, notices };
  }

  notices.push(
    "반복 재생 데이터가 없어 댓글 타임스탬프 언급만으로 장면을 구성했습니다.",
  );
  return { source: "none", segments: [], notices };
}

function rowToAggregate(row: CommentRow): AggregateComment {
  return {
    id: row.id,
    isReply: row.isReply,
    authorKey: row.authorChannelId ?? row.authorDisplayName,
    likeCount: row.likeCount,
    publishedAt: row.publishedAt.toISOString(),
    detectedLanguage: row.detectedLanguage,
    timestamps: safeJsonParse<number[]>(row.extractedTimestamps, []),
    duplicateGroupId: row.duplicateGroupId,
    spamProbability: row.spamProbability,
    shortOrEmoji: isShortOrEmojiOnly(row.textOriginal),
    analyzed: row.analysisStatus === "analyzed",
    sentiment: (row.sentiment as Sentiment | null) ?? null,
    emotions: safeJsonParse<string[]>(row.emotions, []),
    topics: safeJsonParse<Topic[]>(row.topics, []),
  };
}

async function stepScenesAndReport(
  analysisId: string,
  video: VideoMeta,
  mode: AnalysisMode,
  notices: string[],
) {
  await setProgress(analysisId, 6, 0.1);

  const rows = await prisma.comment.findMany({ where: { videoId: video.id } });
  const aggregates = rows.map(rowToAggregate);

  const heatmap = await resolveHeatmap(video);
  notices.push(...heatmap.notices);

  const sceneInputs = rows
    .filter((r) => r.analysisStatus === "analyzed")
    .map((r) => ({
      id: r.id,
      likeCount: r.likeCount,
      timestamps: safeJsonParse<number[]>(r.extractedTimestamps, []),
      topics: safeJsonParse<Topic[]>(r.topics, []),
      text: r.textOriginal,
    }));

  const drafts = buildScenes({
    comments: sceneInputs,
    heatmap: heatmap.segments,
    durationSeconds: video.durationSeconds,
  });
  const peaks = findHeatPeaks(heatmap.segments, { topN: 5 });

  await checkCancel(analysisId);
  await setProgress(analysisId, 6, 0.7);

  // Replace scene rows for this analysis (user edits happen post-completion).
  await prisma.sceneCluster.deleteMany({ where: { analysisId } });
  const sceneRows = await prisma.$transaction(
    drafts.map((d) =>
      prisma.sceneCluster.create({
        data: {
          analysisId,
          rank: d.rank,
          startSec: d.startSec,
          endSec: d.endSec,
          mentionCount: d.mentionCount,
          likeWeighted: d.likeWeighted,
          heatIntensity: d.heatIntensity,
          topics: JSON.stringify(d.topics),
        },
      }),
    ),
  );

  await setProgress(analysisId, 6, 1);
  await setProgress(analysisId, 7, 0.1);

  // Deterministic stats — raw and cleaned variants.
  const statsRaw = computeStatsVariant(aggregates);
  const statsCleaned = computeStatsVariant(cleanComments(aggregates));

  // Narrative input (privacy: excerpts only, no author identifiers).
  const narrativeInput: NarrativeInput = {
    video: {
      title: video.title,
      channelTitle: video.channelTitle,
      durationSeconds: video.durationSeconds,
    },
    totals: {
      analyzed: statsCleaned.analyzedCount,
      positiveShare:
        statsCleaned.analyzedCount > 0
          ? statsCleaned.sentimentCounts.positive / statsCleaned.analyzedCount
          : 0,
      negativeShare:
        statsCleaned.analyzedCount > 0
          ? statsCleaned.sentimentCounts.negative / statsCleaned.analyzedCount
          : 0,
    },
    topics: statsCleaned.topics.slice(0, 12).map((t) => ({
      topic: t.topic,
      count: t.count,
      share: t.share,
      likeWeightedShare: t.likeWeightedShare,
      examples: topExamples(rows, t.topic),
    })),
    scenes: sceneRows.map((s, i) => ({
      sceneId: s.id,
      startSec: s.startSec,
      endSec: s.endSec,
      mentionCount: s.mentionCount,
      heatIntensity: s.heatIntensity,
      examples: drafts[i]?.exampleTexts ?? [],
    })),
    controversy: statsCleaned.topics
      .filter((t) =>
        (
          [
            "character_design",
            "existing_character_absence",
            "censorship",
            "platform_release",
            "ai_concern",
            "story_lore",
          ] as Topic[]
        ).includes(t.topic),
      )
      .map((t) => ({
        topic: t.topic,
        count: t.count,
        share: t.share,
        examples: topExamples(rows, t.topic),
      })),
  };

  const narratives = await generateNarratives(narrativeInput);
  await setProgress(analysisId, 7, 0.7);

  // Apply narrative annotations to scene rows.
  const annotationById = new Map(narratives.sceneAnnotations.map((a) => [a.sceneId, a]));
  await prisma.$transaction(
    sceneRows.map((s) => {
      const a = annotationById.get(s.id);
      return prisma.sceneCluster.update({
        where: { id: s.id },
        data: {
          description: a?.description ?? null,
          reason: a?.reason ?? null,
          summary: a?.summary ?? null,
        },
      });
    }),
  );

  const finalScenes: SceneInfo[] = sceneRows.map((s) => {
    const a = annotationById.get(s.id);
    return {
      id: s.id,
      rank: s.rank,
      startSec: s.startSec,
      endSec: s.endSec,
      mentionCount: s.mentionCount,
      likeWeighted: s.likeWeighted,
      heatIntensity: s.heatIntensity,
      topics: safeJsonParse<Topic[]>(s.topics, []),
      summary: a?.summary ?? null,
      description: a?.description ?? null,
      reason: a?.reason ?? null,
    };
  });

  const collectedTotal = rows.length;
  const topLevel = rows.filter((r) => !r.isReply).length;

  const collectionNotices = [
    "수집된 댓글 수는 YouTube 화면에 표시되는 댓글 수와 다를 수 있습니다.",
    "삭제·숨김·검토 대기·스팸 처리된 댓글은 API로 수집할 수 없습니다.",
  ];

  // 열광 지점: 최다 재생 구간 + 댓글 근거. 외부 API 호출 없이 로컬 계산입니다.
  const hypeInputs: HypeCommentInput[] = rows.map((r) => ({
    id: r.id,
    author: r.authorDisplayName,
    text: r.textOriginal,
    likeCount: r.likeCount,
    timestamps: safeJsonParse<number[]>(r.extractedTimestamps, []),
    topics: safeJsonParse<Topic[]>(r.topics, []),
  }));
  const hype = buildHypeReport({
    comments: hypeInputs,
    heatmap: heatmap.segments,
    durationSeconds: video.durationSeconds,
  });

  const report = buildReportPayload({
    mode,
    video,
    collection: {
      collectedTotal,
      topLevel,
      replies: collectedTotal - topLevel,
      displayedByYouTube: video.commentCount,
      notices: collectionNotices,
    },
    statsRaw,
    statsCleaned,
    scenes: finalScenes,
    hype,
    heatmapSource: heatmap.source,
    heatmapSegments: heatmap.segments,
    heatmapPeaks: peaks,
    narratives,
    completeness: notices,
  });

  await prisma.analysis.update({
    where: { id: analysisId },
    data: {
      reportJson: JSON.stringify(report),
      statsJson: JSON.stringify({ raw: statsRaw, cleaned: statsCleaned }),
      dataCompleteness: JSON.stringify(notices),
      heatmapSource: heatmap.source,
      currentStep: 7,
      stepProgress: 1,
    },
  });
}

function topExamples(rows: CommentRow[], topic: Topic): string[] {
  return rows
    .filter(
      (r) =>
        r.analysisStatus === "analyzed" &&
        safeJsonParse<string[]>(r.topics, []).includes(topic),
    )
    .sort((a, b) => b.likeCount - a.likeCount)
    .slice(0, 3)
    .map((r) => r.textOriginal.slice(0, 200));
}

// ── Entry points ─────────────────────────────────────────────────────────────

export async function runAnalysisPipeline(analysisId: string): Promise<void> {
  const analysis = await prisma.analysis.findUnique({ where: { id: analysisId } });
  if (!analysis) return;

  const mode = analysis.mode as AnalysisMode;
  const notices: string[] = [];

  try {
    const video = await stepVerifyVideo(analysisId, analysis.videoId);

    const collect = await stepCollectComments(analysisId, video, mode);
    notices.push(...collect.notices);

    await stepEnrichComments(analysisId, video);

    const claude = await stepClaudeAnalysis(analysisId, video, mode);
    notices.push(...claude.notices);

    await stepScenesAndReport(analysisId, video, mode, notices);

    await prisma.analysis.update({
      where: { id: analysisId },
      data: { status: "completed", completedAt: new Date(), error: null, failedStep: null },
    });
  } catch (e) {
    if (e instanceof CancelledError) {
      await prisma.analysis.update({
        where: { id: analysisId },
        data: { status: "canceled" },
      });
      return;
    }
    const current = await prisma.analysis.findUnique({
      where: { id: analysisId },
      select: { currentStep: true },
    });
    await prisma.analysis.update({
      where: { id: analysisId },
      data: {
        status: "failed",
        error: (e as Error).message ?? "알 수 없는 오류",
        failedStep: current?.currentStep ?? null,
      },
    });
  }
}

/**
 * Re-runs only steps 6–7 (scene linking + report) — used after a manual
 * heatmap upload so the report reflects the new data without re-collecting
 * or re-analyzing comments.
 */
export async function relinkScenesAndReport(analysisId: string): Promise<void> {
  const analysis = await prisma.analysis.findUnique({
    where: { id: analysisId },
    include: { video: true },
  });
  if (!analysis || !analysis.video) return;

  const notices = safeJsonParse<string[]>(analysis.dataCompleteness, []).filter(
    (n) => !n.startsWith("반복 재생 데이터"),
  );
  await stepScenesAndReport(
    analysisId,
    videoRowToMeta(analysis.video),
    analysis.mode as AnalysisMode,
    notices,
  );
  await prisma.analysis.update({
    where: { id: analysisId },
    data: { status: "completed", completedAt: analysis.completedAt ?? new Date() },
  });
}
