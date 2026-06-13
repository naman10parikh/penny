// CHAOS layer (PLAN §9 testing contract — the three named chaos cases). This is the gap Wave-T fills:
// the contract declares chaos but only #3 (no-network) had a real test. Here all three are exercised
// against REAL failure injection, each citing the brain law it protects:
//
//   (1) KILL MID-RUN  — a real subprocess SIGKILL between the durable dedup claim and the ack, then a
//                       retry → assert SINGLE-fulfill (S-02 / O-02 / P-02). Not an in-process Set (a
//                       crash would wipe that) — a child process the OS actually kills.
//   (2) CORRUPT INPUT — (a) a tampered webhook body → constructEvent REJECTS (S-03 / P-04); (b) a
//                       malformed meter-event timestamp (outside period / >35d / future) → penny
//                       REJECTS LOUDLY, never a silent drop (S-09 / P-09 / O-06).
//   (3) NO-NETWORK    — Stripe unreachable → `penny reconcile --no-network` degrades to "unknown,
//                       reconciling", never asserts money-moved from a transport failure (JTBD-0/P-18).
//
// Every assertion is RED if the protected behavior breaks (proven by inversion during authoring).

import { describe, it, expect } from "vitest";
import Stripe from "stripe";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateMeterEventTimestamp,
  MAX_PAST_MS,
  MAX_FUTURE_MS,
} from "../src/wire/meter-event.js";

const HERE = dirname(fileURLToPath(import.meta.url)); // test/
const REPO = join(HERE, ".."); // repo root
const WORKER = join(REPO, "fixtures", "crash-fulfill-worker.mjs");
const PENNY_BIN = join(REPO, "bin", "penny.js");

/** Count the durable fulfillments (one line per side-effect) in a worker's state base. */
function fulfilledCount(stateBase: string): number {
  const f = `${stateBase}.fulfilled`;
  if (!existsSync(f)) return 0;
  return readFileSync(f, "utf8").split("\n").filter(Boolean).length;
}

// ───────────────────────────────────────────────────────────────────────────────────────────────
// CHAOS (1) — kill mid-run: a REAL SIGKILL, then a retry must single-fulfill (S-02).
// ───────────────────────────────────────────────────────────────────────────────────────────────
describe("chaos · kill mid-run → single-fulfill on retry (S-02 / O-02 / P-02)", () => {
  it("a process SIGKILLed AFTER the side-effect but BEFORE the ack single-fulfills on Stripe's retry", () => {
    const dir = mkdtempSync(join(tmpdir(), "penny-chaos-kill-"));
    const stateBase = join(dir, "evt");
    const EVENT_ID = "evt_crash_between";

    // First delivery: the worker runs the side-effect, then SIGKILLs itself before acking — exactly
    // the S-02 crash-between (deploy/OOM after grantAccess, before Stripe sees the 2xx).
    const first = spawnSync("node", [WORKER, stateBase, EVENT_ID, "--crash-after-side-effect"], { encoding: "utf8" });
    // The OS actually killed it: signal SIGKILL, non-zero/null status — proof this is a real kill,
    // not a graceful in-process simulation.
    expect(first.signal).toBe("SIGKILL");
    expect(fulfilledCount(stateBase)).toBe(1); // the side-effect DID run once before the kill

    // Stripe never saw the 2xx, so it retries the SAME event id. The durable dedup row (written before
    // the side-effect) survived the kill → the retry is a no-op → STILL exactly one fulfillment.
    const retry = spawnSync("node", [WORKER, stateBase, EVENT_ID], { encoding: "utf8" });
    expect(retry.status).toBe(0);
    expect(retry.stdout).toMatch(/noop/); // the retry recognized the claim and did nothing
    expect(fulfilledCount(stateBase)).toBe(1); // ← the contract: NO double-fulfill after a real crash

    rmSync(dir, { recursive: true, force: true });
  });

  it("a process SIGKILLed AFTER the durable claim but BEFORE the side-effect never DOUBLE-fulfills on retry", () => {
    // The other crash window: killed after claiming the event id but before the side-effect. The claim
    // survived, so a retry is a no-op. The design's invariant is "never double-fulfill"; this proves a
    // crash here cannot cause a second fulfillment (the conservative two-step model; one txn in prod).
    const dir = mkdtempSync(join(tmpdir(), "penny-chaos-claim-"));
    const stateBase = join(dir, "evt");
    const EVENT_ID = "evt_crash_after_claim";

    const first = spawnSync("node", [WORKER, stateBase, EVENT_ID, "--crash-after-claim"], { encoding: "utf8" });
    expect(first.signal).toBe("SIGKILL");

    const retry = spawnSync("node", [WORKER, stateBase, EVENT_ID], { encoding: "utf8" });
    expect(retry.stdout).toMatch(/noop/);
    // The hard invariant: at most one fulfillment ever, even across a crash + retry (no double-charge).
    expect(fulfilledCount(stateBase)).toBeLessThanOrEqual(1);

    rmSync(dir, { recursive: true, force: true });
  });

  it("distinct events each fulfill once across crashes (idempotency is per-event, not a global lock)", () => {
    const dir = mkdtempSync(join(tmpdir(), "penny-chaos-distinct-"));
    const stateBase = join(dir, "evt");
    // Two different events, the first crashing between side-effect and ack; both must end fulfilled once.
    spawnSync("node", [WORKER, stateBase, "evt_a", "--crash-after-side-effect"], { encoding: "utf8" });
    spawnSync("node", [WORKER, stateBase, "evt_a"], { encoding: "utf8" }); // retry of a → noop
    spawnSync("node", [WORKER, stateBase, "evt_b"], { encoding: "utf8" }); // distinct b → fulfills
    expect(fulfilledCount(stateBase)).toBe(2);
    rmSync(dir, { recursive: true, force: true });
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// CHAOS (2a) — corrupt input: a tampered webhook body must be REJECTED, not silently accepted (S-03).
// ───────────────────────────────────────────────────────────────────────────────────────────────
describe("chaos · corrupt webhook body → REJECTED (S-03 / P-04)", () => {
  const SECRET = "whsec_chaos_test_secret";
  const payload = JSON.stringify({ id: "evt_chaos", type: "checkout.session.completed", data: { object: {} } });

  it("a body with an injected byte fails constructEvent (the HMAC is over the exact signed bytes)", () => {
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    // The genuine signed body verifies…
    expect(() => Stripe.webhooks.constructEvent(payload, header, SECRET)).not.toThrow();
    // …but any tamper (one appended byte) is REJECTED — never silently accepted into fulfillment.
    expect(() => Stripe.webhooks.constructEvent(payload + "x", header, SECRET)).toThrow();
    // A truncated body is likewise rejected.
    expect(() => Stripe.webhooks.constructEvent(payload.slice(0, -1), header, SECRET)).toThrow();
  });

  it("a forged signature header (wrong secret) is REJECTED", () => {
    const forged = Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_attacker" });
    expect(() => Stripe.webhooks.constructEvent(payload, forged, SECRET)).toThrow();
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// CHAOS (2b) — corrupt input: a malformed meter-event timestamp must be REJECTED LOUDLY (S-09 / P-09).
// ───────────────────────────────────────────────────────────────────────────────────────────────
describe("chaos · malformed meter-event timestamp → loud reject, NOT a silent drop (S-09 / P-09 / O-06)", () => {
  const NOW = Date.parse("2026-06-13T12:00:00Z");

  it("a timestamp > 35 days in the past is rejected (Stripe silently drops it = revenue leak)", () => {
    const tooOld = NOW - MAX_PAST_MS - 60_000; // 35 days + 1 min in the past
    const r = validateMeterEventTimestamp(tooOld, NOW);
    expect(r.accepted).toBe(false);
    expect(r.reason).toBe("too_old");
    expect(r.message).toMatch(/S-09|P-09/); // the alarm cites the brain — never a silent drop
  });

  it("a timestamp > 5 minutes in the future is rejected (clock skew / bad flush)", () => {
    const tooFuture = NOW + MAX_FUTURE_MS + 60_000; // 5 min + 1 min in the future
    const r = validateMeterEventTimestamp(tooFuture, NOW);
    expect(r.accepted).toBe(false);
    expect(r.reason).toBe("too_future");
  });

  it("a timestamp OUTSIDE the current billing period is rejected (the S-09 nightly-batch boundary leak)", () => {
    // The headline trap: the period closed at midnight; a nightly flush of pre-midnight usage lands
    // after period end and Stripe silently drops it. penny refuses to flush it.
    const periodStart = Date.parse("2026-06-01T00:00:00Z");
    const periodEnd = Date.parse("2026-06-13T00:00:00Z"); // period closed at midnight today
    const afterClose = Date.parse("2026-06-13T11:00:00Z"); // within 35d + not future, but PAST period end
    const r = validateMeterEventTimestamp(afterClose, NOW, { startMs: periodStart, endMs: periodEnd });
    expect(r.accepted).toBe(false);
    expect(r.reason).toBe("outside_period");
    expect(r.message).toMatch(/S-09/);
  });

  it("a NaN / non-finite timestamp (a truly malformed flush) is rejected, not flushed", () => {
    expect(validateMeterEventTimestamp(NaN, NOW).accepted).toBe(false);
    expect(validateMeterEventTimestamp(Infinity, NOW).accepted).toBe(false);
  });

  it("an in-window, in-period timestamp is ACCEPTED (the validator is not vacuously rejecting)", () => {
    const periodStart = Date.parse("2026-06-01T00:00:00Z");
    const periodEnd = Date.parse("2026-06-30T23:59:59Z");
    const inWindow = NOW - 60_000; // 1 min ago — well within all windows
    const r = validateMeterEventTimestamp(inWindow, NOW, { startMs: periodStart, endMs: periodEnd });
    expect(r.accepted).toBe(true);
  });

  it("the CLI `penny meter validate-event` exits 1 on an out-of-window event and cites the brain on stderr", () => {
    const tooOldIso = new Date(NOW - MAX_PAST_MS - 86_400_000).toISOString(); // ~36 days old
    const r = spawnSync(
      "node",
      [PENNY_BIN, "meter", "validate-event", "--ts", tooOldIso, "--now", new Date(NOW).toISOString()],
      { encoding: "utf8" },
    );
    expect(r.status).toBe(1); // loud failure — a dropped event is never silent
    expect(r.stderr).toMatch(/REJECTED/);
    expect(r.stderr).toMatch(/S-09|P-09/);
  });

  it("the CLI `penny meter validate-event` exits 0 on an in-window event", () => {
    const okIso = new Date(NOW - 60_000).toISOString();
    const r = spawnSync(
      "node",
      [PENNY_BIN, "meter", "validate-event", "--ts", okIso, "--now", new Date(NOW).toISOString()],
      { encoding: "utf8" },
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/ACCEPTED/);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// CHAOS (3) — no-network: `penny reconcile --no-network` degrades, never asserts money moved (JTBD-0).
// (test/reconcile-cli.test.ts owns the flag-contract regression; this re-asserts the chaos posture so
//  the chaos LAYER is self-contained — a reader of chaos.test.ts sees all three §9 cases here.)
// ───────────────────────────────────────────────────────────────────────────────────────────────
describe("chaos · no-network reconcile degrades to 'unknown, reconciling' (JTBD-0 / P-18)", () => {
  it("`penny reconcile --no-network` exits 0, says 'unknown, reconciling', and asserts NO money movement", () => {
    const r = spawnSync("node", [PENNY_BIN, "reconcile", "--no-network"], { encoding: "utf8" });
    const out = (r.stdout ?? "") + (r.stderr ?? "");
    expect(r.status).toBe(0); // honest non-fatal state — the diff is pending, not failed
    expect(out).toMatch(/unknown, reconciling/i);
    expect(out).toMatch(/JTBD-0/); // the law is cited, not penny's confidence
    expect(out).toMatch(/will NOT assert money moved/i); // the transport failure ≠ a money fact
  });
});
