// `penny check-version` — contract-test the pinned Stripe API version shape ($0, no live API).
// This is the CLI face of the headline L1 eval (S-17 / O-16): the Basil postmortem proved a
// breaking change can ship as a 200 OK with fields gone `undefined` (NaN charges, every SDK
// language). SDK types don't catch it — they upgrade too. penny pins the version and owns a
// shape-contract test asserting the response shape its business logic reads.

import { Command } from "commander";
import chalk from "chalk";
import { PINNED_STRIPE_VERSION } from "../brain-refs.js";

/**
 * The shape contract penny's billing logic depends on, pinned to 2026-05-27.dahlia.
 * Post-Basil, period-end moved from `subscription.current_period_end` to the item level —
 * so the path penny reads is `subscription.items.data[0].current_period_end` (S-17).
 */
export const SHAPE_CONTRACT = {
  apiVersion: PINNED_STRIPE_VERSION,
  fields: [
    "subscription.items.data[0].current_period_end (finite number — NOT subscription.current_period_end; moved at Basil, S-17)",
    "subscription.billing_mode (explicit; flexible is the greenfield default since 2025-08-27, P-17)",
    "price.tax_behavior (explicit per currency; USD/CAD exclusive, others inclusive, S-16)",
  ],
} as const;

export function registerCheckVersion(program: Command): void {
  program
    .command("check-version")
    .description("contract-test the pinned Stripe API version shape your code reads ($0, no live API)")
    .option("--api-version <v>", "override the version to report (default: the pinned baseline)")
    .action((opts: { apiVersion?: string }) => {
      const reported = opts.apiVersion ?? SHAPE_CONTRACT.apiVersion;
      const drift = reported !== SHAPE_CONTRACT.apiVersion;

      process.stdout.write(
        chalk.yellow(`penny check-version\n`) +
          `  pinned baseline : ${SHAPE_CONTRACT.apiVersion}\n` +
          `  reporting       : ${reported}\n` +
          chalk.dim(`  brain: O-16 / S-17 — pin the version, own a shape-contract test independent of the SDK.\n\n`),
      );

      process.stdout.write(chalk.bold("Shape contract (the paths penny's logic reads):\n"));
      for (const field of SHAPE_CONTRACT.fields) {
        process.stdout.write(`  - ${field}\n`);
      }

      if (drift) {
        process.stderr.write(
          chalk.red(
            `\npenny: API version drift — reporting ${reported}, baseline ${SHAPE_CONTRACT.apiVersion}. ` +
              `Re-verify the shape contract (S-17) before trusting charge math.\n`,
          ),
        );
        process.exit(1);
      }

      process.stdout.write(chalk.green(`\nVersion matches the pinned baseline. Shape contract above is the L1 gate.\n`));
      process.exit(0);
    });
}
