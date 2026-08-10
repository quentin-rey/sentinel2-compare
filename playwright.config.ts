import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173/sentinel2-compare/",
    trace: "on-first-retry",
    // Every test but the onboarding tour's own (tests/e2e.spec.ts's "first
    // launch" describe block, which overrides this back to an empty
    // storageState) should see the app as a *returning* visitor would —
    // without this, the first-launch tour (issue #31) would auto-open on
    // every single test's fresh browser context and cover/intercept the
    // exact elements most tests click first.
    storageState: {
      cookies: [],
      origins: [{ origin: "http://localhost:5173", localStorage: [{ name: "s2compare-onboarding-seen", value: "1" }] }],
    },
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173/sentinel2-compare/",
    reuseExistingServer: true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
