import { expect, test, type Locator, type Page } from "@playwright/test";

async function blurActive(page: Page) {
  await page.evaluate(() => {
    const el = document.activeElement;
    if (el instanceof HTMLElement) el.blur();
  });
}

async function typeCurrentGlyph(page: Page, caret: Locator) {
  const id = await caret.getAttribute("data-cell");
  const kind = await caret.getAttribute("data-kind");
  const glyph = await caret.textContent();
  if (kind === "newline") {
    await page.keyboard.press("Enter");
  } else if (glyph === " " || kind === "indent") {
    await page.keyboard.press(" ");
  } else if (glyph && glyph.length === 1) {
    await page.keyboard.type(glyph);
  } else {
    throw new Error(`Cannot type caret kind=${kind} glyph=${JSON.stringify(glyph)}`);
  }
  await expect(caret).not.toHaveAttribute("data-cell", id ?? "");
}

function isInside(
  inner: { x: number; y: number; width: number; height: number },
  outer: { x: number; y: number; width: number; height: number },
  slop = 2,
) {
  return (
    inner.x >= outer.x - slop &&
    inner.x + inner.width <= outer.x + outer.width + slop &&
    inner.y >= outer.y - slop &&
    inner.y + inner.height <= outer.y + outer.height + slop
  );
}

test("keeps the practice caret visible at the end of a long line", async ({ page }) => {
  await page.setViewportSize({ width: 557, height: 800 });
  await page.goto("/trainer", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  const buffer = page.getByLabel("Practice buffer");
  const caret = buffer.locator("[data-caret]");
  await expect(caret).toHaveCount(1);

  await buffer.evaluate((el) => {
    el.style.width = "280px";
    el.style.maxWidth = "280px";
  });
  await blurActive(page);

  let reachedLongLineEnd = false;
  for (let i = 0; i < 160; i++) {
    const kind = await caret.getAttribute("data-kind");
    if (kind === "newline") {
      const overflow = await buffer.evaluate((el) => el.scrollWidth - el.clientWidth);
      if (overflow > 8) {
        reachedLongLineEnd = true;
        break;
      }
    }
    await typeCurrentGlyph(page, caret);
  }
  expect(reachedLongLineEnd).toBe(true);

  await expect(caret).toHaveAttribute("data-kind", "newline");
  await expect.poll(async () => buffer.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(8);
  await expect.poll(async () => buffer.evaluate((el) => el.scrollLeft)).toBeGreaterThan(8);
  await expect
    .poll(async () => {
      const caretBox = await caret.boundingBox();
      const bufferBox = await buffer.boundingBox();
      return Boolean(
        caretBox &&
          bufferBox &&
          caretBox.width > 0 &&
          caretBox.height > 0 &&
          isInside(caretBox, bufferBox),
      );
    })
    .toBe(true);

  await page.keyboard.press("Enter");
  await expect(caret).not.toHaveAttribute("data-kind", "newline");
  await expect
    .poll(async () => {
      const nextBox = await caret.boundingBox();
      const afterBuffer = await buffer.boundingBox();
      return Boolean(nextBox && afterBuffer && isInside(nextBox, afterBuffer));
    })
    .toBe(true);
});
