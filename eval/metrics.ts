// Shared calibration metrics for the L2/L3 eval tiers (E2/E3). Binary "pass"/"fail" predictions vs
// hand labels → F1 (the gate the overrides cite: F1 ≥ 0.8) and Cohen's κ (κ ≥ 0.6 — agreement beyond
// chance, the "no self-grading" calibration vs an external rubric).

export type Label = "pass" | "fail";

export interface ConfusionMatrix {
  tp: number; // predicted pass, gold pass
  fp: number; // predicted pass, gold fail
  fn: number; // predicted fail, gold pass
  tn: number; // predicted fail, gold fail
}

export function confusion(pairs: ReadonlyArray<{ pred: Label; gold: Label }>): ConfusionMatrix {
  const m: ConfusionMatrix = { tp: 0, fp: 0, fn: 0, tn: 0 };
  for (const { pred, gold } of pairs) {
    if (pred === "pass" && gold === "pass") m.tp += 1;
    else if (pred === "pass" && gold === "fail") m.fp += 1;
    else if (pred === "fail" && gold === "pass") m.fn += 1;
    else m.tn += 1;
  }
  return m;
}

/** F1 over the positive ("pass") class. Returns 0 when undefined (no predicted/actual positives). */
export function f1Score(m: ConfusionMatrix): number {
  const precision = m.tp + m.fp === 0 ? 0 : m.tp / (m.tp + m.fp);
  const recall = m.tp + m.fn === 0 ? 0 : m.tp / (m.tp + m.fn);
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

/** Accuracy — fraction of correct predictions. */
export function accuracy(m: ConfusionMatrix): number {
  const n = m.tp + m.fp + m.fn + m.tn;
  return n === 0 ? 0 : (m.tp + m.tn) / n;
}

/** Cohen's κ — agreement beyond chance between predictions and gold labels. */
export function cohensKappa(m: ConfusionMatrix): number {
  const n = m.tp + m.fp + m.fn + m.tn;
  if (n === 0) return 0;
  const po = (m.tp + m.tn) / n; // observed agreement
  const predPass = (m.tp + m.fp) / n;
  const goldPass = (m.tp + m.fn) / n;
  const pe = predPass * goldPass + (1 - predPass) * (1 - goldPass); // expected by chance
  return pe === 1 ? 1 : (po - pe) / (1 - pe);
}

export interface CalibrationResult {
  readonly n: number;
  readonly f1: number;
  readonly kappa: number;
  readonly accuracy: number;
  readonly confusion: ConfusionMatrix;
  /** the gate verdict: F1 ≥ f1Gate AND κ ≥ kappaGate */
  readonly pass: boolean;
}

export function calibrate(
  pairs: ReadonlyArray<{ pred: Label; gold: Label }>,
  gates: { f1: number; kappa: number },
): CalibrationResult {
  const m = confusion(pairs);
  const f1 = f1Score(m);
  const kappa = cohensKappa(m);
  return {
    n: pairs.length,
    f1,
    kappa,
    accuracy: accuracy(m),
    confusion: m,
    pass: f1 >= gates.f1 && kappa >= gates.kappa,
  };
}
