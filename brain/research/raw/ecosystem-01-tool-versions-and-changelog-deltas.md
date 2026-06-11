---
title: "Ecosystem Intel — Canonical Tool Versions & 6-Month Changelog Deltas (June 2026)"
type: source
created: "2026-06-11"
updated: "2026-06-11"
tags: [payments, stripe, versions, changelog, dahlia, sdk, cli, agent-toolkit, ecosystem-intelligence]
sources:
  - "gh api repos/stripe/{ai,stripe-node,stripe-python,stripe-cli,link-cli} (2026-06-11)"
  - "https://docs.stripe.com/changelog/dahlia (fetched 2026-06-11)"
  - "https://github.com/stripe/stripe-node/blob/master/CHANGELOG.md"
summary: "Hard version numbers (verified via gh api, not memory) for every canonical Stripe tool penny drives, plus the byte-level Dahlia changelog diff that the field corpus flagged UNCONFIRMED (G-02). Closes G-02."
related: ["[[Field Intel — Migration War Stories & What 2026 Invalidated]]", "[[penny TOOL-MATRIX]]", "[[Ecosystem Intel — Starter & Template Repos]]"]
---

# Ecosystem Intel — Tool Versions & Changelog Deltas

> **Researcher:** ECOSYSTEM (CP123 Wave-R). This is the *version-and-changelog* complement to the field corpus's *war-stories*. Every version number below was pulled live via `gh api` / `gh repo view` on **2026-06-11**, not from memory. This file **closes G-02** (the "Dahlia byte-level diff unconfirmed" gap) by crawling the canonical changelog.

## 0. The currency snapshot (verified 2026-06-11 via gh api)

| Tool | Repo / package | Latest STABLE | Latest pre-release | Stars | Last push | License | Lang |
|---|---|---|---|---|---|---|---|
| **Stripe API** | (the wire version) | **`2026-05-27.dahlia`** | `2026-05-27.preview` | — | — | — | — |
| **stripe-node** | `stripe/stripe-node` | **v22.2.0** (2026-05-27) | v22.3.0-alpha.3 (2026-06-10) | — | — | MIT | TS |
| **stripe-python** | `stripe/stripe-python` | **v15.2.0** (2026-05-27) | v15.3.0a3 (2026-06-10) | — | — | MIT | Py |
| **stripe-cli** | `stripe/stripe-cli` | **v1.42.11** (2026-06-10) | — | — | — | MIT | Go |
| **agent-toolkit** | `stripe/ai` ⚠️ (renamed from `stripe/agent-toolkit`) | npm `@stripe/agent-toolkit` | — | **1,602** | 2026-06-10 | MIT | TS |
| **link-cli** | `stripe/link-cli` | (created 2026-04-23) | — | **568** | 2026-06-11 | MIT | TS |
| **ACP spec** | `agentic-commerce-protocol/agentic-commerce-protocol` | (OpenAI+Stripe) | — | **1,439** | 2026-06-04 | Apache-2.0 | — |

**Three deltas the field corpus did not capture (all NEW since its sources):**
1. **`stripe/agent-toolkit` was RENAMED to `stripe/ai`** ("One-stop shop for building AI-powered products and businesses with Stripe", 1,602★, MIT, TS, pushed 2026-06-10). The old URL still redirects; the npm package is still `@stripe/agent-toolkit`. **Any doc that links `github.com/stripe/agent-toolkit` should be updated to `github.com/stripe/ai`.** — `gh repo view stripe/agent-toolkit` returns `nameWithOwner: stripe/ai` (2026-06-11).
2. **`stripe-cli` ships almost daily** — **5 releases on 2026-06-09 alone** (v1.42.7→v1.42.10), v1.42.11 on 2026-06-10. The CLI is under very active development (it's now the surface for Stripe Projects provisioning). Pin it loosely; expect frequent patches. — `gh api repos/stripe/stripe-cli/releases` (2026-06-11).
3. **`stripe-node` is on the `v22.3.0` pre-release train** (alpha.3 as of 2026-06-10) — the next minor is in flight. The **stable** you build against is **v22.2.0** (cut 2026-05-27, same day as the `2026-05-27.dahlia` wire version — they release the SDK lockstep with the API version). — `gh api repos/stripe/stripe-node/releases`.

> **Version-number caveat (honest):** WebSearch surfaced contradictory `@stripe/agent-toolkit` package versions ("v0.3.3" vs "v0.7.0", both dated Feb 2026). I could **not** byte-verify the exact current npm version of `@stripe/agent-toolkit` from `gh` (it's a sub-package inside the `stripe/ai` monorepo, not a repo-level release). **GAP — see GAPS-AND-DISPUTES.** The repo itself is current (pushed 2026-06-10); the package version is the unconfirmed bit.

---

## 1. DAHLIA — the full changelog diff (closes G-02)

> Source: `https://docs.stripe.com/changelog/dahlia` (fetched 2026-06-11). Dahlia is the **4th** flora-named release (Acacia 2024 → Basil 2025-03-31 → Clover → **Dahlia 2026-03-25**). The **first** Dahlia version (`2026-03-25.dahlia`) carries breaking changes; **subsequent Dahlia versions are additive-only** (so `2026-04-22` and `2026-05-27` GA channels have **no** GA breaking changes — the breaks are quarantined in the `.preview` channel).

### 1a. The single headline breaking change (the one that bites charge math)
**`decimal_string` fields changed type from `string` → `Stripe.Decimal`** in both request params and response objects (TS SDK). *"Code that reads or writes these fields as `string` will need to use `Stripe.Decimal` instead."* This is the **2026 analogue of the Basil `current_period_end` move** (field-02 §1) — a *type* change that a `string`-assuming parser silently mishandles. **penny rule:** the O-01 contract-test must assert `Stripe.Decimal` (not `string`) on every decimal field your business logic reads. — stripe-node CHANGELOG / docs.stripe.com/sdks/versioning (2026-06-11).
- SDK-specific siblings: `Stripe.StripeContext` no longer exported as a type (use `Stripe.StripeContextType`); v2 endpoint Retrieve/List now use **indexed** param format (breaks mock servers expecting repeated-param format).

### 1b. `2026-03-25.dahlia` GA breaking changes (the wire-shape ones)
- **Checkout/Payment Links:** `ui_mode` enum values updated.
- **Elements:** `elements.update()` now returns a **Promise** (was sync); `options.layout.radios` boolean support removed; Address Element state defaults to Latin chars.
- **Stripe.js:** deprecated Payment Intents / Setup Intents / Sources methods **removed**; `initCheckout`→`initCheckoutElements`, `initEmbeddedCheckout`→`createEmbeddedCheckoutPage`.
- **Issuing:** Visa Issuing Token card reference ID made **optional**.
- **Connect:** risk requirements added to Capabilities API.
- **Subscriptions:** "retention policy" cancellation reason added.
- **Event Destinations:** `events_from` now accepts **string** values (was enum).

### 1c. `2026-04-22` — the AGENTIC-COMMERCE primitives land (preview channel) ← penny-critical
This is the most penny-relevant changelog entry in the entire corpus, and it was **not** in the field files (they had the *concept* of SPT from blog posts; here is the *API resource*):
- **`SharedPaymentIssuedToken`** resource — *"allow agents to give sellers scoped access to a customer's credentials."* This is the literal API object behind "Shared Payment Token."
- **`Shared Payment Granted Token`** — *"for managing payment methods shared by agents."*
- **Orchestrated Commerce Agreements API** — *"manage relationships with other businesses"* (the B2B-agent counterpart).
- Status: **preview channel** as of 2026-04-22 (so it's gated/early — confirm GA status before building production SPT issuance). — docs.stripe.com/changelog/dahlia (2026-06-11).

Other 2026-04-22 highlights penny cares about:
- **Managed Payments (Stripe's Merchant-of-Record)** went GA on Checkout/Payment Links/Payments — *"handles indirect tax compliance (80+ countries), fraud prevention, dispute management."* **This is Stripe's own MoR answer to Paddle/Lemon Squeezy** (changes the field-02 §2 "MoR = leave Stripe" calculus — you can now get MoR *inside* Stripe). MAJOR.
- **Billing Meter** event validation for values >15 digits (preview→GA) — relevant to the metered-billing gotchas (field-03).
- **Activity Logs API** — programmatic access to security activity (API-key mgmt, role changes) — useful for the agent-operator audit trail.
- **Batch API v2** (preview) — bulk create-customers / migrate-subscriptions / update-datasets — relevant to JTBD-8 migrations (field-02 §2 cutover).

### 1d. `2026-05-27.dahlia` — the current wire version (NO GA breaking changes)
GA channel is additive-only. The ones penny cares about:
- **Subscriptions — Billing Schedules (prebilling):** *"collect payment for future billing periods before they begin."* New lifecycle primitive.
- **Subscription pause endpoint** (preview): *"pause active subscriptions to suspend service delivery and invoice generation until resumed."* ← directly relevant to dunning/grace-period UX (field-07 §4).
- **Invoice "amount paid off Stripe"** property — track out-of-band payments (reconciliation aid).
- **Pending subscription updates** now carry `discount`/`discounts` + `metadata` — relevant to proration orchestration (field-06).
- **Link Authentication Element renamed → Contact Details Element** (Elements rename — update any UI code referencing the old name).
- New BNPL/local methods: Scalapay, Bizum, Twint recurring, Sunbit, Pix recurring, Blik recurring.
- **Preview breaking:** `Subscription Item.billed_until` no longer returned by default (now includable) — *another* "field silently disappears from the response" shape change in the family of field-02 §1. Pin your API version.

### 1e. The migration-discipline takeaway (reinforces field-02 / O-01)
Dahlia confirms the field corpus's central migration law **three more times**:
1. The `decimal_string`→`Stripe.Decimal` change = a type shift a `string` parser mishandles (just like Basil's `undefined` field).
2. `Subscription Item.billed_until` vanishing-by-default = a field that silently leaves the response (just like `current_period_end` moving).
3. Stripe **quarantines breaking changes to the first version of a release + the `.preview` channel** — so **pinning your API version is the entire defense**, and a contract test pinned to that version (O-01) catches all three. The "additive-only after v1" policy means: once you're on a Dahlia GA version, you won't get *surprised* — but a version bump to the *next* release family (post-Dahlia) will carry breaks again.

---

## 2. SDK release cadence (what an agent maintaining a Stripe integration must expect)
- **Stripe cuts the SDK stable lockstep with the wire version** — `stripe-node v22.2.0` and `stripe-python v15.2.0` both shipped **2026-05-27**, the same date as `2026-05-27.dahlia`. So "what's the current SDK?" ≈ "what's the current API version?" + the major that supports it.
- **Beta/alpha trains run continuously** — `v22.3.0-alpha.3` (2026-06-10) means the next minor is being built in the open. Don't pin to `-alpha`/`-beta` in production.
- **The CLI is the fastest-moving piece** (daily patches) because it's now the Stripe Projects provisioning surface (see ecosystem-04). Treat `stripe` CLI as a living tool, not a pinned dependency.

## 3. OPEN / COULD-NOT-CONFIRM (feeds GAPS-AND-DISPUTES)
- **Exact current `@stripe/agent-toolkit` npm version** — WebSearch gave contradictory numbers; it's a monorepo sub-package so no repo-level release tag. Needs `npm view @stripe/agent-toolkit version` (couldn't run npm per HARD RULE 4). **GAP.**
- **GA status of the `SharedPaymentIssuedToken` API** — it was `preview` at 2026-04-22; did it reach GA in `2026-05-27`? The 2026-05-27 GA notes don't list it explicitly, suggesting still-preview. Confirm before production SPT issuance. **GAP (high value — gates JTBD-5).**
- **Whether Stripe "Managed Payments" (in-Stripe MoR) fully replaces the need to migrate to Paddle/Lemon Squeezy** — it claims 80+ countries; the field-02 §2 MoR calculus may now be partly obsolete, but the data/card-network-relationship tradeoffs need a fresh read. **DISPUTE candidate.**
