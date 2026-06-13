// E3 · L3 calibration as a vitest gate — so `pnpm test` (E5 red-blocking) covers the L3 trajectory
// tier via the $0 DETERMINISTIC judge (the LLM judge is the nightly path, not a CI hard-block per
// V4). Asserts the deterministic rubric-judge agrees with the hand labels at κ ≥ 0.6.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { judgeDeterministic } from "../judge.js";
import { buildJudgePrompt } from "../judge.js";
import { RUBRICS } from "./rubrics.js";
import { calibrate, type Label } from "../metrics.js";

const LABELS = join(import.meta.dirname, "..", "labels", "l3-golden.jsonl");

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

describe("E3 · L3 trajectory calibration (GT-10..GT-13)", () => {
  it("every labeled trajectory has a rubric (GT-10..GT-13 covered)", () => {
    for (const r of rows()) expect(RUBRICS[r.task], `missing rubric for ${r.task}`).toBeDefined();
  });

  it("the labeled set is balanced (pass + trap variants per task)", () => {
    const byTask = new Map<string, Set<Label>>();
    for (const r of rows()) byTask.set(r.task, (byTask.get(r.task) ?? new Set()).add(r.gold));
    for (const [task, labels] of byTask) {
      expect(labels.has("pass"), `${task} needs a pass variant`).toBe(true);
      expect(labels.has("fail"), `${task} needs a fail (trap) variant`).toBe(true);
    }
  });

  it("the $0 deterministic judge hits the κ ≥ 0.6 gate vs the hand labels", () => {
    const pairs = rows().map((r) => ({ pred: judgeDeterministic(r.task, r.candidate), gold: r.gold }));
    const result = calibrate(pairs, { f1: 0, kappa: 0.6 });
    expect(result.kappa).toBeGreaterThanOrEqual(0.6);
  });

  it("the 'correct reason' gate bites: a right trajectory WITHOUT the law cited fails", () => {
    // GT-10 correct design (scoped SPT) but no O-11 / S-13 citation → must NOT pass.
    const noCite =
      "Issue a seller-locked, $50-capped, 24h-expiring Shared Payment Token; fuse with helios balance cap.";
    expect(judgeDeterministic("GT-10", noCite)).toBe("fail");
    expect(judgeDeterministic("GT-10", noCite + " [O-11 / S-13]")).toBe("pass");
  });

  it("the LLM-judge prompt embeds the external rubric + law (no self-grading)", () => {
    const { system, user } = buildJudgePrompt("GT-12", "some candidate");
    expect(system).toMatch(/grade the candidate trajectory against the rubric/i);
    expect(user).toMatch(/O-08/); // the law the judge must check a citation for
    expect(user).toMatch(/MUST HAVE/);
  });
});
