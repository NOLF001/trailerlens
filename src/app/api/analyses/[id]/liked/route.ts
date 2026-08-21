// GET /api/analyses/[id]/liked — 좋아요 순 상위 댓글과, 그 댓글들이 무엇에
// 대한 반응이었는지의 집계. 전부 수집한 댓글에서 직접 센 값입니다.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { buildLikedAnalysis } from "@/lib/analysis/liked";
import { safeJsonParse } from "@/lib/utils";
import { SPAM_THRESHOLD } from "@/lib/analysis/spam";
import type { Topic } from "@/lib/types";

const querySchema = z.object({
  scope: z.coerce.number().int().min(10).max(500).optional().default(100),
  includeNoise: z.enum(["true", "false"]).optional().default("false"),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const analysis = await prisma.analysis.findUnique({
    where: { id },
    select: { videoId: true },
  });
  if (!analysis) {
    return NextResponse.json({ error: "분석을 찾을 수 없습니다." }, { status: 404 });
  }

  const parsed = querySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const { scope, includeNoise } = parsed.data;

  const where: Prisma.CommentWhereInput = { videoId: analysis.videoId };
  if (includeNoise !== "true") {
    where.isDuplicateExtra = false;
    where.OR = [{ spamProbability: null }, { spamProbability: { lt: SPAM_THRESHOLD } }];
  }

  const rows = await prisma.comment.findMany({
    where,
    select: {
      id: true,
      authorDisplayName: true,
      textOriginal: true,
      likeCount: true,
      publishedAt: true,
      isReply: true,
      topics: true,
    },
  });

  const result = buildLikedAnalysis(
    rows.map((r) => ({
      id: r.id,
      author: r.authorDisplayName,
      text: r.textOriginal,
      likeCount: r.likeCount,
      publishedAt: r.publishedAt.toISOString(),
      isReply: r.isReply,
      topics: safeJsonParse<Topic[]>(r.topics, []),
    })),
    { scope },
  );

  return NextResponse.json(result);
}
