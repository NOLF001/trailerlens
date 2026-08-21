// GET /api/analyses/[id]/comments — filtered, paginated comment explorer.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { safeJsonParse } from "@/lib/utils";
import { SPAM_THRESHOLD } from "@/lib/analysis/spam";
import {
  buildCommentOrderBy,
  buildCommentWhere,
  commentFilterSchema,
} from "@/lib/comment-filters";

const querySchema = commentFilterSchema.extend({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(50),
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
    return NextResponse.json({ error: "잘못된 필터입니다." }, { status: 400 });
  }
  const qp = parsed.data;

  const where = buildCommentWhere(analysis.videoId, qp);
  const orderBy = buildCommentOrderBy(qp);

  const [total, rows] = await Promise.all([
    prisma.comment.count({ where }),
    prisma.comment.findMany({
      where,
      orderBy,
      skip: (qp.page - 1) * qp.pageSize,
      take: qp.pageSize,
    }),
  ]);

  return NextResponse.json({
    total,
    page: qp.page,
    pageSize: qp.pageSize,
    comments: rows.map((r) => ({
      id: r.id,
      isReply: r.isReply,
      author: r.authorDisplayName,
      text: r.textOriginal,
      likeCount: r.likeCount,
      publishedAt: r.publishedAt.toISOString(),
      language: r.detectedLanguage,
      sentiment: r.sentiment,
      topics: safeJsonParse<string[]>(r.topics, []),
      emotions: safeJsonParse<string[]>(r.emotions, []),
      timestamps: safeJsonParse<number[]>(r.extractedTimestamps, []),
      isDuplicate: r.duplicateGroupId != null,
      isSpam: (r.spamProbability ?? 0) >= SPAM_THRESHOLD,
      analysisStatus: r.analysisStatus,
      impressiveReason: r.impressiveReason,
      concernReason: r.concernReason,
    })),
  });
}
