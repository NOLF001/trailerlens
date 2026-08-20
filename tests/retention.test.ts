// pruneOldVideos: only the 3 most recently analyzed videos should survive,
// older ones (and their cascaded comments/analyses) get deleted — except a
// video with an in-flight (queued/running/canceling) analysis, which must
// never be pruned even if it falls outside the top 3 by recency.

import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const DB_FILE = join(ROOT, "prisma", "retention-test.db");
const DB_URL = "file:./retention-test.db";

process.env.DATABASE_URL = DB_URL;

let prisma: (typeof import("@/lib/db"))["prisma"];
let pruneOldVideos: (typeof import("@/lib/jobs/retention"))["pruneOldVideos"];

beforeAll(async () => {
  rmSync(DB_FILE, { force: true });
  execSync("pnpm exec prisma db push --skip-generate", {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: "ignore",
  });
  ({ prisma } = await import("@/lib/db"));
  ({ pruneOldVideos } = await import("@/lib/jobs/retention"));
}, 120_000);

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync(DB_FILE, { force: true });
});

beforeEach(async () => {
  await prisma.sceneCluster.deleteMany();
  await prisma.analysis.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.video.deleteMany();
});

async function seedVideo(id: string) {
  return prisma.video.create({
    data: {
      id,
      title: id,
      channelId: "c",
      channelTitle: "c",
      thumbnailUrl: "",
      durationSeconds: 100,
      isMock: true,
    },
  });
}

describe("pruneOldVideos", () => {
  it("keeps only the 3 most recently analyzed videos", async () => {
    const base = Date.now();
    for (let i = 0; i < 5; i++) {
      await seedVideo(`v${i}`);
      await prisma.comment.create({
        data: {
          id: `v${i}-c1`,
          videoId: `v${i}`,
          authorDisplayName: "a",
          textOriginal: "hi",
          publishedAt: new Date(base),
          updatedAt: new Date(base),
        },
      });
      await prisma.analysis.create({
        data: {
          videoId: `v${i}`,
          mode: "full",
          status: "completed",
          createdAt: new Date(base + i * 1000), // v4 newest, v0 oldest
        },
      });
    }

    await pruneOldVideos();

    const remaining = (await prisma.video.findMany({ select: { id: true } })).map((v) => v.id);
    expect(remaining.sort()).toEqual(["v2", "v3", "v4"]);

    const remainingComments = await prisma.comment.findMany({ select: { videoId: true } });
    expect(remainingComments.map((c) => c.videoId).sort()).toEqual(["v2", "v3", "v4"]);
  });

  it("never prunes a video with an in-flight analysis, even if it's old", async () => {
    const base = Date.now();
    for (let i = 0; i < 4; i++) {
      await seedVideo(`v${i}`);
    }
    // v0 is oldest by createdAt but still running — must survive despite
    // falling outside the top 3 most-recent (v1 is the one that gets
    // pruned instead, keeping the total at the 3-video cap).
    await prisma.analysis.create({
      data: { videoId: "v0", mode: "full", status: "running", createdAt: new Date(base) },
    });
    await prisma.analysis.create({
      data: { videoId: "v1", mode: "full", status: "completed", createdAt: new Date(base + 1000) },
    });
    await prisma.analysis.create({
      data: { videoId: "v2", mode: "full", status: "completed", createdAt: new Date(base + 2000) },
    });
    await prisma.analysis.create({
      data: { videoId: "v3", mode: "full", status: "completed", createdAt: new Date(base + 3000) },
    });

    await pruneOldVideos();

    const remaining = (await prisma.video.findMany({ select: { id: true } })).map((v) => v.id);
    expect(remaining.sort()).toEqual(["v0", "v2", "v3"]);
  });

  it("does nothing when 3 or fewer videos exist", async () => {
    const base = Date.now();
    for (let i = 0; i < 2; i++) {
      await seedVideo(`v${i}`);
      await prisma.analysis.create({
        data: { videoId: `v${i}`, mode: "full", status: "completed", createdAt: new Date(base + i * 1000) },
      });
    }

    await pruneOldVideos();

    const remaining = await prisma.video.count();
    expect(remaining).toBe(2);
  });
});
