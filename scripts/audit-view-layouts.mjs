import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:8787";
const WIDTHS = [720, 980, 1100, 1280, 1440];

const VIEWS = [
  { id: "connect", url: "/keymap?clearLocal=1", setup: null },
  { id: "keymap", url: "/keymap?clearLocal=1", setup: "continue" },
  { id: "logic", url: "/logic?clearLocal=1", setup: "continue" },
  { id: "keymap-rgb", url: "/keymap?mode=rgb&clearLocal=1", setup: "continue" },
  { id: "versioning", url: "/versioning?clearLocal=1", setup: "continue" },
  { id: "firmware", url: "/firmware?clearLocal=1", setup: "continue" },
];

function layoutIssues(page, viewportWidth) {
  return page.evaluate((vw) => {
    const issues = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > doc.clientWidth + 1) {
      issues.push({
        kind: "page-overflow-x",
        detail: `${doc.scrollWidth}px > ${doc.clientWidth}px`,
      });
    }

    const topbar = document.querySelector(".topbar");
    if (topbar) {
      const buttons = [...topbar.querySelectorAll(".view-seg button")];
      for (let i = 1; i < buttons.length; i++) {
        const prev = buttons[i - 1].getBoundingClientRect();
        const cur = buttons[i].getBoundingClientRect();
        if (cur.left < prev.right - 1) {
          issues.push({
            kind: "topbar-nav-overlap",
            detail: `${buttons[i - 1].title} overlaps ${buttons[i].title}`,
          });
          break;
        }
      }
      const labels = [...topbar.querySelectorAll(".view-seg [data-label]")];
      const visibleLabels = labels.filter((el) => {
        const s = getComputedStyle(el);
        return s.display !== "none" && el.getBoundingClientRect().width > 2;
      });
      const narrowButtons = buttons.filter((b) => b.getBoundingClientRect().width < 40);
      if (visibleLabels.length && narrowButtons.length) {
        issues.push({
          kind: "topbar-label-in-icon-slot",
          detail: `${visibleLabels.length} labels visible with ${narrowButtons.length} narrow buttons`,
        });
      }
      if (topbar.scrollWidth > topbar.clientWidth + 1) {
        issues.push({
          kind: "topbar-overflow-x",
          detail: `${topbar.scrollWidth}px > ${topbar.clientWidth}px`,
        });
      }
    }

    const shell = document.querySelector(".view-shell");
    if (shell) {
      if (shell.scrollWidth > shell.clientWidth + 1) {
        issues.push({
          kind: "view-shell-overflow-x",
          detail: `${shell.scrollWidth}px > ${shell.clientWidth}px`,
        });
      }
      const overflowing = [...shell.querySelectorAll("*")].filter((el) => {
        if (el.closest(".keyboard-stage")) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.right > vw + 2;
      });
      if (overflowing.length) {
        const sample = overflowing
          .slice(0, 3)
          .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join(".")}`)
          .join(", ");
        issues.push({
          kind: "child-past-viewport",
          detail: `${overflowing.length} nodes (e.g. ${sample})`,
        });
      }
    }

    const frame = document.querySelector(".app-frame");
    if (frame && frame.scrollHeight > frame.clientHeight + 1) {
      issues.push({
        kind: "app-frame-scrolls",
        detail: "unexpected outer scroll on app-frame",
      });
    }

    return issues;
  }, viewportWidth);
}

async function scrollShell(page) {
  await page.evaluate(() => {
    const shell = document.querySelector(".view-shell");
    if (!shell || shell.scrollHeight <= shell.clientHeight) return;
    shell.scrollTop = shell.scrollHeight;
    shell.scrollTop = 0;
  });
  await page.waitForTimeout(150);
}

const browser = await chromium.launch();
const report = [];

for (const width of WIDTHS) {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  for (const view of VIEWS) {
    await page.goto(`${BASE}${view.url}`, { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForSelector("[data-testid=app-frame]", { timeout: 60_000 });
    if (view.setup === "continue") {
      const btn = page.getByRole("button", { name: "Continue without device →" });
      if (await btn.isVisible().catch(() => false)) await btn.click();
      await page.waitForTimeout(400);
    }
    if (view.id === "versioning") {
      for (let i = 0; i < 8; i++) {
        const fork = page.getByRole("button", { name: "New fork" });
        if (await fork.isVisible().catch(() => false)) await fork.click();
      }
    }
    await scrollShell(page);
    const issues = await layoutIssues(page, width);
    if (issues.length) report.push({ width, view: view.id, issues });
  }
  await page.close();
}

await browser.close();
console.log(JSON.stringify(report, null, 2));
console.log(`\nTotal issue groups: ${report.length}`);
