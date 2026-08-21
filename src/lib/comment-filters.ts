// 댓글 탐색기와 엑셀 내보내기가 같은 필터를 쓰도록 한곳에 모읍니다.
// 화면에 보이는 목록과 내보낸 파일의 내용이 어긋나면 안 됩니다.

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { SPAM_THRESHOLD } from "@/lib/analysis/spam";

export const commentFilterSchema = z.object({
  q: z.string().max(200).optional(),
  language: z.string().max(10).optional(),
  topic: z.string().max(40).optional(),
  sentiment: z.enum(["positive", "neutral", "negative", "mixed"]).optional(),
  type: z.enum(["all", "top", "reply"]).optional().default("all"),
  minLikes: z.coerce.number().int().min(0).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasTimestamp: z.enum(["true", "false"]).optional(),
  includeNoise: z.enum(["true", "false"]).optional().default("false"),
  sort: z.enum(["likes", "recent"]).optional().default("likes"),
});

export type CommentFilters = z.infer<typeof commentFilterSchema>;

export function buildCommentWhere(
  videoId: string,
  qp: CommentFilters,
): Prisma.CommentWhereInput {
  const where: Prisma.CommentWhereInput = { videoId };

  if (qp.q) where.textOriginal = { contains: qp.q };
  if (qp.language) where.detectedLanguage = qp.language;
  if (qp.sentiment) where.sentiment = qp.sentiment;
  if (qp.type === "top") where.isReply = false;
  if (qp.type === "reply") where.isReply = true;
  if (qp.minLikes) where.likeCount = { gte: qp.minLikes };
  if (qp.topic) where.topics = { contains: `"${qp.topic}"` };
  if (qp.dateFrom || qp.dateTo) {
    where.publishedAt = {
      ...(qp.dateFrom ? { gte: new Date(`${qp.dateFrom}T00:00:00.000Z`) } : {}),
      ...(qp.dateTo ? { lte: new Date(`${qp.dateTo}T23:59:59.999Z`) } : {}),
    };
  }
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

  return where;
}

export function buildCommentOrderBy(
  qp: CommentFilters,
): Prisma.CommentOrderByWithRelationInput {
  return qp.sort === "recent" ? { publishedAt: "desc" } : { likeCount: "desc" };
}

/** 필터가 하나라도 걸려 있는지 — 내보내기 파일명과 안내 문구에 씁니다. */
export function hasActiveFilters(qp: CommentFilters): boolean {
  return Boolean(
    qp.q ||
      qp.language ||
      qp.topic ||
      qp.sentiment ||
      (qp.type && qp.type !== "all") ||
      qp.minLikes ||
      qp.dateFrom ||
      qp.dateTo ||
      qp.hasTimestamp === "true" ||
      qp.includeNoise === "true",
  );
}
