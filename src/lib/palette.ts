// Chart palette — validated with the dataviz six-checks validator against the
// dark surface (lightness band, chroma floor, CVD separation, normal-vision
// floor, contrast). Do not eyeball-edit; re-validate any change.

export const CHART = {
  teal: "#0d9488",
  tealSoft: "#14b8a6",
  violet: "#8b5cf6",
  magenta: "#c026d3",
  crimson: "#e11d48",
  amber: "#d97706",
  blue: "#3b82f6",
  slate: "#64748b", // "기타/Other" 전용 — 항상 라벨과 함께 사용 (색상 단독 식별 금지)
} as const;

/** positive / neutral / negative / mixed — validated in list + wrap order. */
export const SENTIMENT_COLORS: Record<string, string> = {
  positive: CHART.teal,
  neutral: CHART.blue,
  negative: CHART.crimson,
  mixed: CHART.violet,
};

export const SENTIMENT_LABELS_KO: Record<string, string> = {
  positive: "긍정",
  neutral: "중립",
  negative: "부정",
  mixed: "혼합",
};

/** Fixed language → color assignment (never cycled). "other" is labeled slate. */
export const LANGUAGE_COLORS: Record<string, string> = {
  ko: CHART.teal,
  en: CHART.violet,
  ja: CHART.amber,
  zh: CHART.crimson,
  ru: CHART.blue,
  other: CHART.slate,
};

export const LANGUAGE_LABELS_KO: Record<string, string> = {
  ko: "한국어",
  en: "영어",
  ja: "일본어",
  zh: "중국어",
  ru: "러시아어",
  other: "기타",
};

export const HEATMAP_SOURCE_META: Record<
  string,
  { label: string; color: string }
> = {
  owner: { label: "공식 Analytics", color: CHART.teal },
  manual: { label: "수동 입력", color: CHART.blue },
  ytdlp: { label: "비공식 공개 히트맵", color: CHART.amber },
  mock: { label: "데모 데이터", color: CHART.violet },
  none: { label: "데이터 없음", color: CHART.slate },
};
