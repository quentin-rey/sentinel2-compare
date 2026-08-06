import { defineConfig } from "vitest/config";

// Separate from tests/ (Playwright's e2e suite, its own runner) — vitest
// only ever looks at unit tests colocated with the source they cover.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
