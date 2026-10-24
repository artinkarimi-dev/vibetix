import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.QA_CHROMIUM_EXECUTABLE || undefined,
});
const runs = [];
try {
  for (const mobile of [false, true])
    for (let run = 1; run <= 3; run++) {
      const context = await browser.newContext({
        viewport: mobile
          ? { width: 390, height: 844 }
          : { width: 1440, height: 1000 },
        isMobile: mobile,
        deviceScaleFactor: mobile ? 3 : 1,
      });
      const page = await context.newPage();
      const session = await context.newCDPSession(page);
      if (mobile) {
        await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
        await session.send("Network.enable");
        await session.send("Network.emulateNetworkConditions", {
          offline: false,
          latency: 150,
          downloadThroughput: (1.6 * 1024 * 1024) / 8,
          uploadThroughput: (750 * 1024) / 8,
        });
      }
      await page.addInitScript(() => {
        window.__vibetixLab = { lcp: 0, cls: 0, longTasks: [] };
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            window.__vibetixLab.lcp = entry.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            if (!entry.hadRecentInput) window.__vibetixLab.cls += entry.value;
        }).observe({ type: "layout-shift", buffered: true });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            window.__vibetixLab.longTasks.push(entry.duration);
        }).observe({ type: "longtask", buffered: true });
      });
      await page.goto(process.env.QA_BASE_URL || "http://127.0.0.1:5184/", {
        waitUntil: "networkidle",
      });
      await page.waitForTimeout(3000);
      const metrics = await page.evaluate(() => ({
        ...window.__vibetixLab,
        navigation: performance.getEntriesByType("navigation")[0].toJSON(),
        resources: performance.getEntriesByType("resource").map((e) => ({
          name: e.name,
          bytes: e.encodedBodySize,
          duration: e.duration,
        })),
      }));
      runs.push({
        mode: mobile ? "mobile-4xCPU-150ms-1.6Mbps" : "desktop-unthrottled",
        run,
        ...metrics,
        initialJSNetworkBytes: metrics.resources
          .filter((entry) => new URL(entry.name).pathname.endsWith(".js"))
          .reduce((sum, entry) => sum + entry.bytes, 0),
      });
      await context.close();
    }
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/performance.json",
    JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        caveat:
          "Local headless Chromium lab sample without coverage/tracing; not Lighthouse, INP or field data. CLS is the sampled initial window, not full session.",
        runs,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      runs.map(({ mode, run, lcp, cls, longTasks, initialJSNetworkBytes }) => ({
        mode,
        run,
        lcp,
        cls,
        blockingTime: longTasks.reduce(
          (sum, ms) => sum + Math.max(0, ms - 50),
          0,
        ),
        initialJSNetworkBytes,
      })),
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
