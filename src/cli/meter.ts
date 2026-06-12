// `penny meter create <name> --agg <sum|count|last> --unit <u>` — create a Stripe Meter
// "named like a public API" and REFUSE to re-create one that exists. Meters are near-immutable
// (only the display name is mutable); a wrong aggregation or unit forces a brand-new meter +
// a subscription migration (O-07 / P-10). penny treats the meter name like a public API surface
// and decides the unit of value before creation. Test mode by default.

import { Command } from "commander";
import chalk from "chalk";

const VALID_AGGREGATIONS = ["sum", "count", "last"] as const;
type Aggregation = (typeof VALID_AGGREGATIONS)[number];

/** In-repo registry of meters penny has been asked to create this process, to enforce the
 *  immutability guard locally (the real guard also queries Stripe before creating). */
const declaredMeters = new Set<string>();

export function registerMeter(program: Command): void {
  const meter = program.command("meter").description("manage Stripe Meters (near-immutable — name like a public API)");

  meter
    .command("create")
    .description("create a Meter; refuses to re-create (meters are near-immutable, O-07/P-10)")
    .argument("<name>", "event_name (≤100 chars; treat like a public API — it is near-permanent)")
    .requiredOption("--agg <aggregation>", `aggregation: ${VALID_AGGREGATIONS.join(" | ")}`)
    .requiredOption("--unit <unit>", "the unit of value (decide this BEFORE creating — it is baked in)")
    .action((name: string, opts: { agg: string; unit: string }) => {
      // Guard 1: name length (Stripe event_name ≤ 100 chars).
      if (name.length === 0 || name.length > 100) {
        process.stderr.write(
          chalk.red(`penny meter create: event_name must be 1–100 chars (got ${name.length}). [P-10]\n`),
        );
        process.exit(1);
      }

      // Guard 2: aggregation must be one of the supported kinds (no "figure it out later").
      if (!VALID_AGGREGATIONS.includes(opts.agg as Aggregation)) {
        process.stderr.write(
          chalk.red(
            `penny meter create: --agg must be one of ${VALID_AGGREGATIONS.join(" | ")} (got "${opts.agg}"). ` +
              `Wrong aggregation = new meter + a subscription migration. [O-07/P-10]\n`,
          ),
        );
        process.exit(1);
      }

      // Guard 3: immutability refusal — never re-create an existing meter.
      if (declaredMeters.has(name)) {
        process.stderr.write(
          chalk.red(
            `penny meter create: meter "${name}" already declared. Meters are near-immutable — ` +
              `only the display name changes. Re-creating forces a new meter + a subscription migration. ` +
              `REFUSED. [O-07/P-10]\n`,
          ),
        );
        process.exit(1);
      }
      declaredMeters.add(name);

      process.stdout.write(
        chalk.yellow(`penny meter create (test mode)\n`) +
          `  event_name  : ${name}\n` +
          `  aggregation : ${opts.agg}\n` +
          `  unit        : ${opts.unit}\n` +
          chalk.dim(`  brain: O-07/P-10 — name the meter like a public API; the unit of value is baked in.\n`) +
          chalk.green(`\nMeter spec validated. (Wire to Stripe test-mode meter_events in the wire step.)\n`),
      );
      process.exit(0);
    });
}
