// DB-backed job runner. The Analysis row *is* the job record (status, step,
// progress, checkpoint, error). This module claims queued jobs and runs the
// pipeline in-process, guarding against double-execution.

import { prisma } from "@/lib/db";
import { runAnalysisPipeline } from "@/lib/jobs/pipeline";

const globalForRunner = globalThis as unknown as {
  __tlRunning?: Set<string>;
};

const running = (globalForRunner.__tlRunning ??= new Set<string>());

/** How long a "running" analysis may go without DB updates before it is
 *  considered stalled (e.g. the server restarted mid-run). */
const STALL_MS = 90_000;

/**
 * Claims a queued analysis and starts the pipeline (fire-and-forget).
 * Returns false when the job was not in a claimable state.
 */
export async function kickoffAnalysis(analysisId: string): Promise<boolean> {
  const claimed = await prisma.analysis.updateMany({
    where: { id: analysisId, status: "queued" },
    data: { status: "running", attempts: { increment: 1 }, error: null },
  });
  if (claimed.count === 0) return false;
  if (running.has(analysisId)) return true;

  running.add(analysisId);
  void runAnalysisPipeline(analysisId)
    .catch(async (e) => {
      await prisma.analysis
        .update({
          where: { id: analysisId },
          data: { status: "failed", error: (e as Error).message },
        })
        .catch(() => {});
    })
    .finally(() => {
      running.delete(analysisId);
    });
  return true;
}

/**
 * Puts a failed/canceled analysis back in the queue and starts it.
 * Also recovers "running" rows that stalled (server restart mid-run).
 */
export async function resumeAnalysis(analysisId: string): Promise<boolean> {
  const analysis = await prisma.analysis.findUnique({ where: { id: analysisId } });
  if (!analysis) return false;

  const stalled =
    analysis.status === "running" &&
    !running.has(analysisId) &&
    Date.now() - analysis.updatedAt.getTime() > STALL_MS;

  if (!["failed", "canceled"].includes(analysis.status) && !stalled) {
    return false;
  }

  await prisma.analysis.update({
    where: { id: analysisId },
    data: { status: "queued", error: null },
  });
  return kickoffAnalysis(analysisId);
}

/** Requests cancellation. Running jobs stop at the next checkpoint. */
export async function cancelAnalysis(analysisId: string): Promise<boolean> {
  const analysis = await prisma.analysis.findUnique({ where: { id: analysisId } });
  if (!analysis) return false;

  if (analysis.status === "queued") {
    await prisma.analysis.update({
      where: { id: analysisId },
      data: { status: "canceled" },
    });
    return true;
  }
  if (analysis.status === "running") {
    await prisma.analysis.update({
      where: { id: analysisId },
      data: { status: "canceling" },
    });
    return true;
  }
  return false;
}

export function isRunningInProcess(analysisId: string): boolean {
  return running.has(analysisId);
}
