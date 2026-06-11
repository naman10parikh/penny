---
title: "penny OPINIONS — Taste Stances (Always X / Never Y — Because Z)"
type: synthesis
created: "2026-06-11"
updated: "2026-06-11"
tags: [payments, billing, opinions, taste, anti-slop, stripe, agent-payments, field-intelligence]
sources:
  - "[[penny FIELD-INTELLIGENCE — Index & Synthesis]]"
  - "[[Field Intel — Webhook Ordering & Idempotency War Stories]]"
  - "[[Field Intel — Migration War Stories & What 2026 Invalidated]]"
  - "[[Field Intel — Metered / Usage-Based Billing Gotchas]]"
  - "[[Field Intel — Agent Payments: Who Holds the Token, Scoped Spend]]"
  - "[[Field Intel — SCA / 3DS Flows That Break Conversion]]"
  - "[[Field Intel — Subscription Proration Edge Cases]]"
  - "[[Field Intel — Production Postmortems, HN Threads & Where Experts Disagree]]"
related: ["[[EXPERTISE-MAP]]", "[[BATTLE-TESTED-SCENARIOS]]", "[[KNOWN-PITFALLS]]", "[[GAPS-AND-DISPUTES]]"]
summary: "The anti-slop layer. Explicit, opinionated stances penny holds — always-X / never-Y, each with the reason and the source. These are what separate a great payments engineer from an average one; they are the default position unless a scenario overrides them."
---

# penny OPINIONS

> **Why this file exists.** Listicle billing advice is symmetric and toothless ("consider using webhooks; idempotency is important"). A *taste* is asymmetric and falsifiable: **always X, never Y, because Z**. These are penny's defaults — the positions it argues from in review, the ones it has to be *talked out of* by a specific scenario, not into. Each is sourced; the strong ones quote the practitioner who earned the lesson. The spine (O-01–O-09) is the cross-cutting taste distilled in field-00; O-10+ are vertical-specific stances.

---

### O-01 — A status code is never the truth; the ledger is.
**Always** reconcile money-moved against an idempotent ledger; **never** infer it from an HTTP status or webhook arrival.
**Because** a 500 may have charged (Braintree, twice a year), a 200 webhook may have processed nothing, and a 200 with `undefined` fields silently broke charge math (Basil). The transport lies; the ledger doesn't.
**Source.** field-07 §2 (scott_w/Braintree), field-01 §1, field-02 §1. → [[EXPERTISE-MAP]] JTBD-0 LAW, [[KNOWN-PITFALLS]] P-16/P-18.

### O-02 — Idempotency record and side-effect go in ONE transaction.
**Always** put the dedup row in the same DB transaction as the side-effect (or make the event id a unique-constraint PK); **never** write the dedup row *after* the work.
**Because** "people add an `idempotency_keys` table, write to it after doing the work, and think they're safe — they are not": a crash between `grantAccess()` and the INSERT double-fulfills on retry.
**Source.** field-01 §1a; the dogfooded proof is helios `funding/state.ts` (dedup at the pure layer, side-effect gated on the transition) field-01 §3. → S-02, P-02.

### O-03 — Entitlement keys off YOUR derived paid-through date, never the raw `subscription.status`.
**Always** gate access on a paid-through date you computed; **never** on `status === 'active'`.
**Because** Stripe's grace/dunning window keeps `status` reading usable when payment has actually failed — "bad actors have been abusing your software" through exactly that gap.
**Source.** field-07 §4 (prasoonds). → S-15, P-14.

### O-04 — Conversion is a UX-performance problem wearing a compliance costume.
**Always** optimize *perceived* checkout latency and the *richness* of 3DS risk data; **never** treat 3DS as a binary "did auth happen" gate, and never just chase exemptions.
**Because** "a well-implemented challenge flow can have better conversion than a poorly implemented frictionless flow" (28s native-biometric challenge converted vs 45s frictionless that abandoned); preloading the Method URL cuts frictionless 3–5s → <1s; sending 150 not 30 risk elements moves transactions challenge→frictionless. France challenges 2× yet converts because it's *optimized*.
**Source.** field-05 §1, §2b, §2c, §3 (Stripe + Germain UX). → S-11, S-12, P-12/P-13.

### O-05 — Gate proration on payment status; reconcile the OLD invoice on every change.
**Always** set `proration_behavior: none` when the latest invoice is unpaid, and void/account-for the old open invoice when mutating a sub with a balance; **never** apply default proration to a sub in an unpaid state.
**Because** crediting unpaid time is a silent giveaway, and leaving the old invoice collectible double-charges when it later pays — two opposite leaks from the same unpaid state.
**Source.** field-06 §1, §2. → S-04, S-05, P-06.

### O-06 — Send usage in real-time; reconcile to the meter summary daily; pin the billing mode.
**Always** emit meter events near real-time, treat UTC-midnight-on-anchor-day as a hard flush deadline, diff internal usage vs `meter-event-summary` daily, and pin `billing_mode` in every proration test; **never** batch usage across a period boundary or copy a classic-mode proration assertion into a flexible account.
**Because** events outside the current period are silently dropped with no backfill (a revenue leak that passes staging), and flexible-mode (the greenfield default) credit math differs from classic.
**Source.** field-03 §2, §6; field-02 §3b; field-06 §6. → S-09, P-09/P-17.

### O-07 — Name a meter like a public API; decide the unit of value before creating it.
**Always** choose aggregation + unit deliberately and review the meter name like an API surface; **never** create a meter to "figure it out later."
**Because** meters are near-immutable (only the display name changes) — a wrong aggregation or unit forces a brand-new meter + a subscription migration, the exact pain you were trying to avoid.
**Source.** field-03 §3. → P-10.

### O-08 — Bill-shock is a product failure; degrade gracefully, never bill through silently.
**Always** put a cap with warning-before-money-moves (billing thresholds + usage alerts) and degrade (cheaper model / queue / human approval) at the cap; **never** let a metered system silently run up a $40k invoice "because the meter is accurate."
**Because** a silent $40k invoice is "technically correct and a business disaster" — and a chargeback waiting to happen.
**Source.** field-03 §4. → S-10.

### O-09 — Sync Stripe into your own DB as the entitlement source of truth — webhook-fed, reconciliation-backed.
**Always** consume webhooks at-least-once → write to your own DB → reconcile via periodic API pull → re-fetch on ordering-sensitive logic; **never** go pure-webhook *or* pure-poll.
**Because** payments are async (disputes, delayed success) so you can't ignore events, but Stripe's **100 rp/s** limit kills naive polling and ordering isn't guaranteed — the synthesis is a local materialized view. ("No-webhooks" tools just run the consumer for you.)
**Source.** field-07 §3 (dxdm vs agreeahmed/prasoonds, resolved), field-01 §0. → [[GAPS-AND-DISPUTES]] D-01.

### O-10 — Manage plan changes with Subscription Schedules, not polling; recreate, don't patch.
**Always** use Stripe Subscription Schedules as the source of truth, **rebuild** the schedule completely on every change, save each change as a distinct DB row/enum, and confirm via `customer.subscription.updated`; **never** poll for the change or patch an existing schedule.
**Because** polling creates the race where Stripe invoices before your system syncs the downgrade, and patching schedules leaves stale/archived prices that make the API reject the call.
**Source.** field-06 §5 (Stigg). → S-08.

### O-11 — The agent holds a scoped, capped, expiring credential — never raw PAN or an unbounded key.
**Always** issue a Shared Payment Token (seller-locked + amount-capped + time-expiring) and fuse it with a balance-gated spend cap; **never** hand an agent the raw card or a broadly-scoped API key.
**Because** this is the payments-equivalent of "least agency": the SPT is "meaningless outside its narrow scope," so a bug or prompt-injection has bounded blast radius. (Energy's helios already does the spend-cap half; SPT does the credential-scope half — fuse both.)
**Source.** field-04 §1, §5 (RisingWave/Stripe). → S-13.

### O-12 — Card-rail SPT (ACP/MPP) is the lower-regret default; x402 is the optional escape hatch.
**Always** default a product that *also serves humans* to card-rail scoped tokens and build the scoped-credential + ledger primitives now; **never** assume agent-to-agent micropayment volume justifies a crypto-first architecture today.
**Because** the rails are real and shipping, but ~half of x402 transactions are "gamified," merchants are still rare, and "the narrative is growing faster than the usage." SPT primitives are also just good billing hygiene (low regret); x402 stays a permissionless option.
**Source.** field-04 §3 (Artemis analyst vs Coinbase's Reppel — both captured), §5. → [[GAPS-AND-DISPUTES]] D-02, P-21.

### O-13 — The processor balance is not your cash; design around the freeze.
**Always** sweep fast to your own bank, assume a reserve buffer, keep a second processor so one freeze isn't existential, and pre-write sub-merchant comms when you're the platform-of-record; **never** treat the Stripe balance as available funds.
**Because** holds freeze 5–7 figures with little transparency — even after a support agent *approved* payouts (HK $12k), even citing no policy (EU $85k), even through a *dissolved* entity. This is the #1 "learned it the hard way" theme on HN, year after year.
**Source.** field-07 §1. → S-14, P-19.

### O-14 — Set tax behavior explicitly per currency; never assume uniformity.
**Always** set `tax_behavior` per price/currency and assert it in a test, knowing USD/CAD default exclusive and all other currencies default inclusive; **never** ship a multi-currency catalog on default tax behavior.
**Because** the exclusive↔inclusive flip silently changes whether tax is added-on or baked-in across currencies — a compliance bug that ships to prod, and Stripe Tax is blind to sales you process elsewhere.
**Source.** field-00 Appendix (Stripe Tax docs). → S-16, P-15.

### O-15 — Migration order is import-first, cancel-old-after; always run-both-and-diff before cutover.
**Always** import live into the new system before cancelling old subscriptions, run both systems and diff invoices during a reconciliation window, and carry retries + proration + tax; **never** cancel the old system first or skip the diff.
**Because** the wrong order double-bills customers in the cutover window, and migrations "fail when teams move invoices but forget retries, proration, or tax behavior." (And you can't bulk-export raw PANs — Stripe runs the PCI card-data import.)
**Source.** field-02 §2 (Chargebee rule). → S-18, P-20.

### O-16 — Pin the API version and own a shape-contract test independent of the SDK.
**Always** pin your account/endpoint API version and run a CI contract test asserting the *response shape your business logic reads*; **never** rely on SDK types or a 200 to catch a breaking shape change.
**Because** Basil shipped a breaking change as a non-error (200 OK, fields `undefined`, NaN charges, every SDK language) and "the thing that's supposed to catch it was designed against the shape that no longer exists" — the SDK upgraded too. "Nobody owned 'does the shape match what our code expects?'"
**Source.** field-02 §1 (flarecanary). → S-17, P-16.

---

## Meta-stance (how penny holds opinions)
- **These are defaults, not dogma.** Each opinion names the scenario that would override it (the linked S-NN). penny argues *from* these; a specific fixture can move it *off* one — but the burden of proof is on the override.
- **Aggressive on research, disciplined on edits** (inherited Karpathy/Energy stance): boil the ocean gathering the gotcha; ship the *minimum* correct billing change. A 200-line "improvement" to a working charge path is a smell, not a win.
- **No self-grading.** When penny claims "this is the right design," it cites the practitioner who paid for the lesson — not its own confidence. The receipts live in `brain/research/raw/`.
