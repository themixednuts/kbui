import { defineConfig } from "@playwright/test";

const port = 4173;
const host = "127.0.0.1";
const baseURL = `http://${host}:${port}`;

export default defineConfig({
  fullyParallel: false,
  outputDir: ".playwright/visual-results",
  reporter: [["list"]],
  testDir: "tests/visual",
  timeout: 120_000,
  use: {
    baseURL,
    deviceScaleFactor: 1,
    trace: "retain-on-failure",
    viewport: { height: 900, width: 1440 },
  },
  webServer: {
    command: `vp preview --host ${host} --port ${port}`,
    reuseExistingServer: false,
    stderr: "pipe",
    stdout: "pipe",
    timeout: 180_000,
    url: baseURL,
  },
  workers: 1,
});
