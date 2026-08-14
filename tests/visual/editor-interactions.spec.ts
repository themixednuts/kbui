import { expect, test } from "@playwright/test";

test("keeps the compact inspector coherent and resizable", async ({ page }) => {
  await page.setViewportSize({ width: 1269, height: 740 });
  await page.goto("/editor", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  const appbar = page.getByRole("banner");
  await expect(appbar).not.toContainText("fork_right");
  await expect(appbar).not.toContainText(/\bmain\b/i);
  await expect(page.locator('[data-key-id="k1-13"] .g-main')).toHaveText("\\");

  await page.locator('[data-key-id="k2-4"]').click();

  await page
    .getByRole("navigation", { name: "Editor layout" })
    .getByRole("button", { name: "Dock" })
    .click();

  const resizeHandle = page.getByRole("separator", { name: "Resize key inspector" });
  await expect(resizeHandle).toBeVisible();
  await expect(resizeHandle).toHaveAttribute("data-direction", "vertical");

  const dockPane = page.locator(".key-inspector-dock-pane");
  const before = await dockPane.boundingBox();
  const handleBox = await resizeHandle.boundingBox();
  expect(before).not.toBeNull();
  expect(handleBox).not.toBeNull();
  expect(handleBox!.width).toBeGreaterThan(handleBox!.height);
  expect(handleBox!.height).toBeLessThanOrEqual(2);
  await expect(resizeHandle.locator(":scope > div")).toHaveCount(0);

  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y - 90, {
    steps: 8,
  });
  await page.mouse.up();

  const after = await dockPane.boundingBox();
  expect(after).not.toBeNull();
  expect(after!.height).toBeGreaterThan(before!.height + 60);

  const letterRows = await page
    .locator(".quick-group")
    .first()
    .locator("button")
    .evaluateAll((buttons) => [
      ...new Set(buttons.map((button) => Math.round(button.getBoundingClientRect().top))),
    ]);
  expect(letterRows.length).toBeGreaterThan(1);

  const catalogSummary = page.locator("details.keycode-catalog summary");
  await expect(catalogSummary).toContainText("Search QMK keycodes");
  await expect(catalogSummary).not.toContainText("736");
  await catalogSummary.click();
  await expect(page.getByLabel("Search all QMK keycodes")).toBeVisible();
});

test("keeps layer selection stable and renders the board as a flow graph", async ({ page }) => {
  await page.setViewportSize({ width: 1110, height: 740 });
  await page.goto("/editor", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  await expect(page.locator(".board-keycap[aria-pressed='true']")).toHaveCount(0);
  await expect(page.getByText("No key selected", { exact: true })).toBeVisible();

  const numberKey = page.locator('[data-key-id="k0-1"]');
  await expect(numberKey.locator(".cap-legend")).toHaveCount(0);

  const activeLayer = page
    .getByLabel("Keyboard layers")
    .getByRole("button", { name: "Base", exact: true });
  await expect(activeLayer).toHaveAttribute("aria-pressed", "true");
  const activeBackground = await activeLayer.evaluate(
    (button) => getComputedStyle(button).backgroundColor,
  );
  await activeLayer.hover();
  await expect
    .poll(() => activeLayer.evaluate((button) => getComputedStyle(button).backgroundColor))
    .toBe(activeBackground);

  const keycaps = page.locator(".keyboard-flow .svelte-flow__node .board-keycap");
  await expect(keycaps).toHaveCount(61);
  await expect(page.locator(".keyboard-flow .cap-legend").first()).toBeVisible();
  await expect(page.locator(".keyboard-flow .svelte-flow__edge.combo-connector")).toHaveCount(1);

  await expect(page.locator('[data-key-id="k1-1"] .marker-slot.combo')).toHaveText("Esc");
  await expect(page.locator('[data-key-id="k1-2"] .marker-slot.combo')).toHaveText("Esc");

  // Wide panes keep two rows: mode + firmware/status on top, layers beneath.
  // The strip scrolls rather than wrapping, and the bar never overflows.
  const toolbar = page.locator(".editor-toolbar");
  const primaryTools = toolbar.locator(".editor-primary-tools");
  const layerRow = toolbar.locator(".editor-layer-row");
  const [primaryBox, layerBox] = await Promise.all([
    primaryTools.boundingBox(),
    layerRow.boundingBox(),
  ]);
  expect(primaryBox).not.toBeNull();
  expect(layerBox).not.toBeNull();
  expect(layerBox!.y).toBeGreaterThan(primaryBox!.y + 4);
  expect(await toolbar.evaluate((bar) => bar.scrollWidth <= bar.clientWidth + 1)).toBe(true);
  expect(
    await toolbar.locator(".layer-buttons").evaluate((strip) => getComputedStyle(strip).flexWrap),
  ).toBe("nowrap");
  await expect(page.locator(".key-inspector .inspector-chrome")).toHaveCount(0);
  await expect(page.locator(".fallthrough-chip")).toHaveText("fall-through");

  const rightCtrl = page.locator('[data-key-id="k4-7"]');
  await expect(rightCtrl.locator(".g-main")).toHaveText("RCtrl");
  const [rightCtrlFaceBox, rightCtrlGlyphBox] = await Promise.all([
    rightCtrl.locator(".keycap-face").boundingBox(),
    rightCtrl.locator(".g-main").boundingBox(),
  ]);
  expect(rightCtrlFaceBox).not.toBeNull();
  expect(rightCtrlGlyphBox).not.toBeNull();
  expect(rightCtrlGlyphBox!.y).toBeGreaterThanOrEqual(rightCtrlFaceBox!.y - 1);
  expect(rightCtrlGlyphBox!.y + rightCtrlGlyphBox!.height).toBeLessThanOrEqual(
    rightCtrlFaceBox!.y + rightCtrlFaceBox!.height + 1,
  );
  expect(
    await rightCtrl
      .locator(".g-main")
      .evaluate((glyph) => getComputedStyle(glyph).getPropertyValue("text-box-trim")),
  ).toBe("trim-both");

  const layerKey = page.locator('[data-key-id="k4-4"]');
  await expect(layerKey.locator(".cap-legend")).toHaveText("Fn");
  await expect(layerKey.locator(".g-main")).toHaveText("MO");
  await expect(layerKey.locator(".g-sub")).toHaveCount(0);
  await expect(layerKey.locator(".marker-slot.layer")).toHaveText("L1");
  await layerKey.click();
  await expect(layerKey).toHaveAttribute("aria-pressed", "true");

  const keyBox = await layerKey.boundingBox();
  const nodeBox = await layerKey
    .locator(
      "xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' svelte-flow__node ')][1]",
    )
    .boundingBox();
  expect(keyBox).not.toBeNull();
  expect(nodeBox).not.toBeNull();
  expect(Math.abs(keyBox!.width - nodeBox!.width)).toBeLessThan(1);
  expect(Math.abs(keyBox!.height - nodeBox!.height)).toBeLessThan(1);
});

test("collapses the editor toolbar to one row in a narrow pane", async ({ page }) => {
  // 62px rail + ~495px editor matches the squeezed editor pane; below 640px
  // the toolbar must sit in one row instead of leaving a two-row empty gap.
  await page.setViewportSize({ width: 557, height: 740 });
  await page.goto("/editor", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  const toolbar = page.locator(".editor-toolbar");
  const primaryTools = toolbar.locator(".editor-primary-tools");
  const layerRow = toolbar.locator(".editor-layer-row");
  const [toolbarBox, primaryBox, layerBox] = await Promise.all([
    toolbar.boundingBox(),
    primaryTools.boundingBox(),
    layerRow.boundingBox(),
  ]);
  expect(toolbarBox).not.toBeNull();
  expect(primaryBox).not.toBeNull();
  expect(layerBox).not.toBeNull();
  expect(toolbarBox!.width).toBeLessThan(640);
  expect(Math.abs(layerBox!.y - primaryBox!.y)).toBeLessThan(4);
  expect(layerBox!.x).toBeGreaterThan(primaryBox!.x + primaryBox!.width - 1);
  expect(toolbarBox!.height).toBeLessThan(64);
  expect(await toolbar.evaluate((bar) => bar.scrollWidth <= bar.clientWidth + 1)).toBe(true);
  expect(
    await toolbar.locator(".layer-buttons").evaluate((strip) => getComputedStyle(strip).flexWrap),
  ).toBe("nowrap");
  await expect(toolbar.locator(".add-layer")).toBeVisible();
  await expect(toolbar.locator(".add-layer span")).toBeHidden();
  await expect(toolbar.getByRole("navigation", { name: "Firmware edit target" })).toBeHidden();
  await expect(toolbar.getByRole("button", { name: "Base", exact: true })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "Fn", exact: true })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "Nav", exact: true })).toBeVisible();
  await expect(toolbar.getByText("Disconnected", { exact: true })).toBeVisible();
});

