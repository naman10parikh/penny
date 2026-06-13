#!/usr/bin/env tsx
// E2 · L2 golden-task scorer (GT-5..GT-9) — binary behavioral gates, calibrated vs hand labels.
//
// Loads eval/labels/l2-golden.jsonl (candidate responses + gold pass/fail), runs each through its
// deterministic behavioral classifier (eval/l2/classifiers.ts — correct behavior AND a brain
// citation), and measures the classifier's agreement with the labels: F1 ≥ 0.8 / κ ≥ 0.6 (the
// HARNESS-OVERRIDES §9 gate). $0 — no LLM (that is L3). Prints `EVAL l2 result=<pass|fail> f1=<n>
// kappa=<n>` and exits 0/1. No self-grading: the gate is the external label set, not a model's
// confidence.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { CLASSIFIERS, type Verdict } from "./classifiers.js";
import { calibrate, type Label } from "../metrics.js";

const HERE = dirname(fileURLToPath(import.meta.url)); // eval/l2/
const ROOT = join(HERE, "..", ".."); // repo root
const LABELS = join(ROOT, "eval", "labels", "l2-golden.jsonl");

const F1_GATE = 0.8;
const KAPPA_GATE = 0.6;

interface Row {
  task: string;
  scenario: string;
  title: string;
  candidate: string;
  gold: Label;
}

function loadRows(): Row[] {
  const out: Row[] = [];
  for (const line of readFileSync(LABELS, "utf8").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    out.push(JSON.parse(t) as Row);
  }
  return out;
}

function main(): void {
  const rows = loadRows();
  const pairs: { pred: Label; gold: Label }[] = [];
  const perTask: Record<string, { pass: number; total: number }> = {};

  for (const row of rows) {
    const classify = CLASSIFIERS[row.task];
    if (!classify) {
      process.stderr.write(`penny eval l2: no classifier for ${row.task}\n`);
      process.exit(2);
    }
    const pred: Verdict = classify(row.candidate);
    pairs.push({ pred, gold: row.gold });
    perTask[row.task] ??= { pass: 0, total: 0 };
    perTask[row.task].total += 1;
    if (pred === row.gold) perTask[row.task].pass += 1;
  }

  const result = calibrate(pairs, { f1: F1_GATE, kappa: KAPPA_GATE });

  process.stdout.write(`penny eval L2 — GT-5..GT-9 behavioral gates (n=${result.n} labeled candidates)\n`);
  for (const [task, s] of Object.entries(perTask)) {
    process.stdout.write(`  ${task}: classifier agreed with ${s.pass}/${s.total} labels\n`);
  }
  process.stdout.write(
    `  confusion: tp=${result.confusion.tp} fp=${result.confusion.fp} fn=${result.confusion.fn} tn=${result.confusion.tn}\n`,
  );
  process.stdout.write(
    `  F1=${result.f1.toFixed(3)} (gate ≥ ${F1_GATE})  κ=${result.kappa.toFixed(3)} (gate ≥ ${KAPPA_GATE})  acc=${result.accuracy.toFixed(3)}\n`,
  );
  // Machine line for the runner / RSI loop.
  process.stdout.write(`EVAL l2 result=${result.pass ? "pass" : "fail"} f1=${result.f1.toFixed(3)} kappa=${result.kappa.toFixed(3)}\n`);

  process.exit(result.pass ? 0 : 1);
}

main();
