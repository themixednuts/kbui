import { expect, type Page, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const screenshotDir = fileURLToPath(
  new URL("../../docs/redesign/screenshots/rebuild/", import.meta.url),
);

type CaptureTarget = {
  name: string;
  route: string;
  ready: (page: Page) => Promise<void>;
  prepare?: (page: Page) => Promise<void>;
};

const targets: CaptureTarget[] = [
  {
    name: "editor-keys.png",
    ready: async (page) => {
      await expect(page.locator('.editor-route[data-lens="keys"]')).toBeVisible();
      await expect(page.getByRole("region", { name: "Keyboard board viewport" })).toBeVisible();
    },
    route: "/editor",
  },
  {
    name: "editor-lighting.png",
    prepare: async (page) => {
      await page
        .getByRole("navigation", { name: "Editor lens" })
        .getByRole("button", { name: "Lighting" })
        .click();
      await expect(page.locator('.editor-route[data-lens="lighting"]')).toBeVisible();
      await expect(page.getByRole("region", { name: "Keyboard lighting viewport" })).toBeVisible();
    },
    ready: async (page) => {
      await expect(page.locator('.editor-route[data-lens="keys"]')).toBeVisible();
    },
    route: "/editor",
  },
  {
    name: "editor-split.png",
    ready: async (page) => {
      await expect(page.locator(".editor-route.split")).toBeVisible();
      await expect(page.getByRole("region", { name: "Keyboard board viewport" })).toBeVisible();
    },
    route: "/editor?board=split",
  },
  {
    name: "connect.png",
    ready: (page) => waitForAppRouteHeading(page, "Connect"),
    route: "/connect",
  },
  {
    name: "library.png",
    ready: (page) => waitForAppRouteHeading(page, "Library"),
    route: "/library",
  },
  {
    name: "versions.png",
    ready: (page) => waitForAppRouteHeading(page, "Versions"),
    route: "/versions",
  },
  {
    name: "settings.png",
    ready: (page) => waitForAppRouteHeading(page, "Settings"),
    route: "/settings",
  },
  {
    name: "browse.png",
    ready: (page) => waitForAppRouteHeading(page, "Browse"),
    route: "/browse",
  },
];

test.beforeAll(() => {
  mkdirSync(screenshotDir, { recursive: true });
});

for (const target of targets) {
  test(`captures ${target.name}`, async ({ page }) => {
    await page.goto(target.route, { waitUntil: "domcontentloaded" });
    await target.ready(page);
    await waitForVisualReady(page);

    if (target.prepare) {
      await target.prepare(page);
      await waitForVisualReady(page);
    }

    await page.screenshot({
      fullPage: true,
      path: path.join(screenshotDir, target.name),
    });
  });
}

async function waitForAppRouteHeading(page: Page, heading: string) {
  const route = page.locator(".app-route-page");
  await expect(route).toBeVisible();
  await expect(route.getByRole("heading", { level: 2, name: heading })).toBeVisible();
}

async function waitForVisualReady(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}
