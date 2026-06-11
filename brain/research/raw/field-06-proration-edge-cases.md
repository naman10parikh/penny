---
title: "Field Intel — Subscription Proration Edge Cases"
type: source
created: "2026-06-11"
updated: "2026-06-11"
tags: [payments, proration, subscriptions, upgrade-downgrade, stripe, edge-cases, field-intelligence]
sources: ["Stripe api-discuss forum", "Stigg 2026", "Stripe docs 2026", "WebSearch 2026-06-11"]
summary: "Proration edge cases practitioners hit: unpaid-invoice credit leak, double-charge-on-late-pay, upgrade rollback ('actively broken'), and the subscription-schedule discipline."
---

# Subscription Proration — The Edge Cases That Leak Money or Double-Charge

## 1. The unpaid-invoice credit leak (revenue leak)

Stripe docs, "Prorations" — https://docs.stripe.com/billing/subscriptions/prorations
- "If a customer changes their subscription **while having an unpaid invoice** for the current period, they might **receive a credit for unused time on the higher-priced plan, even if they haven't paid for that time yet.**"
- Mitigation (verbatim): "you can **disable prorations when the subscription's latest invoice is unpaid** by setting `proration_behavior` to `none`."
- **penny takeaway:** crediting unpaid time is a silent giveaway. The rule: **gate proration on payment status.** If the latest invoice is unpaid, set `proration_behavior: none` on the change.

## 2. The double-charge-on-late-pay (the nasty one)

Stripe docs / api-discuss:
- "Either of these approaches can lead to **double payment if the customer eventually pays the old invoice.**"
- Scenario: customer has an unpaid invoice → you change their plan and bill the new amount → later the *old* invoice gets paid (auto-retry, manual pay, card-updater) → customer paid for both. This is the inverse of §1 and bites in the same unpaid-invoice state.
- **penny takeaway:** reconcile the *old* open invoice when you mutate a subscription with an outstanding balance — void it or account for it, don't leave it collectible.

## 3. Upgrade with immediate charge + rollback — Stripe called this "ACTIVELY BROKEN" (verbatim)

Source: Stripe api-discuss, "Subscription billing edge cases" — https://groups.google.com/a/lists.stripe.com/g/api-discuss/c/TH8rGL6x54M
> **NOTE: this thread is historically dated (origin ~2016) but the design tension it names persists into 2026 — the `pay_now`/rollback semantics it asks for are still the thing practitioners build around.** Flagged for GAPS-AND-DISPUTES as "old source, still-relevant pattern."

- **Mantas Konstantinavicius (developer):** wants A→B mid-cycle; the workaround is "changing plans then creating and forcing payment on an invoice" — which **fails when payment declines, leaving customers stranded with no rollback.**
- **Jim Danz (Stripe):** "the fact that you have to do it that way is something that I consider to be **actively broken with our design.**" Promised a `pay_now` parameter: "**failed payment means rollback, and payment won't automatically be reattempted.**"
- Downgrade-at-period-end: Mantas wanted "process the downgrade 'at period end'… so they can still use their current higher value plan (already paid for) until the end of current billing cycle." Jim: "'Schedule modification of subscription for period end' has been on our radar."
- Failed-renewal recovery (Stripe's automatic behavior): "When you **update a customer's default credit card, we automatically retry the latest unpaid, unclosed invoice** for each subscription."
- Workaround taste (Remi J.): preview with the **Upcoming Invoice API**; for downgrades **"set `trial_end` to the `current_period_end`"** of the canceled subscription; use the **Pay Invoice API** for recovery.

**Why it matters for penny:** the "charge now, roll back if it fails" semantic that everyone wants is *not* a clean primitive — you orchestrate it with upcoming-invoice preview + explicit invoice payment + your own rollback. Build this as a tested module, not ad-hoc.

## 4. Trial-conversion proration trap

Stripe docs, "Trials" / "Prorations":
- "If you've subscribed a customer to a **zero-amount price** (e.g. a trial), changing the price to a non-zero amount **generates an invoice and resets the billing period to the date of the change.**"
- "by default, the subscription's **`billing_cycle_anchor` automatically resets to the time the trial ends** … charged the full amount for their first regular interval immediately, **without generating prorations.**"
- **penny takeaway:** converting a $0 trial to paid *resets the billing anchor* — if you assumed the anchor stayed fixed, your renewal-date math and any anchor-dependent proration is wrong.

## 5. Practitioner discipline — manage downgrades with Subscription SCHEDULES, not polling (Stigg, 2026)

Source: Stigg, "The only guide you'll ever need to implement upgrade & downgrade flows [Part 2]" — https://www.stigg.io/blog-posts/the-only-guide-youll-ever-need-to-implement-upgrade-downgrade-flows-part-2

The explicit TASTE (what average engineers get wrong):
1. **"Stripe Subscription Schedules > Polling."** "create and manage stripe scheduled updates" so Stripe is the source of truth — prevents the **race condition where Stripe invoices before your system syncs the downgrade.** (Polling = race.)
2. **"Save Each Change Separately"** — tier downgrade, unit reduction, add-on removal in **separate DB rows with distinct enum types**, so you can cancel one without clobbering others.
3. **"Recreate Schedules on Every Subscription Change"** — "Rebuild them completely to eliminate stale data, archived prices, or faulty items that prevent Stripe API acceptance." (Patching schedules = stale-price bugs.)
4. **Listen to `customer.subscription.updated`** to confirm scheduled changes + sync entitlements.
5. **Contradictory requests** (more seats + lower tier at once): "**schedule for later the downgrades and perform the upgrades immediately** while canceling the irrelevant downgrade."
- Convention captured: **upgrades immediate-prorated** (Zoom/Productboard pattern), **downgrades at period end** (Zoom/GitHub) OR immediate-with-credit (Slack/Notion). Pick one explicitly per plan.

## 6. 2026 twist — flexible billing mode changes the proration MATH (cross-ref field-02)
- New subscriptions default to **flexible billing mode** (since 2025-08-27). Flexible "calculates credit prorations based on the **original amount previously debited**," which **differs from classic.** So §1's credit math is mode-dependent now.
- Source: https://docs.stripe.com/billing/subscriptions/billing-mode/compare ; default-flexible changelog https://docs.stripe.com/changelog/basil/2025-08-27/billing-mode-default-flexible
- **penny takeaway:** any proration golden-test must pin `billing_mode` explicitly and test BOTH modes, because a 2024-era account (classic) and a 2026 greenfield (flexible) diverge.

## 7. OPEN / COULD-NOT-CONFIRM (for GAPS-AND-DISPUTES)
- Whether Stripe ever shipped the `pay_now` parameter Jim Danz promised, or whether the "actively broken" upgrade-rollback is still orchestrated manually in 2026. The 2026 Stigg guide still builds rollback via schedules/webhooks (implying no clean primitive), but I did not find an explicit "pay_now shipped/not-shipped" confirmation. **High-value gap to resolve.**
- Exact flexible-mode proration credit formula vs classic — docs describe the *basis* difference qualitatively; I did not find a worked numeric example proving the delta.
- The forum thread's age (≈2016) vs current API — kept for the *pattern* and the "actively broken" admission, but the specific API calls (trial_end trick) should be re-verified against 2026 endpoints.
