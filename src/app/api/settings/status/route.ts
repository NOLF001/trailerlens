// GET /api/settings/status — which integrations are configured (booleans only,
// never the key values themselves).

import { NextResponse } from "next/server";
import { env, isGoogleOAuthConfigured, isMockClaude, isMockMode, isYtdlpEnabled } from "@/lib/env";
import { prisma } from "@/lib/db";

export async function GET() {
  const e = env();
  const [videoCount, commentCount, analysisCount] = await Promise.all([
    prisma.video.count(),
    prisma.comment.count(),
    prisma.analysis.count(),
  ]);

  return NextResponse.json({
    youtubeApiConfigured: Boolean(e.YOUTUBE_API_KEY),
    anthropicConfigured: Boolean(e.ANTHROPIC_API_KEY),
    googleOAuthConfigured: isGoogleOAuthConfigured(),
    nextAuthSecretConfigured: Boolean(e.NEXTAUTH_SECRET),
    mockMode: isMockMode(),
    mockClaude: isMockClaude(),
    ytdlpEnabled: isYtdlpEnabled(),
    anthropicModel: e.ANTHROPIC_MODEL,
    databaseProvider: e.DATABASE_URL.startsWith("file:") ? "sqlite" : "postgresql",
    counts: { videos: videoCount, comments: commentCount, analyses: analysisCount },
  });
}
