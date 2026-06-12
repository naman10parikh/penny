---
name: metered-billing
description: Turn consumption into invoices without silently dropping usage or shocking the customer with a runaway bill. Use when wiring usage-based pricing, creating a Stripe Meter, reporting meter events, or reviewing metered/usage code (including any code calling the dead createUsageRecord API).
model-tier: opus  # the revenue-leak surface — silent drops pass staging; near-immutable meters; needs careful reasoning
---

# metered-billing

> **Law (JTBD-0):** the meter summary is the ledger; an accepted event is not proof it counted. The whole metered surface fails *silently* — events drop at period boundaries, meters are near-immutable, and a "correct" meter can still produce a business-disaster invoice. — `brain/EXPERTISE-MAP.md` JTBD-3.

## Trigger

Invoke when ANY of these are true:
- You are wiring usage-based / metered pricing, or creating a Stripe Meter.
- Code reports usage (`v1/billing/meter_events`) — or worse, calls `subscriptionItems.createUsageRecord()` (dead since Basil).
- The symptom is "internal usage > Stripe-recorded usage near period boundaries", "usage never appears on invoices", or a usage spec mentions agent/AI consumption billing.
- You are reviewing whether a metered system can run up an unbounded invoice.

## Steps

Run in order. Each step cites the brain ref it enforces.

1. **Meters are mandatory; `createUsageRecord` is a deleted API.** Since `2025-03-31.basil` the legacy usage-records API is gone — every metered price needs a backing **Meter** + `v1/billing/meter_events`. Grep for `createUsageRecord`, for `usage_type: 'metered'` without a Meter, and for any pre-2025 metered tutorial copy; treat all three as poison. — **P-08** (`brain/KNOWN-PITFALLS.md` P-08; `brain/EXPERTISE-MAP.md` 3.1).

2. **Send near real-time; the timestamp rules silently drop usage.** Events must be within the past **35 calendar days** (≤5 min future); Stripe **rejects events outside the current billing period** and does **not** backfill; the ~1-hour late grace is **not a guarantee**. A nightly batch whose flush crosses a period boundary silently under-bills — and staging never crosses a boundary, so every test passed. Treat UTC-midnight-on-the-anchor-day as a hard flush deadline. — **P-09 / S-09** (`brain/KNOWN-PITFALLS.md` P-09, `brain/BATTLE-TESTED-SCENARIOS.md` S-09).

3. **Reconcile daily against `meter-event-summary`; alarm on divergence.** Keep your own usage ledger and diff it against Stripe's `meter-event-summary` every day — this is *the* canary for the silent drop in step 2 (staging can't catch it). — **O-06 / S-09** (`brain/OPINIONS.md` O-06; `brain/EXPERTISE-MAP.md` 3.6).

4. **Name the meter like a public API; decide the unit of value before creating it.** Configured meters can only change their *display name* — wrong aggregation (`sum` / `count` / `last_during_period`) or wrong unit forces a brand-new meter + a subscription migration (the exact pain you were avoiding). `event_name` ≤100 chars. Review aggregation + unit against the unit of value *before* the meter exists. — **O-07 / P-10** (`brain/OPINIONS.md` O-07, `brain/KNOWN-PITFALLS.md` P-10). penny's `meter create` **refuses to re-create** an existing meter for this reason.

5. **Bill-shock is a product failure — cap, warn before money moves, degrade gracefully.** A silent $40k invoice is "technically correct and a business disaster" + a likely chargeback. Set **billing thresholds + usage alerts**; on hitting a cap, degrade (cheaper model / queue runs / require human approval) instead of billing through. Warn *before* money moves, not after. — **O-08 / S-10** (`brain/OPINIONS.md` O-08, `brain/BATTLE-TESTED-SCENARIOS.md` S-10).

6. **Don't promise a clean Stripe-native P&L for advanced UBB.** `billable_items` aren't fully wired into reports — journal entries show the `billable_item` ID as the product ID and the product name comes back empty. Keep your own usage ledger as the reporting source of truth for advanced usage. — **P-11** (`brain/KNOWN-PITFALLS.md` P-11; `brain/EXPERTISE-MAP.md` 3.5).

## Output

A corrected metered integration (for authoring) or a findings list (for review), each item shaped:
`{ check: <step>, status: pass|fail, brainRef: O-0n|P-0n|S-0n, file:line, fix }`.

- **Authoring:** emit Meters + `meter_events` (never `createUsageRecord`), a near-real-time flush, a daily reconciliation against `meter-event-summary`, and a billing-threshold cap with graceful degrade.
- **Review:** any `createUsageRecord` call is a HIGH finding (P-08, dead API → exit non-zero); a batch flush with no daily reconcile is a revenue-leak finding (P-09/S-09); an uncapped metered agent is a bill-shock finding (O-08/S-10). Cite the brain ref.

## Self-test rig

Stripe **test mode**: create a Meter, push a `meter_event` with a timestamp just past a period boundary, and assert the drop is caught by the daily reconcile against `meter-event-summary` (S-09). `penny meter create` self-tests the immutability refusal (re-create same name → refused, O-07/P-10).
