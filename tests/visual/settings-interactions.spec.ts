import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1173, height: 740 });
  await page.goto("/settings", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
});

test("behavior labels toggle without moving the settings content", async ({ page }) => {
  const row = page.locator(".toggle-row").filter({ hasText: "Permissive hold" });
  const control = page.getByRole("switch", { name: "Permissive hold", exact: true });
  const settingsGrid = page.locator(".settings-grid");
  const splitTransport = page.locator(".settings-card").filter({ hasText: "Split Transport" });
  const initialChecked = await control.getAttribute("aria-checked");
  const initialGridBox = await settingsGrid.boundingBox();
  const initialSplitBox = await splitTransport.boundingBox();

  expect(initialGridBox).not.toBeNull();
  expect(initialSplitBox).not.toBeNull();

  await row.getByText("Permissive hold", { exact: true }).click();

  await expect(control).toHaveAttribute(
    "aria-checked",
    initialChecked === "true" ? "false" : "true",
  );
  const toggledGridBox = await settingsGrid.boundingBox();
  const toggledSplitBox = await splitTransport.boundingBox();

  expect(toggledGridBox).not.toBeNull();
  expect(toggledSplitBox).not.toBeNull();
  expect(Math.abs(toggledGridBox!.y - initialGridBox!.y)).toBeLessThan(1);
  expect(Math.abs(toggledSplitBox!.y - initialSplitBox!.y)).toBeLessThan(1);
});

test("every behavior switch click changes it exactly once", async ({ page }) => {
  const control = page.getByRole("switch", { name: "Permissive hold", exact: true });
  const initialChecked = await control.getAttribute("aria-checked");
  const toggledChecked = initialChecked === "true" ? "false" : "true";

  await control.click();
  await expect(control).toHaveAttribute("aria-checked", toggledChecked);

  await control.click();

  await expect(control).toHaveAttribute("aria-checked", initialChecked!);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`switch state is visible in ${colorScheme} system mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.reload({ waitUntil: "networkidle" });

    const control = page.getByRole("switch", { name: "Retro tapping", exact: true });
    const thumb = control.locator('[data-slot="switch-thumb"]');
    const initialTrack = await control.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    const initialTranslate = await thumb.evaluate((element) => getComputedStyle(element).translate);

    await control.click();
    await expect(control).toHaveAttribute("aria-checked", "true");

    await expect
      .poll(() => control.evaluate((element) => getComputedStyle(element).backgroundColor))
      .not.toBe(initialTrack);
    await expect
      .poll(() => thumb.evaluate((element) => getComputedStyle(element).translate))
      .not.toBe(initialTranslate);
    expect(initialTrack).not.toBe("rgba(0, 0, 0, 0)");
  });
}

test("integration cards use the page width without bright inverse actions", async ({ page }) => {
  await page.setViewportSize({ width: 1110, height: 740 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/settings?section=integrations", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  const integrationColumn = page.locator(".integration-column");
  const monkeytypeCard = page.locator(".monkeytype-card");
  const extensionCard = page.locator(".extension-card");
  const firmwareCard = page.locator(".firmware-github-card");
  const primaryActions = page.locator(".integration-primary-action");

  await expect(integrationColumn).toHaveCSS("grid-template-columns", /.+ .+/);
  const monkeytypeBox = await monkeytypeCard.boundingBox();
  const extensionBox = await extensionCard.boundingBox();
  const firmwareBox = await firmwareCard.boundingBox();
  expect(monkeytypeBox).not.toBeNull();
  expect(extensionBox).not.toBeNull();
  expect(firmwareBox).not.toBeNull();
  expect(Math.abs(extensionBox!.y - firmwareBox!.y)).toBeLessThan(1);
  expect(monkeytypeBox!.width).toBeGreaterThan(extensionBox!.width * 1.9);

  expect(await primaryActions.count()).toBe(3);
  const surfaceColor = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.backgroundColor = "var(--surface-2)";
    document.body.appendChild(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return color;
  });
  for (const action of await primaryActions.all()) {
    expect(await action.evaluate((button) => getComputedStyle(button).backgroundColor)).toBe(
      surfaceColor,
    );
  }
});

test("the QMK target chooser remains structured at compact desktop widths", async ({ page }) => {
  await page.setViewportSize({ width: 1110, height: 740 });
  await page.goto("/settings?section=keyboard", { waitUntil: "networkidle" });

  const card = page.locator("#firmware-target");
  await expect(card.getByText("Find from VIA / QMK", { exact: true })).toBeVisible();
  await expect(card.getByPlaceholder("Search keyboard", { exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "Save firmware target" })).toBeVisible();

  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(1110);
});
