// FFmpeg frame extraction from user-uploaded original footage.
// Extracts frames just before / at / just after a peak timestamp.

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "@/lib/env";
import type { FrameImage } from "@/lib/analysis/vision";

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      env().FFMPEG_PATH,
      args,
      { timeout: 120_000, windowsHide: true },
      (error) => (error ? reject(error) : resolve()),
    );
  });
}

/**
 * Writes the uploaded video to a temp file and extracts one JPEG frame at each
 * requested second (직전 / 중심 / 직후 around a peak).
 */
export async function extractFramesFromVideo(
  videoBuffer: Buffer,
  seconds: { label: string; at: number }[],
): Promise<FrameImage[]> {
  const dir = await mkdtemp(join(tmpdir(), "trailerlens-"));
  const videoPath = join(dir, "input.mp4");

  try {
    await writeFile(videoPath, videoBuffer);
    const frames: FrameImage[] = [];

    for (const { label, at } of seconds) {
      const outPath = join(dir, `frame-${Math.max(0, Math.floor(at))}.jpg`);
      try {
        await runFfmpeg([
          "-ss",
          String(Math.max(0, at)),
          "-i",
          videoPath,
          "-frames:v",
          "1",
          "-q:v",
          "3",
          "-y",
          outPath,
        ]);
        const data = await readFile(outPath);
        frames.push({
          label,
          mediaType: "image/jpeg",
          base64: data.toString("base64"),
        });
      } catch {
        // Skip frames that fail (e.g. timestamp beyond the uploaded clip).
      }
    }

    if (frames.length === 0) {
      throw new Error(
        "FFmpeg 프레임 추출에 실패했습니다. FFMPEG_PATH 설정과 업로드한 영상을 확인하세요.",
      );
    }
    return frames;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export function peakFrameTimes(startSec: number, endSec: number) {
  const center = (startSec + endSec) / 2;
  return [
    { label: "직전", at: Math.max(0, startSec - 2) },
    { label: "중심", at: center },
    { label: "직후", at: endSec + 2 },
  ];
}
