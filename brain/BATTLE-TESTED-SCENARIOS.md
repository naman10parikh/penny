---
title: "penny BATTLE-TESTED-SCENARIOS — Golden Eval Tasks"
type: synthesis
created: "2026-06-11"
updated: "2026-06-11"
tags: [payments, billing, scenarios, golden-tasks, eval, stripe, postmortem, field-intelligence]
sources:
  - "[[Field Intel — Webhook Ordering & Idempotency War Stories]]"
  - "[[Field Intel — Migration War Stories & What 2026 Invalidated]]"
  - "[[Field Intel — Metered / Usage-Based Billing Gotchas]]"
  - "[[Field Intel — Agent Payments: Who Holds the Token, Scoped Spend]]"
  - "[[Field Intel — SCA / 3DS Flows That Break Conversion]]"
  - "[[Field Intel — Subscription Proration Edge Cases]]"
  - "[[Field Intel — Production Postmortems, HN Threads & Where Experts Disagree]]"
related: ["[[EXPERTISE-MAP]]", "[[KNOWN-PITFALLS]]", "[[OPINIONS]]"]
summary: "18 real, specific failure/migration/production scenarios with setup, the failure, and the resolution. These are the golden eval tasks for Wave S (Hamel L2 behavior + L3 trajectory). Every one is drawn from a verbatim-cited postmortem or doc, not invented."
---

# penny BATTLE-TESTED-SCENARIOS

> **What this is.** 18 scenarios mined from the field corpus, each grounded in a real postmortem, HN thread, or canonical doc. **Each becomes a golden eval task** (per `dsip.json` → `eval.rubric`): the *Setup* is the fixture, the *Trigger* drives the behavior, the *Wrong* answer is the trap an average engineer (or naïve LLM) falls into, the *Right* answer is the gate, and *Eval level* tags it as L1 (assertion), L2 (behavior), or L3 (trajectory) per Hamel's three-level evals.
>
> **Pass bar for penny:** a correct answer cites *why* (the law from [[EXPERTISE-MAP]] JTBD-0), not just *what*. An answer that gets the fix right for the wrong reason fails — because the next variant breaks it.

---

### S-01 — The reordered webhook (entitlement flips off then on)
- **Setup.** A subscriber upgrades mid-cycle. Stripe sends `customer.subscription.updated` (new plan) and `invoice.payment_succeeded`. Your handler sets entitlements directly from each payload.
- **Trigger.** Delivery reorders (or a retry of an older event lands after a newer one): the `updated` event arrives *after* a later `subscription.deleted`-adjacent state, so your DB ends on the stale plan.
- **Wrong.** Trust payload order; write `entitlement = payload.plan`. Entitlement silently regresses; nobody notices for weeks.
- **Right.** On any ordering-sensitive event, **re-fetch the canonical Subscription from the API** and derive entitlement from that + your own paid-through date. Treat the handler as at-least-once. — field-01 §0, §4.
- **Eval level.** L2 (behavior: does the agent re-fetch vs trust payload?). **Map:** [[EXPERTISE-MAP]] 1.1, [[KNOWN-PITFALLS]] P-01.

### S-02 — Crash-between double-fulfill
- **Setup.** Webhook handler does `grantAccess(user)` then `INSERT INTO processed_events(event_id)`.
- **Trigger.** Process is killed (deploy, OOM) *after* `grantAccess` but *before* the INSERT. Stripe retries the event.
- **Wrong.** Assume the `processed_events` table makes you idempotent. The retry re-runs `grantAccess` → double-fulfill (double seats, double credits, double shipment).
- **Right.** Put the dedup row **in the same DB transaction** as the side-effect, *or* use the Stripe event id as a unique-constraint PK and let the second INSERT fail the handler before any side-effect. — field-01 §1a, §3 (helios pattern).
- **Eval level.** L2/L3. **Map:** [[EXPERTISE-MAP]] 1.3, [[KNOWN-PITFALLS]] P-02, [[OPINIONS]] O-02.

### S-03 — Raw-body signature breakage on Next.js App Router
- **Setup.** A webhook route in Next.js App Router parses the body with `await req.json()` before calling `stripe.webhooks.constructEvent`.
- **Trigger.** Every real webhook 400s with "No signatures found matching the expected signature."
- **Wrong.** Conclude the webhook secret is wrong; rotate `STRIPE_WEBHOOK_SECRET`; the bug persists.
- **Right.** Read the **raw bytes** (`await req.text()`), disable the body parser, pass the raw string + `stripe-signature` header to `constructEvent`. HMAC is over the exact bytes Stripe signed; any reserialization breaks it. — field-01 §1c.
- **Eval level.** L1 (assertion: route reads raw body). **Map:** [[EXPERTISE-MAP]] 1.5, [[KNOWN-PITFALLS]] P-04.

### S-04 — The unpaid-invoice credit leak (flexible-mode aware)
- **Setup.** A customer on the $99 plan has an **unpaid** current-period invoice. They downgrade to the $29 plan. Account is a 2026 greenfield (flexible billing mode).
- **Trigger.** Default `proration_behavior` credits unused time on the $99 plan they never paid for; on flexible mode the credit basis differs from the classic example you copied.
- **Wrong.** Apply default proration; ship a credit for unpaid time; revenue leaks. Worse: copy a 2024 (classic) proration assertion into the test and pass it.
- **Right.** **Gate proration on payment status** — set `proration_behavior: none` when the latest invoice is unpaid. Pin `billing_mode` explicitly in the test and assert the flexible-mode credit, not the classic one. — field-06 §1, §6; field-02 §3b.
- **Eval level.** L2 + L1 (assert mode pinned). **Map:** [[EXPERTISE-MAP]] 2.1 / 8.5, [[KNOWN-PITFALLS]] P-06 / P-17, [[OPINIONS]] O-05 / O-06.

### S-05 — Double-charge when the old invoice finally pays
- **Setup.** Customer has an unpaid $99 invoice. You change them to $149 and force-pay the new invoice now.
- **Trigger.** Later, the *old* $99 invoice auto-retries successfully (card-updater fires / customer pays the link). Customer is charged $99 + $149.
- **Wrong.** Leave the old open invoice collectible after the mutation. The double-charge becomes a dispute + chargeback.
- **Right.** When mutating a subscription with an outstanding balance, **reconcile the old invoice** — void it or explicitly account for it — don't leave it collectible. — field-06 §2.
- **Eval level.** L2/L3. **Map:** [[EXPERTISE-MAP]] 2.2, [[KNOWN-PITFALLS]] P-06.

### S-06 — Upgrade with immediate charge, then the card declines
- **Setup.** Customer requests an immediate upgrade A→B mid-cycle; you change the plan then create + force payment on the proration invoice.
- **Trigger.** The payment declines. The customer is now on plan B with an unpaid invoice and **no clean rollback** — "actively broken" per Stripe's own engineer.
- **Wrong.** Assume a `pay_now`-style atomic "charge or roll back" primitive exists. Leave the customer stranded on B, unpaid.
- **Right.** Orchestrate it as a tested module: preview with the **Upcoming Invoice API**, attempt the explicit invoice payment, and on decline **roll the plan back yourself** (don't rely on auto-retry to fix it). Treat rollback as application logic, not a Stripe guarantee. — field-06 §3 (Jim Danz / Remi J.). *(Whether `pay_now` ever shipped is [[GAPS-AND-DISPUTES]] G-01 — resolve before relying on it.)*
- **Eval level.** L3 (trajectory: does the agent build the rollback path?). **Map:** [[EXPERTISE-MAP]] 2.3.

### S-07 — Trial conversion silently moves the renewal date
- **Setup.** Customer is on a $0 trial price; your renewal-reminder job assumes `billing_cycle_anchor` is fixed.
- **Trigger.** You convert the trial to a non-zero price. The anchor **resets to trial-end**; a full interval is charged immediately with no proration. Your reminder emails and any anchor-dependent proration are now wrong.
- **Wrong.** Keep using the pre-trial anchor for date math; send "renews on \<wrong date\>"; miscompute later prorations.
- **Right.** Re-read the anchor after conversion; expect the immediate full-interval charge and the reset; recompute all anchor-dependent dates from the canonical object. — field-06 §4.
- **Eval level.** L2. **Map:** [[EXPERTISE-MAP]] 2.4, [[KNOWN-PITFALLS]] P-07.

### S-08 — Downgrade race: Stripe invoices before your DB syncs
- **Setup.** Customer schedules a tier downgrade for period-end. Your system polls Stripe to detect the change and update entitlements.
- **Trigger.** Stripe finalizes the period-end invoice (new lower tier) *before* your poll runs → a window where your system bills/entitles the wrong tier; or a stale archived price in a patched schedule makes Stripe reject the API call.
- **Wrong.** Poll for state; patch the existing schedule. Hit the race + stale-price rejection.
- **Right.** Use **Subscription Schedules** so Stripe is the source of truth; **recreate the schedule from scratch** on every change (no patching); listen to `customer.subscription.updated` to confirm + sync; save each change as a distinct DB row/enum so one can be cancelled without clobbering others. — field-06 §5 (Stigg).
- **Eval level.** L3. **Map:** [[EXPERTISE-MAP]] 2.5, [[OPINIONS]] O-10.

### S-09 — The metered timestamp drop (revenue leak that passes staging)
- **Setup.** Usage is batched and flushed nightly to `v1/billing/meter_events`, with the event timestamp set to the *usage* time. A customer's billing period boundary falls between a usage spike and the nightly flush.
- **Trigger.** The flush sends events whose timestamp is **outside the now-closed billing period**. Stripe **silently drops** them (no backfill). You under-bill. Staging never crosses a period boundary, so every test passed.
- **Wrong.** Trust the nightly batch; assume Stripe queues late events. Lose the revenue with no retroactive fix.
- **Right.** Send meter events **near real-time**; treat **UTC-midnight-on-the-anchor-day as a hard flush deadline**; **reconcile your internal usage ledger vs Stripe's `meter-event-summary` daily** and alarm on divergence. Respect the 35-day / ≤5-min-future / current-period-only rules. — field-03 §2, §6.
- **Eval level.** L2/L3. **Map:** [[EXPERTISE-MAP]] 3.2 / 3.6, [[KNOWN-PITFALLS]] P-09, [[OPINIONS]] O-06.

### S-10 — Bill-shock: the silent $40k agent invoice
- **Setup.** An agent on usage-based pricing runs an unbounded workload overnight (retry storm / runaway loop).
- **Trigger.** Metered usage accrues to a $40k invoice with no warning. Technically correct; a business disaster + a furious customer + a likely chargeback.
- **Wrong.** Bill straight through ("the meter is accurate"). Treat it as purely an engineering success.
- **Right.** Set **billing thresholds + usage alerts**; on hitting a cap, **degrade gracefully** — offer a cheaper model, queue runs, or require human approval — instead of silent overage. Warn *before* money moves. — field-03 §4.
- **Eval level.** L3 (product trajectory). **Map:** [[EXPERTISE-MAP]] 3.4, [[OPINIONS]] O-08.

### S-11 — Mobile checkout dies in the 3DS iframe
- **Setup.** Mobile web checkout uses a browser-based 3DS iframe (no native SDK). A challenge is required.
- **Trigger.** The iframe loads in 3–5s, doesn't fit the viewport, needs pinch-zoom to see the OTP field, and times out before the user finishes. Mobile conversion sits 10–15% below desktop.
- **Wrong.** Blame "3DS kills conversion" and consider it unfixable / regulatory.
- **Right.** Move to **native mobile 3DS2** (well-implemented native lands within 5% of desktop); ensure the challenge surface fits the viewport and doesn't time out. The problem is *implementation*, not authentication existing. — field-05 §2a, §1.
- **Eval level.** L2/L3. **Map:** [[EXPERTISE-MAP]] 4.2, [[KNOWN-PITFALLS]] P-12, [[OPINIONS]] O-04.

### S-12 — "Frictionless" that still takes 4 seconds
- **Setup.** A transaction routes through the frictionless 3DS pathway, yet checkout feels slow; conversion lags. The team sends ~25 risk data elements and invokes the 3DS Method URL at form submission.
- **Trigger.** Frictionless completion takes 4s (Method URL fired too late + thin device fingerprinting + ACS latency), and thin risk data pushes borderline transactions into *challenges* anyway.
- **Wrong.** Conclude frictionless is already optimal because it's "frictionless"; chase exemptions to avoid challenges.
- **Right.** **Pre-load the Method URL during payment-method selection** (cuts frictionless to <1s) and **send 150+ risk elements** (account age, history, behavioral signals) to move transactions challenge→frictionless. — field-05 §2b, §2c.
- **Eval level.** L2. **Map:** [[EXPERTISE-MAP]] 4.3 / 4.4, [[OPINIONS]] O-04.

### S-13 — Issue an agent a scoped spend credential (the on-thesis task)
- **Setup.** A customer wants their agent to be able to buy compute/services up to **$50, at seller X only, expiring in 24h** — and the agent must never touch the raw card.
- **Trigger.** A naïve design hands the agent an API key or a card token with broad scope; a bug or prompt-injection lets it overspend or pay the wrong seller.
- **Wrong.** Give the agent an unbounded credential ("we'll watch the logs"). One injection = unbounded blast radius.
- **Right.** Issue a **Shared Payment Token (SPT)**: seller-locked + total-amount-capped + time-expiring; the agent only ever holds the SPT (meaningless outside its scope). **Fuse with a balance-gated cap** (helios per-loop/daily-loss caps) so the credential scope *and* the ledger both bound spend. Reconcile the agent's internal ledger vs the provider record. — field-04 §1, §5.
- **Eval level.** L3 (design trajectory + safety). **Map:** [[EXPERTISE-MAP]] 5.1 / 5.8, [[OPINIONS]] O-11.

### S-14 — The payout freeze (treat the processor balance as not-your-cash)
- **Setup.** Your platform (or a sub-merchant on your Connect platform) accrues a large Stripe balance. You're counting on the next payout to cover payroll/obligations.
- **Trigger.** Stripe places a hold/reserve — possibly with little transparency, possibly even after a support agent *approved* payouts (HK case), possibly citing no specific policy (EU $85k case). Five/six/seven figures freeze.
- **Wrong.** Treat the Stripe balance as available cash; have no buffer or fallback. A freeze becomes existential.
- **Right.** Design for it: **faster sweeps** to your own bank, a **reserve-buffer** assumption, ideally a **second processor** so one freeze isn't fatal, and **clear sub-merchant comms** when you're the platform-of-record. — field-07 §1.
- **Eval level.** L3 (architecture/ops trajectory). **Map:** [[EXPERTISE-MAP]] 6.1 / 6.2, [[OPINIONS]] O-13.

### S-15 — Grace-period abuse (status says active, money didn't arrive)
- **Setup.** A subscriber's renewal payment fails. Stripe keeps the subscription in a grace/dunning state where `subscription.status` still reads usable.
- **Trigger.** Your entitlement check is `if (subscription.status === 'active') grant()`. Bad actors let payment fail and keep using the product through the grace window — "abusing your software."
- **Wrong.** Key entitlement off the raw `status` string. Free usage leaks; abuse compounds.
- **Right.** Key entitlement off **your own derived paid-through date**, not the raw status. `active` can mean "in dunning grace, not actually paid." — field-07 §4.
- **Eval level.** L2. **Map:** [[EXPERTISE-MAP]] 6.5, [[KNOWN-PITFALLS]] P-14, [[OPINIONS]] O-03.

### S-16 — Multi-currency tax flips exclusive↔inclusive
- **Setup.** A catalog priced in USD is extended to EUR/GBP. Tax behavior is left at the default per-currency.
- **Trigger.** For USD + CAD, tax is **exclusive** (added on top); for EUR/GBP (all other currencies) it's **inclusive** (baked in). The displayed/collected total silently changes meaning across currencies — over- or under-collecting tax.
- **Wrong.** Assume tax behavior is uniform across the catalog. Ship a silent compliance bug.
- **Right.** Set tax behavior **explicitly per price/currency**; assert it in a test; know USD/CAD = exclusive, others = inclusive by default. — field-00 Appendix.
- **Eval level.** L1/L2. **Map:** [[EXPERTISE-MAP]] 7.1, [[KNOWN-PITFALLS]] P-15, [[OPINIONS]] O-14.

### S-17 — The Basil shape-change (200 OK, fields go undefined)
- **Setup.** Code reads `subscription.current_period_end` to render renewal dates, compute proration, and drive dunning. You bump the account API version to a post-Basil release (or the SDK upgrades it).
- **Trigger.** The field moved to `subscription.items.data[0].current_period_end`. The endpoint still returns **200 OK**; your access returns **undefined**. Result: "renews on **Invalid Date**," blank dashboards, **NaN charge amounts**, dropped report rows — across every SDK language.
- **Wrong.** Rely on SDK types to catch it (they upgraded too) and on the 200 to mean "fine." Ship NaN charges.
- **Right.** A **contract test pinned to your API version**, run in CI, asserting "subscription period end is a finite number *in the shape my code reads*" — independent of the SDK. Read the new item-level path. — field-02 §1.
- **Eval level.** L1 (the canonical assertion). **Map:** [[EXPERTISE-MAP]] 8.1 / 8.2, [[KNOWN-PITFALLS]] P-16, [[OPINIONS]] O-01.

### S-18 — Provider migration cutover double-bill
- **Setup.** Migrating subscriptions from an old system (or processor) to Stripe. You cancel old subscriptions and import into the new one.
- **Trigger.** You cancel/import in the wrong order, or skip the reconciliation diff. Customers get billed by *both* systems during the cutover window (or proration/tax behavior is dropped in the import).
- **Wrong.** Cancel old subs *before* the live import; skip running both systems + diffing invoices; forget to carry retries/proration/tax.
- **Right.** **Cancel in the OLD system only after the live import** (Chargebee rule); **run both systems and diff invoices** before final cutover; carry retries + proration + tax behavior; let Stripe run the PCI-bound card-data import (you can't bulk-export raw PANs). — field-02 §2.
- **Eval level.** L3. **Map:** [[EXPERTISE-MAP]] 8.3, [[OPINIONS]] O-15.

---

## How these wire into the eval pyramid (`dsip.json`)
- **L1 (assertions, pure, $0):** S-03, S-16, S-17 (+ the mode-pin half of S-04) — shape/behavior assertions runnable without live API. The headline L1 is S-17's contract test.
- **L2 (behavior):** S-01, S-04, S-05, S-07, S-09, S-11, S-12, S-15, S-16 — "given this state, does the agent take the correct action and for the correct reason?"
- **L3 (trajectory):** S-02, S-06, S-08, S-10, S-13, S-14, S-18 — multi-step design/orchestration where the *path* (build a rollback module, design around a freeze, scope a credential) is graded, not just the endpoint.
- **No self-grading** (`dsip.noSelfGrading`): the "for the correct reason" check cites a specific JTBD law from [[EXPERTISE-MAP]] §0 — an external rubric, not the model's own say-so.
