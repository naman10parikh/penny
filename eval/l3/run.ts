#!/usr/bin/env tsx
// E3 · L3 trajectory scorer (GT-10..GT-13) — calibrated LLM-judge, κ ≥ 0.6 vs hand labels.
//
// Loads eval/labels/l3-golden.jsonl (trajectory candidates + gold pass/fail) and grades each against
// the EXTERNAL rubric (eval/l3/rubrics.ts — no self-grading). Modes:
//   default        deterministic rubric-judge ($0) — the graded path; runs on PR + nightly, free.
//   --llm          claude-opus-4-8 LLM-judge (needs ANTHROPIC_API_KEY) — the nightly calibrated path.
//
// Reports κ (Cohen's kappa) vs the labels; gate = κ ≥ 0.6. NOT merge-blocking (per V4 / §6: L3 is
// judged on "honors documented scope," runs PR + nightly, never hard-blocks a single trial). Prints
// `EVAL l3 result=<pass|fail> kappa=<n>` and exits 0/1.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { judgeDeterministic, judgeLlm } from "../judge.js";
import { calibrate, type Label } from "../metrics.js";

const HERE = dirname(fileURLToPath(import.meta.url)); // eval/l3/
const ROOT = join(HERE, "..", ".."); // repo root
const LABELS = join(ROOT, "eval", "labels", "l3-golden.jsonl");

// Load .env so the --llm path finds ANTHROPIC_API_KEY locally (CI provides it as an env var).
// Best-effort; never overwrites an already-set value. The default ($0) path needs no key.
{
  const envPath = join(ROOT, ".env");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  }
}

const KAPPA_GATE = 0.6;
const USE_LLM = process.argv.includes("--llm");

interface Row {
  task: string;
  scenario: string;
  title: string;
  candidate: string;
  gold: Label;
}

function loadRows(): Row[] {
  return readFileSync(LABELS, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Row);
}

async function main(): Promise<void> {
  const rows = loadRows();
  const mode = USE_LLM && process.env.ANTHROPIC_API_KEY ? "llm (claude-opus-4-8)" : "deterministic ($0)";
  process.stdout.write(`penny eval L3 — GT-10..GT-13 trajectory judge [${mode}] (n=${rows.length})\n`);

  const pairs: { pred: Label; gold: Label }[] = [];
  for (const row of rows) {
    let pred: Label;
    if (USE_LLM && process.env.ANTHROPIC_API_KEY) {
      try {
        pred = await judgeLlm(row.task, row.candidate);
      } catch {
        pred = judgeDeterministic(row.task, row.candidate); // graceful fallback
      }
    } else {
      pred = judgeDeterministic(row.task, row.candidate);
    }
    pairs.push({ pred, gold: row.gold });
  }

  const result = calibrate(pairs, { f1: 0, kappa: KAPPA_GATE }); // L3 gate is κ; F1 reported for context
  process.stdout.write(
    `  confusion: tp=${result.confusion.tp} fp=${result.confusion.fp} fn=${result.confusion.fn} tn=${result.confusion.tn}\n`,
  );
  process.stdout.write(
    `  κ=${result.kappa.toFixed(3)} (gate ≥ ${KAPPA_GATE})  F1=${result.f1.toFixed(3)}  acc=${result.accuracy.toFixed(3)}\n`,
  );

  const pass = result.kappa >= KAPPA_GATE;
  process.stdout.write(`EVAL l3 result=${pass ? "pass" : "fail"} kappa=${result.kappa.toFixed(3)}\n`);
  process.stdout.write(
    pass
      ? `  GT-10..GT-13 judged (NOT merge-blocking — PR + nightly per V4).\n`
      : `  judge below the κ gate — recalibrate the rubric or labels.\n`,
  );
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  process.stderr.write(`✗ eval l3: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
