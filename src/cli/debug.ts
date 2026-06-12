// `penny debug <symptom>` — root-cause a billing incident via JTBD-0 (the ledger is the truth).
// Maps a described symptom to the brain's known failure class + the scenario/pitfall that
// explains it, then states the law it violates. This is a heuristic triage (string match over
// the silent-failure tells), not a live debugger — it points the human at the right brain ref.

import { Command } from "commander";
import chalk from "chalk";
import { JTBD0_LAW } from "../brain-refs.js";

interface SymptomMatch {
  /** lowercase substrings that signal this failure class */
  readonly tells: readonly string[];
  readonly rootCause: string;
  readonly brainRef: string;
  readonly fix: string;
}

/** The silent-failure tells (KNOWN-PITFALLS cross-cut). Almost every billing bug hides behind
 *  a success-looking signal — a 200, an `undefined`, a dropped row, a `status:active`. */
const TELLS: readonly SymptomMatch[] = [
  {
    tells: ["no signatures", "constructevent", "400", "signature", "webhook secret"],
    rootCause: "Body-parser mutated the raw webhook body so HMAC no longer byte-matches.",
    brainRef: "P-04 / S-03",
    fix: "Read RAW bytes (req.text() / express.raw), disable the body parser on the route. It is almost NEVER the secret — do not rotate it first.",
  },
  {
    tells: ["double", "twice", "duplicate", "double-charge", "double fulfill"],
    rootCause: "Dedup row written AFTER the side-effect (or a retry after a deploy/crash).",
    brainRef: "P-02 / S-02 / O-02",
    fix: "Put the dedup row in the SAME transaction as the side-effect, or use the event id as a unique-constraint PK so the second insert fails before any side-effect.",
  },
  {
    tells: ["invalid date", "nan", "undefined", "blank dashboard", "period_end"],
    rootCause: "A breaking shape change shipped as a 200 OK — the field your code reads went undefined (Basil moved period-end to the item level).",
    brainRef: "P-16 / S-17 / O-01",
    fix: "Read subscription.items.data[0].current_period_end; own a CI shape-contract test pinned to your API version (penny check-version).",
  },
  {
    tells: ["active", "grace", "still has access", "abuse", "past_due"],
    rootCause: "Entitlement keyed off raw subscription.status === 'active'; Stripe's grace/dunning window keeps status usable when payment failed.",
    brainRef: "P-14 / S-15 / O-03",
    fix: "Key entitlement off YOUR derived paid-through date, never the raw status string.",
  },
  {
    tells: ["usage", "meter", "under-bill", "underbill", "missing usage", "createusagerecord"],
    rootCause: "Metered events dropped at the period boundary (or the dead createUsageRecord API).",
    brainRef: "P-08 / P-09 / S-09 / O-06",
    fix: "Use Meters + meter_events; send near real-time; reconcile internal usage vs meter-event-summary daily; respect the 35-day / current-period-only rules.",
  },
  {
    tells: ["reorder", "out of order", "stale plan", "self-heal", "flips"],
    rootCause: "Trusting webhook payload/event order — Stripe does not guarantee ordering and retries reorder.",
    brainRef: "P-01 / S-01",
    fix: "On ordering-sensitive logic, re-fetch the canonical object from the API and derive state from that + your paid-through date.",
  },
  {
    tells: ["500", "error but charged", "charged on error", "payout", "frozen", "hold", "reserve"],
    rootCause: "Inferring money-state from a transport status (a 500 may have charged; a balance is not your cash).",
    brainRef: "P-18 / P-19 / O-01 / O-13",
    fix: "Reconcile by idempotency key / re-query before retrying; treat the processor balance as not-your-cash (sweep, buffer, second processor).",
  },
];

export function registerDebug(program: Command): void {
  program
    .command("debug")
    .description("root-cause a billing incident via JTBD-0 (the ledger is the truth, not the status code)")
    .argument("<symptom...>", "describe the symptom (e.g. 'every webhook 400s')")
    .action((symptomWords: string[]) => {
      const symptom = symptomWords.join(" ").toLowerCase();

      process.stdout.write(
        chalk.yellow(`penny debug: "${symptomWords.join(" ")}"\n`) +
          chalk.dim(`  THE LAW: ${JTBD0_LAW}\n\n`),
      );

      const matches = TELLS.filter((m) => m.tells.some((t) => symptom.includes(t)));

      if (matches.length === 0) {
        process.stdout.write(
          chalk.dim(
            "No known silent-failure tell matched. Run `penny explain <topic>` to query the brain, " +
              "and reconcile against the ledger before assuming money did/didn't move.\n",
          ),
        );
        process.exit(0);
      }

      for (const m of matches) {
        process.stdout.write(
          chalk.bold(`  Likely root cause [${m.brainRef}]\n`) +
            `    ${m.rootCause}\n` +
            chalk.green(`    Fix: ${m.fix}\n\n`),
        );
      }
      process.exit(0);
    });
}
