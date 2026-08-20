// GET /api/videos/eviction-check?videoId=XXXXXXXXXXX
// 이 영상을 새로 분석하면 3개 제한 때문에 어떤 기존 영상이 자동 삭제될지
// 미리 알려줍니다 (아무것도 지우지 않는 읽기 전용 조회).

import { NextResponse, type NextRequest } from "next/server";
import { isValidVideoId } from "@/lib/youtube/url";
import { previewEviction } from "@/lib/jobs/retention";
import { rateLimit, clientIpFrom } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const rl = rateLimit(`eviction-check:${clientIpFrom(req)}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return NextResponse.json({ error: "요청이 너무 많습니다." }, { status: 429 });
  }

  const videoId = req.nextUrl.searchParams.get("videoId") ?? "";
  if (!isValidVideoId(videoId)) {
    return NextResponse.json({ error: "잘못된 videoId입니다." }, { status: 400 });
  }

  const evictedVideos = await previewEviction(videoId);
  return NextResponse.json({ evictedVideos });
}
