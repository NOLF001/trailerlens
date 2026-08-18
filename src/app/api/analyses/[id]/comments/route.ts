// GET /api/analyses/[id]/comments — filtered, paginated comment explorer.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { safeJsonParse } from "@/lib/utils";
import { SPAM_THRESHOLD } from "@/lib/analysis/spam";

const querySchema = z.object({
  q: z.string().max(200).optional(),
  language: z.string().max(10).optional(),
  topic: z.string().max(40).optional(),
  sentiment: z.enum(["positive", "neutral", "negative", "mixed"]).optional(),
  type: z.enum(["all", "top", "reply"]).optional().default("all"),
  minLikes: z.coerce.number().int().min(0).optional(),
  hasTimestamp: z.enum(["true", "false"]).optional(),
  includeNoise: z.enum(["true", "false"]).optional().default("false"),
  sort: z.enum(["likes", "recent"]).optional().default("likes"),
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

  const where: Prisma.CommentWhereInput = { videoId: analysis.videoId };

  if (qp.q) where.textOriginal = { contains: qp.q };
  if (qp.language) where.detectedLanguage = qp.language;
  if (qp.sentiment) where.sentiment = qp.sentiment;
  if (qp.type === "top") where.isReply = false;
  if (qp.type === "reply") where.isReply = true;
  if (qp.minLikes) where.likeCount = { gte: qp.minLikes };
  if (qp.topic) where.topics = { contains: `"${qp.topic}"` };
  if (qp.hasTimestamp === "true") {
    where.AND = [
      { extractedTimestamps: { not: null } },
      { extractedTimestamps: { not: "[]" } },
    ];
  }
  if (qp.includeNoise !== "true") {
    where.isDuplicateExtra = false;
    where.OR = [
      { spamProbability: null },
      { spamProbability: { lt: SPAM_THRESHOLD } },
    ];
  }

  const orderBy: Prisma.CommentOrderByWithRelationInput =
    qp.sort === "recent" ? { publishedAt: "desc" } : { likeCount: "desc" };

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
