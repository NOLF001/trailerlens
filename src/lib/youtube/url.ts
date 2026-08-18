// Safe videoId extraction from the many YouTube URL shapes.

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Extracts a YouTube videoId from a URL or raw id string.
 * Returns null when nothing that looks like a valid 11-char id is found.
 */
export function extractVideoId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  // Bare video id
  if (ID_RE.test(raw)) return raw;

  let url: URL;
  try {
    url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^www\.|^m\./, "");

  const check = (candidate: string | null | undefined): string | null =>
    candidate && ID_RE.test(candidate) ? candidate : null;

  if (host === "youtu.be") {
    return check(url.pathname.split("/").filter(Boolean)[0]);
  }

  if (
    host === "youtube.com" ||
    host === "music.youtube.com" ||
    host === "gaming.youtube.com" ||
    host === "youtube-nocookie.com"
  ) {
    const parts = url.pathname.split("/").filter(Boolean);

    // /watch?v=ID  and /playlist?v=ID style query param
    const v = url.searchParams.get("v");
    if (check(v)) return v;

    // /shorts/ID, /embed/ID, /live/ID, /v/ID
    if (parts.length >= 2 && ["shorts", "embed", "live", "v"].includes(parts[0]!)) {
      return check(parts[1]);
    }

    // /watch/ID (rare)
    if (parts.length >= 2 && parts[0] === "watch") {
      return check(parts[1]);
    }
  }

  return null;
}

export function isValidVideoId(id: string): boolean {
  return ID_RE.test(id);
}

export function watchUrl(videoId: string, seconds?: number): string {
  const t = seconds != null ? `&t=${Math.max(0, Math.floor(seconds))}s` : "";
  return `https://www.youtube.com/watch?v=${videoId}${t}`;
}
