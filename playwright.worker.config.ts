import { defineConfig } from "@playwright/test";

const baseURL = process.env.KBGUI_WORKER_URL ?? "http://127.0.0.1:8790";

export default defineConfig({
  fullyParallel: false,
  outputDir: ".playwright/worker-results",
  reporter: [["list"]],
  testDir: "tests/worker",
  timeout: 60_000,
  use: {
    baseURL,
    deviceScaleFactor: 1,
    trace: "retain-on-failure",
    viewport: { height: 740, width: 1173 },
  },
  webServer: {
    command: "vp run dev:worker:test",
    env: {
      ...process.env,
      BETTER_AUTH_URL: baseURL,
      KBGUI_WORKER_SNAPSHOT_DIR: ".svelte-kit/wrangler-worker-test",
      KBGUI_WORKER_URL: baseURL,
    },
    reuseExistingServer: false,
    stderr: "pipe",
    stdout: "pipe",
    timeout: 180_000,
    url: baseURL,
  },
  workers: 1,
});
