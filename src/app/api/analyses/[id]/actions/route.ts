// POST /api/analyses/[id]/actions — { action: "cancel" | "retry" | "resume" }

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { cancelAnalysis, resumeAnalysis } from "@/lib/jobs/runner";
import { rateLimit, clientIpFrom } from "@/lib/rate-limit";

const bodySchema = z.object({ action: z.enum(["cancel", "retry", "resume"]) });

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const rl = rateLimit(`actions:${clientIpFrom(req)}`, { limit: 30, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json({ error: "요청이 너무 많습니다." }, { status: 429 });
  }

  const { id } = await params;
  const analysis = await prisma.analysis.findUnique({ where: { id } });
  if (!analysis) {
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
    return NextResponse.json({ error: "알 수 없는 액션입니다." }, { status: 400 });
  }

  if (parsed.data.action === "cancel") {
    const ok = await cancelAnalysis(id);
    return NextResponse.json({ ok });
  }

  // retry / resume — same behavior: requeue from checkpoint.
  const ok = await resumeAnalysis(id);
  if (!ok) {
    return NextResponse.json(
      { error: "이 상태에서는 재시도할 수 없습니다." },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true });
}
