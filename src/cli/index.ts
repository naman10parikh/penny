// penny CLI — command tree root (B2). Wires the full PLAN §4 surface behind `bin/penny.js`.
//
// Design: one command per module (src/cli/*.ts), registered here. commander parses;
// each handler exits 0 on success / non-zero on error. The two heavy commands —
// `wire` (B3) and `review` (B4) — live in src/wire and src/review and are registered here.
//
// Brain law (the lens for every command): the ledger is the truth, not the status code
// (EXPERTISE-MAP JTBD-0). penny operates in Stripe TEST MODE by default; live money is
// only reachable behind the chairman checklist.

import { Command } from "commander";
import { PENNY_VERSION, STRIPE_API_VERSION } from "../index.js";
import { registerExplain } from "./explain.js";
import { registerCheckVersion } from "./check-version.js";
import { registerMeter } from "./meter.js";
import { registerWebhook } from "./webhook.js";
import { registerDebug } from "./debug.js";
import { registerIssueSpt } from "./issue-spt.js";
import { registerReconcile } from "./reconcile.js";
import { registerWire } from "../wire/command.js";
import { registerReview } from "../review/command.js";

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("penny")
    .description(
      "payments/billing employee — wires Stripe test-mode billing (checkout, subscriptions, " +
        "webhooks, meters, scoped agent-spend) and reviews/debugs billing code against 21 known " +
        "pitfalls. Boundary: product billing only — earning loops are helios.",
    )
    .version(`penny ${PENNY_VERSION} (Stripe API ${STRIPE_API_VERSION})`, "-v, --version")
    .showHelpAfterError();

  // The full PLAN §4 command tree. Order mirrors the documented tree.
  registerWire(program); // THE acceptance test: scaffold billing → checkout E2E + webhook + idempotent
  registerReview(program); // audit an integration against the 21 KNOWN-PITFALLS
  registerDebug(program); // root-cause an incident via JTBD-0 (the ledger is the truth)
  registerIssueSpt(program); // scoped/capped/expiring Shared Payment Token (test mode)
  registerReconcile(program); // diff internal ledger vs Stripe; alarm on divergence
  registerWebhook(program); // wrap `stripe listen` + raw-body HMAC self-test
  registerMeter(program); // create a Meter "named like a public API"; refuse re-create
  registerCheckVersion(program); // contract-test the pinned API version shape ($0)
  registerExplain(program); // ask-the-employee: query the brain (BM25) → cited answer

  return program;
}

export async function main(argv: string[]): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(argv);
}

// Entrypoint: bin/penny.js imports this module, which runs main on the real argv.
await main(process.argv);
