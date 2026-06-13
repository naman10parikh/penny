// GT-3 — Multi-currency tax flip (S-16 / P-15 / O-14) — L1 assertion.
//
// USD + CAD tax_behavior defaults to EXCLUSIVE (added on top); ALL other currencies default to
// INCLUSIVE (baked in) — field-00 Appendix. A multi-currency catalog left on default tax behavior
// silently changes whether tax is added-on or baked-in across currencies: a compliance bug that
// ships to prod. The fix (O-14): set tax_behavior EXPLICITLY per price/currency and assert it.
//
// What this asserts ($0): penny's spec schema REQUIRES an explicit tax_behavior on every price (no
// default escape hatch), and the review scanner CATCHES a price that relies on default tax behavior.
// "For the correct reason": the scanner finding cites S-16 / P-15.

import { describe, it, expect } from "vitest";
import { ProductSpecSchema } from "../../src/wire/spec.js";
import { scanText } from "../../src/review/scan.js";

describe("GT-3 · multi-currency tax_behavior explicit per currency (S-16)", () => {
  it("the spec schema REQUIRES an explicit tax_behavior on a recurring price (no silent default)", () => {
    // A recurring price WITHOUT taxBehavior must fail validation — penny refuses to scaffold a
    // multi-currency catalog on default tax behavior (the exclusive↔inclusive flip).
    const missingTax = {
      name: "X",
      product: { name: "P" },
      prices: [{ kind: "recurring", currency: "eur", unitAmount: 1000, interval: "month" }],
      checkout: { uiMode: "hosted", successUrl: "https://e.com/s", cancelUrl: "https://e.com/c" },
      webhook: { path: "/w", rawBody: true },
    };
    const bad = ProductSpecSchema.safeParse(missingTax);
    expect(bad.success, "a price without taxBehavior must be rejected").toBe(false);

    // With an explicit tax_behavior, the same spec validates.
    const good = ProductSpecSchema.safeParse({
      ...missingTax,
      prices: [{ ...missingTax.prices[0], taxBehavior: "inclusive" }],
    });
    expect(good.success, "an explicit taxBehavior validates").toBe(true);
  });

  it("only the two valid behaviors (exclusive | inclusive) are accepted", () => {
    const base = {
      name: "X",
      product: { name: "P" },
      checkout: { uiMode: "hosted", successUrl: "https://e.com/s", cancelUrl: "https://e.com/c" },
      webhook: { path: "/w", rawBody: true },
    };
    const withBehavior = (b: string) =>
      ProductSpecSchema.safeParse({
        ...base,
        prices: [{ kind: "recurring", currency: "usd", unitAmount: 100, interval: "month", taxBehavior: b }],
      }).success;
    expect(withBehavior("exclusive")).toBe(true);
    expect(withBehavior("inclusive")).toBe(true);
    expect(withBehavior("default")).toBe(false); // 'default' is the trap — not a real behavior
    expect(withBehavior("automatic")).toBe(false);
  });

  it("the review scanner CATCHES a price relying on default tax behavior (P-15)", () => {
    const badPrice = "const price = await stripe.prices.create({ currency: 'eur', tax_behavior: 'default' });";
    const findings = scanText("price.ts", badPrice);
    const p15 = findings.find((f) => f.pitfallId === "P-15");
    expect(p15, "default tax_behavior must be flagged as P-15").toBeDefined();
    expect(p15!.brainRef).toMatch(/P-15|S-16/); // for the correct reason
  });
});
