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
    name: "flash-overlay.png",
    prepare: async (page) => {
      await page
        .getByRole("navigation", { name: "Selected key inspector" })
        .getByRole("button", { name: "Hold-Tap" })
        .click();
      await page.getByLabel("Hold").fill("KC_LCTL");
      await page.getByRole("button", { name: "Apply behavior" }).click();
      await expect(page.getByTestId("via-rebuild-required")).toBeVisible();
      await page.getByRole("button", { name: "Build firmware" }).click();
      await expect(page.getByTestId("flash-overlay")).toBeVisible();
      await expect(page.getByRole("dialog", { name: /^Flash to / })).toBeVisible();
    },
    ready: async (page) => {
      await expect(page.locator(".editor-route.split")).toBeVisible();
      await expect(page.getByRole("region", { name: "Keyboard board viewport" })).toBeVisible();
    },
    route: "/editor?board=split",
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
  // Anchor on the shell appbar (banner) heading, which every (app) route shares
  // whether it is a placeholder or a rebuilt screen.
  const banner = page.getByRole("banner");
  await expect(banner.getByRole("heading", { level: 1, name: heading })).toBeVisible();
}

async function waitForVisualReady(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}
