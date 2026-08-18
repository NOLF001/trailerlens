// POST /api/analyses/[id]/scenes/[sceneId]/frames
// Analyze a scene from USER-OWNED footage or frame images (multipart form).
// - field "frames": up to 6 image files, OR
// - field "video": one video file (≤ 50MB) → FFmpeg extracts 직전/중심/직후 frames
// Requires an explicit ownership confirmation flag ("confirmOwnership" = "true").

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { describeSceneFrames, type FrameImage, type ImageMediaType } from "@/lib/analysis/vision";
import { extractFramesFromVideo, peakFrameTimes } from "@/lib/analysis/frames";
import { rateLimit, clientIpFrom } from "@/lib/rate-limit";
import { safeJsonParse } from "@/lib/utils";
import type { Report } from "@/lib/types";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const IMAGE_TYPES: ImageMediaType[] = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

type Params = { params: Promise<{ id: string; sceneId: string }> };

export async function POST(req: Request, { params }: Params) {
  const rl = rateLimit(`frames:${clientIpFrom(req)}`, { limit: 5, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json({ error: "요청이 너무 많습니다." }, { status: 429 });
  }

  const { id, sceneId } = await params;
  const scene = await prisma.sceneCluster.findUnique({ where: { id: sceneId } });
  if (!scene || scene.analysisId !== id) {
    return NextResponse.json({ error: "장면을 찾을 수 없습니다." }, { status: 404 });
  }
  const analysis = await prisma.analysis.findUnique({
    where: { id },
    include: { video: true },
  });
  if (!analysis?.video) {
    return NextResponse.json({ error: "분석을 찾을 수 없습니다." }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "multipart/form-data가 필요합니다." }, { status: 400 });
  }

  if (form.get("confirmOwnership") !== "true") {
    return NextResponse.json(
      {
        error:
          "본인이 소유한 원본 영상/이미지임을 확인해야 합니다. YouTube 영상 임의 다운로드는 지원하지 않습니다.",
      },
      { status: 400 },
    );
  }

  let frames: FrameImage[] = [];

  const videoFile = form.get("video");
  if (videoFile instanceof File && videoFile.size > 0) {
    if (videoFile.size > MAX_VIDEO_BYTES) {
      return NextResponse.json({ error: "영상 파일은 50MB 이하만 지원합니다." }, { status: 413 });
    }
    const buffer = Buffer.from(await videoFile.arrayBuffer());
    try {
      frames = await extractFramesFromVideo(
        buffer,
        peakFrameTimes(scene.startSec, scene.endSec),
      );
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  } else {
    const files = form.getAll("frames").filter((f): f is File => f instanceof File);
    for (const [i, file] of files.slice(0, 6).entries()) {
      if (file.size === 0 || file.size > MAX_IMAGE_BYTES) continue;
      const type = file.type as ImageMediaType;
      if (!IMAGE_TYPES.includes(type)) continue;
      frames.push({
        label: `frame-${i + 1}`,
        mediaType: type,
        base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
      });
    }
  }

  if (frames.length === 0) {
    return NextResponse.json(
      { error: "유효한 이미지(≤5MB, jpeg/png/gif/webp) 또는 영상 파일이 필요합니다." },
      { status: 400 },
    );
  }

  try {
    const description = await describeSceneFrames(frames, {
      videoTitle: analysis.video.title,
      startSec: scene.startSec,
      endSec: scene.endSec,
    });

    await prisma.sceneCluster.update({
      where: { id: sceneId },
      data: { description },
    });

    if (analysis.reportJson) {
      const report = safeJsonParse<Report | null>(analysis.reportJson, null);
      const target = report?.scenes.find((s) => s.id === sceneId);
      if (report && target) {
        target.description = description;
        await prisma.analysis.update({
          where: { id },
          data: { reportJson: JSON.stringify(report) },
        });
      }
    }

    return NextResponse.json({ ok: true, description });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
