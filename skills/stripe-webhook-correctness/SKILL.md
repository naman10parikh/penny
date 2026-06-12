---
name: stripe-webhook-correctness
description: Write or review a Stripe webhook handler so it receives money exactly once across retries, reorders, crashes, and ambiguous transport errors. Use when building or auditing any code that consumes Stripe events (checkout.session.completed, invoice.payment_succeeded, customer.subscription.updated) or a `/webhook` route.
model-tier: sonnet  # mechanical pattern-application + grep; opus only for a novel ordering puzzle
---

# stripe-webhook-correctness

> **Law (JTBD-0):** the ledger is the truth, not the status code. A webhook's *arrival* is not proof money moved; a 200 is not proof the work happened. This skill makes "received exactly once" a property you can assert, not hope for. — `brain/EXPERTISE-MAP.md` JTBD-0.

## Trigger

Invoke when ANY of these are true:
- You are writing a new Stripe webhook handler / `/api/webhook` route.
- You are reviewing existing handler code (a `penny review` on a path that consumes events).
- The symptom is "every webhook 400s", "duplicate seats/credits/shipments after a deploy", or "entitlement flipped to a stale value and self-healed."
- A handler reads fields directly off `event.data.object` on ordering-sensitive logic.

## Steps

Run in order. Each step names the brain ref it enforces; cite it in the finding/comment (no generic Stripe advice).

1. **Raw-body HMAC first (the #1 silent killer).** Confirm the route reads **raw bytes** (`await req.text()` / `express.raw`), with the framework body-parser **disabled** for that path, and passes the raw string + `stripe-signature` header to `constructEvent`. If the route does `await req.json()` (or any JSON middleware) before verifying, the reserialized body no longer byte-matches what Stripe signed and *every* webhook 400s with "No signatures found matching." **Never** rotate `STRIPE_WEBHOOK_SECRET` as the first fix — it is almost never the secret. — **P-04 / S-03** (`brain/KNOWN-PITFALLS.md` P-04, `brain/BATTLE-TESTED-SCENARIOS.md` S-03).

2. **Same-transaction idempotency.** Confirm the dedup row (event id) is INSERTed in the **same DB transaction** as the side-effect, **or** the Stripe event id is a unique-constraint PK so the second insert fails the handler before any side-effect. A `processed_events` table written *after* `grantAccess()` does **not** make you idempotent — a crash between the work and the INSERT double-fulfills on Stripe's retry. — **O-02 / P-02 / S-02** (`brain/OPINIONS.md` O-02). The copyable in-house proof is helios `funding/state.ts` (dedup at the pure layer, side-effect gated on the dedup'd transition).

3. **Acknowledge fast, process durably.** Confirm the handler returns 2xx within Stripe's timeout window and enqueues the real work. An inline-slow handler gets timed-out → retried → concurrent duplicate processing. — **P-03** (`brain/KNOWN-PITFALLS.md` P-03; `brain/EXPERTISE-MAP.md` 1.4).

4. **Re-fetch on ordering-sensitive logic; never trust payload/event order.** Stripe does **not** guarantee ordering and retries (≈3-day exponential backoff) can land an older event after a newer one. On any ordering-sensitive field, **re-fetch the canonical object** from the API and derive state from that + your own derived paid-through date — not from `payload.plan` / `payload.status`. Treat the handler as at-least-once. — **P-01 / S-01** (`brain/KNOWN-PITFALLS.md` P-01, `brain/BATTLE-TESTED-SCENARIOS.md` S-01).

5. **Request-side idempotency keys are a 24h window.** If the handler *makes* charges, confirm idempotency keys are UUID v4, **per logical operation**, and not retried past 24h (a retry after the window creates a duplicate charge; same key + different params errors). Re-derive a fresh op + reconcile instead of replaying a stale key. — **P-05** (`brain/KNOWN-PITFALLS.md` P-05).

6. **Local materialized view, not pure-webhook or pure-poll.** Confirm the design consumes webhooks at-least-once → writes to your own DB as the entitlement source of truth → reconciles via a periodic API pull (mind the **100 rp/s** limit) → re-fetches on ordering-sensitive logic. Pure-webhook misses late/disputed events; pure-poll dies on the rate limit. — **O-09** (`brain/OPINIONS.md` O-09; `brain/EXPERTISE-MAP.md` 6.4).

## Output

A findings list (for review) or a corrected handler (for authoring), each item shaped:
`{ check: <step>, status: pass|fail, brainRef: P-0n|O-0n|S-0n, file:line, fix }`.

- **Authoring:** emit a handler that reads raw bytes, verifies HMAC, dedups in-transaction, ACKs fast, and re-fetches on ordering-sensitive paths.
- **Review:** every finding cites the brain ref above (an uncited "consider idempotency" is slop, not a finding). Exit non-zero when a HIGH finding (P-04 raw-body, P-02 idempotency) is present.

## Self-test rig

Prove it against Stripe **test mode** via the `stripe` CLI: `stripe listen --forward-to localhost:<port>/webhook` (prints the `whsec_…`), then `stripe trigger checkout.session.completed`. Assert: raw `constructEvent` succeeds; a tampered body is rejected; replaying the same event id is a no-op (side-effect runs exactly once). This is the `penny wire` acceptance test's webhook half (S-02 + S-03).
