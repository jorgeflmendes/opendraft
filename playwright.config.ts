import { defineConfig, devices } from "@playwright/test";

// Browser tests cover production bundling, real workers, canvas rendering, and
// cross-browser behavior that jsdom-based tests cannot exercise.

export default defineConfig({
  testDir: "./tests/e2e",
  // Engine startup, package resolution, compilation, and PDF rendering share
  // this budget. A finite timeout prevents a stalled worker from hanging CI.
  timeout: 90_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: devices["Desktop Chrome"],
    },
    {
      name: "firefox",
      use: devices["Desktop Firefox"],
    },
    {
      name: "webkit",
      use: devices["Desktop Safari"],
    },
  ],
});
