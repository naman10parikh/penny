---
title: "Ecosystem Intel — Best Starter / Template / Example Repos (June 2026)"
type: source
created: "2026-06-11"
updated: "2026-06-11"
tags: [payments, stripe, starters, templates, repos, saas-boilerplate, stars, ecosystem-intelligence]
sources:
  - "gh repo view (live, 2026-06-11) — star counts + last-push dates verified, not from memory"
  - "gh search repos (2026-06-11)"
summary: "The 3-5 best (and the most-popular-but-STALE) Stripe billing starter/example repos, with verified stars + last-commit dates + why each. The honest 'most-forked starter is unmaintained' flag the field corpus didn't surface."
related: ["[[Ecosystem Intel — Tool Versions & Changelog Deltas]]", "[[penny TOOL-MATRIX]]", "[[Ecosystem Intel — Agent-Operator Interface]]"]
---

# Ecosystem Intel — Starter / Template / Example Repos

> **Researcher:** ECOSYSTEM (CP123 Wave-R). Every star count + last-push date below was pulled live via `gh repo view` on **2026-06-11** (the search-API field is `stargazersCount`; the repo-view field is `stargazerCount` — they differ, a footgun that silently zeroed an earlier pass). The single most valuable finding: **the most-starred Stripe SaaS starter is unmaintained.**

## 0. The honest headline (read this before forking anything)
**`vercel/nextjs-subscription-payments` — 7,714★ but LAST PUSHED 2025-01-23 (16 months stale as of 2026-06-11).** This is the canonical "Next.js + Supabase + Stripe subscriptions" starter that everyone links to and forks. It predates: Dahlia (`decimal_string`→`Stripe.Decimal`), flexible billing mode default, Basil's `current_period_end` move (field-02 §1), and Meters replacing `createUsageRecord` (field-03 §1). **A fork of it ships 2025-era bugs.** If you reach for it, treat it as a *layout reference*, not runnable billing code — its webhook handler and proration assumptions are stale. **penny rule:** prefer a repo pushed in the last ~3 months for anything that touches charge math.

---

## 1. TIER A — Official Stripe sample repos (the load-bearing flows, kept current)
*Source: `stripe-samples/*`. These are the ones Stripe itself maintains alongside the docs; they get bumped when the API version moves.*

| Repo | ★ | Last push | Lang | Why it's the reference |
|---|---|---|---|---|
| **stripe-samples/checkout-one-time-payments** | **1,054** | **2026-06-08** | CSS/multi | The freshest official sample (pushed 3 days ago). Canonical Checkout one-time flow across 7+ server langs. Use for the *hosted Checkout* baseline. |
| **stripe-samples/subscription-use-cases** | **901** | 2026-05-01 | JS/multi | **The subscriptions bible** — "fixed prices OR usage-based billing." This is the one to mine for the JTBD-2 (lifecycle/proration) and JTBD-3 (metered) flows. Multi-language server impls. |
| **stripe-samples/checkout-single-subscription** | 892 | 2026-05-01 | CSS/multi | Checkout + Billing combined for a fast single-plan subscription. The minimal "sell one plan" path. |
| **stripe-samples/accept-a-payment** | 832 | 2026-05-12 | JS/multi | The PaymentIntents + SCA/3DS reference (JTBD-4). Card, wallets, 3DS challenge flows. Mine this for the field-05 3DS gotchas in *runnable* form. |
| **stripe-samples/issuing-treasury** | 96 | 2026-05-01 | TS | **The per-agent virtual-card reference** — Issuing + Treasury building blocks. Directly relevant to "agent earns + spends, P&L-isolated" (field-04 §5, helios). Low stars but high relevance. |

**Why official samples beat SaaS boilerplates for *correctness*:** they isolate ONE flow, are multi-language (so the pattern is visible without framework noise), and Stripe bumps them with the API version. They are *not* a product scaffold (no auth, no DB, no UI polish) — for that, see Tier C.

---

## 2. TIER B — The AGENTIC-PAYMENTS examples (the on-thesis, brand-new layer)
*These did not exist in 2025. This is where penny's JTBD-5 work starts.*

| Repo | ★ | Last push | Lang | License | Why |
|---|---|---|---|---|---|
| **stripe/link-cli** | **568** | **2026-06-11** | TS | MIT | **THE agent-spend reference impl.** Created 2026-04-23, pushed *today*. "Let your agents spend on your behalf. Your payment credentials are never exposed. You approve every purchase." The full CLI/MCP/skill interface is in ecosystem-03. **Fork/study this first for the consent-UX + SPT-issuance flows.** |
| **stripe/ai** (was `stripe/agent-toolkit`) | **1,602** | 2026-06-10 | TS | MIT | The agent-framework integration monorepo (function-calling tools for OpenAI Agents SDK / LangChain / CrewAI / Vercel AI SDK). Houses `@stripe/agent-toolkit` + `@stripe/mcp`. **Note the rename** (ecosystem-01 §0). |
| **agentic-commerce-protocol/agentic-commerce-protocol** | **1,439** | 2026-06-04 | — | Apache-2.0 | The **ACP open standard** (OpenAI+Stripe-maintained). The spec + reference shapes for agent↔merchant checkout. Created 2025-09-29. This is the *protocol*, not a runnable server. |
| **stripe-samples/machine-payments** | 46 | **2026-06-04** | Python | MIT | The official **MPP (Machine Payments Protocol)** sample. Brand-new (46★, pushed last week). The runnable counterpart to the MPP docs. Mine for session-aggregated high-frequency agent payments. |
| **stripe-samples/link** | 22 | 2026-04-21 | TS | MIT | Accepting payments with **Link wallet** demo — the human side of the wallet that `link-cli` gives agents access to. |
| **vercel/acp-handler** | 24 | 2025-12-14 | TS | MIT | "Integrate ACP into your servers." Low stars, **6-months stale** — useful as a shape reference for an ACP server handler, but verify against the current spec (the protocol moved since Dec 2025). |

### x402 (the crypto-rail escape hatch) — note the org move
- **`x402-foundation/x402` — 6,159★, pushed 2026-06-10** — **THIS is the canonical x402 repo now.** The protocol was donated to the **Linux Foundation (2026-04-02)** and the repo moved **from `coinbase/x402` to `x402-foundation/x402`.** The old `coinbase/x402` is a 90★ stub. *Any doc linking `coinbase/x402` should point to `x402-foundation/x402`.* — `gh search repos x402` (2026-06-11). **Ecosystem delta the field corpus didn't have.**
- **`google-agentic-commerce/a2a-x402` — 527★, 2026-06-08** — the **AP2↔x402 bridge** ("A2A x402 Extension brings cryptocurrency [payments to A2A]"). This is how Google's agent-payments stack talks to the x402 rail. Relevant to the "protocols absorbing each other" theme (field-04 §4).
- **`Merit-Systems/x402scan` — 346★, 2026-06-11** — x402 ecosystem explorer (the block-explorer for agent payments). Useful for the "is the demand real or synthetic?" dispute (field-04 §3, D-02) — it's where you'd *measure* x402 volume.
- **`x402-rs/x402-rs` — 269★** — Rust verify/settle impl (server side).

---

## 3. TIER C — SaaS boilerplates (full product scaffolds: auth + DB + billing + UI)
*When you want a *product*, not just a payments flow. Honest staleness flags included.*

| Repo | ★ | Last push | License | Verdict |
|---|---|---|---|---|
| **ixartz/SaaS-Boilerplate** | **7,180** | **2026-06-01** | MIT | **The live leader.** Fresh (pushed 10 days ago), Next.js, MIT. The one to fork for a 2026 SaaS-with-Stripe product. Replaces the stale `nextjs-subscription-payments` as the default recommendation. |
| **boxyhq/saas-starter-kit** | **4,840** | **2026-05-11** | Apache-2.0 | Enterprise-leaning (SSO/SAML, audit, team mgmt). Fresh. Good if you need the compliance/SSO surface (checklist C2 GAP items) out of the box. |
| **mickasmt/next-saas-stripe-starter** | 2,989 | **2024-08-16** | MIT | **STALE (22 months).** Popular but predates everything 2026. Layout reference only. |
| **vercel/nextjs-subscription-payments** | 7,714 | **2025-01-23** | MIT | **STALE (16 months).** See §0. Most-forked, least-current. Do not use for live billing. |

**Boilerplate selection taste:** for a 2026 build, **ixartz/SaaS-Boilerplate** (fresh, MIT) or **boxyhq/saas-starter-kit** (fresh, enterprise/SSO). Avoid the two high-star-but-stale ones for anything touching the Stripe API surface — re-derive the webhook handler + proration from the *official* samples (Tier A) and the field-corpus pitfalls, not from a 2024/2025 boilerplate.

---

## 4. penny's recommended starting set (the 5 to actually open)
1. **stripe-samples/subscription-use-cases** — for billing lifecycle + metered (JTBD-2/3). Freshest canonical subscription code.
2. **stripe/link-cli** — for agent spend + consent UX + SPT (JTBD-5). The on-thesis reference; pushed today.
3. **stripe-samples/issuing-treasury** — for the per-agent virtual card P&L (helios fusion).
4. **stripe-samples/machine-payments** — for MPP session-aggregated agent payments (the high-frequency rail).
5. **ixartz/SaaS-Boilerplate** — for the product shell (auth+DB+UI) IF penny needs a full web surface; otherwise skip — penny's value-add is the billing *logic*, not another SaaS skin.

## 5. OPEN / COULD-NOT-CONFIRM
- Whether `agentic-commerce-protocol/agentic-commerce-protocol` ships a *runnable* reference server or only the spec — I confirmed it's the spec repo (Apache-2.0) but didn't crawl its `/examples` tree. **Minor GAP.**
- Exact maintenance status of `vercel/acp-handler` (24★, last push 2025-12-14) vs the current ACP spec version — it may be spec-drifted. Verify before using as more than a shape reference. **GAP.**
