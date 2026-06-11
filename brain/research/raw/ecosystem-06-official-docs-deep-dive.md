---
title: "Ecosystem Intel — Official Docs Deep-Dive on the Load-Bearing Flows (June 2026)"
type: source
created: "2026-06-11"
updated: "2026-06-11"
tags: [payments, stripe, docs, webhooks, spt, shared-payment-token, metered, thin-events, ecosystem-intelligence]
sources:
  - "https://docs.stripe.com/webhooks (fetched 2026-06-11)"
  - "https://docs.stripe.com/agentic-commerce/concepts/shared-payment-tokens.md?agent-seller=seller (fetched 2026-06-11)"
  - "https://docs.stripe.com/billing/subscriptions/usage-based/recording-usage (fetched 2026-06-11)"
summary: "Canonical primary-source crawl of the load-bearing flows: webhook discipline (signature/dedup/ordering/retry/thin-vs-snapshot) and the SPT API surface (exact resource + field names). CLOSES G-04 (SPT revocation) and confirms the SharedPaymentGrantedToken API is still PREVIEW. The webhook doc confirms every field-01 claim from the canonical source."
related: ["[[Field Intel — Webhook Ordering & Idempotency War Stories]]", "[[Field Intel — Agent Payments: Who Holds the Token, Scoped Spend]]", "[[Ecosystem Intel — Agent-Operator Interface]]"]
---

# Ecosystem Intel — Official Docs Deep-Dive

> **Researcher:** ECOSYSTEM (CP123 Wave-R). The brief's requirement (3): *"official docs deep-dive on the load-bearing flows (crawl)."* Crawled the canonical Stripe docs 2026-06-11 to (a) confirm the field-01 webhook claims against the source, and (b) **resolve the SPT API surface + revocation (G-04).** Direct quotes from docs.stripe.com.

## 1. WEBHOOK DISCIPLINE — the canonical source (confirms every field-01 claim)
Source: `docs.stripe.com/webhooks` (2026-06-11). The field corpus derived these from blogs/HN; here they are from Stripe's own doc, verbatim.

### 1a. Signature verification (confirms field-01 §1c / P-04)
- **`Stripe-Signature` header** carries `t=` (timestamp), `v1=` (the live-mode HMAC-SHA256 signature), `v0=` (test-only fake scheme).
- **Verification = HMAC-SHA256** over `signed_payload = "{timestamp}.{raw_request_body}"`, key = endpoint signing secret. **"use a constant-time-string comparison… to protect against timing attacks."**
- **Default timestamp tolerance: 5 minutes** (replay-protection window). ← a number the field corpus didn't have.
- Library call (Ruby shown): `Stripe::Webhook.construct_event(payload, sig_header, endpoint_secret)`.
- ⚠️ **Doc nuance + correction:** the webhooks doc says *"There is no separate `constructEventAsync`"* — but that's the doc generalizing from the Ruby example. **In `stripe-node`, `constructEventAsync()` DOES exist and is REQUIRED on edge/Workers/Deno** (Web Crypto is async there) — confirmed by the edge-runtime issue family (ecosystem-04 §2, #1593/#997). **penny rule: Node server → `constructEvent`; edge/Workers/Deno → `constructEventAsync` + `createFetchHttpClient()`.** The doc's blanket "no async version" is Ruby-centric and wrong for Node-on-edge.

### 1b. Duplicate handling (confirms field-01 §1 / O-02) — the EXACT dedup key
> *"guard against duplicated event receipts by logging the event IDs you've processed… In some cases, two separate Event objects are generated and sent. To identify these duplicates, use the ID of the object in `data.object` along with the `event.type`."*
- **Dedup on `event.id` for replays; dedup on `data.object.id` + `event.type` for the "two separate Events for the same thing" case.** ← This is a sharper rule than the field corpus had: Stripe can emit **two distinct `event.id`s for the same underlying object change**, so `event.id` alone is insufficient — you also need `(data.object.id, event.type)`. **penny: the dedup key is a composite, not just `event.id`.** (helios dedups on the *business* txn id — Stripe session id — which is exactly the `data.object.id` flavor, so helios is already on the right key.)

### 1c. Event ordering NOT guaranteed (confirms field-01 §0 / P-01) — verbatim
> *"Stripe doesn't guarantee the delivery of events in the order that they're generated… Make sure that your event destination isn't dependent on receiving events in a specific order… You can also use the API to retrieve any missing objects."*
- Example sequence (sub creation): `customer.subscription.created` → `invoice.created` → `invoice.paid` → `charge.created` — **any can arrive out of order.** → re-fetch the canonical object on ordering-sensitive logic (Corollary A). Confirmed from source.

### 1d. Retry policy (NEW exact numbers — field corpus only said "retries")
- **Live mode: up to 3 DAYS, exponential backoff.** Sandbox: 3 times over a few hours.
- **Manual retry:** Dashboard up to **15 days**; CLI up to **30 days** via `stripe events resend <event_id> --webhook-endpoint=<endpoint_id>`.
- **penny:** your idempotency window must tolerate a retry **3 days later** (and a *manual* replay **30 days** later) — a dedup table with a short TTL (e.g. 24h, matching request-idempotency-keys, field-01 §2) is **too short for webhook dedup.** Webhook dedup must persist ≥3 days (ideally indefinitely on `data.object.id`). ← important sizing rule the field corpus missed.

### 1e. Quick-ack-then-process (confirms field-01 §1b / P-03) — verbatim
> *"Your endpoint must quickly return a successful status code (2xx) prior to any complex logic that could cause a timeout… return a 200 response before updating a customer's invoice as paid… process incoming events with an asynchronous queue."*
- No explicit timeout *number* is stated (the doc deliberately says "avoid complex logic before 200, defer to a queue"). Confirms the field-01 §4 / O-09 "at-least-once consumer + DLQ" pattern is the official recommendation.

### 1f. THIN vs SNAPSHOT events (confirms field-01 §4 / field-02 §8.6) — the v2 trap
- **Snapshot events (API v1 resources):** full object in `event.data.object`, access directly.
- **Thin events (API v2 resources, Clover+):** **minimal payload — only metadata.** You MUST call `fetchRelatedObject()` to get current state, `fetchEvent()` for full event. Example: `v1.billing.meter.error_report_triggered`.
- **penny (directly relevant to metered billing, field-03):** the **meter error-report event is a THIN event** — a handler that reads `event.data.object` expecting the meter payload gets **only metadata** and must `fetchRelatedObject()`. A parser written for v1 snapshot events **silently gets nothing** from a v2 thin event. This is the field-02 §8.6 "payload shape tied to API version" pitfall, confirmed with the exact meter example. **Pin your API version; know whether each event you handle is thin or snapshot.**

---

## 2. SHARED PAYMENT TOKENS — the API surface (CLOSES G-04: revocation)
Source: `docs.stripe.com/agentic-commerce/concepts/shared-payment-tokens.md?agent-seller=seller` (2026-06-11). This **resolves the field-04 §6 / G-04 open question** ("can a customer kill an outstanding SPT mid-flight?") AND confirms the ecosystem-01 §1c GA-status GAP.

### 2a. The exact API resources (field corpus only had the blog-level "SPT" concept)
- **Seller receives a `SharedPaymentGrantedToken`** — API resource **`shared_payment.granted_token`** (the seller-facing object). The agent-facing issuance object is `SharedPaymentIssuedToken` (ecosystem-01 §1c, from the changelog).
- **STATUS: PREVIEW** — API version **`2026-04-22.preview`**. ⚠️ **This CONFIRMS the ecosystem-01 §1c GAP: SPT is NOT GA as of 2026-06-11.** Production SPT issuance requires the preview API version header (`Stripe-Version: 2026-04-22.preview`) and is gated. **penny: do not promise a production SPT flow yet — it's preview; the shape may change before GA.**

### 2b. The three constraints — exact field names (sharpens field-04 §1)
The `usage_limits` object (verbatim shape):
```json
{ "usage_limits": { "currency": "usd", "max_amount": 1000, "expires_at": 1783766216 } }
```
- `currency` (allowed currency), `max_amount` (cents cap), `expires_at` (Unix ts). ← These are the *concrete API fields* behind the field-04 §1 "seller-locked + capped + expiring" prose. (Note: the *seller* lock is implicit — the granted token is issued *to* a specific seller's Stripe profile, so "merchant scope" = which Stripe account holds the granted token, not a `merchant=` field.)

### 2c. Redemption (how a seller charges against it) — NEW, field corpus had none
```
POST /v1/payment_intents
  amount=1000 currency=usd
  payment_method_data[shared_payment_granted_token]=spt_123
  confirm=true
```
> *"When confirmed, Stripe **clones the customer's original payment method into a new PaymentMethod**, and subsequent operations (refunds, reporting) behave as if you provided the payment method directly."*
- So an SPT redemption produces a normal `PaymentMethod` clone → **refunds/reporting work normally.** Good for reconciliation (penny's mandate).

### 2d. Revocation — **CLOSES G-04** (the field-04 §6 open question)
> Token becomes unusable when: **(1) Consumed (one-time use), (2) Expired (past `expires_at`), (3) Revoked by the agent.** Listen for the **`shared_payment.granted_token.deactivated`** webhook event. *"Cannot create payments with revoked SPTs."*
- **ANSWER to G-04:** **Yes — a customer/agent CAN kill an outstanding SPT mid-flight (agent-revoked), and Stripe propagates it via the `shared_payment.granted_token.deactivated` webhook.** The seller must handle that event to stop attempting charges. So the "kill the agent's spend instantly" UX the TOOL-MATRIX flagged as unconfirmed (G-04) **is supported** — via webhook-propagated deactivation. **penny CAN build the "revoke this agent's spend now" button** — it's a deactivation that fires `granted_token.deactivated`. *(Caveat: in-flight = whether a charge already in `confirm=true` mid-call completes is not specified; revocation prevents NEW payments. Sub-gap noted.)*

### 2e. Network token (Visa/Mastercard) — still thin
- The doc *"references network tokens… but does not provide explicit details"* — *"The SPT abstracts the underlying payment method; when you use it, Stripe manages the network tokenization internally."* So the field-04 §1 blog claim ("agentic network token from Mastercard/Visa scoped to intent") is **abstracted away** at the API level — you don't touch the network token; Stripe handles it. **Sub-gap: the exact network-token scoping mechanics remain undocumented at this layer.**

---

## 3. METERED BILLING DOCS — and the Metronome steering signal
Source: `docs.stripe.com/billing/subscriptions/usage-based/recording-usage` (2026-06-11).
- **The endpoint is `/v1/billing/meter_events`** (confirms field-03 §1). *"Stripe processes meter events asynchronously, so aggregated usage… might not immediately reflect recently received meter events."* (confirms the eventual-consistency that makes the daily reconciliation, field-03 §6, necessary).
- ⚠️ **The doc itself now RECOMMENDS METRONOME for new integrations** — *"This page explicitly recommends using Metronome instead."* **This is a strong steering signal:** post-acquisition (ecosystem-05 §0), Stripe is routing new usage-billing users to the *acquired* Metronome rather than legacy Meters. **penny: for a *new* high-volume usage build, evaluate Metronome (now Stripe-native) over Meters** — the 35-day/no-backfill rigidity (field-03 §2) is the legacy-Meters limitation Metronome/Orb's raw-event-history model avoids.
- The **35-day window / no-backfill / aggregation-formula specifics were NOT on this overview page** — they're on the `recording-usage-api.md` sub-page (the field-03 source). So field-03's timestamp rules stand; this overview just confirms the endpoint + async nature + the Metronome steer. **The 35-day rule (field-03 §2 / G-03) remains as the field corpus had it — sub-page sourced, not re-byte-verified here.**

---

## 4. HOW penny USES THIS FILE
- **Webhook §1** is the canonical-source backing for every field-01 pitfall — quote *this* (docs.stripe.com) over the blogs when justifying the webhook test (ecosystem-03 §5).
- **The composite dedup key (§1b: `event.id` OR `data.object.id`+`event.type`)** and the **3-day/30-day retry window (§1d)** are two *sharper* rules than the field corpus had — fold into KNOWN-PITFALLS (the dedup-table-TTL-must-be-≥3-days rule is new).
- **SPT §2 resolves G-04** (revocation = `granted_token.deactivated` webhook) and confirms **SPT is still preview** (`2026-04-22.preview`) — update TOOL-MATRIX G-04 to RESOLVED and add the "preview, not GA" caveat to any SPT promise.
- **The Metronome steer (§3)** reinforces ecosystem-05 §1: for new usage billing, Metronome (Stripe-native) > legacy Meters.

## 5. OPEN / COULD-NOT-CONFIRM (residual)
- **Whether a charge already mid-`confirm` completes when an SPT is revoked** (the true in-flight race) — docs say revocation blocks *new* payments; the in-flight case is unspecified. **Sub-GAP.**
- **Exact network-token scoping mechanics** — abstracted away at the API layer; undocumented at this level. **Sub-GAP.**
- **The 35-day meter window** — confirmed endpoint + async, but the precise window is on the `recording-usage-api.md` sub-page (not re-crawled here); field-03's number stands but isn't re-byte-verified in this pass. **Carried-forward GAP (G-03).**
- **`SharedPaymentIssuedToken` (agent-side issuance) full field set** — I crawled the *seller* variant (`granted_token`); the *agent/issued* variant's full schema wasn't crawled. **Sub-GAP.**
