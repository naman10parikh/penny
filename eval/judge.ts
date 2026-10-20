// L3 judge (E3) — grades a trajectory candidate against an EXTERNAL rubric. Two modes:
//
//   1. Deterministic rubric-judge ($0, always-on): scores the candidate on the rubric's positive
//      signals, trap signals, and the required brain citation. No model, no spend — so PR/CI stays
//      free and the κ-gate is reproducible offline. This is the graded path.
//   2. LLM-judge: when ANTHROPIC_API_KEY and PENNY_JUDGE_MODEL are set, the model named there grades
//      the SAME rubric (no self-grading — the model judges OTHER trajectories against an external bar).
//      This is the nightly calibrated path; it lights up with both, mirroring the deferred-Claude-half
//      pattern (D8). It is NOT required for the gate — the deterministic judge is.
//
// Both return "pass" | "fail"; the scorer (l3/run.ts) calibrates either against the hand labels.

import { RUBRICS, type Rubric } from "./l3/rubrics.js";
import type { Label } from "./metrics.js";

export type JudgeMode = "deterministic" | "llm";

/** Does the candidate cite at least one of the rubric's accepted brain refs? (no self-grading) */
function citesLaw(candidate: string, rubric: Rubric): boolean {
  return rubric.citations.some((c) => candidate.includes(c));
}

/**
 * Deterministic rubric-judge ($0). A trajectory passes iff: it trips NO trap pattern, it hits a
 * MAJORITY of the rubric's positive signals (the required design moves), and it cites the law.
 */
export function judgeDeterministic(task: string, candidate: string): Label {
  const rubric = RUBRICS[task];
  if (!rubric) throw new Error(`no rubric for ${task}`);

  // Any trap signal → fail outright (the trajectory prescribes a banned move).
  if (rubric.trapPatterns.some((re) => re.test(candidate))) return "fail";

  // Count positive signals hit; require a majority of the required design moves.
  const hits = rubric.positivePatterns.filter((re) => re.test(candidate)).length;
  const majority = Math.ceil(rubric.positivePatterns.length / 2);
  const behaviorOk = hits >= majority;

  return behaviorOk && citesLaw(candidate, rubric) ? "pass" : "fail";
}

/** Build the judge prompt for the LLM path — the rubric IS the external bar (no self-grading). */
export function buildJudgePrompt(task: string, candidate: string): { system: string; user: string } {
  const rubric = RUBRICS[task];
  const system =
    "You are a strict payments-engineering grader. Grade the CANDIDATE trajectory against the RUBRIC " +
    "only — not your own opinion. A trajectory PASSES iff it exhibits the required design moves, avoids " +
    "every trap, AND cites the law. Reply with exactly one word: PASS or FAIL.";
  const user =
    `RUBRIC for ${rubric.task} (${rubric.scenario} — ${rubric.title})\n` +
    `LAW (must be cited): ${rubric.law}\n` +
    `MUST HAVE (all): ${rubric.mustHave.map((m) => `\n  - ${m}`).join("")}\n` +
    `MUST NOT (none): ${rubric.mustNot.map((m) => `\n  - ${m}`).join("")}\n` +
    `Accepted citations: ${rubric.citations.join(", ")}\n\n` +
    `CANDIDATE:\n${candidate}\n\n` +
    `Grade (PASS or FAIL):`;
  return { system, user };
}

/**
 * LLM-judge via the model named in PENNY_JUDGE_MODEL (the Messages API needs a model name and penny
 * never picks one, because a fixed ID goes stale). Returns the verdict, or throws if ANTHROPIC_API_KEY
 * or PENNY_JUDGE_MODEL is unset (the caller decides whether to fall back to the deterministic judge).
 * Uses adaptive thinking; no temperature/budget_tokens.
 */
export async function judgeLlm(task: string, candidate: string): Promise<Label> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY unset — LLM judge unavailable (use the deterministic judge)");
  }
  const model = process.env.PENNY_JUDGE_MODEL?.trim();
  if (!model) {
    throw new Error("PENNY_JUDGE_MODEL unset: name the judge model to use the LLM judge (or use the deterministic judge)");
  }
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const { system, user } = buildJudgePrompt(task, candidate);
  const res = await client.messages.create({
    model,
    max_tokens: 16,
    thinking: { type: "adaptive" },
    system,
    messages: [{ role: "user", content: user }],
  });
  const text = res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join(" ")
    .toUpperCase();
  return text.includes("PASS") && !text.includes("FAIL") ? "pass" : "fail";
}
