---
title: "penny EXPERTISE-MAP — What the Payments Employee Must Master"
type: synthesis
created: "2026-06-11"
updated: "2026-06-11"
tags: [payments, billing, expertise-map, jobs-to-be-done, stripe, agent-payments, taste]
sources:
  - "[[Field Intel — Webhook Ordering & Idempotency War Stories]]"
  - "[[Field Intel — Migration War Stories & What 2026 Invalidated]]"
  - "[[Field Intel — Metered / Usage-Based Billing Gotchas]]"
  - "[[Field Intel — Agent Payments: Who Holds the Token, Scoped Spend]]"
  - "[[Field Intel — SCA / 3DS Flows That Break Conversion]]"
  - "[[Field Intel — Subscription Proration Edge Cases]]"
  - "[[Field Intel — Production Postmortems, HN Threads & Where Experts Disagree]]"
  - "[[penny FIELD-INTELLIGENCE — Index & Synthesis]]"
related: ["[[BATTLE-TESTED-SCENARIOS]]", "[[KNOWN-PITFALLS]]", "[[OPINIONS]]", "[[TOOL-MATRIX]]", "[[GAPS-AND-DISPUTES]]"]
summary: "The structured map of everything penny (payments/billing product-side employee) must master, organized by job-to-be-done. Each node cites its raw source and links to the scenario/pitfall/opinion that makes it dangerous in production."
---

# penny EXPERTISE-MAP

> **How to read this.** Organized by **job-to-be-done (JTBD)**, not by tool — because a payments engineer who "knows Stripe" but can't reconcile a held payout is useless, and one who's never touched the API but understands "a 500 may have charged" is dangerous in the right way. Every node states *what it is*, *why it bites*, and *where the proof lives* (raw file + the scenario/pitfall it generates). The source-of-truth currency is **June 2026, Stripe API `2026-05-27.dahlia`, flexible billing mode default.**
>
> A fresh Claude session that reads this file + the five sibling brain docs should be able to design, review, and debug a billing surface for an agent platform **without re-deriving the gotchas from scratch.**

## JTBD-0 — The meta-discipline (read this first; it governs every node below)
The corpus collapses to one law and four corollaries. They are the lens; everything else is application.

- **THE LAW: the ledger is the truth, not the status code.** A non-2xx may have moved money (Braintree returned HTTP 500 *and* charged — field-07 §2). A 200 webhook may have processed nothing (field-01 §1). A 200 with `undefined` fields silently broke charge math (Basil, field-02 §1). → Never infer "money moved" / "money didn't move" from a transport status. Reconcile against an idempotent ledger.
  - Source: field-07 §2, field-01 §1, field-02 §1.
- **Corollary A — re-fetch the canonical object; never trust payload or event order.** Stripe does not guarantee webhook ordering and *retries reorder* (field-01 §0). Entitlement keys off *your* derived paid-through date, not the raw `subscription.status` (field-07 §4).
- **Corollary B — idempotency record + side-effect in ONE transaction.** Otherwise crash-between = double-fulfill (field-01 §1a). Energy's helios ledger does exactly this (field-01 §3).
- **Corollary C — sync Stripe into your own DB as the entitlement source of truth.** Pure-webhook and pure-poll are both wrong; the synthesis is a webhook-fed, periodically-reconciled local materialized view (field-07 §3). Mind the **100 rp/s** API limit (field-07 §3).
- **Corollary D — the processor balance is not your cash.** Holds/reserves freeze 5–7-figure sums with little transparency (field-07 §1). Design reserve buffers + fast sweeps + ideally a second processor.

→ Taste stances derived from this: see [[OPINIONS]] §1–§9. Disputes about it: see [[GAPS-AND-DISPUTES]].

---

## JTBD-1 — Receive a payment reliably (webhooks + idempotency)
**The job:** know, for certain and exactly once, that money moved — across retries, reorders, crashes, and ambiguous transport errors.

- **1.1 Webhook ordering is not guaranteed.** `invoice.payment_succeeded` can arrive before *or* after `customer.subscription.updated`; a retried older event can land after a newer one. Re-fetch on ordering-sensitive logic. — field-01 §0. → scenario S-01, pitfall P-01.
- **1.2 "Succeeds for the wrong reason" is the #1 real incident.** Returning 200 before processing, double-processing a retry, missing an event on upstream timeout — each sits undetected for *weeks*. — field-01 §1 (digitalapplied, "30+ integrations"). → scenario S-02.
- **1.3 Same-transaction idempotency.** Insert the dedup row *inside the same DB transaction* as the side-effect, or use the event id as a unique-constraint PK and let the second insert fail. Writing the dedup row *after* the work = double-fulfill on crash-between. — field-01 §1a. → scenario S-02, pitfall P-02, opinion O-02.
- **1.4 Acknowledge fast, process durably.** Return 2xx within the timeout, enqueue the real work; inline-slow handlers get timed-out and retried into concurrent duplicates. — field-01 §1b. → pitfall P-03.
- **1.5 Raw-body HMAC footgun.** Signature is computed over raw bytes; any JSON re-serialization (body-parser, `req.json()`) breaks `constructEvent`. Next.js App Router needs `await req.text()` + body-parser disabled. — field-01 §1c. → scenario S-03, pitfall P-04.
- **1.6 Request-side idempotency keys.** Stored + replayed for **24h**; UUID v4; same key + different params = error; a retry *after* the window creates a duplicate charge. — field-01 §2 (Stripe API ref). → pitfall P-05.
- **1.7 At-least-once consumer + DLQ + replay is 2026 table-stakes** (2025 guides stopped at "verify the signature"). — field-01 §4. → opinion O-09.
- **1.8 The copyable in-house pattern.** Energy helios `funding/state.ts`: dedup on txn id at the pure layer, append-only ledger, *derived* balance (no settable field), HMAC-verified, idempotent disk write, side-effect gated on the dedup'd transition. — field-01 §3. → opinion O-02.

## JTBD-2 — Bill a subscription (lifecycle + proration)
**The job:** charge the right amount at the right time across upgrades, downgrades, trials, and dunning — without leaking credits or double-charging.

- **2.1 The unpaid-invoice credit leak.** Changing a sub *while a current-period invoice is unpaid* can credit unused time on the higher plan the customer never paid for. Mitigate: `proration_behavior: none` when latest invoice is unpaid. — field-06 §1. → scenario S-04, pitfall P-06, opinion O-05.
- **2.2 The double-charge-on-late-pay.** Same unpaid state, inverse failure: bill the new plan now → the *old* invoice later gets paid (auto-retry / card-updater) → customer paid twice. Reconcile/void the old open invoice on any mutation. — field-06 §2. → scenario S-05, pitfall P-06.
- **2.3 Upgrade-with-immediate-charge + rollback is not a clean primitive.** The "charge now, roll back if it declines" semantic everyone wants is orchestrated manually (upcoming-invoice preview + explicit invoice pay + your own rollback). Stripe's own engineer called the status quo "actively broken." — field-06 §3 (api-discuss, Jim Danz). → scenario S-06, gap G-01 (did `pay_now` ever ship?).
- **2.4 Trial-conversion resets the billing anchor.** Subscribing to a $0 price then moving to non-zero *resets `billing_cycle_anchor` to trial-end*, charges full interval immediately, generates no proration. Anchor-dependent renewal math breaks if you assumed it stayed fixed. — field-06 §4. → scenario S-07, pitfall P-07.
- **2.5 Manage plan changes with Subscription Schedules, not polling.** Schedules make Stripe the source of truth and kill the race where Stripe invoices before your system syncs the change. Recreate schedules on every change (patching = stale-price bugs). Save each change as a distinct DB row/enum. — field-06 §5 (Stigg). → opinion O-10, scenario S-08.
- **2.6 Convention is a *decision*, not a default.** Upgrades immediate-prorated (Zoom/Productboard); downgrades at period-end (Zoom/GitHub) *or* immediate-with-credit (Slack/Notion). Pick one explicitly per plan and test it. — field-06 §5. → opinion O-06.
- **2.7 Contradictory requests** (more seats + lower tier at once): perform upgrades immediately, schedule downgrades for later, cancel the irrelevant downgrade. — field-06 §5.
- **2.8 Failed-renewal recovery is partly automatic.** Updating the default card auto-retries the latest unpaid, unclosed invoice per subscription — but the rollback semantics are still yours to build. — field-06 §3.

## JTBD-3 — Bill usage / metered (the revenue-leak surface)
**The job:** turn consumption into invoices without silently dropping usage or shocking the customer.

- **3.1 Meters are mandatory; `createUsageRecord` is dead.** Since `2025-03-31.basil` the legacy usage-records API is gone — every metered price needs a backing **Meter**; current path is `v1/billing/meter_events`. Any pre-2025 metered tutorial is poison. — field-03 §1, field-02 §3c. → pitfall P-08, scenario S-09.
- **3.2 The timestamp rules that silently drop usage.** Events must be within the past **35 calendar days** (or ≤5 min future); Stripe **rejects events outside the current billing period** and **does not backfill** prior months; the **~1-hour late grace is "not a guarantee."** Batch a flush past the period boundary → silent under-bill, no retroactive fix. — field-03 §2. → scenario S-09, pitfall P-09, opinion O-06.
- **3.3 Meters are near-immutable — name them like a public API.** Only the display name is mutable; wrong aggregation (sum vs count vs last_during_period) or wrong unit ⇒ new meter + migrate subs. `event_name` ≤100 chars. Decide the unit of value before creating the meter. — field-03 §3. → pitfall P-10, opinion O-07.
- **3.4 Bill-shock is a *product* failure, not an engineering one.** A silent $40k invoice is "technically correct and a business disaster." Surface a cap, then degrade gracefully: cheaper model, queued runs, human approval — use billing thresholds + usage alerts. — field-03 §4. → opinion O-08, scenario S-10.
- **3.5 Reporting gaps for advanced UBB.** `billable_items` aren't fully wired into reports; journal entries show the `billable_item` ID as the product ID, product *name* comes back empty. Don't promise a clean Stripe-native P&L for advanced usage; keep your own usage ledger as reporting source of truth. — field-03 §5. → pitfall P-11.
- **3.6 Reconcile daily against the meter-event-summary.** Send events near real-time; diff your internal usage ledger vs Stripe's `meter-event-summary` daily; alarm on divergence; treat UTC-midnight-on-anchor-day as a hard flush deadline. — field-03 §2. → opinion O-06, scenario S-09.
- **3.7 AI-usage metering is now a first-class Stripe Billing primitive (2026)** — "turning AI activity into billable financial events." Directly on-thesis for self-paying compute. — field-03 §6.

## JTBD-4 — Convert at checkout under SCA/3DS (UX-performance in a compliance costume)
**The job:** authenticate when required without bleeding conversion — by treating it as a latency/UX problem, not a yes/no compliance gate.

- **4.1 Implementation quality > authentication quantity.** France challenges ~2× the EEA rate yet keeps high success + conversion *because it's optimized*; Japan's 2025 mandate hit 93% conversion / 60% frictionless / disputes −30%. — field-05 §1 (Stripe). → opinion O-04.
- **4.2 The mobile-iframe timeout is the #1 silent killer.** Browser iframes (vs native SDKs) load 3–5s, don't fit the viewport, need pinch-zoom for the OTP field, time out before completion. Native, well-implemented mobile 3DS lands within 5% of desktop; poor mobile is 10–15% below. — field-05 §2a. → scenario S-11, pitfall P-12.
- **4.3 "Frictionless" ≠ fast — preload the Method URL.** Invoke the 3DS Method URL **during payment-method selection, not at submission**; complete device fingerprinting; cut frictionless completion from 3–5s to <1s. — field-05 §2b. → scenario S-12, opinion O-04.
- **4.4 Thin risk data forces challenges — send 150, not 30.** Most merchants send 20–30 of 150+ data elements; without account age / history / behavioral signals, issuers default to challenge. Richer risk data is the cheapest conversion win (challenge → frictionless). — field-05 §2c. → opinion O-04, scenario S-12.
- **4.5 Synchronous form validation blocks fingerprinting.** 400ms keystroke-validation delays push Method-URL execution past browser idle windows. — field-05 §2d. → pitfall P-13.
- **4.6 A fast challenge can beat a slow frictionless flow.** Perceived responsiveness > visible-vs-invisible auth. Poorly-optimized frictionless took 45s (abandon); native-biometric challenge 28s (convert). 100ms button-state change creates perceived responsiveness independent of backend latency. — field-05 §3. → opinion O-04, dispute D-05.
- **4.7 Exemptions trade conversion for liability.** TRA/low-value/trusted-beneficiary exemptions skip the challenge but **forfeit the liability shift** if honored and fraud occurs. Interpretation varies by issuer/market. — field-05 §4. → gap G-06.
- **4.8 ML routing is replacing hand-tuned exemption rules (2026).** Stripe's adaptive auth claims +1.20% conversion / −7.67% fraud. — field-05 §5.

## JTBD-5 — Let an agent pay (the on-thesis core: who holds the token, scoped spend)
**The job:** give an agent the ability to spend money with bounded blast radius — the payments-equivalent of "least agency." This is penny's reason to exist on an agent platform.

- **5.1 Shared Payment Tokens (SPT) — the agent never sees the card.** An SPT is a scoped grant the customer authorizes: (1) usable only at a **specific seller**, (2) **caps total spend**, (3) **expires at a fixed time**. Meaningless outside its narrow scope. — field-04 §1 (RisingWave/Stripe). → opinion O-11, scenario S-13.
- **5.2 The network layer mirrors the scope.** Stripe provisions an agentic network token (Mastercard/Visa) "scoped to the customer's intent." — field-04 §1 (Stripe blog).
- **5.3 The protocol zoo — complementary layers, different bets.** ACP (OpenAI+Stripe, card-via-SPT, checkout), MPP (Stripe+Tempo, session-aggregated high-frequency, SPT), x402 (Coinbase+Cloudflare, USDC over HTTP 402, **agent self-custodies wallet keys**), AP2 (Google, card/FIDO "Human Not Present", mandate-based), UCP (NVIDIA-ref, merchant-controlled negotiation). — field-04 §2. → TOOL-MATRIX §Agent-Payment-Rails, dispute D-02.
- **5.4 The "who holds the token" fork is real, not solved.** x402 = agent holds wallet keys (self-custody risk, compliance *your* responsibility, setup minutes). MPP = Stripe holds via SPT (Radar/tax/reporting built-in, setup hours). Not mutually exclusive — pick per use-case like compute infra. — field-04 §3 Side A (WorkOS). → opinion O-11.
- **5.5 Demand is partly a mirage today (sharpest dispute).** Artemis analyst: the x402 "boom is still mostly a mirage," ~half of transactions "gamified" (wash/self-dealing); merchants still rare. Bulls (Coinbase's Reppel): "as teams move to production these percentages should naturally decline" + 69k active agents / 165M tx / ~$50M cumulative. — field-04 §3 Side B/C. → dispute D-02, opinion O-12.
- **5.6 Lower-regret default: card-rail SPT (ACP/MPP) for a product that also serves humans; x402 as the optional permissionless escape hatch.** Build scoped-credential + ledger primitives now (also just good hygiene); don't assume agent-to-agent micropayment volume justifies a crypto-first architecture yet. — field-04 §3 penny read. → opinion O-12.
- **5.7 Governance is consolidating.** x402 Foundation under the Linux Foundation (2026-04-02), 22 launch members incl. Adyen/AWS/Amex/Base/Circle/Fiserv/Google/Mastercard/Microsoft/Shopify/Stripe/Visa. Stripe is a founding member *and* ships MPP (hedges across rails). Amazon Bedrock AgentCore payments wraps both. Visa TAP + ACP both added x402. — field-04 §4.
- **5.8 Energy already owns the spend-side; penny owns the product-side.** helios = spend ledger + caps + per-agent Stripe Issuing virtual card + chairman-visible P&L; quartermaster = the tool catalog (`eval_score≈1.0`). penny's value-add = **SPT issuance/scoping flows, the consent UX ("issue this agent $X at seller Y until Z"), and reconciliation between the agent's internal ledger and the provider's record.** — field-04 §5. → scenario S-13.

## JTBD-6 — Survive the platform (holds, reconciliation, sync-vs-webhooks)
**The job:** stay solvent and consistent when the processor freezes funds, reorders events, or rate-limits you.

- **6.1 Fund holds / reserves are an existential, recurring reality.** Stripe HK withheld ~$12k via a *dissolved* entity even after approving payouts (field-07 §1a); ~$85k withheld from an EU platform with no policy cited (§1b); $1.45M frozen through a bankruptcy until Feb 2026 (§1c). "Tens of thousands held indefinitely with very little transparency." — field-07 §1. → scenario S-14, opinion O-13.
- **6.2 Design around the hold.** Faster sweeps to your own bank; reserve-buffer assumption; ideally a second processor so a freeze isn't existential; clear sub-merchant comms when *you* are the platform-of-record (Connect). — field-07 §1. → opinion O-13.
- **6.3 The webhooks-vs-sync schism — and its resolution.** Side A: payments shouldn't be modeled as event-driven (direct state queries / Shopify model); "no-webhooks" tools exist. Side B: payments *are* async (disputes, delayed success) so webhooks are correct. Honesty footnote: "no-webhooks" almost always means "we run the consumer for you." — field-07 §3. → dispute D-01, opinion O-09.
- **6.4 The resolution (the durable design).** (1) consume webhooks at-least-once → (2) write to your own DB as the entitlement source of truth → (3) reconcile via periodic API pull to catch missed/late/out-of-order events → (4) always re-fetch the canonical object on ordering-sensitive logic. Backstopped by the **100 rp/s** limit that kills naive polling. — field-07 §3. → opinion O-09.
- **6.5 The grace-period abuse vector.** On payment failure Stripe keeps the sub in a grace state where `status` still reads usable ("active"/"past_due"-but-usable) — "bad actors have been abusing your software." Entitlement must key off *your* derived paid-through date, not a naive `status === 'active'`. — field-07 §4. → scenario S-15, pitfall P-14, opinion O-03.

## JTBD-7 — Tax, currency & compliance (the silent correctness surface)
**The job:** charge the legally-correct amount across currencies and jurisdictions — a correctness *and* compliance bug class, not a nice-to-have.

- **7.1 Tax behavior flips by currency.** USD + CAD tax behavior is **exclusive** (added on top); **all other currencies inclusive** (baked in). A multi-currency catalog can silently change add-on-vs-baked-in. — field-00 Appendix. → scenario S-16, pitfall P-15, opinion O-14.
- **7.2 Registration thresholds vary wildly and are *your* duty to act on.** US remote-seller from $100k/200 txns (most states) to $500k (CA/NY/TX); EU from €0 (Spain) to £90k (UK). Stripe Tax tracks but you must register. — field-00 Appendix.
- **7.3 Stripe Tax is blind to non-Stripe sales.** It only sees Stripe-processed (or imported) sales, assumes your preset tax code + destination-taxable. Process elsewhere → threshold tracking is blind. — field-00 Appendix. → pitfall P-15.
- **7.4 Multi-currency settlement trades FX fees for reconciliation complexity.** Multiple settlement currencies → multiple payout streams to reconcile. — field-00 Appendix.

## JTBD-8 — Migrate (providers + API versions) without double-billing
**The job:** change provider or Stripe API version without breaking charge math or billing customers twice.

- **8.1 The Basil `current_period_end` move is the canonical migration postmortem.** Field moved from `subscription.*` to `subscription.items.data[0].*` (2025-03-31). Symptoms: "renews on Invalid Date," blank dashboards, NaN-cascading charge amounts, dropped report rows — across *every SDK language* (Ruby unaffected). Endpoint still returned **200 OK**; accessed fields just came back **undefined**. — field-02 §1. → scenario S-17, pitfall P-16, opinion O-01.
- **8.2 The defense is a contract test, not SDK types.** SDK types upgrade with the SDK, so they don't catch a shape change. Assert the *response shape your business logic reads*, pinned to your API version, in CI. — field-02 §1. → opinion O-01, eval L1.
- **8.3 Cutover order prevents double-billing.** Cancel subs in the OLD system **only after** the live import into the new one (Chargebee rule); run both + diff invoices (reconciliation period) before final cutover; you generally can't bulk-export raw PANs (PCI) — Stripe runs the card-data import. — field-02 §2. → scenario S-18, opinion O-15.
- **8.4 Merchant-of-Record migration is an *organizational* change.** Migrating *to* an MoR (Paddle/Lemon Squeezy/Dodo) offloads global tax but gives up the direct card-network relationship + some data; migrating *off* an MoR suddenly makes you own sales-tax/VAT registration in dozens of jurisdictions. — field-02 §2. → TOOL-MATRIX §Processors-and-MoR.
- **8.5 Flexible billing mode is the DEFAULT (since 2025-08-27) and changes proration MATH.** New subs get `flexible` (credit prorations based on "original amount previously debited"); existing integrations preserved as `classic`. A 2026 greenfield diverges from a 2024 codebase on the *same* account. Pin `billing_mode` in every proration golden-test; test both modes. Popular wrappers lagged (Laravel Cashier #1832). — field-02 §3b, field-06 §6. → opinion O-06, pitfall P-17, dispute (none — confirmed), scenario S-04.
- **8.6 Webhook payload shape is tied to the endpoint's API version.** Upgrading the account API version can change payload shape and break parsers assuming 2025 fields (thin vs snapshot events). — field-01 §4.

---

## Coverage / honesty note (fable gate)
Every node above is backed by a verbatim-quoted, URL-and-date-stamped raw source — this is **not** a Wikipedia summary; it's the scenario-grounded distillation. The thin spots are *explicitly* carried into [[GAPS-AND-DISPUTES]] rather than papered over: the Dahlia byte-level diff (G-02), the late-but-within-35-days meter case (G-03), `pay_now` rollback's fate (G-01), SPT revocation semantics (G-04), ACP-vs-MPP for subscription-plus-usage (G-05). The one acknowledged research hole is **live X/Twitter topical signal** (the SearchTimeline `doc_id` 404'd — field-00 §X-note); coverage leans on HN threads, GitHub repos/issues, Stripe changelog/docs, and practitioner blogs, which for *this* vertical is the higher-signal corpus anyway.
