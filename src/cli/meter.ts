// `penny meter create <name> --agg <sum|count|last> --unit <u>` — record a Meter spec locally
// (this version does not call Stripe), "named like a public API", and REFUSE to re-create one that
// exists. Meters are near-immutable
// (only the display name is mutable); a wrong aggregation or unit forces a brand-new meter +
// a subscription migration (O-07 / P-10). penny treats the meter name like a public API surface
// and decides the unit of value before creation. Test mode by default.

import { Command } from "commander";
import chalk from "chalk";
import { validateMeterEventTimestamp, type BillingPeriod } from "../wire/meter-event.js";
import { isMeterDeclared, meterRegistryPath, recordMeter } from "../wire/meter-registry.js";

const VALID_AGGREGATIONS = ["sum", "count", "last"] as const;
type Aggregation = (typeof VALID_AGGREGATIONS)[number];

export function registerMeter(program: Command): void {
  const meter = program.command("meter").description("plan Stripe Meters locally, with no Stripe call (near-immutable, so name them like a public API)");

  meter
    .command("create")
    .description("record a Meter spec locally (no Stripe call); refuses to re-create (meters are near-immutable, O-07/P-10)")
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

      // Guard 3: immutability refusal — never re-create an existing meter. Backed by an on-disk
      // registry (logs/declared-meters.json) so the refusal SURVIVES across CLI processes and matches
      // the long-lived MCP server's refusal — the two faces of the meter contract agree. (Production
      // also queries Stripe before creating; this is the $0/test-mode mirror of that existence check.)
      if (isMeterDeclared(name)) {
        process.stderr.write(
          chalk.red(
            `penny meter create: meter "${name}" already declared. Meters are near-immutable — ` +
              `only the display name changes. Re-creating forces a new meter + a subscription migration. ` +
              `REFUSED. [O-07/P-10]\n`,
          ),
        );
        process.exit(1);
      }
      recordMeter({ name, aggregation: opts.agg, unit: opts.unit });

      process.stdout.write(
        chalk.yellow(`penny meter create: recorded locally in ${meterRegistryPath()}. No Stripe Meter was created.\n`) +
          `  event_name  : ${name}\n` +
          `  aggregation : ${opts.agg}\n` +
          `  unit        : ${opts.unit}\n` +
          chalk.dim(`  brain: O-07/P-10 — name the meter like a public API; the unit of value is baked in.\n`) +
          chalk.green(`\nMeter spec validated. This version does not call Stripe.\n`),
      );
      process.exit(0);
    });

  // `penny meter validate-event --ts <unix-ms|ISO> [--period-start <ts> --period-end <ts>]`
  // The S-09 / P-09 loud-rejection guard: refuse to flush a meter event Stripe would SILENTLY DROP
  // (outside the 35-day / 5-min-future / current-period window). Exit 0 = accepted, exit 1 = would be
  // dropped (penny alarms instead of leaking revenue — JTBD-0 applied to usage telemetry).
  meter
    .command("validate-event")
    .description("reject a meter event Stripe would silently drop (35-day / 5-min-future / in-period, S-09/P-09)")
    .requiredOption("--ts <ts>", "the meter event timestamp: unix-ms or ISO date")
    .option("--period-start <ts>", "current billing period start (unix-ms or ISO) — enables the outside-period check")
    .option("--period-end <ts>", "current billing period end (unix-ms or ISO)")
    .option("--now <ts>", "override 'now' (unix-ms or ISO) — for deterministic checks/tests")
    .action((opts: { ts: string; periodStart?: string; periodEnd?: string; now?: string }) => {
      const toMs = (s: string): number => (/^\d+$/.test(s.trim()) ? Number(s) : Date.parse(s));
      const eventTs = toMs(opts.ts);
      const nowMs = opts.now ? toMs(opts.now) : Date.now();
      let period: BillingPeriod | undefined;
      if (opts.periodStart && opts.periodEnd) {
        period = { startMs: toMs(opts.periodStart), endMs: toMs(opts.periodEnd) };
      }

      const check = validateMeterEventTimestamp(eventTs, nowMs, period);
      if (check.accepted) {
        process.stdout.write(chalk.green(`penny meter validate-event: ACCEPTED\n`) + chalk.dim(`  ${check.message}\n`));
        process.exit(0);
      }
      // Loud rejection — the whole point of S-09 is that a dropped event must NEVER be silent.
      process.stderr.write(
        chalk.red(`penny meter validate-event: REJECTED (${check.reason}) — would be SILENTLY DROPPED by Stripe\n`) +
          `  ${check.message}\n`,
      );
      process.exit(1);
    });
}
