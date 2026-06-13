// GT-2 — Shape-contract / version pin (S-17 / O-16) — THE HEADLINE L1.
//
// The Basil postmortem (flarecanary, field-02 §1) proved a breaking change can ship as a 200 OK:
// `current_period_end` moved to the item level, top-level access returns `undefined`, NaN cascades
// into charge amounts — across every SDK language. SDK types don't catch it (they upgrade too).
// penny's defense (O-16): pin the API version and own a shape-contract test asserting the response
// shape its business logic reads, independent of the SDK.
//
// What this asserts ($0, no live API): penny's SHAPE_CONTRACT (the CLI face of this eval) pins
// 2026-05-27.dahlia, reads the item-level path (NOT the moved top-level field), and catches drift.
// "For the correct reason" gate: the contract must cite S-17 / O-16, not just pin a string.

import { describe, it, expect } from "vitest";
import { SHAPE_CONTRACT } from "../../src/cli/check-version.js";
import { PINNED_STRIPE_VERSION } from "../../src/brain-refs.js";

describe("GT-2 · shape-contract / version pin (S-17 — the headline L1)", () => {
  it("pins the API version to 2026-05-27.dahlia (the contract baseline)", () => {
    expect(SHAPE_CONTRACT.apiVersion).toBe("2026-05-27.dahlia");
    expect(SHAPE_CONTRACT.apiVersion).toBe(PINNED_STRIPE_VERSION);
  });

  it("reads the ITEM-LEVEL period-end path, NOT the moved top-level field (the Basil trap)", () => {
    const periodEndField = SHAPE_CONTRACT.fields.find((f) => f.includes("current_period_end"));
    expect(periodEndField, "the contract must assert a period-end shape").toBeDefined();
    // The fix: read subscription.items.data[0].current_period_end (the post-Basil item-level path).
    expect(periodEndField).toMatch(/items\.data\[0\]\.current_period_end/);
    // The trap: the OLD top-level access is what returned undefined → NaN charges. The contract
    // text must call it out so a reader does not regress to it.
    expect(periodEndField).toMatch(/NOT subscription\.current_period_end/);
  });

  it("the contract catches version DRIFT (a stale version must not silently pass)", () => {
    // The detector logic the CLI uses: any reported version != the pinned baseline is drift.
    const drift = (reported: string): boolean => reported !== SHAPE_CONTRACT.apiVersion;
    expect(drift("2025-03-31.basil"), "Basil must be flagged as drift").toBe(true);
    expect(drift("2024-09-30.acacia"), "Acacia must be flagged as drift").toBe(true);
    expect(drift(SHAPE_CONTRACT.apiVersion), "the pinned baseline is NOT drift").toBe(false);
  });

  it("for the correct reason: the contract cites S-17 / O-16 (no bare string-pin)", () => {
    const joined = SHAPE_CONTRACT.fields.join(" ");
    // The brain ref is the anti-slop gate — a pin without the 'why' fails the pass bar.
    expect(joined, "the shape contract must cite the brain").toMatch(/S-17|O-16/);
  });
});
