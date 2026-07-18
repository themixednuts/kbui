import { expect, test } from "@playwright/test";

test("Browse renders the persisted CommunityAgent catalog", async ({ page }, testInfo) => {
  const response = await page.goto("/browse");
  expect(response?.ok()).toBe(true);

  const browse = page.locator("[data-community-store]");
  await expect(browse).toHaveAttribute("data-community-store", "durable-object-sqlite");
  await expect(page.locator("article.community-card")).toHaveCount(6);
  await expect(page.getByText("@kbui", { exact: true })).toHaveCount(6);
  await expect(page.locator('[aria-label="Official first-party layout"]')).toHaveCount(6);
  await expect(page.getByText("positive-only signals", { exact: true })).toHaveCount(0);

  await page.screenshot({
    path: testInfo.outputPath("browse-1173x740.png"),
  });
});
