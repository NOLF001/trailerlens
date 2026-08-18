// POST /api/settings/purge — delete ALL collected/analyzed data.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, clientIpFrom } from "@/lib/rate-limit";
import { blockIfPublicDemo } from "@/lib/guard";

export async function POST(req: Request) {
  const blocked = blockIfPublicDemo(
    "공개 모드에서는 전체 데이터 삭제를 사용할 수 없습니다.",
  );
  if (blocked) return blocked;

  const rl = rateLimit(`purge:${clientIpFrom(req)}`, { limit: 3, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json({ error: "요청이 너무 많습니다." }, { status: 429 });
  }

  // Video deletion cascades to comments, analyses, scenes and heatmaps.
  await prisma.video.deleteMany({});
  await prisma.analysis.deleteMany({});

  return NextResponse.json({ ok: true });
}
