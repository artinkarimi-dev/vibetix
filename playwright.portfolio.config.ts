process.env.VIBETIX_FIXTURE_TESTS = "true";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/portfolio",
  workers: 1,
  retries: 0,
  timeout: 30000,
  reporter: [
    ["list"],
    ["json", { outputFile: "artifacts/portfolio/ui-results.json" }],
  ],
  outputDir: "artifacts/portfolio/ui-traces",
  use: {
    baseURL: "http://127.0.0.1:5194",
    trace: "retain-on-failure",
    launchOptions: process.env.QA_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.QA_CHROMIUM_EXECUTABLE }
      : {},
  },
  webServer: {
    command: `${process.execPath} node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5194 --strictPort`,
    url: "http://127.0.0.1:5194",
    reuseExistingServer: false,
  },
});
