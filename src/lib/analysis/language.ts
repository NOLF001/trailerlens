// Lightweight script-based language detection.
// Not a full language model — good enough for share-of-language stats.

import type { LanguageCode } from "@/lib/types";

const RANGES: { code: LanguageCode; re: RegExp }[] = [
  { code: "ko", re: /[가-힯ᄀ-ᇿ㄰-㆏]/g },
  { code: "ja", re: /[぀-ゟ゠-ヿㇰ-ㇿ]/g },
  { code: "zh", re: /[一-鿿㐀-䶿]/g },
  { code: "ru", re: /[Ѐ-ӿ]/g },
  { code: "en", re: /[A-Za-z]/g },
];

export function detectLanguage(text: string): LanguageCode {
  const letters = text.replace(/[\s\d\p{P}\p{S}]/gu, "");
  if (letters.length === 0) return "other";

  const counts = new Map<LanguageCode, number>();
  for (const { code, re } of RANGES) {
    const m = text.match(re);
    if (m) counts.set(code, (counts.get(code) ?? 0) + m.length);
  }

  // Japanese kana wins over shared CJK ideographs.
  const ja = counts.get("ja") ?? 0;
  const zh = counts.get("zh") ?? 0;
  if (ja > 0 && zh > 0) {
    counts.set("ja", ja + zh);
    counts.delete("zh");
  }

  let best: LanguageCode = "other";
  let bestCount = 0;
  for (const [code, count] of counts) {
    if (count > bestCount) {
      best = code;
      bestCount = count;
    }
  }

  // Require the winning script to cover a reasonable share of the letters.
  if (bestCount / letters.length < 0.25) return "other";
  return best;
}
