// 열광 지점 직접 편집.
//   POST   /api/analyses/[id]/moments  — 지점 추가 / 설명 저장 / 숨기기
//   DELETE /api/analyses/[id]/moments  — 편집 내용 되돌리기 (?editId=...)
//
// 편집 후에는 보고서의 6~7단계만 다시 돌려서(relinkScenesAndReport) 화면에
// 반영합니다. 댓글을 다시 수집하거나 재분석하지 않습니다.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { relinkScenesAndReport } from "@/lib/jobs/pipeline";
import { rateLimit, clientIpFrom } from "@/lib/rate-limit";

const bodySchema = z.discriminatedUnion("action", [
  // 사용자가 직접 구간을 지정해 새 지점을 만듭니다.
  z.object({
    action: z.literal("add"),
    startSec: z.number().min(0),
    endSec: z.number().min(0),
    description: z.string().max(2000).optional(),
  }),
  // 자동/수동 지점에 영상 내용 설명을 답니다.
  z.object({
    action: z.literal("describe"),
    startSec: z.number().min(0),
    endSec: z.number().min(0),
    description: z.string().max(2000),
  }),
  // 자동 탐지된 지점을 목록에서 숨깁니다.
  z.object({
    action: z.literal("hide"),
    startSec: z.number().min(0),
    endSec: z.number().min(0),
  }),
]);

type Params = { params: Promise<{ id: string }> };

/** 같은 구간을 가리키는 기존 편집 행. 자동 지점은 재계산 때 경계가 조금씩
 *  달라지므로 id가 아니라 시간 겹침으로 찾습니다. */
async function findOverlappingEdit(
  analysisId: string,
  startSec: number,
  endSec: number,
) {
  const rows = await prisma.hypeMomentEdit.findMany({ where: { analysisId } });
  return rows.find((r) => r.startSec < endSec && r.endSec > startSec) ?? null;
}

export async function POST(req: NextRequest, { params }: Params) {
  const rl = rateLimit(`moments:${clientIpFrom(req)}`, { limit: 30, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json({ error: "요청이 너무 많습니다." }, { status: 429 });
  }

  const { id } = await params;
  const analysis = await prisma.analysis.findUnique({
    where: { id },
    include: { video: true },
  });
  if (!analysis || !analysis.video) {
    return NextResponse.json({ error: "분석을 찾을 수 없습니다." }, { status: 404 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const body = parsed.data;

  const duration = analysis.video.durationSeconds;
  const startSec = Math.max(0, Math.min(body.startSec, duration));
  const endSec = Math.min(body.endSec, duration);
  if (endSec <= startSec) {
    return NextResponse.json(
      { error: "종료 시각이 시작 시각보다 뒤여야 합니다." },
      { status: 400 },
    );
  }

  const existing = await findOverlappingEdit(id, startSec, endSec);

  if (body.action === "add") {
    if (existing && existing.origin === "manual") {
      return NextResponse.json(
        { error: "이미 겹치는 구간을 직접 추가해 두었습니다." },
        { status: 409 },
      );
    }
    await prisma.hypeMomentEdit.create({
      data: {
        analysisId: id,
        startSec,
        endSec,
        description: body.description?.trim() || null,
        origin: "manual",
      },
    });
  } else if (body.action === "describe") {
    if (existing) {
      await prisma.hypeMomentEdit.update({
        where: { id: existing.id },
        // 설명을 다는 것만으로 숨김이 풀려서는 안 되지만, 자동 지점의 경계가
        // 살짝 밀렸을 수 있으므로 방금 본 구간으로 맞춰 둡니다.
        data: { description: body.description.trim() || null, startSec, endSec },
      });
    } else {
      await prisma.hypeMomentEdit.create({
        data: {
          analysisId: id,
          startSec,
          endSec,
          description: body.description.trim() || null,
          origin: "auto",
        },
      });
    }
  } else {
    // hide — 직접 추가한 구간이면 편집 행 자체를 지워 목록에서 없앱니다.
    if (existing?.origin === "manual") {
      await prisma.hypeMomentEdit.delete({ where: { id: existing.id } });
    } else if (existing) {
      await prisma.hypeMomentEdit.update({
        where: { id: existing.id },
        data: { hidden: true, startSec, endSec },
      });
    } else {
      await prisma.hypeMomentEdit.create({
        data: { analysisId: id, startSec, endSec, origin: "auto", hidden: true },
      });
    }
  }

  if (analysis.status === "completed") {
    await relinkScenesAndReport(id);
  }
  return NextResponse.json({ ok: true });
}

/** 편집 행을 지워 자동 탐지 상태로 되돌립니다. */
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const editId = req.nextUrl.searchParams.get("editId");
  if (!editId) {
    return NextResponse.json({ error: "editId가 필요합니다." }, { status: 400 });
  }

  const analysis = await prisma.analysis.findUnique({ where: { id } });
  if (!analysis) {
    return NextResponse.json({ error: "분석을 찾을 수 없습니다." }, { status: 404 });
  }

  const deleted = await prisma.hypeMomentEdit.deleteMany({
    where: { id: editId, analysisId: id },
  });
  if (deleted.count === 0) {
    return NextResponse.json({ error: "편집 내용을 찾을 수 없습니다." }, { status: 404 });
  }

  if (analysis.status === "completed") {
    await relinkScenesAndReport(id);
  }
  return NextResponse.json({ ok: true });
}
