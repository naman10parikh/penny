---
title: "penny TOOL-MATRIX — Canonical Tools, Agent-Access & Required Secrets"
type: synthesis
created: "2026-06-11"
updated: "2026-06-11"
tags: [payments, billing, tools, stripe, agent-payments, secrets, mcp, x402, field-intelligence]
sources:
  - "[[Field Intel — Agent Payments: Who Holds the Token, Scoped Spend]]"
  - "[[Field Intel — Metered / Usage-Based Billing Gotchas]]"
  - "[[Field Intel — Migration War Stories & What 2026 Invalidated]]"
  - "[[Field Intel — Production Postmortems, HN Threads & Where Experts Disagree]]"
  - "[[penny FIELD-INTELLIGENCE — Index & Synthesis]]"
related: ["[[EXPERTISE-MAP]]", "[[OPINIONS]]", "[[GAPS-AND-DISPUTES]]", "[[KNOWN-PITFALLS]]"]
summary: "The canonical tool list for the payments vertical: default vs alternatives, when-to-use-which, the agent-access surface (CLI/API/MCP), and the env vars/secrets each needs. The 'Required Secrets' section feeds the Wave-P secrets manifest directly."
---

# penny TOOL-MATRIX

> **What this is.** The opinionated tool map for the payments/billing surface, plus the **agent-access surface** (how a Claude session actually drives each tool: CLI / API+SDK / MCP) and the **secrets** each needs. The final section is the **Required-Secrets manifest seed** for Wave P — copy it into the chairman checklist. Defaults reflect [[OPINIONS]] and Energy's existing stack (helios spend-ledger, quartermaster catalog at `eval_score≈1.0`).
>
> **Currency:** June 2026, Stripe API `2026-05-27.dahlia`. The ecosystem-watch source per `dsip.json` `externalIntelligence` is the changelog/issues/X feeds listed in §Watchlist.

---

## 1. Core processor / billing engine

| Need | Default | Alternatives | When to switch | Agent-access surface |
|---|---|---|---|---|
| Subscriptions, invoices, checkout | **Stripe Billing + Checkout** | Chargebee, Recurly, Paddle/Lemon Squeezy (MoR), Dodo (MoR) | MoR if you want global tax/VAT offloaded and accept giving up direct card-network relationship + some data (field-02 §2) | **API+SDK** (`stripe-node`/`-python`), **CLI** (`stripe`), **MCP** (`@stripe/mcp`) |
| Metered / usage billing | **Stripe Meters** (`v1/billing/meter_events`) | (in-house usage ledger as reporting SoT for advanced UBB — field-03 §5) | Always pair Stripe Meters with your own usage ledger for reconciliation (O-06) | **API** (`meter_events`, `meter-event-summary`); **CLI** for meter CRUD |
| Issuing agent/virtual cards | **Stripe Issuing** (per-agent virtual card) | — | Default for "agent earns + spends" P&L isolation (field-04 §5) | **API+SDK** |
| Tax / VAT | **Stripe Tax** | MoR (Paddle/etc.) offloads it entirely | If you can't act on registration thresholds yourself, MoR (field-00 Appendix) | **API** (auto-calc on invoices) |

**Stripe-specific taste (non-negotiable defaults):**
- **Pin the API version** and own a shape-contract test in CI (O-16 / S-17). Current is `2026-05-27.dahlia`; verify the Dahlia diff (G-02) before trusting specifics.
- **Verify webhook HMAC over raw bytes** (P-04); consume at-least-once with a DLQ (O-09).
- **Meters are near-immutable** — name like a public API (O-07).
- **`billing_mode` is flexible by default** on greenfield; pin it in tests (O-06 / P-17).

**The CLI is a first-class agent tool** (`stripe`): `stripe listen --forward-to localhost/...` to receive + replay webhooks locally, `stripe trigger <event>` to fire test events, `stripe fixtures` for seed data. This is how penny self-tests webhook handling ([[BATTLE-TESTED-SCENARIOS]] S-01/S-02/S-03) without a live customer.

---

## 2. Agent-payment rails (who holds the token)
*The on-thesis layer — see [[EXPERTISE-MAP]] JTBD-5. Default per [[OPINIONS]] O-12: card-rail SPT first, x402 as optional escape hatch.*

| Protocol / tool | Default? | Rail | Who holds token | Best for | Agent-access |
|---|---|---|---|---|---|
| **Stripe Shared Payment Tokens (SPT)** | **YES — the scoped-credential primitive** | card | Stripe (agent never sees card) | seller-locked + capped + expiring agent spend (O-11) | **API** (agentic-commerce) |
| **ACP** (Agentic Commerce Protocol, OpenAI+Stripe) | **YES — for agent↔merchant checkout** | card via SPT | Stripe | discovery + checkout | **API**, OSS handler (Vercel `acp-handler`) |
| **MPP** (Machine Payments Protocol, Stripe+Tempo) | optional — high-frequency sessions | fiat/card/stablecoin, session-aggregated | Stripe (SPT) | high-frequency agent *sessions* | **API/SDK** (Stripe SDK + session config) |
| **x402** (Coinbase+Cloudflare) | **escape hatch only** | USDC on Base/Solana over HTTP 402 | **agent self-custodies wallet keys** | permissionless per-request micropayments | **HTTP 402** flow; Stripe also supports x402 (`docs.stripe.com/payments/machine/x402`) |
| **AP2** (Google) | watch | card/network, FIDO "Human Not Present" | varies (mandate-based) | cross-agent mandate/authorization | — (thinner docs — G in field-04 §6) |
| **UCP** (NVIDIA reference) | watch | merchant-control checkout | merchant | retail negotiation w/ merchant control | — |

**Rail-selection taste:**
- **Default card-rail SPT (ACP/MPP)** for a product that also serves humans — built-in Radar/tax/reporting, compliance handled, setup in hours (field-04 §3). x402 puts compliance + fraud on *you* and self-custody risk on the agent.
- **x402 only when** you genuinely need permissionless, crypto-native, per-request micropayments — and even then know demand is partly synthetic today (D-02, P-21).
- **Revocation semantics for SPT are unconfirmed** (G-04) — resolve before promising a "kill the agent's spend instantly" UX.
- **Reconcile the agent's internal ledger vs the provider record** — penny's core value-add (field-04 §5).

**Internal references penny inherits (don't rebuild):**
- **helios** `funding/state.ts` — the spend-side: append-only ledger, dedup on txn id, derived balance, per-loop + daily-loss caps, HMAC-verified Stripe webhook (field-01 §3, field-04 §5). penny *fuses* this balance-cap with SPT's credential-scope (O-11).
- **quartermaster** — catalogs the payments stack (`stripe*` tools at `eval_score≈1.0`).
- Energy checklist default four-layer stack: **Stripe agent-toolkit + `@stripe/mcp` · x402/Coinbase · Stripe link-cli (human-approved spends) · Stripe Projects** (field-04 §5).

---

## 3. Webhook / sync infrastructure
*Per the schism resolution (D-01 / O-09): a synced local DB, webhook-fed + reconciliation-backed.*

| Need | Default | Alternatives | When to switch | Agent-access |
|---|---|---|---|---|
| Receive + verify webhooks | **Own handler** (raw-body HMAC, at-least-once, DLQ) | — | never outsource the *verification*; you can outsource the *sync* | API + `stripe` CLI for local replay |
| Stripe → DB sync (entitlement SoT) | **Own DB materialized view** | Stripe-no-webhooks / Autumn / similar "sync your Stripe to Postgres" tools | a managed sync tool is fine *if* you understand it still runs the webhook consumer for you (D-04) and exposes reconciliation | varies |
| Local webhook testing | **`stripe listen` / `stripe trigger`** | ngrok + dashboard | — | **CLI** |

**Taste:** entitlements derive from *your* DB + paid-through date (O-03), never the raw payload or `subscription.status`. Re-fetch the canonical object on ordering-sensitive logic (P-01). Watch the **100 rp/s** API limit (D-01) — it's why naive polling loses.

---

## 4. Processors / Merchant-of-Record (resilience + tax tradeoff)
*Driven by the fund-hold reality (O-13) and the MoR migration calculus (field-02 §2).*

| Role | Primary | Secondary (resilience) | MoR option | Note |
|---|---|---|---|---|
| Card processing | **Stripe** | a **second processor** (so one freeze isn't existential — O-13) | Paddle / Lemon Squeezy / Dodo | A second processor is a *resilience* decision, not premature optimization, given $12k/$85k/$1.45M holds (field-07 §1) |
| Global tax liability | Stripe Tax (you register) | — | **MoR owns tax/VAT + customer-of-record** | Migrating *off* an MoR suddenly makes you own VAT registration in dozens of jurisdictions (field-02 §2) |

---

## 5. Observability / reconciliation (the always-on safety net)

| Need | Tool | Why |
|---|---|---|
| Usage drift alarm | Daily diff: internal usage ledger vs Stripe `meter-event-summary` | Catches the silent metered drop (P-09 / S-09) — the canary staging can't see |
| Payout/hold monitoring | Stripe Balance + payout webhooks; reserve-buffer dashboard | Processor balance ≠ cash (O-13) |
| Shape-contract test | CI assertion pinned to API version | Catches breaking shape changes shipped as 200 OK (O-16 / S-17) |
| Webhook DLQ + replay | Dead-letter queue + replay tool | 2026 table-stakes (field-01 §4) |

---

## 6. Watchlist (the `externalIntelligence` source for the RSI loop)
Re-check monthly per `dsip.json` `externalIntelligence`:
- **Stripe changelog** — `https://docs.stripe.com/changelog/` (resolve Dahlia diff G-02; watch for the next breaking release after Dahlia).
- **ACP repo** — `github.com/agentic-commerce-protocol/agentic-commerce-protocol` (OpenAI+Stripe, actively updated).
- **Vercel ACP handler** — `github.com/vercel/acp-handler`.
- **x402 Foundation** (Linux Foundation since 2026-04-02) — spec + volume numbers (D-02 is a moving forecast).
- **Laravel Cashier / wrapper issues** — e.g. flexible-mode support (#1832); wrappers lag the default (P-17).
- **Stripe agentic-commerce docs** — SPT revocation (G-04), ACP-vs-MPP for subscription+usage (G-05).
- **X topical sweep** — *blocked* until the SearchTimeline `doc_id` is refreshed in `scrape.py` (GAPS Part D).

---

## 7. REQUIRED-SECRETS MANIFEST (seed for Wave P)
> Drop into the chairman checklist. **Test-mode keys unblock everything except live money movement.** Already present in `.env.example` are marked ✅; payments-specific *additions* are marked ➕.

### Tier 0 — unblocks the brain/eval loop (test mode, no real money)
| Secret | Tool | Purpose | In `.env.example`? |
|---|---|---|---|
| `STRIPE_SECRET_KEY` (test: `sk_test_…`) | Stripe API/SDK/CLI | drive Billing/Checkout/Meters/Issuing in test mode; run live experiments to close G-01/G-03/G-04 | ✅ |
| `STRIPE_PUBLISHABLE_KEY` (test: `pk_test_…`) | Stripe.js / Checkout | client-side checkout + 3DS test flows (S-11/S-12) | ✅ |
| `STRIPE_WEBHOOK_SECRET` (`whsec_…`) | Own webhook handler | raw-body HMAC verification (P-04 / S-03); `stripe listen` prints one | ✅ |

### Tier 1 — agent-payment rails (when JTBD-5 work starts)
| Secret | Tool | Purpose | In `.env.example`? |
|---|---|---|---|
| Stripe agentic-commerce / SPT access (gated feature on the Stripe account, keyed by `STRIPE_SECRET_KEY`) | SPT / ACP / MPP | issue scoped agent credentials (O-11 / S-13) | ➕ (account feature-flag, not a new key) |
| `X402_WALLET_PRIVATE_KEY` *(only if x402 escape hatch is built)* | x402 / Coinbase | agent self-custody wallet — **high-sensitivity**, gitignored, test-network first | ➕ |
| `COINBASE_API_KEY` / `COINBASE_API_SECRET` *(only if x402)* | Coinbase rails | x402 settlement | ➕ |

### Tier 2 — already in the repo's `.env.example` (no payments-specific action)
`ANTHROPIC_API_KEY` (Claude / eval `claude -p`), `GITHUB_PERSONAL_ACCESS_TOKEN` (MCP `github` + Actions push), `BROWSERBASE_API_KEY`/`PROJECT_ID` + `FIRECRAWL_API_KEY` (docs-crawl for changelog watch / G-02), `SUPABASE_*` (if the synced-DB entitlement view is hosted there).

### Handling rules (inherited)
- **Never commit real keys** (`.claudeignore` already excludes `.env*`); test keys for the eval loop, live keys only behind the chairman checklist.
- **Scrub before any public publish** (genericize keys/paths) — penny is a product harness; treat live Stripe keys as secrets even in examples.
- `X402_WALLET_PRIVATE_KEY` and any live `sk_live_…` are the **highest-sensitivity** items: gitignored, test-network/test-mode first, never in a code example.

---

## How the RSI loop uses this file (`re-verify-tool-matrix` step)
Nightly, the loop should: (1) hit the §6 watchlist and flag any changelog/spec/version drift (esp. a post-Dahlia release or new SPT/ACP/MPP semantics); (2) confirm the §7 secrets manifest still matches `.env.example` + `.mcp.json`; (3) when a §6 change invalidates an [[OPINIONS]] default or a [[TOOL-MATRIX]] row, open a proposal gated by the eval pyramid (`dsip.eval.gate`). **A drifted default that the loop didn't catch is a loop bug.**
