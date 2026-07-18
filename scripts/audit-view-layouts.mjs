import { chromium } from "playwright";

import { formatAuditReport, inspectLayout, watchPageErrors } from "./lib/layout-audit.mjs";
import { findLocalDevUrl, parseLocalDevUrl } from "./lib/local-dev-url.mjs";

const configuredBase =
  process.env.BASE_URL ??
  findLocalDevUrl({ envNames: ["KBGUI_WORKER_URL", "BETTER_AUTH_URL"] })?.value;
const BASE = configuredBase ? parseLocalDevUrl(configuredBase, "BASE_URL").origin : null;

if (!BASE) {
  throw new Error("Set BASE_URL or BETTER_AUTH_URL in .dev.vars before running this audit.");
}

const ROUTES = ["/connect", "/editor", "/browse", "/library", "/versions", "/settings"];

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];

const baseError = await baseAvailabilityError(BASE);

if (baseError) {
  console.error(`FAIL layout audit: ${baseError}`);
  process.exitCode = 1;
} else {
  const results = await runAudit();
  const report = formatAuditReport(results, {
    routeCount: ROUTES.length,
    viewportCount: VIEWPORTS.length,
  });

  console.log(report.output);
  if (report.failed) process.exitCode = 1;
}

async function runAudit() {
  const browser = await chromium.launch();
  const results = [];

  try {
    for (const viewport of VIEWPORTS) {
      for (const route of ROUTES) {
        const context = await browser.newContext({
          reducedMotion: "reduce",
          viewport: { height: viewport.height, width: viewport.width },
        });
        const page = await context.newPage();
        const pageErrors = watchPageErrors(page, BASE);
        let layoutIssues = [];

        try {
          const response = await page.goto(`${BASE}${route}`, {
            timeout: 60_000,
            waitUntil: "domcontentloaded",
          });

          if (!response) {
            pageErrors.record("navigation", `No response while loading ${route}`);
          } else if (!response.ok()) {
            pageErrors.record(
              "http-error",
              `${response.request().method()} ${route} returned ${response.status()} (document)`,
            );
          }

          await page.waitForSelector(".new-app-shell", { state: "visible", timeout: 60_000 });

          const loadedPath = new URL(page.url()).pathname;
          if (loadedPath !== route) {
            pageErrors.record("navigation", `Expected ${route}, but loaded ${loadedPath}`);
          }

          await page.waitForLoadState("networkidle", { timeout: 1_500 }).catch(() => {});
          await page.evaluate(async () => {
            await document.fonts?.ready;
            await new Promise((resolve) => {
              requestAnimationFrame(() => requestAnimationFrame(resolve));
            });
          });

          layoutIssues = await inspectLayout(page);
        } catch (error) {
          const message =
            error instanceof Error ? error.message.split(/\r?\n/, 1)[0] : String(error);
          pageErrors.record("navigation", `${route} could not be audited: ${message}`);
        } finally {
          results.push({
            issues: [...layoutIssues, ...pageErrors.snapshot()],
            route,
            viewport,
          });
          pageErrors.stop();
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }

  return results;
}

async function baseAvailabilityError(base) {
  try {
    await fetch(base, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(5_000),
    });
    return null;
  } catch (error) {
    const reason = error?.cause?.code ?? (error instanceof Error ? error.message : String(error));
    return `Cannot reach ${base} (${reason}). Start the app or set BASE_URL to its origin.`;
  }
}
