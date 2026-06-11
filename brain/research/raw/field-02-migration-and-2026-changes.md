---
title: "Field Intel — Migration War Stories & What 2026 Invalidated"
type: source
created: "2026-06-11"
updated: "2026-06-11"
tags: [payments, migration, stripe-basil, dahlia, breaking-changes, postmortem, field-intelligence]
sources: ["dev.to/flarecanary 2026", "Stripe changelog 2026", "WebSearch 2026-06-11"]
summary: "Real migration breakages (Basil current_period_end move, flexible billing default) and the 2026 changes that invalidate 2025 conventional wisdom."
---

# Migration War Stories + 2026-Invalidates-2025

## 1. THE marquee war story — Stripe Basil silently moved `current_period_end` (March 31, 2025; still biting in 2026)

This is the single best-documented billing migration postmortem in the corpus. Source: flarecanary (Flare Canary), "Stripe Basil Quietly Moved current_period_end Off Subscription — And a Lot of Code Broke," DEV Community — https://dev.to/flarecanary/stripe-basil-quietly-moved-currentperiodend-off-subscription-and-a-lot-of-code-broke-3eo7

**What changed (verbatim field move):**
- API `2025-02-24.acacia` → `subscription.current_period_end: 1712678400`
- API `2025-03-31.basil` → `subscription.items.data[0].current_period_end: 1712678400`
- Three fields removed from the `Subscription` object on **March 31, 2025**: `current_period_start`, `current_period_end` (both moved to subscription **items**), and `billing_thresholds` (removed entirely, later reintroduced May 28, 2025).

**The actual symptoms (direct quotes):**
- "Dunning emails stopped... sent 'your subscription renews on **Invalid Date**'"
- "Customer-facing dashboards went blank... showed empty cells"
- "Proration math got weird... defaulted to zero or to a **NaN that cascaded into charge amounts**"
- "Reporting numbers drifted... analytics jobs started dropping rows"

**Blast radius:** "The breakage affected **every SDK language** — Node, Python, PHP, Java, Go, .NET" (Ruby was unaffected).

**The author's TASTE (why this is the lesson, not just the bug) — direct quotes:**
- "the endpoint still returned **`200 OK`**... fields your code accessed just came back **`undefined`**"
- "The thing that's supposed to catch it was designed against the **shape that no longer exists**"
- "nobody owned **'does the shape match what our code expects?'**"

**penny takeaway:** a provider can ship a *breaking* change as a *non-error* (200 OK, fields go `undefined`). Type-checking against the SDK types does NOT save you because the SDK was upgraded too. The defense is a **contract test that asserts the response shape your business logic depends on**, pinned to your API version, run in CI — independent of the SDK. This belongs in penny's eval pyramid (L1 assertion: "subscription period end is a finite number in the shape my code reads").

## 2. Migration discipline — the order-of-operations that prevents double-billing

From the provider-to-provider migration guides (Stripe, Chargebee, Paddle):
- "Subscription migrations fail when teams move invoices but **forget retries, proration, or tax behavior.**" — churnmate / automaiva 2026 summary
- Chargebee's explicit rule: **cancel subscriptions in the OLD system only AFTER the live import** into the new one — otherwise customers get double-billed during the cutover window. — Chargebee docs, https://www.chargebee.com/docs/2.0/migrating-data.html
- Stripe's own migration guide (PAN data import via a Stripe-led process; you generally cannot bulk-export raw card numbers yourself for PCI reasons) — https://docs.stripe.com/billing/subscriptions/migrate-subscriptions
- The reconciliation period (run both systems, diff the invoices) before final cutover is the step teams skip and regret.

Sources:
- automaiva, "Stripe vs Paddle vs Chargebee vs Recurly (2026)" — https://automaiva.com/stripe-vs-paddle-vs-chargebee-vs-recurly-saas-2026/
- Paddle migration service — https://www.paddle.com/platform/migration-service
- Dodo Payments, "7 Best Stripe Billing Alternatives 2026 (… MoR-Ready)" — https://dodopayments.com/blogs/stripe-billing-alternatives

**Merchant-of-Record (MoR) angle that changed the migration calculus:** Paddle/Lemon Squeezy/Dodo act as MoR — they own the tax/VAT liability and the customer-of-record relationship. Migrating *to* an MoR means you give up direct card-network relationship + some data, but offload global tax. Migrating *off* an MoR (e.g., Paddle → Stripe) means you suddenly own sales-tax/VAT registration in dozens of jurisdictions you never had to think about. This is the migration "what broke" that is organizational, not code.

## 3. WHAT 2026 INVALIDATED (the headline section)

### 3a. Current API version is `2026-05-27.dahlia` (not Basil/Acacia)
Stripe ships a breaking-named release roughly twice a year: Acacia (2024-09-30) → Basil (2025-03-31) → … → **Dahlia (2026-05-27, current)**. Any 2025 tutorial pinned to Acacia is two breaking releases stale.
- Stripe changelog — https://docs.stripe.com/changelog
- Basil changelog — https://docs.stripe.com/changelog/basil

### 3b. **Flexible billing mode is now the DEFAULT** (the biggest silent behavior change)
- "Newly created subscriptions now **default to flexible billing mode** as of **August 27, 2025**." — https://docs.stripe.com/changelog/basil/2025-08-27/billing-mode-default-flexible
- Existing integrations are preserved as `classic` for back-compat; **new** ones get `flexible`. So a 2026 greenfield build behaves *differently from* a 2024 codebase on the same Stripe account.
- Flexible mode **changes how prorations, trials, and usage-based billing are calculated/orchestrated**: "Flexible billing mode calculates credit prorations based on the **original amount previously debited** to a customer, which differs from the classic approach." — https://docs.stripe.com/billing/subscriptions/billing-mode/compare
- **The trap:** 2025 conventional wisdom about proration credits assumes *classic* math. On a new (flexible) subscription the credit can differ. Copy-pasted 2024 proration assertions will be subtly wrong.
- Library lag is real: Laravel Cashier had an open "Feature Request: Flexible Billing Mode Support" issue (#1832) — https://github.com/laravel/cashier-stripe/issues/1832 — i.e., popular wrappers trailed the default change.

### 3c. Legacy usage-records API is GONE — every metered price needs a Meter object
- "Since API version **2025-03-31.basil**, the **legacy usage records API is gone**, and every metered price now requires a backing **Meter**." — buildmvpfast 2026, https://www.buildmvpfast.com/blog/stripe-metered-billing-implementation-guide-saas-2026
- Any 2024 tutorial using `usage_type: 'metered'` + `subscriptionItems.createUsageRecord(...)` without a Meter is dead code in 2026. (See metered file.)

### 3d. Agentic-commerce primitives did not exist in 2025
Stripe Shared Payment Tokens, Agentic Commerce Protocol (ACP, with OpenAI), agentic network tokens (Visa/Mastercard scoped) — all 2026-era. Any "how should an agent pay" design from 2025 predates the standard. (See agent-payments file.)

## 4. OPEN / COULD-NOT-CONFIRM (for GAPS-AND-DISPUTES)
- Could not byte-verify the exact list of Dahlia (2026-05-27) breaking changes from the canonical Dahlia changelog page (search surfaced the version string + Basil/Acacia details; I did not open a dedicated Dahlia changelog entry). penny should crawl https://docs.stripe.com/changelog/ for the Dahlia diff before trusting any specific Dahlia behavior.
- The `billing_thresholds` "removed then reintroduced May 28, 2025" detail comes from one secondary source (flarecanary) — plausible and specific, but single-sourced.
