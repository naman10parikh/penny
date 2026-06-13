// `penny reconcile --since <ts>` — diff the internal usage/entitlement ledger against Stripe
// (meter-event-summary / canonical objects) and alarm on divergence (S-09 / O-09). The whole
// point is JTBD-0: never assert money-moved from a transport status — reconcile against the
// ledger, and when the provider is unreachable, say "unknown, reconciling" rather than guess.

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
    .description("diff internal ledger vs Stripe (meter-event-summary / canonical objects); alarm on divergence")
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
          "  (live reconcile diffs the internal usage ledger vs meter-event-summary and re-fetches\n" +
            "   canonical objects; it alarms on divergence and respects the 100 rp/s limit — O-09.)\n",
        ) + chalk.green("\nNo divergence asserted without the ledger. Wire the live diff via the reconcile path.\n"),
      );
      process.exit(0);
    });
}
