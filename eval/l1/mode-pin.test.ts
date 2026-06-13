// GT-4 (mode-pin half) — Flexible-mode billing pin (S-04 / P-17 / O-06) — L1 assertion.
//
// New subscriptions default to FLEXIBLE billing mode (since 2025-08-27); existing integrations are
// preserved as CLASSIC. Flexible mode calculates credit prorations on the "original amount
// previously debited," DIFFERING from classic — so a 2024-era (classic) proration assertion copied
// into a 2026 flexible account is subtly wrong (P-17). The fix: PIN billing_mode explicitly in every
// spec/test and assert the correct mode's math.
//
// This is the L1 (assertion) HALF of GT-4 — the full proration-behavior gate (proration_behavior:
// none when the latest invoice is unpaid) is the L2 behavior in eval/l2. Here we only assert the
// mode is pinned and surfaces in the scaffold + the verify plan.
//
// "For the correct reason": the pin must cite P-17 / S-04.

import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSpec, ProductSpecSchema, type ProductSpec } from "../../src/wire/spec.js";
import { writeScaffold } from "../../src/wire/scaffold.js";
import { buildWirePlan } from "../../src/wire/router.js";

const ACCEPTANCE_SPEC = join(import.meta.dirname, "..", "..", "examples", "saas-pro.json");

function spec(): ProductSpec {
  const parsed = loadSpec(ACCEPTANCE_SPEC);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.spec;
}

describe("GT-4 (mode-pin half) · billing_mode pinned explicitly (S-04 / P-17)", () => {
  it("the acceptance spec pins billing_mode to flexible (the greenfield default, explicit not assumed)", () => {
    expect(spec().billingMode).toBe("flexible");
  });

  it("the schema only accepts the two known modes (flexible | classic) — no silent third state", () => {
    const base = {
      name: "X",
      product: { name: "P" },
      prices: [{ kind: "recurring", currency: "usd", unitAmount: 100, interval: "month", taxBehavior: "exclusive" }],
      checkout: { uiMode: "hosted", successUrl: "https://e.com/s", cancelUrl: "https://e.com/c" },
      webhook: { path: "/w", rawBody: true },
    };
    expect(ProductSpecSchema.safeParse({ ...base, billingMode: "flexible" }).success).toBe(true);
    expect(ProductSpecSchema.safeParse({ ...base, billingMode: "classic" }).success).toBe(true);
    expect(ProductSpecSchema.safeParse({ ...base, billingMode: "automatic" }).success).toBe(false);
  });

  it("the scaffolded Stripe client / setup pins the API version (the mode-pin's sibling contract)", () => {
    const dir = mkdtempSync(join(tmpdir(), "penny-gt4-"));
    const { files } = writeScaffold(spec(), dir);
    const client = readFileSync(join(dir, files.find((f) => f.includes("stripe-client"))!), "utf8");
    // The pinned API version is the shape contract; billing_mode is pinned on the subscription call.
    expect(client).toMatch(/apiVersion/);
    expect(client).toMatch(/2026-05-27\.dahlia/);
  });

  it("the verify plan asserts billing_mode is explicitly pinned, citing P-17 / S-04 (correct reason)", () => {
    const verifyMode = buildWirePlan(spec()).find((s) => s.id === "verify.mode");
    expect(verifyMode, "the plan must verify the billing mode").toBeDefined();
    expect(verifyMode!.description).toMatch(/billing_mode/);
    expect(verifyMode!.brainRef).toMatch(/P-17|S-04/);
  });
});
