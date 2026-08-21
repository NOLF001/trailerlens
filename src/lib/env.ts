import { z } from "zod";

const boolFromString = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().optional().default(""),
  YOUTUBE_API_KEY: z.string().optional().default(""),
  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
  DATABASE_URL: z.string().optional().default("file:./dev.db"),
  NEXTAUTH_SECRET: z.string().optional().default(""),
  NEXTAUTH_URL: z.string().optional().default("http://localhost:3000"),
  MOCK_MODE: boolFromString,
  ANTHROPIC_MODEL: z.string().optional().default("claude-opus-5"),
  ENABLE_EXPERIMENTAL_YTDLP: boolFromString,
  YTDLP_PATH: z.string().optional().default("yt-dlp"),
  YTDLP_COOKIES_PATH: z.string().optional().default(""),
  YTDLP_COOKIES_B64: z.string().optional().default(""),
  FFMPEG_PATH: z.string().optional().default("ffmpeg"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (!cached) {
    cached = envSchema.parse(process.env);
  }
  return cached;
}

/** True when synthetic data should be served instead of real YouTube data. */
export function isMockMode(): boolean {
  const e = env();
  return e.MOCK_MODE || !e.YOUTUBE_API_KEY;
}

/** True when Claude calls should be replaced by the deterministic mock analyzer. */
export function isMockClaude(): boolean {
  const e = env();
  return e.MOCK_MODE || !e.ANTHROPIC_API_KEY;
}

/** Serverless platforms where spawning yt-dlp must never happen. */
function isServerless(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.NETLIFY ||
      process.env.CF_PAGES,
  );
}

export function isYtdlpEnabled(): boolean {
  return env().ENABLE_EXPERIMENTAL_YTDLP && !isServerless();
}

export function isGoogleOAuthConfigured(): boolean {
  const e = env();
  return Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET);
}
