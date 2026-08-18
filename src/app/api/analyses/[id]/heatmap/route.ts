// POST /api/analyses/[id]/heatmap — manual heatmap import (JSON or CSV).
// Body: { format: "json", segments: [{startTime,endTime,value}] }
//    or { format: "csv", text: "start,end,value\n..." }

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { relinkScenesAndReport } from "@/lib/jobs/pipeline";
import { rateLimit, clientIpFrom } from "@/lib/rate-limit";
import { clamp } from "@/lib/utils";

const segmentSchema = z.object({
  startTime: z.number().min(0),
  endTime: z.number().min(0),
  value: z.number().min(0),
});

const bodySchema = z.union([
  z.object({ format: z.literal("json"), segments: z.array(segmentSchema).min(1).max(5000) }),
  z.object({ format: z.literal("csv"), text: z.string().min(1).max(500_000) }),
]);

function parseCsv(text: string): { startTime: number; endTime: number; value: number }[] {
  const out: { startTime: number; endTime: number; value: number }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^start/i.test(trimmed)) continue;
    const parts = trimmed.split(/[,\t;]/).map((p) => Number(p.trim()));
    if (parts.length < 3 || parts.some((p) => !Number.isFinite(p))) continue;
    out.push({ startTime: parts[0]!, endTime: parts[1]!, value: parts[2]! });
  }
  return out;
}

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const rl = rateLimit(`heatmap:${clientIpFrom(req)}`, { limit: 10, windowMs: 60_000 });
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
    return NextResponse.json(
      { error: "형식이 올바르지 않습니다. [{startTime, endTime, value}] JSON 또는 CSV(start,end,value)를 사용하세요." },
      { status: 400 },
    );
  }

  const rawSegments =
    parsed.data.format === "json" ? parsed.data.segments : parseCsv(parsed.data.text);

  const duration = analysis.video.durationSeconds;
  const valid = rawSegments
    .filter((s) => s.endTime > s.startTime && s.startTime < duration)
    .map((s) => ({
      startTime: clamp(s.startTime, 0, duration),
      endTime: clamp(s.endTime, 0, duration),
      value: s.value,
    }));

  if (valid.length === 0) {
    return NextResponse.json(
      { error: "영상 길이 안의 유효한 구간이 없습니다." },
      { status: 400 },
    );
  }

  // Normalize to 0..1 relative intensity.
  const max = Math.max(...valid.map((s) => s.value));
  const normalized = valid.map((s) => ({ ...s, value: max > 0 ? s.value / max : 0 }));

  await prisma.heatmapSegment.deleteMany({
    where: { videoId: analysis.videoId, source: "manual" },
  });
  await prisma.heatmapSegment.createMany({
    data: normalized.map((s) => ({
      videoId: analysis.videoId,
      source: "manual",
      startTime: s.startTime,
      endTime: s.endTime,
      value: s.value,
    })),
  });

  // Rebuild scenes + report with the new heatmap (no re-collection, no re-analysis).
  if (analysis.status === "completed") {
    await relinkScenesAndReport(id);
  }

  return NextResponse.json({ ok: true, segments: normalized.length });
}
