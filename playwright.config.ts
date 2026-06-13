// Playwright config — the cockpit E2E suite (Cluster G / G2 verify; §9 testing contract).
// Scoped to test/cockpit.e2e.ts: the ONLY Playwright suite in penny (the rest is Vitest +
// Stripe-test-mode integration — penny is CLI/MCP-first; the cockpit is the one browser surface).
// Chromium-only, headless; the test boots the stdlib cockpit server itself (no webServer block —
// the server is a zero-dep .mjs spawned in the suite's beforeAll, kept self-contained).

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./test",
  testMatch: /cockpit\.e2e\.ts$/,
  fullyParallel: false, // one server, sequential views — deterministic screenshots
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? "list" : "list",
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:7799",
    headless: true,
    screenshot: "only-on-failure",
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
