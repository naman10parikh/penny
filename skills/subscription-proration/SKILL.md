---
name: subscription-proration
description: Charge the right amount across plan upgrades, downgrades, trial conversions, and dunning without leaking credits or double-charging. Use when changing a subscription's price/quantity, converting a trial, handling a failed renewal, or reviewing proration math.
model-tier: opus  # proration edge cases are subtle (unpaid-invoice twin failures, mode-dependent math) — high-reasoning
---

# subscription-proration

> **Law (JTBD-0):** entitlement and money are derived from a reconciled ledger, never inferred from `subscription.status`. Proration is where two *opposite* leaks hide in the *same* unpaid state — read the invoice's payment status before you touch the plan. — `brain/EXPERTISE-MAP.md` JTBD-2.

## Trigger

Invoke when ANY of these are true:
- You are changing a subscription's price, quantity, or plan (upgrade / downgrade).
- A trial ($0 price) is being converted to a paid price.
- A renewal payment failed and you are deciding entitlement / recovery.
- You are reviewing proration assertions in a test, or the symptom is "unexplained credits", "customer charged twice weeks apart", or "renews on the wrong date after trial."

## Steps

Run in order. Each step cites the brain ref it enforces.

1. **Read the latest invoice's payment status BEFORE mutating.** If the current-period invoice is **unpaid**, set `proration_behavior: none` — default proration would credit unused time on a plan the customer never paid for (a silent giveaway). — **O-05 / P-06 / S-04** (`brain/OPINIONS.md` O-05, `brain/KNOWN-PITFALLS.md` P-06).

2. **Reconcile the OLD open invoice on every mutation.** The inverse failure from the same unpaid state: if you bill the new plan now and leave the old invoice collectible, it later auto-retries (card-updater / customer pays the link) → the customer is charged twice → dispute + chargeback. Void it or explicitly account for it. — **O-05 / P-06 / S-05** (`brain/BATTLE-TESTED-SCENARIOS.md` S-05).

3. **Pin `billing_mode` in every proration test and assert the right mode's math.** Flexible mode (the greenfield default since 2025-08-27) computes credit prorations on the "original amount previously debited," **differing from classic**. A 2024-era (classic) assertion copied into a 2026 sub is subtly wrong; popular wrappers lagged the default (Laravel Cashier #1832). Test BOTH modes; verify wrapper support before trusting it. — **O-06 / P-17 / S-04** (`brain/KNOWN-PITFALLS.md` P-17; `brain/EXPERTISE-MAP.md` 8.5).

4. **Treat upgrade-with-immediate-charge + rollback as application logic, not a Stripe primitive.** There is no clean "charge now, roll back if it declines" semantic (Stripe's own engineer called the status quo "actively broken"). Orchestrate it: preview with the **Upcoming Invoice API**, attempt the explicit invoice payment, and on decline **roll the plan back yourself** — do not rely on auto-retry to fix it. — **S-06** (`brain/BATTLE-TESTED-SCENARIOS.md` S-06; `brain/EXPERTISE-MAP.md` 2.3). *(Whether `pay_now` ever shipped is `brain/GAPS-AND-DISPUTES.md` G-01 — resolve before relying on it.)*

5. **Re-read the billing anchor after trial conversion.** Converting a $0 trial price to non-zero **resets `billing_cycle_anchor` to trial-end**, charges a full interval immediately, and generates no proration. Any date logic that cached the pre-trial anchor (renewal reminders, later proration) is now wrong — recompute all anchor-dependent dates from the canonical object. — **P-07 / S-07** (`brain/KNOWN-PITFALLS.md` P-07).

6. **Manage plan changes with Subscription Schedules, not polling; recreate, don't patch.** Schedules make Stripe the source of truth and kill the race where Stripe invoices before your system syncs the downgrade. **Rebuild** the schedule from scratch on every change (patching leaves stale/archived prices that make the API reject the call); save each change as a distinct DB row/enum; confirm via `customer.subscription.updated`. — **O-10 / S-08** (`brain/OPINIONS.md` O-10, `brain/BATTLE-TESTED-SCENARIOS.md` S-08).

7. **Make the up/down convention an explicit decision per plan, then test it.** Upgrades immediate-prorated, downgrades at period-end (or immediate-with-credit) is a *choice*, not a default — pick one per plan and assert it; for contradictory requests (more seats + lower tier at once) perform the upgrade immediately and schedule the downgrade. — **O-06** (`brain/EXPERTISE-MAP.md` 2.6 / 2.7).

## Output

A corrected mutation (for authoring) or a findings list (for review), each item shaped:
`{ check: <step>, status: pass|fail, brainRef: O-0n|P-0n|S-0n, file:line, fix }`.

- **Authoring:** gate proration on payment status, reconcile the old invoice, pin `billing_mode`, and build the rollback path explicitly.
- **Review:** flag any proration test that does not pin `billing_mode` (caps the cell), any mutation that ignores the latest invoice's payment status, and any date math that caches a pre-trial anchor. Cite the brain ref; uncited generic proration advice is slop.

## Self-test rig

Stripe **test mode**: create a sub with an unpaid invoice, downgrade, and assert no credit is issued (`proration_behavior: none`); convert a trial and assert the anchor reset + immediate full-interval charge. The mode-pin half is an L1 assertion in the eval pyramid (S-04).
