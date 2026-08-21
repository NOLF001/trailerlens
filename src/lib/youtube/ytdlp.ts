// Experimental local-only yt-dlp adapter for YouTube's public "most replayed"
// heatmap. Disabled by default; never runs in serverless environments.
// Values are normalized relative intensity — NOT retention or viewer counts.

import { execFile } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env, isYtdlpEnabled } from "@/lib/env";
import { isValidVideoId } from "@/lib/youtube/url";
import type { HeatSegment } from "@/lib/types";

interface YtdlpJson {
  heatmap?: { start_time: number; end_time: number; value: number }[];
}

// Age-restricted videos need a logged-in session's cookies. YTDLP_COOKIES_B64
// (base64 Netscape cookies.txt) is meant for environments like Railway with
// no persistent volume — it's materialized to a temp file once per process.
// YTDLP_COOKIES_PATH points at an already-existing cookies.txt (local dev).
let cachedCookiesPath: string | null | undefined;

function resolveCookiesPath(): string | null {
  if (cachedCookiesPath !== undefined) return cachedCookiesPath;
  const { YTDLP_COOKIES_B64, YTDLP_COOKIES_PATH } = env();
  if (YTDLP_COOKIES_B64) {
    const path = join(tmpdir(), "trailerlens-yt-cookies.txt");
    writeFileSync(path, Buffer.from(YTDLP_COOKIES_B64, "base64"));
    cachedCookiesPath = path;
  } else {
    cachedCookiesPath = YTDLP_COOKIES_PATH || null;
  }
  return cachedCookiesPath;
}

function run(
  cmd: string,
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true },
      (error, stdout) => {
        if (error) reject(error);
        else resolve({ stdout });
      },
    );
  });
}

/**
 * Reads the `heatmap` field from `yt-dlp --dump-single-json`.
 * Returns null on any failure — the analysis pipeline must keep going.
 */
export async function getYtdlpHeatmap(videoId: string): Promise<HeatSegment[] | null> {
  if (!isYtdlpEnabled()) return null;
  if (!isValidVideoId(videoId)) return null;

  try {
    const cookiesPath = resolveCookiesPath();
    const { stdout } = await run(
      env().YTDLP_PATH,
      [
        "--dump-single-json",
        "--no-download",
        "--no-warnings",
        "--skip-download",
        // Cookies push YouTube onto a client path that requires solving a
        // signature/n challenge. The yt-dlp-ejs pip package (bundles its own
        // solver script — no network fetch needed) plus Node as the runtime
        // handles that.
        ...(cookiesPath ? ["--cookies", cookiesPath, "--js-runtimes", "node"] : []),
        `https://www.youtube.com/watch?v=${videoId}`,
      ],
      60_000,
    );

    const data = JSON.parse(stdout) as YtdlpJson;
    const heatmap = data.heatmap;
    if (!Array.isArray(heatmap) || heatmap.length === 0) return null;

    const maxValue = Math.max(...heatmap.map((h) => h.value), 0.0001);
    return heatmap
      .filter(
        (h) =>
          Number.isFinite(h.start_time) &&
          Number.isFinite(h.end_time) &&
          Number.isFinite(h.value),
      )
      .map((h) => ({
        startTime: h.start_time,
        endTime: h.end_time,
        value: h.value / maxValue,
      }));
  } catch {
    // yt-dlp missing, blocked, or output changed — degrade gracefully.
    return null;
  }
}
