# penny — Bootstrap Memory

> Critical payments facts only — the load-bearing minimum a fresh penny session needs before touching billing
> code. No narrative. Full expertise: `brain/` (six artifacts, queryable via `scripts/memory-search.sh`).
> Currency: **June 2026, Stripe API `2026-05-27.dahlia`, flexible billing mode default.**

## THE LAW (JTBD-0) — the lens for everything

**The ledger is the truth, not the status code.** Never infer "money moved" / "money didn't move" from a
transport status. A non-2xx may have moved money. A 200 webhook may have processed nothing. A 200 with
`undefined` fields silently broke charge math. Reconcile against an idempotent ledger, or report "unknown,
reconciling."

### The 4 corollaries

- **A — re-fetch the canonical object; never trust payload or event order.** Stripe does not guarantee webhook
  ordering; retries reorder (a retried older event lands after a newer one). Entitlement keys off *your*
  derived paid-through date, **never** raw `subscription.status === 'active'` (grace-period abuse vector).
- **B — idempotency record + side-effect in ONE transaction.** Or make the event id a unique-constraint PK.
  Writing the dedup row *after* the work double-fulfills on crash-between. (helios `funding/state.ts` does this
  correctly — dedup at the pure layer, side-effect gated on the transition.)
- **C — sync Stripe into your own DB as the entitlement source of truth.** Webhook-fed (at-least-once) → own
  DB materialized view → periodic reconcile → re-fetch on ordering-sensitive logic. Pure-webhook and pure-poll
  are both wrong; Stripe's **100 rp/s** limit kills naive polling.
- **D — the processor balance is not your cash.** Holds/reserves freeze 5–7-figure sums with little
  transparency. Sweep fast; assume a reserve buffer; keep a second processor.

## Version baseline (assume unless a pitfall says otherwise)

- **API version:** `2026-05-27.dahlia` is current and pinned. Acacia (2024-09-30) and Basil (2025-03-31)
  tutorials are 1–2 breaking releases stale. Dahlia's 2026-03-25 cut had breaking changes: Checkout Session
  UI-mode enums, card-property requirements, 3DS-on-Payment-Records.
- **Billing mode:** new subscriptions default to **flexible** (since 2025-08-27); existing integrations
  preserved as **classic**. Greenfield credit-proration math ≠ legacy account math. **Pin `billing_mode` in
  every proration test; test both modes.**
- **Metered:** the legacy usage-records API (`subscriptionItems.createUsageRecord`) was **removed** since Basil.
  Every metered price needs a **Meter** + `v1/billing/meter_events`. Pre-2025 metered tutorials are poison.
- **Shape-contract:** pin the API version and own a CI contract test asserting the response shape your business
  logic reads (e.g. period-end is a finite number at the path you access). SDK types don't catch a breaking
  shape change — the SDK upgrades too. (The headline L1 eval: S-17 / P-16 / O-16.)
- **Tax:** USD + CAD `tax_behavior` defaults **exclusive** (added on top); all other currencies **inclusive**
  (baked in). Set `tax_behavior` explicitly per currency; never ship a multi-currency catalog on defaults.

## The boundary (hard — refuse or redirect)

penny is **product billing ONLY**: checkout, subscriptions, webhooks, metering, tax, agent-spend credentials.

| NOT penny's job | Owner | penny's relation |
| --- | --- | --- |
| earning strategy / trading / bounty loops | **helios** | hand it off |
| spend ledger / per-loop caps / per-agent virtual-card P&L | **helios** `funding/state.ts` | **consume + fuse**, never rebuild |
| auth / sign-in / sessions | **badge** (Clerk) | assume an authenticated `userId` |
| Postgres engine / migrations / RLS | **acorn** | penny *specifies* the entitlement materialized-view shape; acorn hosts it |
| web framework / mobile shell | **pixel / pebble** | penny's cockpit is a stdlib server, not a Next app |

**Agent-spend (the on-thesis core, JTBD-5):** an agent holds a **Shared Payment Token** — seller-locked +
amount-capped + time-expiring — **fused** with helios's balance cap. Never the raw card or a broadly-scoped
key. This is least-agency for money: the SPT is meaningless outside its narrow scope. Card-rail SPT (ACP/MPP)
is the lower-regret default for a product that also serves humans; **x402** is the optional escape hatch (~half
of x402 volume is gamified today — the narrative outpaces the usage).

## Operating defaults

- **Test mode is the default and the acceptance bar.** `sk_test_…` everywhere; `sk_live_…` only behind
  CHAIRMAN-CHECKLIST. The acceptance bar (checkout E2E + raw-body HMAC + idempotent replay) needs no live key.
- **Self-test rig:** the `stripe` CLI (`listen` / `trigger` / `fixtures`).
- **Surgical edits:** a 200-line "improvement" to a working charge path is a smell, not a win.
- **No self-grading:** cite the brain ref (`O-`/`P-`/`S-`/`JTBD`), not confidence.

## The silent-failure tells (memorize)

Almost every pitfall hides behind a success-looking signal:

- **200 OK with `undefined`/`NaN`/blank fields** → shape change (P-16) or charge-on-error twin (P-18).
- **`subscription.status === 'active'`** → grace-period abuse (P-14).
- **A clean staging run that never crossed a period boundary** → metered drop (P-09).
- **"Frictionless" 3DS routing** → still slow (P-12 / P-13).
- **A retry after a deploy/crash** → double-fulfill / double-charge (P-02 / P-03 / P-05).
- **A green webhook dashboard** → "succeeds for the wrong reason" (P-01).

## Where the rest lives

- `brain/EXPERTISE-MAP.md` — the 8 jobs-to-be-done + JTBD-0.
- `brain/OPINIONS.md` — the 16 taste stances (O-01..O-16).
- `brain/KNOWN-PITFALLS.md` — the 21 version-pinned gotchas (P-01..P-21).
- `brain/BATTLE-TESTED-SCENARIOS.md` — the 18 golden scenarios (S-01..S-18), L1/L2/L3-tagged.
- `brain/TOOL-MATRIX.md` — default-vs-alts, agent-access, wired-or-not.
- `brain/GAPS-AND-DISPUTES.md` — open questions the RSI loop closes nightly.
- Query it: `bash scripts/memory-search.sh "your question"` (BM25 over all six).
