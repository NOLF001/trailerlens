// Integration test: full mock-mode pipeline run against a throwaway SQLite db,
// then verifies resume/idempotency (already-analyzed comments are not redone)
// and incremental analysis for a second run on the same video.

import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const DB_FILE = join(ROOT, "prisma", "pipeline-test.db");
const DB_URL = "file:./pipeline-test.db";
const VIDEO_ID = "mockvideo01";

process.env.DATABASE_URL = DB_URL;
process.env.MOCK_MODE = "true";
process.env.YOUTUBE_API_KEY = "";
process.env.ANTHROPIC_API_KEY = "";

// Imported dynamically AFTER env is set so PrismaClient picks up the test db.
let prisma: (typeof import("@/lib/db"))["prisma"];
let runAnalysisPipeline: (typeof import("@/lib/jobs/pipeline"))["runAnalysisPipeline"];

beforeAll(async () => {
  rmSync(DB_FILE, { force: true });
  execSync("pnpm exec prisma db push --skip-generate", {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: "ignore",
  });
  ({ prisma } = await import("@/lib/db"));
  ({ runAnalysisPipeline } = await import("@/lib/jobs/pipeline"));
}, 120_000);

afterAll(async () => {
  await prisma?.$disconnect();
});

describe("mock-mode pipeline (end to end)", () => {
  let firstAnalysisId: string;

  it("runs all 7 steps to completion and produces a report", async () => {
    const video = await seedVideoRow();
    const analysis = await prisma.analysis.create({
      data: { videoId: video.id, mode: "full", status: "running" },
    });
    firstAnalysisId = analysis.id;

    await runAnalysisPipeline(analysis.id);

    const done = await prisma.analysis.findUniqueOrThrow({ where: { id: analysis.id } });
    expect(done.status).toBe("completed");
    expect(done.currentStep).toBe(7);
    expect(done.reportJson).toBeTruthy();

    const report = JSON.parse(done.reportJson!) as {
      conclusion: string;
      scenes: unknown[];
      stats: { raw: { totalComments: number }; cleaned: { totalComments: number } };
      heatmap: { source: string; peaks: unknown[] };
    };
    expect(report.conclusion.length).toBeGreaterThan(10);
    expect(report.scenes.length).toBeGreaterThan(0);
    expect(report.stats.raw.totalComments).toBeGreaterThan(100);
    // cleaned variant removes duplicates/spam → strictly fewer or equal
    expect(report.stats.cleaned.totalComments).toBeLessThanOrEqual(
      report.stats.raw.totalComments,
    );
    expect(report.heatmap.source).toBe("mock");
    expect(report.heatmap.peaks.length).toBeGreaterThan(0);

    const analyzed = await prisma.comment.count({
      where: { videoId: VIDEO_ID, analysisStatus: "analyzed" },
    });
    expect(analyzed).toBeGreaterThan(100);
  }, 120_000);

  it("is idempotent on resume: already-analyzed comments are not re-analyzed", async () => {
    const before = await prisma.comment.findMany({
      where: { videoId: VIDEO_ID, analysisStatus: "analyzed" },
      select: { id: true, analyzedAt: true },
      take: 20,
    });
    expect(before.length).toBeGreaterThan(0);

    // Simulate an interrupted second run on the same video (job requeued).
    const analysis2 = await prisma.analysis.create({
      data: { videoId: VIDEO_ID, mode: "full", status: "running" },
    });
    await runAnalysisPipeline(analysis2.id);

    const done = await prisma.analysis.findUniqueOrThrow({ where: { id: analysis2.id } });
    expect(done.status).toBe("completed");

    const after = await prisma.comment.findMany({
      where: { id: { in: before.map((b) => b.id) } },
      select: { id: true, analyzedAt: true },
    });
    const beforeById = new Map(before.map((b) => [b.id, b.analyzedAt?.getTime()]));
    for (const row of after) {
      expect(row.analyzedAt?.getTime()).toBe(beforeById.get(row.id)); // untouched
    }
  }, 120_000);

  it("analyzes only comments that are still pending (incremental)", async () => {
    // Inject one "new" comment as if YouTube returned a fresh one.
    await prisma.comment.create({
      data: {
        id: "new-comment-1",
        videoId: VIDEO_ID,
        parentId: null,
        authorDisplayName: "late_user",
        authorChannelId: "UC_late",
        textOriginal: "1:37 이 장면 보고 예약 구매 했습니다",
        likeCount: 3,
        publishedAt: new Date(),
        updatedAt: new Date(),
        isReply: false,
      },
    });

    const analysis3 = await prisma.analysis.create({
      data: { videoId: VIDEO_ID, mode: "full", status: "running" },
    });
    await runAnalysisPipeline(analysis3.id);

    const fresh = await prisma.comment.findUniqueOrThrow({
      where: { id: "new-comment-1" },
    });
    expect(fresh.analysisStatus).toBe("analyzed");
    expect(JSON.parse(fresh.topics ?? "[]")).toContain("purchase_intent");
    expect(JSON.parse(fresh.extractedTimestamps ?? "[]")).toContain(97);
  }, 120_000);

  it("cleans up when the analysis is deleted", async () => {
    await prisma.analysis.delete({ where: { id: firstAnalysisId } });
    const remaining = await prisma.analysis.count({ where: { videoId: VIDEO_ID } });
    expect(remaining).toBeGreaterThan(0); // others still exist → video stays
  });
});

async function seedVideoRow() {
  return prisma.video.upsert({
    where: { id: VIDEO_ID },
    create: {
      id: VIDEO_ID,
      title: "seed",
      channelId: "c",
      channelTitle: "c",
      thumbnailUrl: "",
      durationSeconds: 222,
      isMock: true,
    },
    update: {},
  });
}
