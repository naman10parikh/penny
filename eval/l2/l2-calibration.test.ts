// E2 · L2 calibration as a vitest gate — so `pnpm test` (red-blocking in CI, E5) covers the L2
// behavioral pyramid, not just the standalone `pnpm eval -- --level l2` scorer. Asserts the
// classifiers agree with the hand labels at F1 ≥ 0.8 / κ ≥ 0.6 (HARNESS-OVERRIDES §9).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CLASSIFIERS, type Verdict } from "./classifiers.js";
import { calibrate, type Label } from "../metrics.js";

const LABELS = join(import.meta.dirname, "..", "labels", "l2-golden.jsonl");

interface Row {
  task: string;
  candidate: string;
  gold: Label;
}

function rows(): Row[] {
  return readFileSync(LABELS, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Row);
}

describe("E2 · L2 golden-task calibration (GT-5..GT-9)", () => {
  it("every labeled candidate has a classifier (GT-5..GT-9 all covered)", () => {
    for (const r of rows()) expect(CLASSIFIERS[r.task], `missing classifier for ${r.task}`).toBeTypeOf("function");
  });

  it("the labeled set is balanced (both pass and fail variants exist per task)", () => {
    const byTask = new Map<string, Set<Label>>();
    for (const r of rows()) {
      byTask.set(r.task, (byTask.get(r.task) ?? new Set()).add(r.gold));
    }
    for (const [task, labels] of byTask) {
      expect(labels.has("pass"), `${task} needs a pass variant`).toBe(true);
      expect(labels.has("fail"), `${task} needs a fail (trap) variant`).toBe(true);
    }
  });

  it("classifiers hit the F1 ≥ 0.8 / κ ≥ 0.6 gate vs the hand labels (no self-grading)", () => {
    const pairs = rows().map((r) => ({
      pred: CLASSIFIERS[r.task](r.candidate) as Verdict as Label,
      gold: r.gold,
    }));
    const result = calibrate(pairs, { f1: 0.8, kappa: 0.6 });
    expect(result.f1).toBeGreaterThanOrEqual(0.8);
    expect(result.kappa).toBeGreaterThanOrEqual(0.6);
    expect(result.pass).toBe(true);
  });

  it("the 'correct reason' gate bites: a right behavior WITHOUT a brain citation fails", () => {
    // GT-6 correct behavior (re-fetch) but no S-01/Corollary A citation → must NOT pass.
    const noCite = "Re-fetch the canonical subscription from the API and derive entitlement from that.";
    expect(CLASSIFIERS["GT-6"](noCite)).toBe("fail");
    // Same behavior WITH the citation → passes.
    const withCite = noCite + " This is S-01 / Corollary A.";
    expect(CLASSIFIERS["GT-6"](withCite)).toBe("pass");
  });
});
