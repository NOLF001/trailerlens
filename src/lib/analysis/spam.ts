// Heuristic spam scoring. 0 = clean, 1 = almost certainly spam.
// YouTube already removes most spam before we ever see it; this catches
// promo/link/copy-paste leftovers so they can be excluded in "cleaned" stats.

const PROMO_PATTERNS: RegExp[] = [
  /check\s*out\s*my/i,
  /sub(scribe)?\s*(to)?\s*my/i,
  /my\s*channel/i,
  /free\s*(gift|robux|v-?bucks|money)/i,
  /whatsapp|telegram\s*\+?\d/i,
  /카톡|텔레그램|주식\s*리딩|수익\s*보장|무료\s*체험/,
  /onlyfans|nude|s3x|섹스/i,
];

export interface SpamInput {
  text: string;
  authorDuplicateCount?: number; // same normalized text posted by same author
}

export function spamProbability({ text, authorDuplicateCount = 0 }: SpamInput): number {
  let score = 0;

  const linkCount = (text.match(/https?:\/\/\S+/g) ?? []).length;
  if (linkCount >= 1) score += 0.35;
  if (linkCount >= 2) score += 0.2;

  for (const re of PROMO_PATTERNS) {
    if (re.test(text)) {
      score += 0.45;
      break;
    }
  }

  // aaaaaaaa / ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ style flooding
  if (/(.)\1{14,}/u.test(text)) score += 0.2;

  // Same author pasting the same text repeatedly
  if (authorDuplicateCount >= 2) score += 0.25;
  if (authorDuplicateCount >= 5) score += 0.25;

  // Excessive length with phone-number-looking content
  if (/\+?\d[\d\s-]{9,}\d/.test(text)) score += 0.2;

  return Math.min(1, score);
}

export const SPAM_THRESHOLD = 0.7;
