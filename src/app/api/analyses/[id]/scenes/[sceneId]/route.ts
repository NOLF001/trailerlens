// PATCH /api/analyses/[id]/scenes/[sceneId] — edit a scene description.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { safeJsonParse } from "@/lib/utils";
import type { Report } from "@/lib/types";

const bodySchema = z.object({
  description: z.string().max(2000).optional(),
  reason: z.string().max(2000).optional(),
});

type Params = { params: Promise<{ id: string; sceneId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const { id, sceneId } = await params;

  const scene = await prisma.sceneCluster.findUnique({ where: { id: sceneId } });
  if (!scene || scene.analysisId !== id) {
    return NextResponse.json({ error: "장면을 찾을 수 없습니다." }, { status: 404 });
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

  await prisma.sceneCluster.update({
    where: { id: sceneId },
    data: {
      ...(parsed.data.description !== undefined
        ? { description: parsed.data.description }
        : {}),
      ...(parsed.data.reason !== undefined ? { reason: parsed.data.reason } : {}),
    },
  });

  // Keep the stored report JSON in sync so the UI reflects the edit.
  const analysis = await prisma.analysis.findUnique({ where: { id } });
  if (analysis?.reportJson) {
    const report = safeJsonParse<Report | null>(analysis.reportJson, null);
    if (report) {
      const target = report.scenes.find((s) => s.id === sceneId);
      if (target) {
        if (parsed.data.description !== undefined) target.description = parsed.data.description;
        if (parsed.data.reason !== undefined) target.reason = parsed.data.reason;
        await prisma.analysis.update({
          where: { id },
          data: { reportJson: JSON.stringify(report) },
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
