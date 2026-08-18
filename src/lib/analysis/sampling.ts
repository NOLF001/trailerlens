// Statistical sample sizing for the "표본 분석" mode.
//
// Sample size for estimating a proportion at the given confidence level and
// margin of error, with finite population correction (FPC):
//   n0 = z² · p(1-p) / E²          (Cochran)
//   n  = n0 / (1 + (n0 - 1) / N)   (FPC)
// Worst-case p = 0.5 is used so the bound holds for every proportion.
//
// HONESTY NOTE: the YouTube API cannot return a random sample — we collect a
// mix of top(relevance) + newest(time) comments. The margin of error reported
// is therefore the value a true random sample of this size would have; the
// actual sample is a non-probability sample and the report must say so.

const Z95 = 1.959964; // 95% confidence

export function requiredSampleSize(
  population: number | null,
  marginOfError = 0.03,
  z = Z95,
  p = 0.5,
): number {
  const n0 = (z * z * p * (1 - p)) / (marginOfError * marginOfError);
  if (population == null || !Number.isFinite(population) || population <= 0) {
    return Math.ceil(n0);
  }
  if (population <= n0) return Math.ceil(population); // just take (nearly) all
  return Math.ceil(n0 / (1 + (n0 - 1) / population));
}

/** Margin of error actually achieved by a sample of `sampleSize` from `population`. */
export function achievedMarginOfError(
  population: number | null,
  sampleSize: number,
  z = Z95,
  p = 0.5,
): number {
  if (sampleSize <= 0) return 1;
  const base = z * Math.sqrt((p * (1 - p)) / sampleSize);
  if (
    population == null ||
    !Number.isFinite(population) ||
    population <= 1 ||
    sampleSize >= population
  ) {
    return sampleSize >= (population ?? Infinity) ? 0 : base;
  }
  const fpc = Math.sqrt((population - sampleSize) / (population - 1));
  return base * fpc;
}
