// POST /api/analyses — create (or reuse) an analysis job.
// GET  /api/analyses — recent analyses for the home page.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { isValidVideoId } from "@/lib/youtube/url";
import { getVideoMeta } from "@/lib/youtube/metadata";
import { getOwnerRetention, AnalyticsError } from "@/lib/youtube/analytics";
import { kickoffAnalysis } from "@/lib/jobs/runner";
import { pruneOldVideos } from "@/lib/jobs/retention";
import { rateLimit, clientIpFrom } from "@/lib/rate-limit";
import { serializeAnalysis } from "@/lib/serialize";
import { env, isGoogleOAuthConfigured, isMockMode } from "@/lib/env";

const bodySchema = z.object({
  videoId: z.string().min(11).max(11),
  mode: z.enum(["quick", "sample", "full", "owner"]),
  force: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  const rl = rateLimit(`analyses:${clientIpFrom(req)}`, { limit: 10, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: `요청이 너무 많습니다. ${rl.retryAfterSeconds}초 후 다시 시도하세요.` },
      { status: 429 },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success || !isValidVideoId(parsed.data.videoId)) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const { videoId, mode, force } = parsed.data;

  // Verify the video exists and make sure a Video row is present.
  const meta = await getVideoMeta(videoId).catch(() => null);
  if (!meta) {
    return NextResponse.json(
      { error: "영상을 확인할 수 없습니다. URL을 다시 확인하세요." },
      { status: 404 },
    );
  }
  await prisma.video.upsert({
    where: { id: videoId },
    create: {
      id: videoId,
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
    },
    update: {},
  });

  // Owner mode: fetch Analytics retention NOW (while we hold the session).
  if (mode === "owner") {
    if (isMockMode()) {
      // In mock mode owner data is simulated by the mock heatmap later.
    } else {
      if (!isGoogleOAuthConfigured()) {
        return NextResponse.json(
          { error: "Google OAuth가 설정되지 않아 채널 소유자 모드를 사용할 수 없습니다." },
          { status: 400 },
        );
      }
      const token = await getToken({ req, secret: env().NEXTAUTH_SECRET });
      const accessToken = token?.accessToken as string | undefined;
      if (!accessToken) {
        return NextResponse.json(
          { error: "채널 소유자 모드는 Google 로그인이 필요합니다." },
          { status: 401 },
        );
      }
      try {
        const retention = await getOwnerRetention(
          accessToken,
          videoId,
          meta.durationSeconds,
        );
        await prisma.heatmapSegment.deleteMany({ where: { videoId, source: "owner" } });
        await prisma.heatmapSegment.createMany({
          data: retention.segments.map((s) => ({
            videoId,
            source: "owner",
            startTime: s.startTime,
            endTime: s.endTime,
            value: s.value,
          })),
        });
      } catch (e) {
        const msg =
          e instanceof AnalyticsError
            ? e.message
            : "YouTube Analytics 데이터를 가져오지 못했습니다.";
        return NextResponse.json(
          { error: `${msg} (본인 채널의 영상인지 확인하세요)` },
          { status: 400 },
        );
      }
    }
  }

  // Reuse an in-flight analysis for the same video+mode.
  const inFlight = await prisma.analysis.findFirst({
    where: { videoId, mode, status: { in: ["queued", "running"] } },
    orderBy: { createdAt: "desc" },
  });
  if (inFlight) {
    return NextResponse.json({ id: inFlight.id, reused: true });
  }

  // Reuse the latest completed analysis unless the user forces a re-run.
  if (!force) {
    const completed = await prisma.analysis.findFirst({
      where: { videoId, mode, status: "completed" },
      orderBy: { createdAt: "desc" },
    });
    if (completed) {
      return NextResponse.json({ id: completed.id, reused: true });
    }
  }

  const analysis = await prisma.analysis.create({
    data: { videoId, mode, status: "queued" },
  });
  await kickoffAnalysis(analysis.id);
  void pruneOldVideos().catch((e) => console.error("pruneOldVideos failed:", e));

  return NextResponse.json({ id: analysis.id, reused: false }, { status: 201 });
}

export async function GET() {
  const analyses = await prisma.analysis.findMany({
    orderBy: { createdAt: "desc" },
    take: 12,
    include: { video: true },
  });
  return NextResponse.json({ analyses: analyses.map(serializeAnalysis) });
}
