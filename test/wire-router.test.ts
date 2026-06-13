// Dispatch test (D1) — exercises B3's pure `buildWirePlan` router under test. The dispatch
// property is the real multi-step routing loop inside `penny wire`: scaffold → verify → self-test,
// in that order, every step brain-cited. This test asserts the ordered worker steps WITHOUT touching
// Stripe (the planner is pure), against the real acceptance spec (examples/saas-pro.json).
//
// Per the prior B-cli builder's note: src/wire/router.ts is already built correctly as B3's step
// machine; D1 adds ONLY this test (no router rewrite).

import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildWirePlan, renderPlan, type WirePhase } from "../src/wire/router.js";
import { loadSpec, type ProductSpec } from "../src/wire/spec.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ACCEPTANCE_SPEC = join(HERE, "..", "examples", "saas-pro.json");

/** Load the real acceptance spec (1 product + 1 recurring + 1 metered price). */
function loadAcceptanceSpec(): ProductSpec {
  const parsed = loadSpec(ACCEPTANCE_SPEC);
  if (!parsed.ok) throw new Error(`acceptance spec failed to load: ${parsed.error}`);
  return parsed.spec;
}

describe("penny wire dispatch loop (D1 — the routing property)", () => {
  it("loads the acceptance spec (1 product + recurring + metered)", () => {
    const spec = loadAcceptanceSpec();
    expect(spec.prices.length).toBeGreaterThanOrEqual(2);
    expect(spec.prices.some((p) => p.kind === "recurring")).toBe(true);
    expect(spec.prices.some((p) => p.kind === "metered")).toBe(true);
  });

  it("produces an ORDERED scaffold → verify → self-test plan (the dispatch order is law)", () => {
    const steps = buildWirePlan(loadAcceptanceSpec());
    expect(steps.length).toBeGreaterThan(0);

    // Collapse to the ordered sequence of distinct phases as they first appear.
    const order: WirePhase[] = [];
    for (const s of steps) {
      if (order[order.length - 1] !== s.phase) order.push(s.phase);
    }
    expect(order).toEqual(["scaffold", "verify", "self-test"]);

    // No phase interleaving: every scaffold step precedes every verify step precedes every self-test.
    const phaseRank: Record<WirePhase, number> = { scaffold: 0, verify: 1, "self-test": 2 };
    const ranks = steps.map((s) => phaseRank[s.phase]);
    const sorted = [...ranks].sort((a, b) => a - b);
    expect(ranks).toEqual(sorted); // monotonic non-decreasing — phases never go backwards
  });

  it("cites a brain ref on EVERY step (the anti-slop gate — no generic step)", () => {
    const steps = buildWirePlan(loadAcceptanceSpec());
    for (const s of steps) {
      expect(s.brainRef, `step ${s.id} must cite the brain`).toMatch(/O-\d|P-\d|S-\d|JTBD|Corollary/);
    }
  });

  it("includes the load-bearing scaffold steps: raw-body webhook + pinned billing_mode + the meter", () => {
    const steps = buildWirePlan(loadAcceptanceSpec());
    const ids = steps.map((s) => s.id);
    // raw-body webhook handler (P-04/S-03 — the #1 silent webhook footgun)
    expect(ids).toContain("scaffold.webhook");
    expect(steps.find((s) => s.id === "scaffold.webhook")?.brainRef).toMatch(/P-04/);
    // billing_mode pinned (P-17 — classic vs flexible)
    expect(steps.find((s) => s.id === "scaffold.product")?.brainRef).toMatch(/P-17/);
    expect(steps.find((s) => s.id === "verify.mode")?.brainRef).toMatch(/P-17|S-04/);
    // the metered spec adds the Meter step (O-07/P-08/P-10)
    expect(ids).toContain("scaffold.meter");
  });

  it("the self-test phase RE-FETCHES the canonical object + asserts idempotency (the spine)", () => {
    const steps = buildWirePlan(loadAcceptanceSpec());
    const selfTest = steps.filter((s) => s.phase === "self-test");
    // re-fetch canonical (Corollary A) — not the redirect payload
    expect(selfTest.find((s) => s.id === "selftest.checkout")?.description).toMatch(/re-fetch/i);
    // idempotent replay — side-effect exactly once (S-02/O-02)
    expect(selfTest.find((s) => s.id === "selftest.idempotent")?.brainRef).toMatch(/S-02|O-02/);
  });

  it("renderPlan emits the ordered, numbered, brain-cited dry-run view", () => {
    const rendered = renderPlan(buildWirePlan(loadAcceptanceSpec()));
    expect(rendered).toContain("[scaffold]");
    expect(rendered).toContain("[verify]");
    expect(rendered).toContain("[self-test]");
    // [scaffold] must appear before [self-test] in the rendered string
    expect(rendered.indexOf("[scaffold]")).toBeLessThan(rendered.indexOf("[self-test]"));
  });
});
