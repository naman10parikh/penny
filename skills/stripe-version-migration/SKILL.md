---
name: stripe-version-migration
description: Change Stripe API version or migrate providers without breaking charge math or double-billing customers. Use when bumping the account/SDK API version, migrating subscriptions between systems, or debugging "Invalid Date" / NaN charge amounts / blank dashboards after an upgrade.
model-tier: opus  # migration cutover ordering + shape-contract reasoning — high stakes, double-bill risk
---

# stripe-version-migration

> **Law (JTBD-0):** a 200 OK is not proof the shape is right, and a non-2xx is not proof money didn't move. A breaking change can ship as a *non-error* (fields silently go `undefined`); a 500 can still charge. Own a shape-contract test independent of the SDK, and reconcile by idempotency key — never infer from the status. — `brain/EXPERTISE-MAP.md` JTBD-8 / JTBD-0.

## Trigger

Invoke when ANY of these are true:
- You are bumping the account API version or the `stripe` SDK version.
- You are migrating subscriptions between providers (or onto/off a Merchant-of-Record).
- The symptom is "renews on Invalid Date", "NaN charge amounts", "blank dashboards", or "dropped report rows" after an upgrade.
- A retry-on-error path assumes a non-2xx means the charge didn't happen.

## Version baseline (assume unless told otherwise)

- **API version:** `2026-05-27.dahlia` is current. Acacia (2024-09-30) and Basil (2025-03-31) tutorials are 1–2 breaking releases stale. — `brain/KNOWN-PITFALLS.md` version baseline.
- **Billing mode:** new subscriptions default to **flexible** (since 2025-08-27); existing integrations preserved as **classic** — greenfield ≠ legacy account behavior.
- **Metered:** the legacy usage-records API is gone since Basil; every metered price needs a Meter.

## Steps

Run in order. Each step cites the brain ref it enforces.

1. **Pin the API version and own a shape-contract test independent of the SDK.** The Basil `current_period_end` move shipped as a **non-error**: 200 OK, the field went `undefined` (it moved to `subscription.items.data[0].current_period_end`), and NaN cascaded into charge amounts across every SDK language. SDK *types* don't catch it because the SDK upgrades too. Pin your account/endpoint API version and run a CI contract test asserting "the response shape my business logic reads is correct" (e.g., period-end is a **finite number at the path I access**). — **O-16 / P-16 / S-17** (`brain/OPINIONS.md` O-16, `brain/BATTLE-TESTED-SCENARIOS.md` S-17). This is the headline L1 eval (`penny check-version`).

2. **Read the new item-level path post-Basil.** Don't read `subscription.current_period_end`; read `subscription.items.data[0].current_period_end`. Audit every place the code touches period/renewal fields. — **S-17 / P-16** (`brain/EXPERTISE-MAP.md` 8.1).

3. **Treat a non-2xx as ambiguous — reconcile by idempotency key before retrying.** A payments API can return **HTTP 500 and still charge** (Braintree, twice-annual incidents) and create the recurring subscription. A 500 is **ambiguous, not a failure**. Retry-on-5xx logic must re-query / use an idempotency key before retrying, or it double-charges. — **O-01 / P-18** (`brain/OPINIONS.md` O-01, `brain/KNOWN-PITFALLS.md` P-18).

4. **Migration cutover order: import-first, cancel-old-after, always run-both-and-diff.** Cancelling old subs *before* the live import — or skipping the run-both-and-diff reconciliation window — double-bills customers during cutover. Import live into the new system → run both + diff invoices → cancel the old system only after (Chargebee rule). Carry retries + proration + tax behavior. You generally can't bulk-export raw PANs — let Stripe run the PCI-bound card-data import. — **O-15 / P-20 / S-18** (`brain/OPINIONS.md` O-15, `brain/BATTLE-TESTED-SCENARIOS.md` S-18).

5. **Re-pin `billing_mode` after the move.** A 2026 greenfield sub is flexible-mode; a migrated/legacy account may be classic — and the credit-proration math differs. Pin `billing_mode` in proration tests across the cutover (cross-ref the `subscription-proration` skill, P-17). — **P-17** (`brain/EXPERTISE-MAP.md` 8.5).

6. **Know the MoR migration is organizational, not just technical.** Migrating *to* a Merchant-of-Record offloads global tax but gives up the direct card-network relationship + some data; migrating *off* an MoR suddenly makes you own sales-tax/VAT registration in dozens of jurisdictions. — **field-02 §2** (`brain/EXPERTISE-MAP.md` 8.4).

## Output

A corrected migration plan / version bump (for authoring) or a findings list (for review), each item shaped:
`{ check: <step>, status: pass|fail, brainRef: O-0n|P-0n|S-0n, file:line, fix }`.

- **Authoring:** pin the API version, ship a shape-contract test, read the item-level path, reconcile non-2xx by idempotency key, and order the cutover import-first/cancel-after with a diff window.
- **Review:** code that relies on SDK types (not a contract test) to catch a shape change is a P-16 finding; a retry-on-5xx without re-query is a P-18 finding; a cutover that cancels old subs before import or skips the diff is a P-20/S-18 finding. Cite the brain ref.

## Self-test rig

Stripe **test mode**: `penny check-version` runs the shape-contract assertion at $0 (period-end finite at the read path, version pinned `2026-05-27.dahlia` — S-17). For a migration, stand up both systems against test mode and diff invoices before cutover (S-18).
