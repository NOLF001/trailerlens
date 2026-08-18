// Timestamp mention parsing + clustering.
// Recognized shapes: 3:11 / 03:11 / 1:02:15 / 2:57-3:09 / 2분 47초 / 1시간 2분

export interface TimestampMention {
  seconds: number;
  raw: string;
}

const CLOCK_RE = /(?<!\d)(\d{1,2}):(\d{2})(?::(\d{2}))?(?!\d)/g;
const KOREAN_RE =
  /(?:(\d{1,2})\s*시간)?\s*(?:(\d{1,3})\s*분)\s*(?:(\d{1,2})\s*초)?|(?:(\d{1,2})\s*시간)\s*(?:(\d{1,2})\s*초)?/g;

function clockToSeconds(a: string, b: string, c?: string): number {
  if (c !== undefined) {
    return Number(a) * 3600 + Number(b) * 60 + Number(c);
  }
  return Number(a) * 60 + Number(b);
}

/**
 * Extracts every timestamp mention from a comment, keeping only values that
 * fall inside the video duration. Ranges like "2:57-3:09" yield both ends.
 */
export function parseTimestamps(
  text: string,
  durationSeconds: number,
): TimestampMention[] {
  const out: TimestampMention[] = [];
  const seen = new Set<number>();

  const push = (seconds: number, raw: string) => {
    const s = Math.floor(seconds);
    if (!Number.isFinite(s) || s < 0) return;
    if (durationSeconds > 0 && s > durationSeconds) return; // outside the video
    if (seen.has(s)) return;
    seen.add(s);
    out.push({ seconds: s, raw });
  };

  for (const m of text.matchAll(CLOCK_RE)) {
    // Reject minute part >= 60 in h:mm:ss and second part >= 60 everywhere.
    const [raw, a, b, c] = m;
    if (Number(b) >= 60) continue;
    if (c !== undefined && Number(c) >= 60) continue;
    push(clockToSeconds(a!, b!, c), raw);
  }

  for (const m of text.matchAll(KOREAN_RE)) {
    const raw = m[0]!.trim();
    if (!raw) continue;
    const hours = Number(m[1] ?? m[4] ?? 0);
    const minutes = Number(m[2] ?? 0);
    const secs = Number(m[3] ?? m[5] ?? 0);
    const total = hours * 3600 + minutes * 60 + secs;
    if (total > 0) push(total, raw);
  }

  return out.sort((x, y) => x.seconds - y.seconds);
}

export interface TimestampCluster {
  startSec: number;
  endSec: number;
  count: number;
  weight: number;
  seconds: number[]; // representative mention points
}

/**
 * Clusters nearby timestamp mentions into scene-sized bins.
 * Adjacent bins (default 4s) are merged so a burst around one moment forms a
 * single cluster.
 */
export function clusterTimestamps(
  mentions: { seconds: number; weight: number }[],
  { binSize = 4, durationSeconds = Infinity }: { binSize?: number; durationSeconds?: number } = {},
): TimestampCluster[] {
  if (mentions.length === 0) return [];

  const bins = new Map<number, { count: number; weight: number; seconds: number[] }>();
  for (const m of mentions) {
    if (m.seconds < 0 || m.seconds > durationSeconds) continue;
    const bin = Math.floor(m.seconds / binSize);
    const entry = bins.get(bin) ?? { count: 0, weight: 0, seconds: [] };
    entry.count += 1;
    entry.weight += m.weight;
    entry.seconds.push(m.seconds);
    bins.set(bin, entry);
  }

  const sortedBins = [...bins.entries()].sort((a, b) => a[0] - b[0]);
  const clusters: TimestampCluster[] = [];

  for (const [bin, entry] of sortedBins) {
    const start = bin * binSize;
    const last = clusters[clusters.length - 1];
    if (last && start - last.endSec <= binSize) {
      last.endSec = start + binSize;
      last.count += entry.count;
      last.weight += entry.weight;
      last.seconds.push(...entry.seconds);
    } else {
      clusters.push({
        startSec: start,
        endSec: start + binSize,
        count: entry.count,
        weight: entry.weight,
        seconds: [...entry.seconds],
      });
    }
  }

  return clusters.sort((a, b) => b.weight - a.weight);
}
