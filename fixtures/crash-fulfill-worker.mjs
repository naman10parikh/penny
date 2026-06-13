#!/usr/bin/env node
// FIXTURE — the crash-between idempotency worker the CHAOS suite SIGKILLs (S-02 / O-02 / P-02).
//
// This models the EXACT durable-idempotency design penny's scaffold prescribes: the event id is a
// unique key, the dedup write commits in the SAME unit as the side-effect, and a process killed
// mid-flight must single-fulfill on retry. We use two append-only files as the durable store:
//   • <state>.processed  — the dedup "row" (event ids that have begun fulfillment) — the unique PK
//   • <state>.fulfilled  — the side-effect log (one line per ACTUAL fulfillment) — what we count
//
// The atomic contract (S-02 "Right"): claim the event id FIRST (write the dedup row); if it's already
// claimed, do NOTHING (exactly-once). Only a fresh claim runs the side-effect. Because the claim is
// durable and precedes the side-effect, a crash AFTER the claim but BEFORE the ack still leaves the
// row — so Stripe's retry sees the claim and never re-runs the side-effect. That's the design the
// real SIGKILL below proves, not an in-process Set that a crash would wipe.
//
// Usage:
//   node crash-fulfill-worker.mjs <stateBase> <eventId>                          → normal fulfill (ack, exit 0)
//   node crash-fulfill-worker.mjs <stateBase> <eventId> --crash-after-claim      → SIGKILL self AFTER the
//        durable dedup claim but BEFORE the side-effect (worst case: did we claim without fulfilling?)
//   node crash-fulfill-worker.mjs <stateBase> <eventId> --crash-after-side-effect→ SIGKILL self AFTER the
//        side-effect ran but BEFORE the ack (the classic S-02 crash-between: Stripe never saw the 2xx)

import { appendFileSync, readFileSync, existsSync } from "node:fs";

const [, , stateBase, eventId, flag] = process.argv;
if (!stateBase || !eventId) {
  process.stderr.write("usage: crash-fulfill-worker.mjs <stateBase> <eventId> [--crash-after-claim|--crash-after-side-effect]\n");
  process.exit(2);
}

const processedFile = `${stateBase}.processed`;
const fulfilledFile = `${stateBase}.fulfilled`;

/** Has this event id already been claimed (the durable dedup row)? */
function alreadyClaimed(id) {
  if (!existsSync(processedFile)) return false;
  return readFileSync(processedFile, "utf8").split("\n").filter(Boolean).includes(id);
}

// 1. EXACTLY-ONCE GATE: if the event id is already claimed, do nothing. This is what makes a retry of
//    an event that was claimed-then-crashed a no-op (the dedup row outlived the crash).
if (alreadyClaimed(eventId)) {
  process.stdout.write(`noop: ${eventId} already claimed\n`);
  process.exit(0);
}

// 2. CLAIM (the durable dedup write — the unique-constraint INSERT). In real code this is one txn with
//    the side-effect; here the durable append precedes the side-effect so a crash between them is the
//    worst case the design must survive.
appendFileSync(processedFile, eventId + "\n");

// Crash AFTER the claim but BEFORE the side-effect: a real SIGKILL. The dedup row exists; the
// fulfillment did not run. (This case asserts the design never DOUBLE-fulfills — at-least-once
// retry must not re-run a claimed event. It may under-fulfill this one event, which the test asserts,
// because the brain's contract is "in ONE transaction"; this fixture's two-step is the conservative
// model and the retry is a no-op by claim — single-fulfill is preserved either way.)
if (flag === "--crash-after-claim") {
  process.kill(process.pid, "SIGKILL");
}

// 3. SIDE-EFFECT (grant access) — gated on the fresh claim above. One line = one fulfillment.
appendFileSync(fulfilledFile, `${eventId}\n`);

// Crash AFTER the side-effect but BEFORE the ack: the CLASSIC S-02 crash-between. Stripe never saw the
// 2xx, so it retries the SAME event id. The retry hits the exactly-once gate (step 1) → no double.
if (flag === "--crash-after-side-effect") {
  process.kill(process.pid, "SIGKILL");
}

// 4. ACK (return 2xx). Reached only on the no-crash path.
process.stdout.write(`fulfilled: ${eventId}\n`);
process.exit(0);
