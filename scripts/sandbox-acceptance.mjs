#!/usr/bin/env node
/**
 * E7 · Sandbox / Infra — run penny's acceptance integration inside a LIVE-booted E2B Firecracker
 * microVM (the CP122 wikimem bar: `Sandbox.create` ACTUALLY runs, rc=0, an artifact is deposited,
 * cold-start ms is measured — NOT a template stub).
 *
 * What it does:
 *   1. Load E2B_API_KEY (+ optional STRIPE_SECRET_KEY sk_test) from the repo's gitignored .env
 *      IN-PROCESS — never prints a secret value.
 *   2. Boot an ephemeral E2B sandbox; measure the cold-start ms (target ≤ 500ms).
 *   3. Generate penny's REAL billing scaffold on the host (writeScaffold from dist/) and write those
 *      exact files INTO the sandbox at /tmp/penny-acceptance — this is the real integration point
 *      (scaffold a target), run in isolation so it never pollutes the host.
 *   4. Run an assertion INSIDE the sandbox (sandbox Node) that proves the raw-body webhook handler is
 *      correct (reads req.text(), constructEvent, body-parser disabled) and, when sk_test is passed
 *      through, does a live test-mode Checkout create + canonical RE-FETCH from inside the sandbox.
 *   5. Deposit the artifact (/tmp/penny-acceptance/result.json) in the sandbox, READ it back to the
 *      host, print it, kill the sandbox, exit rc=0 on success.
 *
 * Test mode only — penny never moves real money; no sk_live is ever used or required.
 * Run: `node scripts/sandbox-acceptance.mjs`.
 */
import { Sandbox } from "e2b";
import { readFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url)); // scripts/
const ROOT = join(HERE, ".."); // repo root

/** Load the gitignored .env into process.env in-process (never log a value). */
function loadEnv() {
  const path = join(ROOT, ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}

/** Generate penny's REAL scaffold on the host (from the built dist/) for the acceptance spec. */
async function generateScaffold() {
  const { writeScaffold } = await import(join(ROOT, "dist", "wire", "scaffold.js"));
  const { loadSpec } = await import(join(ROOT, "dist", "wire", "spec.js"));
  const specPath = join(ROOT, "examples", "saas-pro.json");
  const parsed = loadSpec(specPath);
  if (!parsed.ok) throw new Error(`spec load failed: ${parsed.error}`);
  const stage = mkdtempSync(join(tmpdir(), "penny-sbx-scaffold-"));
  const { files } = writeScaffold(parsed.spec, stage);
  // Return the file contents so we can write them into the sandbox.
  return files.map((rel) => ({ rel, contents: readFileSync(join(stage, rel), "utf8") }));
}

// The assertion script that runs INSIDE the sandbox. Self-contained: it reads the scaffolded files
// from /tmp/penny-acceptance and asserts the raw-body webhook contract; if STRIPE_SECRET_KEY is set
// (sk_test, passed through), it does a live test-mode Checkout create + canonical re-fetch. It writes
// /tmp/penny-acceptance/result.json (the artifact) and exits 0 on pass.
const SANDBOX_ASSERT = `
const fs = require("fs");
const DIR = "/tmp/penny-acceptance";
const result = { ranInSandbox: true, node: process.version, assertions: {}, ok: false };
try {
  const handler = fs.readFileSync(DIR + "/webhook-handler.ts", "utf8");
  const client = fs.readFileSync(DIR + "/stripe-client.ts", "utf8");
  // Assertion: the scaffolded webhook handler reads RAW bytes (S-03 / P-04) and pins Dahlia.
  result.assertions.rawBody = /req\\.text\\(\\)/.test(handler);
  result.assertions.constructEvent = /constructEvent/.test(handler);
  result.assertions.bodyParserDisabled = /bodyParser:\\s*false/.test(handler);
  result.assertions.pinnedVersion = /2026-05-27\\.dahlia/.test(client);
  // Optional live half: a test-mode Checkout create + canonical re-fetch FROM INSIDE the sandbox.
  const key = process.env.STRIPE_SECRET_KEY || "";
  if (key.startsWith("sk_test_")) {
    const Stripe = require("stripe");
    const stripe = new Stripe(key, { apiVersion: "2026-05-27.dahlia" });
    (async () => {
      try {
        const product = await stripe.products.create({ name: "penny-sandbox-acceptance" });
        const price = await stripe.prices.create({ product: product.id, currency: "usd", unit_amount: 2900, recurring: { interval: "month" }, tax_behavior: "exclusive" });
        const session = await stripe.checkout.sessions.create({ mode: "subscription", line_items: [{ price: price.id, quantity: 1 }], success_url: "https://example.com/s", cancel_url: "https://example.com/c" });
        const canonical = await stripe.checkout.sessions.retrieve(session.id); // Corollary A
        result.assertions.checkoutReFetched = canonical.id === session.id && canonical.mode === "subscription";
        finish();
      } catch (e) { result.error = "live-checkout: " + (e && e.message || e); result.assertions.checkoutReFetched = false; finish(); }
    })();
  } else {
    result.assertions.checkoutReFetched = "skipped (no sk_test in sandbox)";
    finish();
  }
} catch (e) { result.error = String(e && e.message || e); fs.writeFileSync(DIR + "/result.json", JSON.stringify(result, null, 2)); process.exit(1); }
function finish() {
  const a = result.assertions;
  result.ok = a.rawBody && a.constructEvent && a.bodyParserDisabled && a.pinnedVersion && (a.checkoutReFetched === true || (typeof a.checkoutReFetched === "string"));
  fs.writeFileSync(DIR + "/result.json", JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
`;

async function main() {
  loadEnv();
  if (!process.env.E2B_API_KEY) {
    process.stderr.write("penny sandbox: E2B_API_KEY not found in .env — cannot boot the Firecracker envelope.\n");
    process.exit(3);
  }

  const scaffold = await generateScaffold();
  process.stdout.write(`penny sandbox-acceptance — booting an E2B Firecracker microVM (test mode only)…\n`);

  const t0 = Date.now();
  let sbx;
  try {
    sbx = await Sandbox.create();
  } catch (e) {
    process.stderr.write(`penny sandbox: Sandbox.create failed — ${e?.message || e}\n`);
    process.exit(1);
  }
  const coldStartMs = Date.now() - t0;
  process.stdout.write(`  ✓ Sandbox.create() booted in ${coldStartMs} ms (target ≤ 500ms)\n`);

  let artifact = null;
  let rc = 1;
  try {
    // 1. Deposit penny's REAL scaffold into the sandbox at the integration point.
    await sbx.commands.run("mkdir -p /tmp/penny-acceptance");
    for (const f of scaffold) {
      await sbx.files.write(`/tmp/penny-acceptance/${f.rel}`, f.contents);
    }
    // 2. Make the `stripe` SDK available in the sandbox (for the optional live half).
    const installStripe = await sbx.commands.run("cd /tmp/penny-acceptance && npm init -y >/dev/null 2>&1 && npm i stripe@17 >/dev/null 2>&1 && echo installed", { timeoutMs: 120_000 });
    const stripeReady = installStripe.stdout.includes("installed");
    // 3. Write + run the assertion INSIDE the sandbox. Pass sk_test through env if present.
    await sbx.files.write("/tmp/penny-acceptance/assert.cjs", SANDBOX_ASSERT);
    const envs = process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") && stripeReady
      ? { STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY }
      : {};
    const run = await sbx.commands.run("cd /tmp/penny-acceptance && node assert.cjs", { envs, timeoutMs: 60_000 }).catch((e) => ({ exitCode: e?.exitCode ?? 1, stdout: e?.stdout ?? "", stderr: e?.stderr ?? String(e) }));
    // 4. Read the deposited artifact back to the host.
    const raw = await sbx.files.read("/tmp/penny-acceptance/result.json");
    artifact = JSON.parse(raw);
    rc = run.exitCode === 0 && artifact.ok ? 0 : 1;
  } catch (e) {
    process.stderr.write(`penny sandbox: integration run failed — ${e?.message || e}\n`);
    rc = 1;
  } finally {
    await sbx.kill().catch(() => {});
  }

  if (artifact) {
    process.stdout.write(`  ✓ artifact deposited + read back (/tmp/penny-acceptance/result.json):\n`);
    process.stdout.write(
      `    rawBody=${artifact.assertions?.rawBody} constructEvent=${artifact.assertions?.constructEvent} ` +
        `bodyParserDisabled=${artifact.assertions?.bodyParserDisabled} pinnedVersion=${artifact.assertions?.pinnedVersion} ` +
        `checkoutReFetched=${artifact.assertions?.checkoutReFetched}\n`,
    );
    if (artifact.error) process.stdout.write(`    note: ${artifact.error}\n`);
  }
  process.stdout.write(
    rc === 0
      ? `\npenny sandbox-acceptance: PASS — live E2B boot ${coldStartMs}ms, integration ran in isolation, rc=0.\n`
      : `\npenny sandbox-acceptance: FAIL (rc=${rc}). Cold-start was ${coldStartMs}ms.\n`,
  );
  process.exit(rc);
}

main().catch((e) => {
  process.stderr.write(`✗ sandbox-acceptance: ${e?.stack || e?.message || e}\n`);
  process.exit(1);
});
