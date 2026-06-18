import { defineConfig, devices } from "@playwright/test";

// End-to-end config. The app needs the FULL local stack running:
//   - anvil (chain 1337) with the seeded Anthill contract
//   - the backend on :5001
//   - the Vite dev server on :5173
// Playwright manages the Vite server below (reusing one if already running);
// anvil + the backend must be started separately (see README "development").
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  // Interaction tests involve hover/animation timing — retry once to absorb
  // the occasional flake.
  retries: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    // Root-hoisted bin (pnpm workspace). Reused if a dev server is already up.
    command: "../node_modules/.bin/vite",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
