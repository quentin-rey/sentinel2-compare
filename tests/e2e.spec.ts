import { test, expect, type Page } from "@playwright/test";

// Drives the full staged wizard flow (pick date1 → display single image →
// ask to compare → pick date2 → confirm) up through a resolved split
// comparison, since most tests need to get there before asserting on
// something else.
async function runFullCompare(page: Page, date1: string, date2: string) {
  await page.fill("#date1", date1);
  await page.click("#display-btn");
  await page.waitForFunction(() => /\d+% /.test(document.getElementById("label-a")?.textContent ?? ""), { timeout: 20000 });
  await page.click("#add-compare-date-btn");
  await page.fill("#date2", date2);
  await page.click("#compare-btn");
  await page.waitForFunction(() => /\d+% /.test(document.getElementById("label-b")?.textContent ?? ""), { timeout: 20000 });
}

test("app loads without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/");
  await expect(page.locator("h1")).toHaveText("Sentinel-2 Compare");
  expect(errors).toEqual([]);
});

test("FR/EN toggle switches visible strings and persists across reload", async ({ page }) => {
  await page.goto("/");

  // Force a known starting language rather than relying on the
  // browser-detected default (Playwright's default locale is en-US).
  await page.click(".lang-toggle button:has-text('FR')");
  await expect(page.locator("#display-btn")).toHaveText("Afficher");
  await expect(page.locator("#dates-section > summary")).toHaveText("Dates & rendu");

  await page.click(".lang-toggle button:has-text('EN')");
  await expect(page.locator("#display-btn")).toHaveText("Display");
  await expect(page.locator("#dates-section > summary")).toHaveText("Dates & render");

  await page.reload();
  await expect(page.locator("#display-btn")).toHaveText("Display");
});

test("the panel actually collapses via the ☰ button and the M shortcut", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#panel")).not.toHaveClass(/collapsed/);

  await page.click("#menu-toggle");
  await expect(page.locator("#panel")).toHaveClass(/collapsed/);
  await page.click("#menu-toggle");
  await expect(page.locator("#panel")).not.toHaveClass(/collapsed/);

  await page.keyboard.press("m");
  await expect(page.locator("#panel")).toHaveClass(/collapsed/);
  await page.keyboard.press("m");
  await expect(page.locator("#panel")).not.toHaveClass(/collapsed/);
});

test("staged flow: single image displays first, then upgrading to a comparison reveals the slider", async ({ page }) => {
  await page.goto("/");

  // Stage idle: only a single date is asked for.
  await expect(page.locator("#display-btn")).toBeVisible();
  await expect(page.locator("#date2")).toHaveCount(0);
  await expect(page.locator("#compare-btn")).toHaveCount(0);

  await page.fill("#date1", "2026-06-01");
  await page.click("#display-btn");

  // Stage single: one full-bleed image, no split/slider yet.
  await page.waitForFunction(() => /\d+% /.test(document.getElementById("label-a")?.textContent ?? ""), { timeout: 20000 });
  await expect(page.locator("#compare")).not.toHaveClass(/hidden/);
  await expect(page.locator("#map-b-wrap")).toHaveClass(/hidden/);
  await expect(page.locator("#swiper")).toHaveClass(/hidden/);
  await expect(page.locator("#label-b")).toHaveCount(0);
  await expect(page.locator("#add-compare-date-btn")).toBeVisible();
  await expect(page.locator("#date2")).toHaveCount(0);

  await page.click("#add-compare-date-btn");
  await expect(page.locator("#date2")).toBeVisible();
  await expect(page.locator("#compare-btn")).toBeVisible();

  await page.fill("#date2", "2026-07-08");
  await page.click("#compare-btn");

  // Stage split: matches today's existing full comparison experience.
  await page.waitForFunction(() => /\d+% /.test(document.getElementById("label-b")?.textContent ?? ""), { timeout: 20000 });
  await expect(page.locator("#map-b-wrap")).not.toHaveClass(/hidden/);
  await expect(page.locator("#swiper")).not.toHaveClass(/hidden/);
  await expect(page.locator("#export-section")).toHaveCount(1);

  const swiper = page.locator("#swiper");
  const box = (await swiper.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  const overflowing = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflowing).toBe(false);
});

test("runs a full compare and the slider drags without horizontal overflow", async ({ page }) => {
  await page.goto("/");
  await runFullCompare(page, "2026-06-01", "2026-07-08");

  await expect(page.locator("#compare")).not.toHaveClass(/hidden/);

  // Regression check: the compare-view maps are constructed synchronously
  // while #compare's "hidden" class hasn't been committed to the DOM yet
  // (no `await` runs between setIsOpen(true) and `new maplibregl.Map(...)`),
  // so without an explicit resize() once the container is actually visible,
  // MapLibre keeps whatever (possibly zero) size it measured at
  // construction time — each canvas should fill the compare view (viewport
  // minus the fixed navbar at the top), not just a small corner of it.
  const viewport = page.viewportSize()!;
  const navbarHeight = await page.evaluate(() => document.getElementById("navbar")!.getBoundingClientRect().height);
  const canvasSizes = await page.evaluate(() => {
    const dims = (el: Element | null) => (el instanceof HTMLCanvasElement ? { w: el.clientWidth, h: el.clientHeight } : null);
    return { a: dims(document.querySelector("#map-a canvas")), b: dims(document.querySelector("#map-b canvas")) };
  });
  expect(canvasSizes.a).toEqual({ w: viewport.width, h: viewport.height - navbarHeight });
  expect(canvasSizes.b).toEqual({ w: viewport.width, h: viewport.height - navbarHeight });

  const swiper = page.locator("#swiper");
  const box = (await swiper.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(2000, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();

  const overflowing = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflowing).toBe(false);
});

test("custom Instance ID modal opens, saves, and persists across reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#instance-id-modal")).toHaveClass(/hidden/);

  await page.click("#instance-id-btn");
  await expect(page.locator("#instance-id-modal")).not.toHaveClass(/hidden/);

  await page.fill("#custom-instance-id", "my-test-instance-id");
  await expect(page.locator("#instance-id-btn")).toHaveClass(/has-custom-instance-id/);

  await page.click("#instance-id-modal-close");
  await expect(page.locator("#instance-id-modal")).toHaveClass(/hidden/);

  await page.reload();
  await expect(page.locator("#instance-id-btn")).toHaveClass(/has-custom-instance-id/);
  await page.click("#instance-id-btn");
  await expect(page.locator("#custom-instance-id")).toHaveValue("my-test-instance-id");
});

test("exports a PNG with the expected filename pattern", async ({ page }) => {
  await page.goto("/");
  await runFullCompare(page, "2026-06-01", "2026-07-08");

  // The Export accordion section auto-opens once a comparison succeeds (see
  // the effect in App.tsx keyed on compareMaps.isComparing) — no need to
  // open it manually first.
  await page.click("#export-png-btn");
  await expect(page.locator("#export-modal")).not.toHaveClass(/hidden/);
  const downloadPromise = page.waitForEvent("download");
  await page.click("#export-modal-confirm");
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^sentinel2_true-color_\d{4}-\d{2}-\d{2}_vs_\d{4}-\d{2}-\d{2}_comparaison_orig\.png$/);
});

test("accordion sections toggle independently, and Export auto-opens after a compare", async ({ page }) => {
  await page.goto("/");

  // Lieu starts closed, Dates & rendu starts open.
  await expect(page.locator("#lieu-section")).not.toHaveAttribute("open", "");
  await expect(page.locator("#dates-section")).toHaveAttribute("open", "");
  await expect(page.locator("#export-section")).toHaveCount(0); // not rendered before any comparison

  await page.click("#lieu-section > summary");
  await expect(page.locator("#lieu-section")).toHaveAttribute("open", "");

  await page.click("#dates-section > summary");
  await expect(page.locator("#dates-section")).not.toHaveAttribute("open", "");
  // Collapsing the section hides the fields but doesn't unmount them.
  await expect(page.locator("#display-btn")).toBeHidden();
  await page.click("#dates-section > summary");
  await expect(page.locator("#display-btn")).toBeVisible();

  await runFullCompare(page, "2026-06-01", "2026-07-08");
  await expect(page.locator("#export-section")).toHaveAttribute("open", "");
});

test("place search finds and selects a location", async ({ page }) => {
  await page.goto("/");
  await page.click("#lieu-section > summary");

  await page.fill("#place-search", "Lyon");
  await expect(page.locator("#place-results li").first()).toBeVisible({ timeout: 10000 });
  await page.locator("#place-results li").first().click();

  await expect(page.locator("#place-search")).toHaveValue(/Lyon/);
});

test("a running comparison survives a refresh, but plain browsing doesn't auto-compare", async ({ page }) => {
  await page.goto("/");
  await runFullCompare(page, "2026-06-01", "2026-07-08");
  await expect(page).toHaveURL(/cmp=2/);

  await page.reload();
  // The split view should be visible immediately (before the exact-date
  // lookup even resolves) — it was reconstructed from the URL, not left
  // over from before the reload.
  await expect(page.locator("#compare")).not.toHaveClass(/hidden/);
  await expect(page.locator("#map-b-wrap")).not.toHaveClass(/hidden/);
  await page.waitForFunction(() => /\d+% /.test(document.getElementById("label-b")?.textContent ?? ""), { timeout: 20000 });

  // Closing the comparison and reloading again should go back to plain
  // browsing, not silently re-open it.
  await page.click("#close-btn");
  await expect(page).not.toHaveURL(/cmp=/);
  await page.reload();
  await page.waitForTimeout(500);
  await expect(page.locator("#compare")).toHaveClass(/hidden/);
});

test("a displayed single image survives a refresh without auto-upgrading to a comparison", async ({ page }) => {
  await page.goto("/");
  await page.fill("#date1", "2026-06-01");
  await page.click("#display-btn");
  await page.waitForFunction(() => /\d+% /.test(document.getElementById("label-a")?.textContent ?? ""), { timeout: 20000 });
  await expect(page).toHaveURL(/cmp=1/);
  await expect(page).not.toHaveURL(/cmp=2/);

  await page.reload();
  await expect(page.locator("#compare")).not.toHaveClass(/hidden/);
  await expect(page.locator("#map-b-wrap")).toHaveClass(/hidden/);
  await page.waitForFunction(() => /\d+% /.test(document.getElementById("label-a")?.textContent ?? ""), { timeout: 20000 });
  await expect(page.locator("#date2")).toHaveCount(0);
  await expect(page.locator("#add-compare-date-btn")).toBeVisible();
});
