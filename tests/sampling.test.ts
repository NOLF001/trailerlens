import { describe, expect, it } from "vitest";
import { achievedMarginOfError, requiredSampleSize } from "@/lib/analysis/sampling";

describe("requiredSampleSize (95% CI, worst-case p=0.5)", () => {
  it("matches the classic Cochran values for large populations", () => {
    // Infinite-population baselines: ±3% → 1068, ±5% → 385 (ceil of 1067.07 / 384.1)
    expect(requiredSampleSize(null, 0.03)).toBe(1068);
    expect(requiredSampleSize(null, 0.05)).toBe(385);
  });

  it("applies finite population correction", () => {
    // 1M comments → barely below the infinite baseline
    const n = requiredSampleSize(1_021_845, 0.03);
    expect(n).toBeGreaterThan(1050);
    expect(n).toBeLessThanOrEqual(1068);
    // Small population → takes (nearly) everything
    expect(requiredSampleSize(500, 0.03)).toBeLessThanOrEqual(500);
    expect(requiredSampleSize(500, 0.03)).toBeGreaterThan(300);
  });

  it("takes the whole population when it is tiny", () => {
    expect(requiredSampleSize(50, 0.03)).toBe(50);
  });
});

describe("achievedMarginOfError", () => {
  it("returns ~3% for the computed sample size", () => {
    const N = 1_021_845;
    const n = requiredSampleSize(N, 0.03);
    const e = achievedMarginOfError(N, n);
    expect(e).toBeLessThanOrEqual(0.0305);
    expect(e).toBeGreaterThan(0.025);
  });

  it("is zero when the sample covers the population", () => {
    expect(achievedMarginOfError(200, 200)).toBe(0);
  });

  it("shrinks as the sample grows", () => {
    const N = 100_000;
    expect(achievedMarginOfError(N, 2000)).toBeLessThan(achievedMarginOfError(N, 500));
  });
});
