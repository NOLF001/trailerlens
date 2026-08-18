// GET    /api/analyses/[id] — job status + report (poll target)
// DELETE /api/analyses/[id] — delete analysis (and orphaned video data)

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serializeAnalysis } from "@/lib/serialize";
import { blockIfPublicDemo } from "@/lib/guard";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const analysis = await prisma.analysis.findUnique({
    where: { id },
    include: { video: true },
  });
  if (!analysis) {
    return NextResponse.json({ error: "분석을 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ analysis: serializeAnalysis(analysis) });
}

export async function DELETE(_req: Request, { params }: Params) {
  const blocked = blockIfPublicDemo(
    "공개 모드에서는 분석을 삭제할 수 없습니다.",
  );
  if (blocked) return blocked;

  const { id } = await params;
  const analysis = await prisma.analysis.findUnique({ where: { id } });
  if (!analysis) {
    return NextResponse.json({ error: "분석을 찾을 수 없습니다." }, { status: 404 });
  }

  await prisma.analysis.delete({ where: { id } });

  // If no other analysis references the video, remove the video and all its
  // collected comments/heatmaps (data deletion guarantee).
  const remaining = await prisma.analysis.count({ where: { videoId: analysis.videoId } });
  if (remaining === 0) {
    await prisma.video.delete({ where: { id: analysis.videoId } }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
