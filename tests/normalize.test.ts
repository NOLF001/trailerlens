import { describe, expect, it } from "vitest";
import {
  decodeHtmlEntities,
  isShortOrEmojiOnly,
  normalizeForDedup,
  stripHtmlToText,
} from "@/lib/analysis/normalize";
import { detectLanguage } from "@/lib/analysis/language";
import { spamProbability, SPAM_THRESHOLD } from "@/lib/analysis/spam";

describe("stripHtmlToText", () => {
  it("removes tags, keeps text, converts <br> to newlines", () => {
    expect(stripHtmlToText('안녕 <b>세상</b><br><a href="https://x.com">링크</a>')).toBe(
      "안녕 세상\n링크",
    );
  });

  it("decodes entities and never keeps script content markup", () => {
    expect(decodeHtmlEntities("&lt;script&gt;alert(1)&lt;/script&gt;")).toBe(
      "<script>alert(1)</script>",
    );
    // Round-trip through strip: tags introduced by decode stay as plain text
    // because tags are removed BEFORE entity decoding.
    expect(stripHtmlToText("&lt;script&gt;alert(1)&lt;/script&gt;")).toBe(
      "<script>alert(1)</script>",
    );
  });
});

describe("normalizeForDedup / isShortOrEmojiOnly", () => {
  it("normalizes case, punctuation, emoji, urls", () => {
    expect(normalizeForDedup("와 이건 진짜 미쳤다!!! 🔥🔥 https://a.b/c")).toBe(
      "와 이건 진짜 미쳤다",
    );
  });

  it("flags emoji-only and very short comments", () => {
    expect(isShortOrEmojiOnly("🔥🔥🔥")).toBe(true);
    expect(isShortOrEmojiOnly("굿")).toBe(true);
    expect(isShortOrEmojiOnly("이 장면은 정말 대단했다")).toBe(false);
  });
});

describe("detectLanguage", () => {
  it.each([
    ["이 장면 소름 돋았다", "ko"],
    ["This trailer looks amazing", "en"],
    ["このシーンやばい", "ja"],
    ["Это потрясающе", "ru"],
    ["👍👍", "other"],
  ])("detects %s as %s", (text, lang) => {
    expect(detectLanguage(text)).toBe(lang);
  });
});

describe("spamProbability", () => {
  it("scores promo/link comments above the threshold", () => {
    const p = spamProbability({
      text: "Check out my channel for free v-bucks!!! http://spam.example",
    });
    expect(p).toBeGreaterThanOrEqual(SPAM_THRESHOLD);
  });

  it("keeps normal comments low", () => {
    expect(spamProbability({ text: "3:11 진짜 미쳤다" })).toBeLessThan(0.3);
  });
});
