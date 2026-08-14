import { expect, test } from "@playwright/test";

test("keeps browse filters grouped and cycles preview layers", async ({ page }) => {
  await page.setViewportSize({ width: 1110, height: 740 });
  await page.goto("/browse", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  const filterPanel = page.getByRole("region", { name: "Browse filters" });
  await expect(filterPanel.locator(".filter-band")).toHaveCount(2);
  await expect(filterPanel.locator(".filter-band-label")).toHaveText(["Tags", "Scope"]);
  expect(
    await filterPanel.evaluate((panel) => panel.scrollWidth - panel.clientWidth),
  ).toBeLessThanOrEqual(1);
  expect(
    await filterPanel.locator(".scope-grid").evaluate((scope) => getComputedStyle(scope).display),
  ).toBe("flex");

  const previewButtons = page.locator(".community-card .card-hit-target");
  expect(await previewButtons.count()).toBeGreaterThan(0);
  await previewButtons.first().click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const switcher = dialog.getByRole("group", { name: "Preview layer" });
  await expect(switcher).toBeVisible();
  const initialLayer = await switcher.getAttribute("data-active-layer");
  await switcher.getByRole("button", { name: "Next layer" }).click();
  await expect(switcher).not.toHaveAttribute("data-active-layer", initialLayer ?? "");
  await expect(switcher.locator(".active-preview-layer")).toContainText("2/");
});

test("sorts community maps without flashing or moving the filter controls", async ({ page }) => {
  await page.setViewportSize({ width: 1110, height: 740 });
  await page.goto("/browse", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  const filterPanel = page.getByRole("region", { name: "Browse filters" });
  const resultCount = filterPanel.locator(".result-count");
  const cardGrid = page.locator(".card-grid");
  const initialPanelBox = await filterPanel.boundingBox();
  const initialCountBox = await resultCount.boundingBox();

  expect(initialPanelBox).not.toBeNull();
  expect(initialCountBox).not.toBeNull();
  const [loadingSample] = await Promise.all([
    cardGrid.evaluate(
      (grid, resultSelector) =>
        new Promise<{ countWidth: number; opacity: string; panelHeight: number }>(
          (resolve, reject) => {
            const timeout = window.setTimeout(() => {
              observer.disconnect();
              reject(new Error("The catalog never entered its loading state."));
            }, 2_000);
            const observer = new MutationObserver(() => {
              if (grid.getAttribute("aria-busy") !== "true") return;
              window.clearTimeout(timeout);
              observer.disconnect();
              const count = document.querySelector<HTMLElement>(resultSelector);
              const panel = grid
                .closest(".browse-shell")
                ?.querySelector<HTMLElement>('[aria-label="Browse filters"]');
              resolve({
                countWidth: count?.getBoundingClientRect().width ?? 0,
                opacity: getComputedStyle(grid).opacity,
                panelHeight: panel?.getBoundingClientRect().height ?? 0,
              });
            });
            observer.observe(grid, { attributeFilter: ["aria-busy"] });
          },
        ),
      ".result-count",
    ),
    filterPanel.getByRole("button", { name: "New", exact: true }).click(),
  ]);

  expect(loadingSample.opacity).toBe("1");
  expect(Math.abs(loadingSample.panelHeight - initialPanelBox!.height)).toBeLessThan(1);
  expect(Math.abs(loadingSample.countWidth - initialCountBox!.width)).toBeLessThan(1);

  await expect(cardGrid).toHaveAttribute("aria-busy", "false");

  const settledPanelBox = await filterPanel.boundingBox();
  const settledCountBox = await resultCount.boundingBox();
  expect(settledPanelBox).not.toBeNull();
  expect(settledCountBox).not.toBeNull();
  expect(Math.abs(settledPanelBox!.height - initialPanelBox!.height)).toBeLessThan(1);
  expect(Math.abs(settledCountBox!.width - initialCountBox!.width)).toBeLessThan(1);
});

test("keeps the route width stable when its vertical scrollbar comes and goes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1110, height: 740 });
  await page.goto("/browse", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  const shellContent = page.locator(".shell-content");
  const search = page.getByRole("searchbox", { name: "Search community keymaps" });
  const initial = await shellContent.evaluate((main) => ({
    clientWidth: main.clientWidth,
    gutter: getComputedStyle(main).scrollbarGutter,
    hasVerticalScrollbar: main.scrollHeight > main.clientHeight,
  }));
  expect(initial.gutter).toBe("stable");
  expect(initial.hasVerticalScrollbar).toBe(true);

  await search.fill("no-community-map-can-match-this-query");
  await expect(page.locator(".empty-panel")).toBeVisible();
  const empty = await shellContent.evaluate((main) => ({
    clientWidth: main.clientWidth,
    hasVerticalScrollbar: main.scrollHeight > main.clientHeight,
  }));
  expect(empty.hasVerticalScrollbar).toBe(false);
  expect(empty.clientWidth).toBe(initial.clientWidth);

  await search.fill("");
  await expect(page.locator(".community-card")).toHaveCount(6);
  expect(await shellContent.evaluate((main) => main.clientWidth)).toBe(initial.clientWidth);
});

test("keeps browse filters to two compact rows in a narrow pane", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 557, height: 800 });
  await page.goto("/browse", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  const filterPanel = page.getByRole("region", { name: "Browse filters" });
  await expect(filterPanel.locator(".filter-band")).toHaveCount(2);
  expect(
    await filterPanel.evaluate((panel) => panel.scrollWidth - panel.clientWidth),
  ).toBeLessThanOrEqual(1);

  const panelBox = await filterPanel.boundingBox();
  expect(panelBox).not.toBeNull();
  expect(panelBox!.height).toBeLessThan(140);

  const tagStrip = filterPanel.locator(".tag-strip");
  expect(await tagStrip.evaluate((el) => getComputedStyle(el).flexWrap)).toBe("nowrap");
  expect(
    await tagStrip.evaluate((el) => {
      const tops = new Set(
        [...el.querySelectorAll("button")].map((button) =>
          Math.round(button.getBoundingClientRect().top),
        ),
      );
      return tops.size;
    }),
  ).toBe(1);
  expect(await tagStrip.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(8);

  const bandColumns = await filterPanel
    .locator(".filter-band")
    .first()
    .evaluate((band) => getComputedStyle(band).gridTemplateColumns.split(" ").length);
  expect(bandColumns).toBe(2);

  await expect(filterPanel.getByRole("switch", { name: /Compatible with / })).toBeVisible();
  await expect(
    filterPanel.getByRole("navigation", { name: "Community keymap sort" }),
  ).toBeVisible();
  await expect(filterPanel.getByRole("button", { name: "Sort by newest" })).toBeVisible();

  await filterPanel.screenshot({ path: testInfo.outputPath("browse-filters-557.png") });
});
