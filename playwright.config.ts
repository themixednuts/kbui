import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  expect: {
    timeout: 7_500,
  },
  // Tests share a single dev server's OPFS — racing them risks one test's
  // SQLocal write stomping another's `?clearLocal=1` cleanup mid-flight.
  // Serialize until we have a per-worker storage origin.
  fullyParallel: false,
  workers: 1,
  outputDir: ".playwright/test-results",
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  reporter: [["list"]],
  testDir: "tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:5320",
    trace: "on-first-retry",
  },
  webServer: {
    command: "vp dev --host 127.0.0.1 --port 5320",
    reuseExistingServer: !process.env.CI,
    timeout: 45_000,
    url: "http://127.0.0.1:5320",
  },
});
