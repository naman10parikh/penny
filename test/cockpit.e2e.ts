// test/cockpit.e2e.ts — the cockpit E2E suite (Cluster G / G2 verify; §9 testing contract).
//
// Boots the stdlib cockpit server (src/cockpit/server.mjs) on a dedicated port, then drives the
// vanilla-JS SPA through its 5 views, SCREENSHOTTING each of the 4 core views (brain / run-log /
// eval-scores / ask) + the bonus gaps view, and asserting they render LIVE data:
//   • Brain Browser  — the six expertise notes + the MOC graph render
//   • Run Log        — the money-action audit trail card renders
//   • Eval Scores    — the acceptance badge reads "WIRED" (the spine, E4) + the L1/L2/L3 pyramid
//   • Ask Employee   — a brain BM25 query returns a cited hit
//   • Gaps Tracker   — the GAPS Part B shrinking checklist renders G-01..G-06
// Plus a design assertion: the page background is the warm-black #141312 (rgb(20,19,18)) — NOT a
// purple/AI tint (the G1 brand bar, asserted on the RENDERED surface, not just the CSS file).
//
// Self-contained: spawns the zero-dep server in beforeAll and kills it in afterAll (no webServer
// block). Screenshots land under content/screenshots/cockpit/ (the chairman's review path).

import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url)); // test/
const REPO = resolve(HERE, ".."); // penny repo root
const SERVER = join(REPO, "src", "cockpit", "server.mjs");
const PORT = 7799;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = join(REPO, "content", "screenshots", "cockpit");

let server: ChildProcess | undefined;

/** Boot the cockpit and resolve when its ready line prints (or reject on timeout). */
function bootServer(): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  return new Promise((res, rej) => {
    server = spawn(process.execPath, [SERVER, String(PORT)], {
      env: { ...process.env, PENNY_COCKPIT_PORT: String(PORT) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const onData = (b: Buffer): void => {
      if (b.toString().includes("penny cockpit →")) res();
    };
    server.stdout?.on("data", onData);
    server.stderr?.on("data", (b: Buffer) => {
      // a bind error (EADDRINUSE) prints to stderr — fail fast rather than hang.
      if (b.toString().includes("already in use") || b.toString().includes("server error")) {
        rej(new Error("cockpit failed to boot: " + b.toString()));
      }
    });
    server.on("error", rej);
    setTimeout(() => rej(new Error("cockpit boot timed out")), 15_000);
  });
}

test.beforeAll(async () => {
  await bootServer();
});

test.afterAll(() => {
  server?.kill("SIGINT");
});

test("cockpit boots and the shell renders warm-black/amber (G1)", async ({ page }) => {
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await expect(page.locator(".wordmark")).toContainText("penny");
  // the rendered page background is the warm-black #141312 = rgb(20, 19, 18) — NOT a purple tint.
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(20, 19, 18)");
  await page.screenshot({ path: join(SHOTS, "00-shell.png"), fullPage: true });
});

test("view 1 — Brain Browser renders the brain + MOC graph", async ({ page }) => {
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.locator('.rail button[data-view="brain"]').click();
  await expect(page.locator(".view-title")).toHaveText("Brain Browser");
  // the six expertise notes render as hits; the MOC graph draws as an SVG with nodes.
  await expect(page.locator("#brain-list .hit").first()).toBeVisible();
  await expect(page.locator(".graph-wrap svg .graph-node").first()).toBeVisible();
  await page.screenshot({ path: join(SHOTS, "01-brain.png"), fullPage: true });
});

test("view 2 — Run Log renders the money-action audit trail", async ({ page }) => {
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.locator('.rail button[data-view="runs"]').click();
  await expect(page.locator(".view-title")).toHaveText("Run Log");
  // the audit-trail card heading is present (the ledger-is-truth law, highlighted).
  await expect(page.getByText("Money-action audit trail", { exact: false }).first()).toBeVisible();
  await page.screenshot({ path: join(SHOTS, "02-runs.png"), fullPage: true });
});

test("view 3 — Eval Scores shows the WIRED acceptance badge + the pyramid", async ({ page }) => {
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.locator('.rail button[data-view="evals"]').click();
  await expect(page.locator(".view-title")).toHaveText("Eval Scores");
  // the eval pyramid shells out (~10s) — wait for the acceptance badge to settle.
  const badge = page.locator(".accept-badge");
  await expect(badge).toBeVisible({ timeout: 40_000 });
  await expect(badge).toContainText("WIRED");
  await expect(badge).toHaveClass(/wired/);
  // the L1 pyramid card renders with at least one golden-task tile.
  await expect(page.locator(".gt").first()).toBeVisible();
  await page.screenshot({ path: join(SHOTS, "03-evals.png"), fullPage: true });
});

test("view 4 — Ask the Employee returns a cited brain hit", async ({ page }) => {
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.locator('.rail button[data-view="ask"]').click();
  await expect(page.locator(".view-title")).toHaveText("Ask the Employee");
  await page.locator("#ask-q").fill("how do I stop a webhook double-fulfilling on a crash");
  await page.locator("#ask-go").click();
  // the keyless A5 BM25 returns ranked hits citing the brain (a .hit-file appears).
  await expect(page.locator("#ask-results .hit-file").first()).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: join(SHOTS, "04-ask.png"), fullPage: true });
});

test("view 5 — Gaps Tracker renders the shrinking Part-B checklist", async ({ page }) => {
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.locator('.rail button[data-view="gaps"]').click();
  await expect(page.locator(".view-title")).toHaveText("Gaps Tracker");
  // the open gaps (G-01..G-06) render as checklist items.
  await expect(page.locator(".gap-item").first()).toBeVisible();
  await expect(page.getByText("G-01", { exact: false }).first()).toBeVisible();
  await page.screenshot({ path: join(SHOTS, "05-gaps.png"), fullPage: true });
});
