// GET /api/analyses/[id]/comments/by-category
// Analyzed comments grouped by topic, each group carrying its top comments.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { safeJsonParse } from "@/lib/utils";
import { SPAM_THRESHOLD } from "@/lib/analysis/spam";
import { TOPICS, type Topic } from "@/lib/types";

const querySchema = z.object({
  per: z.coerce.number().int().min(1).max(20).optional().default(6),
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
  const { per, includeNoise } = parsed.data;

  const where: Prisma.CommentWhereInput = {
    videoId: analysis.videoId,
    analysisStatus: "analyzed",
  };
  if (includeNoise !== "true") {
    where.isDuplicateExtra = false;
    where.OR = [{ spamProbability: null }, { spamProbability: { lt: SPAM_THRESHOLD } }];
  }

  // Like-sorted once; groups then keep their top-N in order for free.
  const rows = await prisma.comment.findMany({
    where,
    orderBy: { likeCount: "desc" },
  });

  const groups = new Map<Topic, typeof rows>();
  for (const row of rows) {
    for (const topic of safeJsonParse<Topic[]>(row.topics, [])) {
      if (!TOPICS.includes(topic)) continue;
      const list = groups.get(topic) ?? [];
      list.push(row);
      groups.set(topic, list);
    }
  }

  const totalAnalyzed = rows.length;
  const payload = [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([topic, members]) => ({
      topic,
      count: members.length,
      share: totalAnalyzed > 0 ? members.length / totalAnalyzed : 0,
      comments: members.slice(0, per).map((r) => ({
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
    }));

  return NextResponse.json({ totalAnalyzed, groups: payload });
}
