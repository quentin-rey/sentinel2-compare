import { test, expect } from "@playwright/test";

test("app loads without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/");
  await expect(page.locator("h1")).toHaveText("Sentinel-2 Compare");
  expect(errors).toEqual([]);
});

test("runs a full compare and the slider drags without horizontal overflow", async ({ page }) => {
  await page.goto("/");
  await page.fill("#date1", "2026-06-01");
  await page.fill("#date2", "2026-07-08");
  await page.click("#compare-btn");

  // Preview renders almost immediately (well before the exact-date lookup
  // resolves) — both map canvases should be visible right away.
  await expect(page.locator("#compare")).not.toHaveClass(/hidden/);

  await page.waitForFunction(() => document.getElementById("status")?.textContent?.includes("nuages"), {
    timeout: 20000,
  });

  const swiper = page.locator("#swiper");
  const box = (await swiper.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(2000, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();

  const overflowing = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflowing).toBe(false);
});

test("exports a PNG with the expected filename pattern", async ({ page }) => {
  await page.goto("/");
  await page.fill("#date1", "2026-06-01");
  await page.fill("#date2", "2026-07-08");
  await page.click("#compare-btn");
  await page.waitForFunction(() => document.getElementById("status")?.textContent?.includes("nuages"), {
    timeout: 20000,
  });

  await page.click("#export-png-btn");
  await expect(page.locator("#export-modal")).not.toHaveClass(/hidden/);
  const downloadPromise = page.waitForEvent("download");
  await page.click("#export-modal-confirm");
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^sentinel2_true-color_\d{4}-\d{2}-\d{2}_vs_\d{4}-\d{2}-\d{2}_comparaison_orig\.png$/);
});
