import { expect, test, type Browser, type Page } from "@playwright/test";

const routes = [
  "/editor",
  "/connect",
  "/browse",
  "/library",
  "/versions",
  "/settings",
  "/settings?section=integrations",
  "/settings?section=app",
] as const;

async function openWithoutJavaScript(
  browser: Browser,
  route: string,
  width: number,
  height: number,
) {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width, height },
  });
  const page = await context.newPage();
  const response = await page.goto(route, { waitUntil: "load" });
  return { context, page, response };
}

async function installLayoutShiftObserver(page: Page) {
  await page.addInitScript(() => {
    Reflect.set(window, "__layoutShiftScore", 0);
    Reflect.set(window, "__layoutShiftEntries", []);
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & {
        hadRecentInput: boolean;
        sources?: {
          currentRect: DOMRectReadOnly;
          node: Node | null;
          previousRect: DOMRectReadOnly;
        }[];
        value: number;
      })[]) {
        if (!entry.hadRecentInput) {
          const score = Number(Reflect.get(window, "__layoutShiftScore"));
          Reflect.set(window, "__layoutShiftScore", score + entry.value);
          const entries = Reflect.get(window, "__layoutShiftEntries") as unknown[];
          entries.push({
            sources: entry.sources?.map((source) => ({
              currentRect: source.currentRect.toJSON(),
              node:
                source.node instanceof Element
                  ? `${source.node.tagName.toLowerCase()}.${source.node.className}`
                  : null,
              previousRect: source.previousRect.toJSON(),
            })),
            value: entry.value,
          });
        }
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

test("all application routes render useful, stable SSR without JavaScript", async ({ browser }) => {
  for (const viewport of [
    { width: 1173, height: 740 },
    { width: 390, height: 844 },
  ]) {
    for (const route of routes) {
      const { context, page, response } = await openWithoutJavaScript(
        browser,
        route,
        viewport.width,
        viewport.height,
      );

      expect(response?.status(), `${route} should render on the server`).toBe(200);
      await expect(page.locator("main")).toBeVisible();
      await expect(page.locator("nav").first()).toBeVisible();
      expect(await page.title(), `${route} should have a document title`).not.toBe("");
      expect(await page.locator("html").getAttribute("class")).toContain("no-js");

      const horizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(
        horizontalOverflow,
        `${route} should not overflow at ${viewport.width}px`,
      ).toBeLessThanOrEqual(1);

      const hrefs = await page
        .locator("a:visible")
        .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
      expect(hrefs.every(Boolean), `${route} should not expose dead links`).toBe(true);

      const enabledButtons = await page.locator("button:visible:not(:disabled)").count();
      if (enabledButtons > 0) {
        expect(
          await page
            .locator("button:visible:not(:disabled)")
            .first()
            .evaluate((button) => getComputedStyle(button).pointerEvents),
        ).toBe("none");
      }

      await context.close();
    }
  }
});

test("mobile editor SSR starts with stacked panes and a fitted keyboard", async ({ browser }) => {
  const { context, page } = await openWithoutJavaScript(browser, "/editor", 390, 844);
  const group = page.locator(".keymap-pane-group");
  const mainPane = page.locator(".keymap-main-pane");
  const inspectorPane = page.locator(".key-inspector-pane");
  const viewport = page.locator(".keyboard-board-viewport");
  const surface = page.locator(".keyboard-board-surface");

  expect(await group.evaluate((node) => getComputedStyle(node).flexDirection)).toBe("column");

  const [groupBox, mainBox, inspectorBox, viewportBox, surfaceBox] = await Promise.all([
    group.boundingBox(),
    mainPane.boundingBox(),
    inspectorPane.boundingBox(),
    viewport.boundingBox(),
    surface.boundingBox(),
  ]);
  expect(groupBox).not.toBeNull();
  expect(mainBox?.width).toBeCloseTo(groupBox!.width, 0);
  expect(inspectorBox?.width).toBeCloseTo(groupBox!.width, 0);
  expect(surfaceBox!.x).toBeGreaterThanOrEqual(viewportBox!.x - 1);
  expect(surfaceBox!.y).toBeGreaterThanOrEqual(viewportBox!.y - 1);
  expect(surfaceBox!.x + surfaceBox!.width).toBeLessThanOrEqual(
    viewportBox!.x + viewportBox!.width + 1,
  );
  expect(surfaceBox!.y + surfaceBox!.height).toBeLessThanOrEqual(
    viewportBox!.y + viewportBox!.height + 1,
  );

  await context.close();
});

test("flow accessibility descriptions never paint behind the keyboard", async ({ browser }) => {
  const context = await browser.newContext({
    colorScheme: "dark",
    javaScriptEnabled: false,
    viewport: { width: 1173, height: 740 },
  });
  await context.route("**/KeyboardBoard.*.css", (route) => route.abort());
  const page = await context.newPage();
  await page.goto("/editor", { waitUntil: "load" });

  const descriptions = page.locator(".keyboard-flow .a11y-hidden");
  await expect(descriptions).toHaveCount(2);
  expect(
    await descriptions.evaluateAll((nodes) =>
      nodes.map((node) => ({
        display: getComputedStyle(node).display,
        height: node.getBoundingClientRect().height,
        width: node.getBoundingClientRect().width,
      })),
    ),
  ).toEqual([
    { display: "none", height: 0, width: 0 },
    { display: "none", height: 0, width: 0 },
  ]);

  await context.close();
});

test("route-changing controls remain links without JavaScript", async ({ browser }) => {
  const { context, page } = await openWithoutJavaScript(browser, "/editor", 1173, 740);
  const connect = page.getByRole("link", { name: /connect/i }).last();
  await expect(connect).toHaveAttribute("href", "/connect");
  await connect.click();
  await expect(page).toHaveURL(/\/connect$/);

  const local = page.getByRole("link", { name: /continue without a device/i });
  await expect(local).toHaveAttribute("href", "/editor");

  await page.goto("/library?tab=combos");
  await expect(page.getByRole("link", { name: /combos/i })).toHaveAttribute("aria-current", "page");
  await context.close();
});

test("SSR-only rendering follows the system dark preference", async ({ browser }) => {
  const context = await browser.newContext({
    colorScheme: "dark",
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto("/settings", { waitUntil: "load" });
  expect(
    await page
      .locator("html")
      .evaluate((root) => getComputedStyle(root).getPropertyValue("--paper").trim()),
  ).toBe("#131217");
  expect(await page.locator("html").evaluate((root) => getComputedStyle(root).colorScheme)).toBe(
    "dark",
  );
  await context.close();
});

test("hydration keeps route layout shift below the regression budget", async ({ browser }) => {
  for (const viewport of [
    { width: 1173, height: 740 },
    { width: 390, height: 844 },
  ]) {
    for (const route of routes) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      await installLayoutShiftObserver(page);
      await page.goto(route, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(250);
      const score = await page.evaluate(() => Number(Reflect.get(window, "__layoutShiftScore")));
      if (score >= 0.001) {
        console.log(
          `${route} ${viewport.width}px shifts`,
          JSON.stringify(await page.evaluate(() => Reflect.get(window, "__layoutShiftEntries"))),
        );
      }
      expect.soft(score, `${route} CLS at ${viewport.width}px`).toBeLessThan(0.001);
      await context.close();
    }
  }
});

test("every route and native vertical scroller reserves its scrollbar gutter", async ({ page }) => {
  await page.setViewportSize({ width: 1173, height: 740 });

  for (const route of routes) {
    await page.goto(route, { waitUntil: "networkidle" });
    const gutterPolicy = await page.evaluate(() => {
      const selector = [
        ".shell-content",
        ".key-inspector-body",
        ".source-block",
        ".modal-content",
        '[class~="overflow-auto"]',
        '[class~="overflow-y-auto"]',
      ].join(",");
      const unstable = [...document.querySelectorAll<HTMLElement>(selector)]
        .filter((element) => getComputedStyle(element).scrollbarGutter !== "stable")
        .map((element) => element.className);
      return {
        document: getComputedStyle(document.documentElement).scrollbarGutter,
        unstable,
      };
    });

    expect(gutterPolicy.document, `${route} document gutter`).toBe("stable");
    expect(gutterPolicy.unstable, `${route} native scrollers`).toEqual([]);
  }
});
