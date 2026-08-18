// Playwright smoke tests — run against a mock-mode dev server (see
// playwright.config.ts webServer). No API keys required.

import { expect, test } from "@playwright/test";

test.describe("TrailerLens smoke", () => {
  test("full mock user flow: resolve → analyze → report → comments", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("트레일러");

    // Mock-mode badge is visible without API keys
    await expect(page.getByText("Mock 모드", { exact: false }).first()).toBeVisible();

    // Resolve a video (bare id works)
    await page.getByLabel("YouTube 트레일러 URL").fill("dQw4w9WgXcQ");
    await page.getByRole("button", { name: "영상 확인" }).click();
    await expect(page.getByText("AURORA FALL", { exact: false })).toBeVisible();

    // Start a quick analysis
    await page.getByRole("button", { name: /빠른 분석/ }).click();
    await page.getByRole("button", { name: "분석 시작" }).click();
    await page.waitForURL(/\/analysis\//, { timeout: 30_000 });

    // Progress UI appears, then the report (mock pipeline is fast)
    await expect(page.getByText("핵심 결론", { exact: false })).toBeVisible({
      timeout: 90_000,
    });
    await expect(page.getByText("반복 재생 그래프")).toBeVisible();
    await expect(page.getByText("장면별 분석")).toBeVisible();
    await expect(page.getByText("댓글 반응 개요")).toBeVisible();
    await expect(page.getByText("논쟁 및 우려")).toBeVisible();

    // Raw/cleaned toggle exists
    await expect(page.getByText(/정제 데이터|원본 데이터/)).toBeVisible();

    // Comment explorer — category view is the default tab
    await page.getByRole("link", { name: /댓글 탐색기 열기/ }).click();
    await page.waitForURL(/\/comments$/);
    await expect(page.getByRole("tab", { name: "카테고리별 보기" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /전체 보기/ }).first(),
    ).toBeVisible({ timeout: 20_000 });

    // Jumping into a category opens the filtered list view
    await page.getByRole("button", { name: /전체 보기/ }).first().click();
    await expect(page.getByLabel("댓글 검색")).toBeVisible();
    await expect(page.getByText(/개 댓글/)).toBeVisible({ timeout: 20_000 });

    // Filter by sentiment
    await page.getByLabel("감정 필터").selectOption("negative");
    await expect(page.getByText(/개 댓글/)).toBeVisible();
  });

  test("settings page shows integration status", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByText("API 연동 상태")).toBeVisible();
    await expect(page.getByText("YouTube Data API v3")).toBeVisible();
    await expect(page.getByText("모든 분석 데이터 삭제")).toBeVisible();
  });

  test("privacy page renders", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByText("데이터 처리 안내").first()).toBeVisible();
    await expect(
      page.getByText("정규화된 상대 강도", { exact: false }).first(),
    ).toBeVisible();
  });
});
