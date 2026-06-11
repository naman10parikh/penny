---
title: "penny KNOWN-PITFALLS — Version-Specific Gotchas (Detection + Avoidance)"
type: synthesis
created: "2026-06-11"
updated: "2026-06-11"
tags: [payments, billing, pitfalls, gotchas, stripe, version-specific, detection, field-intelligence]
sources:
  - "[[Field Intel — Webhook Ordering & Idempotency War Stories]]"
  - "[[Field Intel — Migration War Stories & What 2026 Invalidated]]"
  - "[[Field Intel — Metered / Usage-Based Billing Gotchas]]"
  - "[[Field Intel — SCA / 3DS Flows That Break Conversion]]"
  - "[[Field Intel — Subscription Proration Edge Cases]]"
  - "[[Field Intel — Production Postmortems, HN Threads & Where Experts Disagree]]"
  - "[[penny FIELD-INTELLIGENCE — Index & Synthesis]]"
related: ["[[EXPERTISE-MAP]]", "[[BATTLE-TESTED-SCENARIOS]]", "[[OPINIONS]]"]
summary: "The version-pinned gotcha list. Each pitfall: what it is, the version/condition that triggers it, how to DETECT it (the symptom + the check), and how to AVOID it. Currency: June 2026, Stripe API 2026-05-27.dahlia, flexible billing mode default."
---

# penny KNOWN-PITFALLS

> **What this is.** The trap list. Each entry is **version-specific** where the version matters, and carries a **Detect** line (the observable symptom *and* the proactive check that catches it before prod) and an **Avoid** line. The unifying tell across almost all of them: **the failure is silent** — a 200, an `undefined`, a dropped row, a `status: active` — so the *detection* half is as important as the fix. Sorted roughly by JTBD.

## Version baseline (assume unless a pitfall says otherwise)
- **API version:** `2026-05-27.dahlia` is current. Acacia (2024-09-30) and Basil (2025-03-31) tutorials are 1–2 breaking releases stale. — field-02 §3a.
- **Billing mode:** new subscriptions default to **flexible** (since 2025-08-27); existing integrations preserved as **classic**. Greenfield ≠ legacy account behavior. — field-02 §3b.
- **Metered:** legacy usage-records API removed since Basil; every metered price needs a **Meter**. — field-02 §3c / field-03 §1.

---

### P-01 — Trusting webhook payload/event order
- **What.** Stripe does not guarantee event ordering; retries (exponential backoff, ~3 days) can land an older event after a newer one. — field-01 §0.
- **Detect.** Symptom: entitlements/plan flip to a stale value intermittently and "self-heal" on the next event. Check: grep handlers for direct writes from `event.data.object` on ordering-sensitive fields; add a test that delivers events out of order.
- **Avoid.** On ordering-sensitive logic, **re-fetch the canonical object** from the API; derive state from that + your own paid-through date. → [[BATTLE-TESTED-SCENARIOS]] S-01.

### P-02 — Idempotency row written *after* the side-effect
- **What.** Crash between `grantAccess()` and `INSERT processed_events` ⇒ retry double-fulfills. An `idempotency_keys` table does **not** save you if written second. — field-01 §1a.
- **Detect.** Symptom: rare double seats/credits/shipments correlated with deploys/restarts. Check: is the dedup INSERT in the *same transaction* as the side-effect (or the event id a unique PK)? If not, it's vulnerable.
- **Avoid.** Dedup row + side-effect in **one transaction**, or event id as unique-constraint PK so the second insert fails before any side-effect. → S-02, [[OPINIONS]] O-02.

### P-03 — Returning 200 before processing inline-slow work
- **What.** Slow inline handler → Stripe times out → retries → concurrent duplicate processing. — field-01 §1b.
- **Detect.** Symptom: duplicate side-effects under load; Stripe dashboard shows retries on slow endpoints. Check: handler p95 latency vs Stripe's timeout window.
- **Avoid.** **Acknowledge fast (2xx), process durably** (enqueue). → S-02.

### P-04 — Body-parser mutating the raw webhook body
- **What.** JSON middleware / `req.json()` reserializes the body so HMAC no longer byte-matches what Stripe signed; `constructEvent` fails. Classic Node/Express/Next.js footgun. — field-01 §1c.
- **Detect.** Symptom: *every* webhook 400s with "No signatures found matching." Check: does the route read **raw bytes** (`req.text()` / `express.raw`) with the body parser disabled for that path?
- **Avoid.** Read raw bytes; disable body parsing on the webhook route; never rotate the secret as the first fix (it's almost never the secret). → S-03.

### P-05 — Idempotency key reused or expired
- **What.** Request-side keys are stored/replayed for **24h** only; a retry *after* the window creates a duplicate charge; same key + *different* params returns an error (people scope keys too broadly). — field-01 §2.
- **Detect.** Symptom: duplicate charges on retries that span >24h; "Keys for idempotent requests can only be used with the same parameters" errors. Check: are keys UUID v4, per-logical-operation, and not retried past 24h?
- **Avoid.** UUID v4 per operation; don't retry past the window (re-derive a fresh op + reconcile instead); never reuse a key across different param sets.

### P-06 — Mutating a subscription that has an unpaid invoice
- **What.** Two opposite failures from the *same* state: (a) credit leak — crediting unused time on a plan not yet paid for; (b) double-charge — the old invoice later pays after you billed the new plan. — field-06 §1, §2.
- **Detect.** Symptom: unexplained credits, or customers charged twice weeks apart. Check: before any plan change, query the latest invoice's payment status; flag mutations on subs with an open/unpaid invoice.
- **Avoid.** **Gate proration on payment status** (`proration_behavior: none` when unpaid) AND **reconcile/void the old open invoice** on mutation. → S-04, S-05, [[OPINIONS]] O-05.

### P-07 — Assuming the billing anchor is fixed across trial conversion
- **What.** Converting a $0 trial price to non-zero **resets `billing_cycle_anchor` to trial-end**, charges a full interval immediately, generates no proration. — field-06 §4.
- **Detect.** Symptom: renewal reminders show the wrong date after trial→paid; proration math off post-conversion. Check: does any date logic cache the pre-trial anchor?
- **Avoid.** Re-read the anchor from the canonical object after conversion; expect the immediate full-interval charge. → S-07.

### P-08 — `subscriptionItems.createUsageRecord()` (dead API)
- **What.** Removed since Basil. Any code (or LLM-generated code) calling it is writing against a deleted endpoint; metered prices now require a **Meter** + `v1/billing/meter_events`. — field-03 §1, field-02 §3c.
- **Detect.** Symptom: 404 / deprecation errors on usage reporting; usage never appears on invoices. Check: grep for `createUsageRecord`, `usage_type: 'metered'` without a Meter, and any pre-2025 metered tutorial copy.
- **Avoid.** Use Meters + `meter_events`; treat pre-2025 metered tutorials as poison. → S-09.

### P-09 — Meter event timestamp outside the current period / past 35 days
- **What.** Events must be within the past **35 calendar days** (≤5 min future); events **outside the current billing period are rejected**; **no backfill**; the **~1-hour late grace is not a guarantee**. Batched/late flushes silently drop usage = under-bill. — field-03 §2.
- **Detect.** Symptom: internal usage > Stripe-recorded usage near period boundaries; revenue lower than the internal ledger says. Check: a **daily reconciliation** of internal usage vs `meter-event-summary`, alarmed on divergence; this is *the* canary (staging never crosses a boundary).
- **Avoid.** Send near real-time; treat UTC-midnight-on-anchor-day as a hard flush deadline; reconcile daily. → S-09, [[OPINIONS]] O-06.

### P-10 — Wrong meter aggregation / unit (near-immutable)
- **What.** Configured meters can only change the *display name*; wrong aggregation (sum/count/last_during_period) or unit ⇒ new meter + migrate subscriptions. `event_name` ≤100 chars. — field-03 §3.
- **Detect.** Symptom: invoices undercount/overcount in a way no code change fixes (it's baked into the meter). Check: review aggregation + unit against the *unit of value* before the meter is created; treat the meter name like a public API in review.
- **Avoid.** Decide the unit of value before creating the meter; name it durably. → [[OPINIONS]] O-07.

### P-11 — Expecting clean Stripe-native reports for advanced UBB
- **What.** `billable_items` aren't fully wired into reports; journal entries show the `billable_item` ID as the product ID; product **name comes back empty**. — field-03 §5.
- **Detect.** Symptom: finance/RevRec sees blank product names + opaque IDs in Stripe reports for advanced usage. Check: confirm reporting needs against advanced-UBB report limitations *before* promising a Stripe-dashboard P&L.
- **Avoid.** Keep your own usage ledger as the reporting source of truth for advanced UBB.

### P-12 — Browser-iframe 3DS on mobile (the #1 silent conversion killer)
- **What.** Browser iframe (vs native SDK) loads 3–5s, doesn't fit the viewport, needs pinch-zoom for the OTP field, times out. Mobile conversion 10–15% below desktop. — field-05 §2a.
- **Detect.** Symptom: mobile checkout conversion materially below desktop, concentrated at the challenge step. Check: segment conversion by device + by frictionless-vs-challenge; inspect the mobile challenge surface for viewport fit + load time.
- **Avoid.** Native mobile 3DS2 (well-implemented lands within 5% of desktop). → S-11, [[OPINIONS]] O-04.

### P-13 — Synchronous form validation blocking 3DS fingerprinting
- **What.** 400ms keystroke-triggered validation delays the submission sequence, pushing Method-URL execution past browser idle windows → slow/failed frictionless. — field-05 §2d.
- **Detect.** Symptom: frictionless transactions still slow; checkout-field input feels laggy. Check: measure form-field response time; verify Method-URL fires during method selection, not after validation.
- **Avoid.** Debounce/async-validate; preload the Method URL at method selection (not submission). → S-12.

### P-14 — Entitlement keyed off raw `subscription.status === 'active'`
- **What.** On payment failure Stripe keeps a grace state where `status` still reads usable; `active` can mean "in dunning grace, not actually paid." Abuse vector. — field-07 §4.
- **Detect.** Symptom: users keep access after payment fails; revenue/usage mismatch. Check: grep entitlement gates for naive `status === 'active'`; verify against a *derived paid-through date*.
- **Avoid.** Entitlement keys off your own derived paid-through date, not the raw status. → S-15, [[OPINIONS]] O-03.

### P-15 — Multi-currency tax behavior flip (exclusive ↔ inclusive)
- **What.** USD + CAD tax behavior is **exclusive** (added on top); **all other currencies inclusive** (baked in) by default. A multi-currency catalog silently changes add-on-vs-baked-in. Stripe Tax is also blind to non-Stripe sales + assumes destination-taxable + your preset tax code. — field-00 Appendix.
- **Detect.** Symptom: tax over/under-collected when a new currency is added; thresholds not tracking sales processed elsewhere. Check: assert `tax_behavior` explicitly per price/currency in tests; verify Stripe Tax sees all your sales channels.
- **Avoid.** Set `tax_behavior` explicitly per currency; don't assume uniformity; register where thresholds are crossed. → S-16, [[OPINIONS]] O-14.

### P-16 — Relying on SDK types (not a contract test) to catch a shape change
- **What.** The Basil `current_period_end` move shipped as a **non-error**: 200 OK, fields go **undefined**, NaN cascades into charge amounts — across every SDK language. SDK types don't catch it because the SDK upgrades too. — field-02 §1.
- **Detect.** Symptom: "Invalid Date," blank dashboards, NaN charge amounts, dropped report rows after an API-version or SDK bump. Check: a **CI contract test pinned to your API version** asserting the *response shape your business logic reads* (e.g., "period end is a finite number at the path I access").
- **Avoid.** Own a shape-contract test independent of the SDK; read the item-level path post-Basil. → S-17, [[OPINIONS]] O-01.

### P-17 — Copying classic-mode proration assertions into a flexible-mode account
- **What.** Flexible mode (greenfield default) calculates credit prorations on the "original amount previously debited," **differing from classic**. 2024-era proration assertions are subtly wrong on a 2026 sub. Popular wrappers lagged the default change (Laravel Cashier #1832). — field-02 §3b, field-06 §6.
- **Detect.** Symptom: proration credits off by a small, mode-dependent amount; a wrapper library doesn't expose `billing_mode`. Check: does every proration test **pin `billing_mode`** and assert the correct mode's math? Is the wrapper flexible-aware?
- **Avoid.** Pin `billing_mode` explicitly; test BOTH modes; verify wrapper support before trusting it. → S-04.

### P-18 — Treating a non-2xx as "no money moved"
- **What.** A payments API can return **HTTP 500 and still charge** (Braintree, twice-annual incidents) and create the recurring subscription. A 500 is **ambiguous, not a failure**. — field-07 §2.
- **Detect.** Symptom: customers charged for a "failed" request; duplicate charges after a retry-on-error. Check: does retry-on-5xx logic re-query / use an idempotency key before retrying?
- **Avoid.** On a non-2xx, **reconcile by idempotency key / re-query before retrying**; never assume the charge didn't happen. → [[EXPERTISE-MAP]] JTBD-0 LAW, [[OPINIONS]] O-01.

### P-19 — Treating the processor balance as available cash
- **What.** Holds/reserves freeze 5–7 figures with little transparency — even after a support agent approves payouts, even routing through a *dissolved* entity, even citing no policy. — field-07 §1.
- **Detect.** Symptom: an expected payout doesn't land; "balance will not be made available" with no basis. Check: is there a reserve buffer + a second-processor fallback + a sweep cadence? If a single freeze is existential, you're exposed.
- **Avoid.** Sweep fast; assume a reserve buffer; keep a second processor; pre-write sub-merchant comms. → S-14, [[OPINIONS]] O-13.

### P-20 — Skipping the migration reconciliation diff / wrong cancel order
- **What.** Cancelling old subs *before* the live import, or skipping the run-both-and-diff step, double-bills customers during cutover; imports that drop retries/proration/tax behavior break billing. — field-02 §2.
- **Detect.** Symptom: customers billed by two systems in the cutover window; missing retries/tax post-migration. Check: is the cutover order "import first, cancel old after"? Is there an invoice diff before final cutover?
- **Avoid.** Import → diff → cancel-old-after; carry retries + proration + tax; let Stripe run the PCI card-data import. → S-18, [[OPINIONS]] O-15.

### P-21 — Assuming agent-payment demand justifies a crypto-first architecture
- **What.** ~Half of observed x402 transactions are "gamified" today; merchants are still rare; "the narrative is growing faster than the usage." Building crypto-first for volume that's partly synthetic is premature. — field-04 §3.
- **Detect.** Symptom: architecture bets on agent-to-agent micropayment volume that the data doesn't yet support. Check: does the design *require* x402 volume, or merely *allow* it as an escape hatch?
- **Avoid.** Card-rail SPT (ACP/MPP) as the lower-regret default for a product that also serves humans; x402 as an *optional* permissionless escape hatch. → [[OPINIONS]] O-12, [[GAPS-AND-DISPUTES]] D-02.

---

## Cross-cut: the silent-failure tells (memorize these)
The whole list rhymes — almost every pitfall hides behind a *success-looking* signal. If penny sees any of these, suspect a pitfall above:
- **200 OK** with `undefined`/`NaN`/blank fields → P-16 (shape change), P-18 (charge-on-error twin).
- **`subscription.status === 'active'`** → P-14 (grace-period abuse).
- **A clean staging run that never crossed a period boundary** → P-09 (metered drop).
- **"Frictionless" routing** → P-12/P-13 (still slow).
- **A retry after a deploy/crash** → P-02/P-03/P-05 (double-fulfill / double-charge).
- **A green webhook dashboard** → P-01 ("succeeds for the wrong reason").
