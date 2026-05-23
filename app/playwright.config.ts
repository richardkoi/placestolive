import { defineConfig, devices } from "@playwright/test";

// E2E config — runs against a live server at :8500 (or :5173 in dev mode).
// `npm run test:e2e` assumes the server is already running.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PLACESTOLIVE_URL ?? "http://127.0.0.1:8500",
    trace: "retain-on-failure",
    headless: true,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
