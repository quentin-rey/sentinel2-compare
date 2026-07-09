import { test, expect } from "@playwright/test";

// Placeholder smoke test for the Phase 0 scaffold — real scenarios (compare
// flow, slider drag, exports) are added once the UI is ported (Phase 3/4).
test("scaffold loads without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/");
  await expect(page.locator("h1")).toHaveText("Sentinel-2 Compare");
  expect(errors).toEqual([]);
});
