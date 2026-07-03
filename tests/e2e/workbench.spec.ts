import { expect, test } from "@playwright/test";

import { installMockHidDevice } from "./fixtures/mock-hid";

async function openWorkbench(page: import("@playwright/test").Page) {
  // `?clearLocal=1` flushes the SQLocal/OPFS database before hydration, which
  // is necessary because Playwright's parallel workers share the dev server's
  // OPFS instance per origin. Without this, one test's saved profile leaks
  // into the next test's startup decode and blocks hydration.
  await page.goto("/?clearLocal=1");
  // 30s timeout: cold-starting the dev server + Vite optimize on first boot
  // can blow past the default 7.5s expect timeout for the very first test.
  await expect(page.getByTestId("app-frame")).toHaveAttribute("data-hydrated", "true", {
    timeout: 30_000,
  });
}

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});

test("shows the connect screen when no keyboard has been paired", async ({ page }) => {
  await openWorkbench(page);

  await expect(page.getByTestId("connect-screen")).toBeVisible();
  await expect(page.locator(".app-kb-block")).toHaveCount(0);
  await expect(page.getByTestId("auth-avatar")).toBeVisible();
  await expect(page.getByTestId("connect-webhid")).toBeEnabled();
  // Mock connectors must never leak into the UI — they are test-only fixtures.
  await expect(page.getByTestId("connect-mock")).toHaveCount(0);
  await expect(page.getByTestId("connect-mock-topbar")).toHaveCount(0);
  await expect(page.getByTestId("mock-capture-panel")).toHaveCount(0);
});

test("auto-attaches a previously-granted WebHID keyboard on page load", async ({
  context,
  page,
}) => {
  await installMockHidDevice(context, { preGranted: true });
  await openWorkbench(page);

  // Once `navigator.hid.getDevices()` returns a paired device, the editor
  // opens without any user interaction — same as Chrome's per-origin grant.
  await expect(page.locator(".app-kb-block")).toBeVisible();
  await expect(page.locator(".key-inspector")).toBeVisible();
  await expect(page.getByTestId("connect-screen")).toHaveCount(0);
});

test("connects via the WebHID button when permission has not been granted yet", async ({
  context,
  page,
}) => {
  await installMockHidDevice(context, { preGranted: false });
  await openWorkbench(page);

  await expect(page.getByTestId("connect-screen")).toBeVisible();
  await page.getByTestId("connect-webhid").click();

  await expect(page.locator(".app-kb-block")).toBeVisible();
  await expect(page.locator(".key-inspector")).toBeVisible();
});

test("exposes the git diff panel as a primary workspace view", async ({ page }) => {
  await openWorkbench(page);

  await page.locator('.view-seg button[title="Diff"]').click();

  await expect(page.getByTestId("git-diff-panel")).toBeVisible();
  await expect(page.getByTestId("git-diff-panel")).toContainText("Visual diff");
  await expect(page.getByTestId("git-diff-panel")).toContainText("Branches");
  // With no pending changes the visual diff shows an empty state and the
  // source-diff card is hidden — both deliberate. The card returns once a
  // user makes an edit (covered by the keymap-write test below).
  await expect(page.getByTestId("git-diff-panel")).toContainText(
    "Working layout matches the local base",
  );
});

test("surfaces sign-in and WebHID click outcomes", async ({ context, page }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "hid", {
      configurable: true,
      value: {
        getDevices: async () => [],
        requestDevice: async () => {
          throw new DOMException("No test keyboard selected", "NotFoundError");
        },
      },
    });
  });
  await openWorkbench(page);

  await page.getByTestId("auth-avatar").click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "GitHub" })).toBeVisible();

  await page.getByTestId("connect-webhid").click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "No WebHID keyboard selected" })).toBeVisible();
});

test("does not open the editor with a sample layout when a generic WebHID board has no definition", async ({
  context,
  page,
}) => {
  // Use a vendor/product pair the catalog will not match.
  await installMockHidDevice(context, {
    vendorId: 0x1209,
    productId: 0x9999,
    productName: "QMK Keyboard",
    serialNumber: "GENERIC-0001",
  });
  await openWorkbench(page);
  await page.getByTestId("connect-webhid").click();

  await expect(page.getByTestId("layout-resolution-needed")).toBeVisible();
  await expect(page.locator(".app-kb-block")).toHaveCount(0);
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "no matching VIA definition" })).toBeVisible();
});

test("keeps the top bar to one non-overflowing row across breakpoints", async ({ page }) => {
  for (const viewport of [
    { height: 900, width: 1440 },
    { height: 820, width: 1024 },
    { height: 760, width: 760 },
    { height: 844, width: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await openWorkbench(page);

    const metrics = await page.locator(".app-topbar").evaluate((topbar) => {
      const rect = topbar.getBoundingClientRect();
      const children = Array.from(topbar.children)
        .filter((child) => getComputedStyle(child).display !== "none")
        .map((child) => child.getBoundingClientRect());

      return {
        childBottom: Math.max(...children.map((child) => child.bottom)),
        childTop: Math.min(...children.map((child) => child.top)),
        clientWidth: topbar.clientWidth,
        height: rect.height,
        scrollWidth: topbar.scrollWidth,
      };
    });

    expect(metrics.scrollWidth, `topbar overflowed at ${viewport.width}px`).toBeLessThanOrEqual(
      metrics.clientWidth + 1,
    );
    expect(metrics.height, `topbar height changed at ${viewport.width}px`).toBe(56);
    expect(
      metrics.childBottom - metrics.childTop,
      `topbar children wrapped at ${viewport.width}px`,
    ).toBeLessThanOrEqual(40);
  }
});

test("validates keymap writes against the VIA protocol and rolls back rejected keycodes", async ({
  context,
  page,
}) => {
  await installMockHidDevice(context, { preGranted: true });
  await openWorkbench(page);

  await page.locator("a.keycap").first().click();
  const keycodeInput = page.getByTestId("binding-keycode-input");
  await expect(keycodeInput).toBeVisible();
  const original = await keycodeInput.inputValue();

  await keycodeInput.fill("KC_A");
  await expect(keycodeInput).toHaveValue("KC_A");

  // A keycode longer than 72 chars is rejected by `validatePacket`. The
  // optimistic edit must roll back to the previous value and surface a
  // notice — that's the production validation path, not a dev-only feature.
  await keycodeInput.fill(`KC_${"X".repeat(80)}`);
  await expect(keycodeInput).toHaveValue("KC_A");
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "rejected" })).toBeVisible();

  // Sanity: original was a real binding, not blank.
  expect(original.length).toBeGreaterThan(0);
});

test("blocks flashing without a live WebHID target", async ({ page }) => {
  await openWorkbench(page);
  await page.getByTestId("open-firmware").click();

  await expect(page.getByTestId("flash-validation")).toContainText(
    "Connect a live WebHID keyboard before flashing.",
  );
  await expect(page.getByTestId("flash-to-device")).toBeDisabled();
});
