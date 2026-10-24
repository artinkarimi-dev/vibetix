process.env.VIBETIX_FIXTURE_TESTS = "true";
import { defineConfig, devices } from "@playwright/test";
const external = process.env.QA_BASE_URL;
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "artifacts/playwright-report" }],
    ["json", { outputFile: "artifacts/playwright-results.json" }],
  ],
  outputDir: "artifacts/test-results",
  use: {
    baseURL: external ?? "http://127.0.0.1:5183",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: process.env.QA_CHROMIUM_EXECUTABLE
          ? { executablePath: process.env.QA_CHROMIUM_EXECUTABLE }
          : undefined,
      },
    },
    ...(process.env.QA_ALL_BROWSERS === "true"
      ? [
          { name: "firefox", use: { ...devices["Desktop Firefox"] } },
          { name: "webkit", use: { ...devices["Desktop Safari"] } },
        ]
      : []),
  ],
  webServer: external
    ? undefined
    : {
        command: `${process.execPath} node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5183`,
        url: "http://127.0.0.1:5183",
        reuseExistingServer: !process.env.CI,
        env: { VITE_PROFILE: "true", VITE_USE_FIXTURES: "true" },
        timeout: 30000,
      },
});
