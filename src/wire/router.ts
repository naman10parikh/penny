// The `penny wire` internal routing loop (the Dispatch component, D1). A real multi-step
// router: scaffold → verify → self-test. Built as a PURE planner (buildWirePlan) so the
// dispatch test can assert the ordered worker steps without touching Stripe, plus a runner
// that executes the plan against a target dir. Each step cites the brain gotcha it enforces.

import type { ProductSpec } from "./spec.js";

export type WirePhase = "scaffold" | "verify" | "self-test";

export interface WireStep {
  readonly phase: WirePhase;
  /** stable id for ordering/assertions */
  readonly id: string;
  readonly description: string;
  /** the brain ref this step enforces (anti-slop: no generic step without a citation) */
  readonly brainRef: string;
}

/**
 * Build the ordered step plan for wiring a spec. The order is law: scaffold the surface,
 * verify its shape, then self-test it against Stripe test mode. This is the dispatch loop
 * the acceptance test (E4) drives end-to-end.
 */
export function buildWirePlan(spec: ProductSpec): WireStep[] {
  const hasMetered = spec.prices.some((p) => p.kind === "metered");

  const steps: WireStep[] = [
    // --- scaffold ---
    {
      phase: "scaffold",
      id: "scaffold.product",
      description: `create product "${spec.product.name}" + ${spec.prices.length} price(s), billing_mode pinned to "${spec.billingMode}"`,
      brainRef: "P-17",
    },
    {
      phase: "scaffold",
      id: "scaffold.tax",
      description: "set tax_behavior explicitly per price/currency (USD/CAD exclusive, others inclusive)",
      brainRef: "S-16 / O-14",
    },
    {
      phase: "scaffold",
      id: "scaffold.checkout",
      description: `create a Checkout Session using the current Dahlia UI mode "${spec.checkout.uiMode}" (do not use a removed mode)`,
      brainRef: "S-17-adjacent (Dahlia 2026-03-25 UI-mode enum change)",
    },
    {
      phase: "scaffold",
      id: "scaffold.webhook",
      description: `scaffold a raw-body webhook handler at ${spec.webhook.path} (read raw bytes, disable body parser)`,
      brainRef: "P-04 / S-03",
    },
  ];

  if (hasMetered) {
    steps.push({
      phase: "scaffold",
      id: "scaffold.meter",
      description: "create the Meter (near-immutable; named like a public API) + wire meter_events",
      brainRef: "O-07 / P-08 / P-10",
    });
  }

  // --- verify (shape, $0) ---
  steps.push(
    {
      phase: "verify",
      id: "verify.shape",
      description: `assert the response shape your code reads, pinned to ${spec.apiVersion} (period-end finite at the item-level path)`,
      brainRef: "S-17 / O-16",
    },
    {
      phase: "verify",
      id: "verify.mode",
      description: `assert billing_mode is explicitly "${spec.billingMode}" on the subscription`,
      brainRef: "P-17 / S-04",
    },
  );

  // --- self-test (Stripe test mode via the `stripe` CLI) ---
  steps.push(
    {
      phase: "self-test",
      id: "selftest.checkout",
      description: "drive the test Checkout to complete (4242…); re-fetch the canonical Session/Subscription (not the redirect payload)",
      brainRef: "Corollary A / S-01",
    },
    {
      phase: "self-test",
      id: "selftest.webhook",
      description: "stripe trigger checkout.session.completed → constructEvent over raw bytes succeeds; a tampered body is rejected",
      brainRef: "S-03 / P-04",
    },
    {
      phase: "self-test",
      id: "selftest.idempotent",
      description: "replay the same event id → side-effect runs exactly once (dedup row + side-effect in one transaction)",
      brainRef: "S-02 / O-02",
    },
  );

  return steps;
}

/** Render a plan as an ordered, human-readable step list (used by --dry-run). */
export function renderPlan(steps: WireStep[]): string {
  const lines: string[] = [];
  let phase: WirePhase | null = null;
  let n = 0;
  for (const step of steps) {
    if (step.phase !== phase) {
      phase = step.phase;
      lines.push(`\n[${phase}]`);
    }
    n += 1;
    lines.push(`  ${n}. ${step.description}  [${step.brainRef}]`);
  }
  return lines.join("\n");
}
