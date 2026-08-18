// Thin YouTube Data API v3 client with exponential backoff.
// API key never leaves the server: this module is only imported by server code.

import { env } from "@/lib/env";

const BASE = "https://www.googleapis.com/youtube/v3";

export type YouTubeErrorReason =
  | "quotaExceeded"
  | "rateLimitExceeded"
  | "commentsDisabled"
  | "videoNotFound"
  | "forbidden"
  | "network"
  | "unknown";

export class YouTubeApiError extends Error {
  constructor(
    message: string,
    public readonly reason: YouTubeErrorReason,
    public readonly status: number | null = null,
  ) {
    super(message);
    this.name = "YouTubeApiError";
  }
}

interface GoogleErrorBody {
  error?: {
    code?: number;
    message?: string;
    errors?: { reason?: string; message?: string }[];
  };
}

function classify(status: number, body: GoogleErrorBody): YouTubeApiError {
  const reason = body.error?.errors?.[0]?.reason ?? "";
  const message = body.error?.message ?? `YouTube API error (HTTP ${status})`;
  if (reason === "commentsDisabled") {
    return new YouTubeApiError(message, "commentsDisabled", status);
  }
  if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
    return new YouTubeApiError(message, "quotaExceeded", status);
  }
  if (reason === "rateLimitExceeded" || reason === "userRateLimitExceeded" || status === 429) {
    return new YouTubeApiError(message, "rateLimitExceeded", status);
  }
  if (status === 404) {
    return new YouTubeApiError(message, "videoNotFound", status);
  }
  if (status === 403) {
    return new YouTubeApiError(message, "forbidden", status);
  }
  return new YouTubeApiError(message, "unknown", status);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET request against the Data API with exponential backoff + jitter.
 * Retries transient failures (429/5xx/rateLimitExceeded/network); never retries
 * quotaExceeded, commentsDisabled, or not-found.
 */
export async function ytGet<T>(
  endpoint: string,
  params: Record<string, string | number | undefined>,
  opts: { retries?: number; signal?: AbortSignal } = {},
): Promise<T> {
  const apiKey = env().YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new YouTubeApiError("YOUTUBE_API_KEY is not configured", "forbidden");
  }

  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) search.set(k, String(v));
  }
  search.set("key", apiKey);
  const url = `${BASE}/${endpoint}?${search.toString()}`;

  const retries = opts.retries ?? 4;
  let lastError: YouTubeApiError | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { signal: opts.signal });
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      lastError = new YouTubeApiError(
        `Network error calling YouTube API: ${(e as Error).message}`,
        "network",
      );
      await sleep(backoffMs(attempt));
      continue;
    }

    if (res.ok) {
      return (await res.json()) as T;
    }

    let body: GoogleErrorBody = {};
    try {
      body = (await res.json()) as GoogleErrorBody;
    } catch {
      // non-JSON error body
    }
    const err = classify(res.status, body);

    const retryable =
      err.reason === "rateLimitExceeded" ||
      err.reason === "network" ||
      (res.status >= 500 && res.status < 600);

    if (!retryable || attempt === retries) throw err;
    lastError = err;
    await sleep(backoffMs(attempt));
  }

  throw lastError ?? new YouTubeApiError("YouTube API request failed", "unknown");
}

function backoffMs(attempt: number): number {
  const base = Math.min(30_000, 1000 * 2 ** attempt);
  return base / 2 + Math.random() * (base / 2);
}
