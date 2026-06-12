// The product spec penny wires into a target. Zod-validated at the boundary (typescript.md:
// runtime validation at API boundaries). A spec describes one product + its prices (recurring
// and/or metered) + the Checkout + webhook shape. penny scaffolds a CORRECT billing surface
// from it: a current-Dahlia Checkout UI mode + a raw-body webhook handler + pinned billing_mode
// + explicit tax_behavior (the gotchas the brain earned).

import { readFileSync } from "node:fs";
import { z } from "zod";
import { PINNED_STRIPE_VERSION } from "../brain-refs.js";

// Checkout UI modes valid under Dahlia. The 2026-03-25 cut changed the UI-mode enums — penny
// must NOT scaffold a removed mode (S-17-adjacent). These are the currently-valid values.
const UiMode = z.enum(["hosted", "embedded", "custom"]);

const TaxBehavior = z.enum(["exclusive", "inclusive"]);

const RecurringPrice = z.object({
  kind: z.literal("recurring"),
  currency: z.string().min(3).max(3),
  unitAmount: z.number().int().positive(),
  interval: z.enum(["day", "week", "month", "year"]),
  // Explicit per currency — USD/CAD default exclusive, others inclusive (S-16 / O-14).
  taxBehavior: TaxBehavior,
});

const MeteredPrice = z.object({
  kind: z.literal("metered"),
  currency: z.string().min(3).max(3),
  meter: z.object({
    // event_name ≤ 100 chars; near-immutable — name it like a public API (O-07 / P-10).
    eventName: z.string().min(1).max(100),
    aggregation: z.enum(["sum", "count", "last"]),
    unit: z.string().min(1),
  }),
  unitAmount: z.number().int().positive(),
  taxBehavior: TaxBehavior,
});

export const ProductSpecSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  apiVersion: z.string().default(PINNED_STRIPE_VERSION),
  // Pin the billing mode in every spec — flexible is the greenfield default since 2025-08-27;
  // copying a classic-mode proration assertion into a flexible account is a silent bug (P-17).
  billingMode: z.enum(["flexible", "classic"]).default("flexible"),
  product: z.object({
    name: z.string().min(1),
    description: z.string().optional(),
  }),
  prices: z.array(z.discriminatedUnion("kind", [RecurringPrice, MeteredPrice])).min(1),
  checkout: z.object({
    uiMode: UiMode,
    successUrl: z.string().url(),
    cancelUrl: z.string().url(),
  }),
  webhook: z.object({
    path: z.string().min(1),
    // The raw-body HMAC contract is non-negotiable (P-04 / S-03).
    rawBody: z.literal(true),
  }),
});

export type ProductSpec = z.infer<typeof ProductSpecSchema>;

export type SpecParse =
  | { readonly ok: true; readonly spec: ProductSpec }
  | { readonly ok: false; readonly error: string };

/** Parse + validate a product spec from a JSON file path. Strips the optional `$schema` key. */
export function loadSpec(path: string): SpecParse {
  let raw: unknown;
  try {
    const text = readFileSync(path, "utf8");
    raw = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: `cannot read/parse spec at ${path}: ${(err as Error).message}` };
  }

  // Drop the editor-only $schema hint before validation.
  if (raw && typeof raw === "object" && "$schema" in raw) {
    delete (raw as Record<string, unknown>)["$schema"];
  }

  const parsed = ProductSpecSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: `invalid spec: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` };
  }
  return { ok: true, spec: parsed.data };
}
