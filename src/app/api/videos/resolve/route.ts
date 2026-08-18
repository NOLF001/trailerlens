// POST /api/videos/resolve — { url } → video metadata preview.

import { NextResponse } from "next/server";
import { z } from "zod";
import { extractVideoId } from "@/lib/youtube/url";
import { getVideoMeta } from "@/lib/youtube/metadata";
import { YouTubeApiError } from "@/lib/youtube/client";
import { rateLimit, clientIpFrom } from "@/lib/rate-limit";
import { isMockMode } from "@/lib/env";

const bodySchema = z.object({ url: z.string().min(1).max(2000) });

export async function POST(req: Request) {
  const rl = rateLimit(`resolve:${clientIpFrom(req)}`, { limit: 20, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: `요청이 너무 많습니다. ${rl.retryAfterSeconds}초 후 다시 시도하세요.` },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "URL을 입력하세요." }, { status: 400 });
  }

  const videoId = extractVideoId(parsed.data.url);
  if (!videoId) {
    return NextResponse.json(
      { error: "유효한 YouTube URL 또는 영상 ID가 아닙니다." },
      { status: 400 },
    );
  }

  try {
    const meta = await getVideoMeta(videoId);
    if (!meta) {
      return NextResponse.json(
        { error: "영상을 찾을 수 없습니다. 삭제되었거나 비공개 영상일 수 있습니다." },
        { status: 404 },
      );
    }
    return NextResponse.json({ video: meta, mock: isMockMode() });
  } catch (e) {
    if (e instanceof YouTubeApiError) {
      const msg =
        e.reason === "quotaExceeded"
          ? "YouTube API 쿼터를 초과했습니다. 잠시 후 다시 시도하세요."
          : `YouTube API 오류: ${e.message}`;
      return NextResponse.json({ error: msg }, { status: 502 });
    }
    return NextResponse.json({ error: "영상 정보를 불러오지 못했습니다." }, { status: 500 });
  }
}
