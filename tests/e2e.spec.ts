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

test("Lieu/Couches/Export/Partage are mutually exclusive, Dates & rendu is independent, and Export auto-opens after a compare", async ({ page }) => {
  await page.goto("/");

  // Lieu starts closed, Dates & rendu starts open.
  await expect(page.locator("#lieu-section")).not.toHaveAttribute("open", "");
  await expect(page.locator("#dates-section")).toHaveAttribute("open", "");
  await expect(page.locator("#export-section")).toHaveCount(0); // not rendered before any comparison

  // Opening Lieu doesn't collapse Dates & rendu — it's not part of the
  // mutually-exclusive group (see the comment on App.tsx's `datesOpen`):
  // the Comparer/Fermer/date controls it holds need to stay reachable
  // without an extra click even once "Export" auto-opens below.
  await page.click("#lieu-section > summary");
  await expect(page.locator("#lieu-section")).toHaveAttribute("open", "");
  await expect(page.locator("#dates-section")).toHaveAttribute("open", "");

  // Dates & rendu toggles independently — collapsing hides the fields but
  // doesn't unmount them.
  await page.click("#dates-section > summary");
  await expect(page.locator("#dates-section")).not.toHaveAttribute("open", "");
  await expect(page.locator("#display-btn")).toBeHidden();
  await page.click("#dates-section > summary");
  await expect(page.locator("#display-btn")).toBeVisible();

  await runFullCompare(page, "2026-06-01", "2026-07-08");
  await expect(page.locator("#export-section")).toHaveAttribute("open", "");
  // Still reachable — Export auto-opening didn't collapse it.
  await expect(page.locator("#dates-section")).toHaveAttribute("open", "");
  await expect(page.locator("#close-btn")).toBeVisible();
});

test("place search finds and selects a location", async ({ page }) => {
  await page.goto("/");
  await page.click("#lieu-section > summary");

  await page.fill("#place-search", "Lyon");
  await expect(page.locator("#place-results li").first()).toBeVisible({ timeout: 10000 });
  await page.locator("#place-results li").first().click();

  await expect(page.locator("#place-search")).toHaveValue(/Lyon/);
});

test("a running comparison survives a refresh, and 'Fermer' steps back to single (not all the way to browsing)", async ({ page }) => {
  // Longer than the default: after reload every in-memory COG/tiff cache is
  // gone, so both sides render fully cold — and "Fermer" is intentionally
  // disabled (App.tsx's compareBusyRef) until that finishes, since it tears
  // down the same map instances the still-running compare is using.
  test.setTimeout(60000);
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

  // "Fermer" only exists in split stage, and steps back to the single-image
  // view (still showing date1) rather than resetting all the way to plain
  // browsing — there's no button for that anymore, only Escape. It stays
  // disabled until both sides' post-reload cold render actually finishes.
  await page.click("#close-btn", { timeout: 40000 });
  await page.waitForFunction(() => /\d+% /.test(document.getElementById("label-a")?.textContent ?? ""), { timeout: 20000 });
  await expect(page).toHaveURL(/cmp=1/);
  await expect(page).not.toHaveURL(/cmp=2/);
  await expect(page.locator("#map-b-wrap")).toHaveClass(/hidden/);
  await expect(page.locator("#close-btn")).toHaveCount(0);
  await expect(page.locator("#add-compare-date-btn")).toBeVisible();

  await page.reload();
  await page.waitForFunction(() => /\d+% /.test(document.getElementById("label-a")?.textContent ?? ""), { timeout: 20000 });
  await expect(page.locator("#map-b-wrap")).toHaveClass(/hidden/);
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

test("Info modal's replay button reopens the onboarding tour (issue #31)", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".onboarding-card")).toHaveCount(0);

  await page.click("#info-btn");
  await expect(page.locator("#info-modal")).not.toHaveClass(/hidden/);
  await page.click("#info-modal-replay-tour");
  await expect(page.locator("#info-modal")).toHaveClass(/hidden/);
  await expect(page.locator(".onboarding-card")).toBeVisible();
});

// Overrides the config's default seeded storageState (see
// playwright.config.ts) back to empty — these are the only tests that
// need the tour's actual first-launch behavior, everything else needs it
// *out of the way*.
test.describe("first launch", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the onboarding tour walks through all steps, waits for real Afficher/Comparer clicks, and never reappears once finished", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator(".onboarding-card")).toBeVisible();
    await expect(page.locator(".onboarding-step-count")).toHaveText("Step 1/7");
    // Step 1 spotlights the place search field specifically.
    await expect(page.locator(".onboarding-highlight")).toBeVisible();

    await page.click(".onboarding-card button:has-text('Next')");
    await expect(page.locator(".onboarding-step-count")).toHaveText("Step 2/7");
    await page.click(".onboarding-card button:has-text('Next')");
    await expect(page.locator(".onboarding-step-count")).toHaveText("Step 3/7");

    // The "Afficher" step has no Next — it waits for the real click, since
    // the rest of the tour's targets don't exist until a comparison is
    // actually running.
    await expect(page.locator(".onboarding-card button:has-text('Next')")).toHaveCount(0);
    await page.fill("#date1", "2026-06-01");
    await page.click("#display-btn");
    await expect(page.locator(".onboarding-step-count")).toHaveText("Step 4/7", { timeout: 15000 });

    // The "Comparez" step also waits for a real click — its target covers
    // both #add-compare-date-btn and #compare-btn, so the spotlight should
    // follow the button across that sub-transition without losing it.
    await expect(page.locator(".onboarding-card button:has-text('Next')")).toHaveCount(0);
    await expect(page.locator(".onboarding-highlight")).toBeVisible();
    await page.click("#add-compare-date-btn");
    await expect(page.locator(".onboarding-highlight")).toBeVisible();
    await page.fill("#date2", "2026-07-08");
    await page.click("#compare-btn");
    await expect(page.locator(".onboarding-step-count")).toHaveText("Step 5/7", { timeout: 20000 });

    await page.click(".onboarding-card button:has-text('Next')");
    await expect(page.locator(".onboarding-step-count")).toHaveText("Step 6/7");
    await page.click(".onboarding-card button:has-text('Next')");
    await expect(page.locator(".onboarding-step-count")).toHaveText("Step 7/7");

    await page.click(".onboarding-card button:has-text('Finish')");
    await expect(page.locator(".onboarding-card")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("s2compare-onboarding-seen"))).toBe("1");

    // Persisted — a later visit (reload) doesn't show it again.
    await page.reload();
    await expect(page.locator(".onboarding-card")).toHaveCount(0);
  });

  test("Skip dismisses the tour immediately and marks it as seen", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".onboarding-card")).toBeVisible();
    await page.click(".onboarding-card button:has-text('Skip')");
    await expect(page.locator(".onboarding-card")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("s2compare-onboarding-seen"))).toBe("1");
  });

  test("a shared comparison link does not auto-start the tour", async ({ page }) => {
    await page.goto("/?lat=48.8566&lng=2.3522&zoom=13&d1=2026-06-01&d2=2026-07-08&cmp=2");
    await page.waitForFunction(() => /\d+% /.test(document.getElementById("label-a")?.textContent ?? ""), { timeout: 20000 });
    await expect(page.locator(".onboarding-card")).toHaveCount(0);
  });
});
