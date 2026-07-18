import { expect, test } from "@playwright/test";

test("local profiles use the OPFS worker backend without fallback warnings", async ({ page }) => {
  const warnings: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") warnings.push(message.text());
  });

  await page.goto("/settings?section=keyboard", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Local keyboard" })).toBeVisible();
  await page.getByLabel("QMK keyboard").fill("kbui/test-board");
  await page.getByLabel("Layout macro").fill("LAYOUT");
  await page.getByRole("button", { name: "Save firmware target" }).click();
  await expect(page.getByText("Firmware target saved locally.", { exact: true })).toBeVisible();

  const initial = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const file = await root.getFileHandle("kbui.sqlite3");
    return {
      crossOriginIsolated,
      migration: localStorage.getItem("kbui.sqlocal.opfs-migration.v1"),
      size: (await file.getFile()).size,
    };
  });

  expect(initial.crossOriginIsolated).toBe(true);
  expect(initial.migration).toBe("done");
  expect(initial.size).toBeGreaterThan(0);
  expect(warnings.filter((message) => /opfs|persistence failed/i.test(message))).toEqual([]);

  await page.reload({ waitUntil: "networkidle" });
  const reloadedSize = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    return (await (await root.getFileHandle("kbui.sqlite3")).getFile()).size;
  });
  expect(reloadedSize).toBeGreaterThan(0);
  await expect(page.getByLabel("QMK keyboard")).toHaveValue("kbui/test-board");
  await expect(page.getByLabel("Layout macro")).toHaveValue("LAYOUT");
  expect(warnings.filter((message) => /opfs|persistence failed/i.test(message))).toEqual([]);
});
