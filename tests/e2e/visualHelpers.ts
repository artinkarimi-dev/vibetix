import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export async function prepareVisuals(page: Page) {
  for (const preview of await page.locator("[data-deferred-preview]").all()) {
    await preview.scrollIntoViewIfNeeded();
    await expect(preview).toHaveAttribute("data-preview-ready", "true");
  }
  await page.locator("img").evaluateAll(async (images) => {
    for (const node of images) {
      const image = node as HTMLImageElement;
      image.scrollIntoView({ behavior: "instant" });
      if (!image.complete || !image.naturalWidth) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () =>
              reject(
                new Error(
                  `Image did not load: ${image.currentSrc || image.src}`,
                ),
              ),
            10000,
          );
          image.addEventListener(
            "load",
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true },
          );
          image.addEventListener(
            "error",
            () => {
              clearTimeout(timer);
              reject(new Error(`Image failed: ${image.src}`));
            },
            { once: true },
          );
        });
      }
      await image.decode();
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  });
}
