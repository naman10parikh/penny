---
title: "Field Intel — INDEX & Cross-Cutting Synthesis (penny payments)"
type: synthesis
created: "2026-06-11"
updated: "2026-06-11"
tags: [payments, billing, index, synthesis, taste, gaps-and-disputes, field-intelligence]
sources: ["field-01..07 (this folder)", "internal: energy helios funding + checklist Payments"]
summary: "Index of the field-* corpus + the cross-cutting taste, the 2026-invalidates-2025 list, the consolidated disputes feed, and a Stripe-Tax appendix."
related: ["[[Field Intel — Webhook Ordering & Idempotency War Stories]]", "[[Field Intel — Agent Payments]]"]
---

# penny FIELD-INTELLIGENCE — Index & Synthesis

> Researcher: FIELD-INTELLIGENCE (CP123 Wave-R). Domain: Payments / billing, product side. June-2026 currency.
> Every claim in the linked files carries a URL + date (and author for HN/X). This file is the map + the distilled judgment.

## Files in this corpus (all under `brain/research/raw/`)
1. `field-01-webhooks-idempotency.md` — webhook ordering not guaranteed; "succeeds for the wrong reason"; same-transaction dedup; raw-body HMAC footgun. (~95 lines)
2. `field-02-migration-and-2026-changes.md` — Basil `current_period_end` move war story; flexible-mode default; usage-records removal; Dahlia is current; MoR migration org-pain. (~75 lines)
3. `field-03-metered-billing-gotchas.md` — Meter migration; 35-day/5-min/no-backfill timestamp rules (silent usage drop); immutable meters; bill-shock; report gaps. (~70 lines)
4. `field-04-agent-payments.md` — SPT (agent never sees card); the ACP/MPP/x402/AP2/UCP zoo; "who holds the token" fork; the demand-mirage dispute. (~95 lines)
5. `field-05-sca-3ds-conversion.md` — implementation-quality-not-quantity; mobile iframe 3-5s timeout; Method-URL preloading; 20-30/150 risk data; "challenge can beat frictionless." (~75 lines)
6. `field-06-proration-edge-cases.md` — unpaid-invoice credit leak; double-charge-on-late-pay; upgrade rollback "actively broken"; subscription-schedules > polling; trial anchor reset. (~80 lines)
7. `field-07-postmortems-and-disputes.md` — Stripe fund holds ($12k/$85k/$1.45M); Braintree "charged on HTTP 500"; the webhooks-vs-sync schism (both sides verbatim); grace-period abuse. (~95 lines)
8. `field-00-INDEX-and-synthesis.md` — this file. (~120 lines)

## THE CROSS-CUTTING TASTE (what great payments engineers do that average ones don't)
Distilled from the verbatim quotes across the corpus:

1. **A non-2xx (or a 200) is not the truth — the ledger is.** A 500 may have charged (Braintree, field-07). A 200 webhook may have processed nothing (field-01). `undefined` fields still return 200 (Basil, field-02). → Reconcile against an idempotent ledger; never infer money-moved from a status code.
2. **Re-fetch the canonical object; never trust payload/event order.** Stripe does not guarantee ordering and retries reorder (field-01). Entitlement keys off *your* derived paid-through date, not `subscription.status` (field-07 grace-period abuse).
3. **Idempotency record + side-effect in ONE transaction.** Otherwise crash-between = double-fulfill (field-01). Energy's helios ledger does exactly this (dedup on txn id at the pure layer, side-effect gated on the dedup'd transition).
4. **Conversion is a UX-performance problem in a compliance costume.** Preload the 3DS Method URL, send 150 not 30 risk fields, make the button respond in 100ms — a fast challenge beats a slow frictionless flow (field-05).
5. **Gate proration on payment status; reconcile the OLD invoice on any change.** Unpaid-invoice changes leak credits or double-charge (field-06).
6. **Send usage in real-time and reconcile to the meter summary daily.** The 35-day/period-boundary rules silently drop late usage = revenue leak that passes staging (field-03).
7. **The processor balance is not your cash.** Holds/reserves freeze five-/six-/seven-figure sums with little transparency; design reserve buffers, fast sweeps, and ideally a second processor (field-07).
8. **The agent holds a scoped/capped/expiring credential, never raw PAN or an unbounded key.** SPT + balance-cap = payments "least agency" (field-04).
9. **Sync Stripe into your own DB as the entitlement source of truth.** Pure-webhook and pure-poll are both wrong; the synthesis is a webhook-fed, periodically-reconciled local view (field-07 schism resolution). Watch the 100 rp/s API limit.

## WHAT 2026 INVALIDATED (consolidated — the headline deliverable)
- **API is `2026-05-27.dahlia`** — Acacia (2024) and even Basil (2025) tutorials are stale. (field-02)
- **Flexible billing mode is DEFAULT** (since 2025-08-27) → proration/trial/usage math differs from classic; greenfield ≠ legacy account behavior. (field-02, field-06)
- **`current_period_start/end` moved to subscription ITEMS** (Basil) → any `subscription.current_period_end` access returns `undefined` with a 200 → Invalid Date / NaN charges. (field-02)
- **Legacy usage-records API removed** → every metered price needs a backing **Meter**; `createUsageRecord` is dead. (field-02, field-03)
- **Agentic payments are a brand-new layer** (SPT/ACP/MPP/x402/AP2/UCP) that did not exist in 2025; x402 Foundation now under Linux Foundation (2026-04-02). (field-04)
- **AI-usage metering primitives** shipped in Stripe Billing 2026 (on-thesis for self-paying compute). (field-03)
- **3DS in newly-mandated markets (Japan 2025)** shows the dip-then-recover pattern → a 2025 "3DS kills conversion" datapoint from a fresh market is misleading once optimized. (field-05)

## CONSOLIDATED GAPS-AND-DISPUTES FEED (for the GAPS-AND-DISPUTES doc)
### Where credible sources DISAGREE (both sides captured verbatim in the files)
- **Webhooks vs sync/polling for payment state** (field-07): dxdm "payments are event-driven in reality… webhooks are great for that" vs agreeahmed "shouldn't be modeled as an events-driven domain" + prasoonds "you don't have to figure out which webhooks." Synthesis: local synced DB.
- **Agent-payment demand: real vs mirage** (field-04): Artemis analyst "the x402 agent-payments boom is still mostly a mirage… half the transactions are gamified" vs Coinbase's Erik Reppel "as teams move to production these percentages should naturally decline" + 165M tx / $50M cumulative.
- **Cards need webhooks at all** (field-07): lmz "cards don't really need webhooks unless you get into 3ds" vs dxdm (disputes/delayed success need them).
- **"No-webhooks" honesty** (field-07): bigtones "it's totally using webhooks" vs prasoonds "the user does not have to deal with the webhooks."
- **Frictionless vs challenge** (field-05): conventional "avoid the challenge for conversion" vs Germain UX "a well-implemented challenge can beat a poorly-implemented frictionless flow."

### Things I could NOT confirm (open questions to resolve before relying on them)
1. **Did Stripe ever ship the `pay_now` upgrade-rollback parameter** Jim Danz promised, or is upgrade+failed-payment rollback STILL orchestrated manually in 2026? (field-06) — HIGH VALUE.
2. **The exact Dahlia (2026-05-27) breaking-change list** — not byte-verified from the canonical Dahlia changelog; crawl https://docs.stripe.com/changelog/ before trusting Dahlia specifics. (field-02)
3. **Late-but-within-35-days meter event after the period invoice finalized** — does it roll forward or drop? Ambiguous in secondary sources; needs a live test or canonical-docs read. (field-03)
4. (Bonus open items live in each file's §"OPEN / COULD-NOT-CONFIRM".)

## APPENDIX — Stripe Tax / multi-currency gotchas (rounding out the vertical)
Source: Stripe Tax docs 2026 — https://docs.stripe.com/tax/how-tax-works , https://docs.stripe.com/payouts/multicurrency-settlement , https://docs.stripe.com/tax/products-prices-tax-codes-tax-behavior
- **Tax behavior flips by currency:** for **USD and CAD tax behavior is exclusive**; for **all other currencies it's inclusive.** A multi-currency catalog can silently change whether tax is added-on vs baked-in. (Real trap.)
- **Registration thresholds vary wildly:** US remote-seller from **$100k / 200 txns** (most states) to **$500k (CA, NY, TX)**; EU from **€0 (Spain)** to **£90k (UK)**. Stripe Tax tracks these but you must act on the registration.
- **Stripe Tax only sees Stripe-processed (or imported) sales**, assumes your preset tax code, and assumes destination-taxable. If you process anywhere else, your threshold tracking is blind to it.
- **Multi-currency settlement** avoids FX fees but adds reconciliation complexity (multiple settlement currencies → multiple payout streams to reconcile).
- penny takeaway: tax is a *correctness + compliance* surface, not a nice-to-have; the inclusive/exclusive-by-currency flip is the kind of silent bug that ships to prod.

## NOTE ON X/TWITTER SIGNAL (per HARD RULE 6)
Attempted via energy's `scripts/x-content-intel/scrape.py --search` using `~/.claude/x-auth/x-session.json`. The session authenticated, but the **SearchTimeline GraphQL `doc_id` (MJpyQGqgklrVl_6rYKQbow) returned HTTP 404** — X rotated the query id, so topical search is currently unavailable from this session (the bookmark fetcher targets Naman's *own* bookmarks, not a topical billing query, so it was not a fit). **X signal SKIPPED**; coverage relies on HN threads, GitHub repos/issues, Stripe changelog/docs, and practitioner blogs via WebSearch/WebFetch, per the fallback clause. To revive X search: refresh the SearchTimeline doc_id in `scrape.py`.
