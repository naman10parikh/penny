// `penny reconcile --since <ts>` — explain the diff of the internal usage/entitlement ledger
// against Stripe (meter-event-summary / canonical objects) (S-09 / O-09). This version does not
// call Stripe, so it diffs nothing and says so. The whole point is JTBD-0: never assert
// money-moved from a transport status, and when the provider is unreachable, say "unknown,
// reconciling" rather than guess.

import { Command } from "commander";
import chalk from "chalk";
import { JTBD0_LAW } from "../brain-refs.js";

export function registerReconcile(program: Command): void {
  program
    .command("reconcile")
    // `--since` is only meaningful for a LIVE reconcile. The `--no-network` degrade path needs no
    // window — you cannot reconcile "from a point" when the provider is unreachable; the whole point
    // is to honestly report "unknown, reconciling" (JTBD-0). So `--since` is an ordinary option here
    // and is enforced only on the live path below, NOT as a global requiredOption (which would reject
    // `penny reconcile --no-network` — the most important command to be able to run when Stripe is down).
    .description("explain the internal ledger vs Stripe diff (this version does not call Stripe or diff anything)")
    .option("--since <ts>", "reconcile from this point: unix-ms or ISO date (required for a live reconcile)")
    .option("--no-network", "simulate Stripe unreachable — must degrade to 'unknown, reconciling', never assert")
    .action((opts: { since?: string; network: boolean }) => {
      // The no-network / unreachable case is the most important behavior here (chaos test §9):
      // penny degrades to "unknown, reconciling" and NEVER asserts money-moved from a transport
      // failure. This is JTBD-0 applied to penny's own telemetry. It must run with NO other flags.
      if (opts.network === false) {
        process.stdout.write(
          chalk.yellow(`penny reconcile (network unreachable)\n`) +
            chalk.dim(`  THE LAW: ${JTBD0_LAW}\n\n`) +
            chalk.bold(`  status: unknown, reconciling\n`) +
            `  Stripe is unreachable — penny will NOT assert money moved or didn't move from a transport ` +
            `failure. It re-queries by idempotency key / canonical object when the provider returns. [JTBD-0 / P-18]\n`,
        );
        // Honest non-fatal state: the diff is pending, not failed.
        process.exit(0);
      }

      // Live path: a reconcile window is mandatory (you must know where to diff from).
      if (!opts.since) {
        process.stderr.write(
          chalk.red("penny reconcile: --since <ts> is required for a live reconcile ") +
            "(use --no-network to test the unreachable-degrade path with no window). [O-09]\n",
        );
        process.exit(1);
      }

      process.stdout.write(
        chalk.yellow(`penny reconcile --since ${opts.since}\n`) +
          chalk.dim(`  THE LAW: ${JTBD0_LAW}\n\n`),
      );

      process.stdout.write(
        chalk.dim(
          "  (a live reconcile would diff the internal usage ledger vs meter-event-summary and re-fetch\n" +
            "   canonical objects; it would alarm on divergence and respect the 100 rp/s limit. O-09.)\n",
        ) + chalk.bold("\nThis version does not call Stripe, so nothing was reconciled and no divergence was checked.\n"),
      );
      process.exit(0);
    });
}
