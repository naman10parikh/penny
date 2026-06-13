#!/usr/bin/env tsx
// penny eval runner (E1) — the single entry point behind `pnpm eval`.
//
// Selects a Hamel level and runs the matching golden-task suite:
//   --level l1   (default)  pure $0 assertions — GT-1..GT-4 (S-03 / S-17 / S-16 / S-04 mode-pin)
//   --level l2              binary behavioral gates — GT-5..GT-9; reports F1 / κ vs labeled rows
//   --level l3              calibrated LLM-judge — GT-10..GT-13; reports κ vs labels (PR + nightly)
//
// The pyramid is the headline eval set (PLAN §6). L1 is the merge-blocking $0 floor; the acceptance
// test (E4) is the operational spine on top. No self-grading: every golden task's pass requires a
// brain citation (the "for the correct reason" check), asserted inside the suites themselves.
//
// Mechanism: L1 is a vitest dir (eval/l1/*.test.ts), so we shell out to vitest. L2/L3 carry their
// own calibration scorers (eval/l2/*.ts, eval/l3/*.ts) run as tsx modules that print a machine line
// `EVAL <level> result=<pass|fail> f1=<n> kappa=<n>` and exit 0/1.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url)); // eval/
const ROOT = join(HERE, ".."); // repo root

type Level = "l1" | "l2" | "l3";

function parseLevel(argv: string[]): Level {
  const i = argv.indexOf("--level");
  const raw = i >= 0 ? argv[i + 1] : "l1";
  if (raw === "l1" || raw === "l2" || raw === "l3") return raw;
  process.stderr.write(`penny eval: unknown --level "${raw}" (use l1 | l2 | l3)\n`);
  process.exit(2);
}

/** Run the L1 vitest dir. $0, no live API. */
function runL1(): number {
  // vitest 2.x takes a positional path filter (not --dir): run only the L1 suite.
  const r = spawnSync(
    "node_modules/.bin/vitest",
    ["run", "eval/l1", "--config", "vitest.config.ts"],
    { cwd: ROOT, stdio: "inherit" },
  );
  return r.status ?? 1;
}

/** Run an L2/L3 calibration scorer module (tsx). It prints its own EVAL line + exits 0/1. */
function runScorer(level: "l2" | "l3"): number {
  const scorer = join(ROOT, "eval", level, "run.ts");
  if (!existsSync(scorer)) {
    process.stderr.write(`penny eval: no ${level} scorer at ${scorer}\n`);
    return 1;
  }
  const r = spawnSync("node_modules/.bin/tsx", [scorer], { cwd: ROOT, stdio: "inherit" });
  return r.status ?? 1;
}

function main(): void {
  const level = parseLevel(process.argv.slice(2));
  process.stdout.write(
    `penny eval — level ${level.toUpperCase()} ` +
      `(${level === "l1" ? "pure $0 assertions" : level === "l2" ? "binary behavioral, F1≥0.8/κ≥0.6" : "LLM-judge, κ≥0.6, PR+nightly"})\n`,
  );

  let code: number;
  if (level === "l1") code = runL1();
  else code = runScorer(level);

  process.stdout.write(
    code === 0
      ? `\npenny eval ${level.toUpperCase()}: PASS\n`
      : `\npenny eval ${level.toUpperCase()}: FAIL (exit ${code})\n`,
  );
  process.exit(code);
}

main();
