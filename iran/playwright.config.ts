import { defineConfig, devices } from "@playwright/test";

/**
 * Browser smoke tests against a running production build (`next start`), seeded with the
 * demo restaurant. CI: see .github/workflows/ci-iran.yml (job e2e).
 *   E2E_BASE_URL=http://localhost:3000 npx playwright test
 * PW_CHROMIUM points to a preinstalled Chromium when Playwright's own is not installed.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"], locale: "fa-IR" }, testMatch: /guest/ },
    { name: "desktop", use: { ...devices["Desktop Chrome"], locale: "fa-IR" }, testMatch: /staff/ },
  ],
});
