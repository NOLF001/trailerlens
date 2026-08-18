// Comment text normalization: HTML → safe plain text, plus a canonical form
// used for duplicate detection and "short/emoji" classification.

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "'",
  lsquo: "'",
  ldquo: '"',
  rdquo: '"',
};

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? safeFromCodePoint(code) : "";
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) ? safeFromCodePoint(code) : "";
    })
    .replace(/&([a-zA-Z]+);/g, (m, name: string) => NAMED_ENTITIES[name] ?? m);
}

function safeFromCodePoint(code: number): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

/**
 * Converts YouTube's HTML comment text (textDisplay) to safe plain text.
 * Tags are dropped entirely; entities are decoded; <br> becomes a newline.
 */
export function stripHtmlToText(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>(\n)?/gi, "\n")
    .replace(/<\/(p|div)>/gi, "\n");
  const withoutTags = withBreaks.replace(/<[^>]*>/g, "");
  return decodeHtmlEntities(withoutTags).replace(/\r\n/g, "\n").trim();
}

const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}]/gu;

/**
 * Canonical form for duplicate detection: lowercase, no punctuation/emoji,
 * collapsed whitespace.
 */
export function normalizeForDedup(text: string): string {
  return text
    .toLowerCase()
    .replace(EMOJI_RE, "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** True for comments that are essentially only emoji or extremely short. */
export function isShortOrEmojiOnly(text: string): boolean {
  const noEmoji = text.replace(EMOJI_RE, "").replace(/\s+/g, "");
  if (noEmoji.length === 0) return true;
  return normalizeForDedup(text).length < 4;
}

export function countEmoji(text: string): number {
  return (text.match(EMOJI_RE) ?? []).length;
}
