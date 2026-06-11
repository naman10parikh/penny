---
title: "Ecosystem Intel — Competing-Tools Trade-off Matrix + Stripe Projects (June 2026)"
type: source
created: "2026-06-11"
updated: "2026-06-11"
tags: [payments, stripe, competitors, lago, orb, metronome, paddle, lemon-squeezy, merchant-of-record, stripe-projects, ecosystem-intelligence]
sources:
  - "Stripe Sessions 2026 blog (2026-04-29) — https://stripe.com/blog/everything-we-announced-at-sessions-2026"
  - "WebSearch: usage-based-billing comparison + MoR comparison (2026-06-11)"
  - "gh repo view (2026-06-11) for OSS competitor repos"
summary: "The honest competing-tools matrix (versions + the 2026 consolidation — Stripe bought Metronome AND Lemon Squeezy), plus the Stripe Projects deep-dive (32 providers, CLI-provisioned dev stack for coding agents). Two acquisitions reshape the field-02 §2 MoR calculus."
related: ["[[penny TOOL-MATRIX]]", "[[Ecosystem Intel — Tool Versions & Changelog Deltas]]", "[[Field Intel — Migration War Stories & What 2026 Invalidated]]"]
---

# Ecosystem Intel — Competing Tools + Stripe Projects

> **Researcher:** ECOSYSTEM (CP123 Wave-R). The field corpus had the *concept* of MoR alternatives; this file has the **2026 consolidation** (Stripe acquired both Metronome AND Lemon Squeezy — the competitive map is being absorbed) + concrete pricing + the Stripe Projects "coding-agent provisions its own dev stack" layer.

## 0. THE HEADLINE: Stripe is absorbing the competitive map (two acquisitions)
Two facts that reshape every "Stripe vs X" comparison and partly obsolete field-02 §2:
1. **Stripe acquired Metronome (~Jan 2026, ~$1B)** — the high-throughput usage-based-billing engine is now a **Stripe product** (*"manages commits, multidimensional pricing structures, bespoke contracts… real-time revenue visibility down to the account, contract, and product level"* — Sessions 2026 blog). So "Stripe Billing vs Metronome" is now "basic Stripe Billing vs Stripe's *acquired* enterprise tier." — WebSearch (dodopayments/solvimon, 2026-06-11); Sessions 2026 blog.
2. **Stripe acquired Lemon Squeezy (July 2024)** → built **Stripe Managed Payments** (in-Stripe Merchant-of-Record, GA at Sessions 2026, **80+ countries**). Lemon Squeezy users are being **migrated to Managed Payments**. So "Stripe vs Lemon Squeezy MoR" is now "Stripe-processor vs Stripe-MoR" — same vendor. — lemonsqueezy.com/blog/2026-update; Sessions 2026 blog.

**penny implication (updates field-02 §2):** the old framing "*MoR = leave Stripe, give up the card-network relationship*" is now **partly false** — you can get MoR (Managed Payments) *inside* Stripe, keeping one vendor. The remaining reasons to use a *third-party* MoR (Paddle/Polar/etc.) are now narrower: jurisdiction coverage breadth (Paddle leads), indie-friendly pricing/UX, or **not wanting Stripe as a single point of failure** (the fund-hold risk, field-07 §1 / O-13 — still a real reason for a second, non-Stripe processor).

---

## 1. USAGE-BASED BILLING — the honest trade-off matrix
*The field-03 metered-billing surface, with the competitors that exist because Stripe Meters' rigidity (35-day window, no backfill, immutable meters — field-03 §2/§3) leaves room.*

| Tool | Type | Payment processing | The one-line honest trade-off | Pricing |
|---|---|---|---|---|
| **Stripe Billing + Meters** | Add-on to Stripe payments | **Built-in** (no separate gateway) | *Fastest to launch IF already on Stripe;* but Meters are rigid — **rejects events outside the current period, no backfill, near-immutable** (field-03). **100 rp/s** Events API limit (field-07 §3) — fine for 10k customers×30 events/day, **breaks** for 1k customers×10k calls/day. | **0.7%** of billing volume on top of 2.9%+30c ≈ **3.6%+30c** total. No platform fee. |
| **Orb** | Standalone billing | Needs separate gateway | **Query-based metrics over RAW event history** → *"handles retroactive pricing changes and late events cleanly"* — **the direct answer to Stripe Meters' no-backfill problem (field-03 §2).** Best for high-volume AI/API with eng support. | Not public (sales call). |
| **Metronome** | ⚠️ **now a Stripe product** | Stripe built-in | High-throughput real-time metering, rate cards, prepaid credits, **commits + bespoke contracts**. Enterprise-leaning, heavier impl. Post-acquisition = Stripe's enterprise usage tier. | Not public. |
| **Lago** | **Open-source** | Needs separate gateway | **Self-host, no revenue %, no vendor lock-in, data residency.** You own the hosting + eng burden. The escape hatch from "revenue tax." | OSS (self-host) / cloud. |
| **Chargebee / Zuora** | Subscription mgmt | Needs separate gateway | Mature subscription/dunning/revenue-recognition; heavier, enterprise. | Sales. |

**The architectural fork (the real decision):** *Stripe Billing + Metronome use Stripe's built-in payments; **Chargebee, Orb, Lago, Zuora all require a separate payment gateway** — adding cost + complexity.* So the usage-billing choice is entangled with the processor choice. — dodopayments / solvimon comparisons (2026-06-11).

**penny taste (updates TOOL-MATRIX §1):**
- **Default Stripe Meters** for launch-speed *if* event volume < 100 rp/s and you don't need retroactive re-pricing.
- **Switch to Orb** the moment you need **late-event tolerance or retroactive pricing** (the exact thing Stripe Meters refuses — field-03 §2) — Orb's "query over raw events" model is architecturally better for that, at the cost of a separate gateway.
- **Lago** if open-source / no-revenue-% / data-residency is a hard requirement.
- **Always keep your own usage ledger as reporting SoT regardless** (O-06 / field-03 §5) — true for *every* tool above, because Stripe's `billable_items` reporting is incomplete and the others rate-card independently.

---

## 2. MERCHANT-OF-RECORD — the honest matrix (post-consolidation)
*field-02 §2 + field-07 §1, updated for the two Stripe acquisitions.*

| Tool | MoR? | Who's the seller / handles tax | Fees | The honest trade-off |
|---|---|---|---|---|
| **Stripe (processor)** | ❌ | **You** are MoR; you handle tax (Stripe Tax tracks, you register — field-00 Appendix) | **2.9% + 30¢** | Direct card-network relationship, all the data, lowest fee — but **you own VAT/sales-tax registration in every jurisdiction.** |
| **Stripe Managed Payments** | ✅ (NEW, GA 2026) | **Stripe** is MoR; tax in **80+ countries**, fraud, disputes handled | (premium over base) | **MoR without leaving Stripe** (came from the Lemon Squeezy acq). One vendor for processor + MoR. The 2026 game-changer for the field-02 §2 calculus. |
| **Paddle** | ✅ | Paddle is MoR; **most jurisdictions, most mature tax** (US all states, EU VAT, UK, AU GST, Asia) | **5% + 50¢** | The MoR breadth leader. Enterprise features. Best if you want maximum global tax coverage off your plate. |
| **Lemon Squeezy** | ✅ (being absorbed) | LS is MoR | 5% + 50¢ | Indie-favorite, simple/fast — but **now a Stripe side-product**, users steered to Managed Payments. Migration path, not a long-term independent bet. |
| **Polar / Creem / FastSpring / Fungies** | ✅ | Third-party MoR | varies | The "genuinely indie-built" alternatives if you specifically *don't* want to be inside Stripe's gravity. |
| **Dodo Payments** | ✅ | Third-party MoR | varies | Newer MoR, AI-product-leaning. |

**Edge cases reported (honest):** even Paddle/LS have *"edge cases with Canadian provincial taxes and Indian GST that required manual correction"* — MoR is not magic; tax correctness has long-tail failures. — globalsolo / fungies (2026-06-11).

**penny taste:** for an agent platform that *also serves humans*, the lowest-regret default is **Stripe processor + Stripe Tax** (keep data + card-network relationship), **escalate to Stripe Managed Payments** when global tax-compliance burden exceeds the premium, and **keep a second non-Stripe processor or MoR as resilience** against the fund-hold risk (O-13 / field-07 §1) — *not* premature optimization given the $12k/$85k/$1.45M freeze precedents.

---

## 3. AGENT-PAYMENT RAILS — the matrix (versions, post-Sessions-2026)
*field-04's protocol zoo, with the 2026-04-29 Sessions confirmations + current repo stats (ecosystem-02).*

| Rail | Backer | Who holds token | Rail | 2026 status | Repo (★, 2026-06-11) |
|---|---|---|---|---|---|
| **SPT / ACP** | OpenAI + Stripe | Stripe (agent never sees card) | card/stablecoin/Klarna/Affirm | **GA-ish** — "accept payments from agents over MPP in stablecoins as well as fiat through cards, Klarna, and Affirm via SPTs" (Sessions) | `agentic-commerce-protocol/agentic-commerce-protocol` (1,439★, Apache-2.0) |
| **MPP** | **Stripe + Tempo** (co-authored) | Stripe (SPT) | fiat/card/stablecoin, session-aggregated | shipping — "microtransactions, recurring, more" (Sessions); **streaming payments = Metronome + Tempo** | `stripe-samples/machine-payments` (46★, Python, 2026-06-04) |
| **Link agent wallet** | Stripe | Stripe (via Link) | card/bank in wallet | shipping — "spending approvals + full purchase visibility" | `stripe/link-cli` (568★, MIT, pushed today) |
| **Issuing for agents** | Stripe | Stripe (single-use card) | card | **preview** (Sessions) — "programmatically issue single-use virtual cards" | `stripe-samples/issuing-treasury` (96★) |
| **x402** | x402 Foundation (Coinbase+CF, now **Linux Foundation**) | **agent self-custodies wallet** | USDC over HTTP 402 | live, ~$50M cumulative but demand partly synthetic (D-02) | **`x402-foundation/x402`** (6,159★) — moved from `coinbase/x402` |
| **AP2 / UCP** | Google / NVIDIA | mandate / merchant | card/FIDO / negotiation | Stripe→Google deal: purchases "in AI Mode and Gemini via UCP" (Sessions) | `google-agentic-commerce/a2a-x402` (527★) |

**The Sessions-2026 mega-signal:** Stripe shipped an end-to-end **Agentic Commerce Suite** — *"upload your product catalog and manag[e] agent access directly from the Stripe Dashboard"* with discovery + checkout + payments + fraud — PLUS partnerships with **Meta** (native checkout inside Facebook ads) and **Google** (UCP in Gemini). Stripe is betting the whole stack on agent commerce. — Sessions 2026 blog (2026-04-29).

---

## 4. STRIPE PROJECTS — the coding-agent dev-stack provisioner (the brief's "32 partners")
*This is the most agent-native of all the launches — directly relevant to the Energy/penny "agent provisions + pays for its own infra" thesis.*

**What it is:** *"a new way for developers and **coding agents** to discover, provision, and pay for developer tools all from the **Stripe CLI** — everything in one centralized workflow instead of jumping between dashboards, entering payment info, and copying credentials."* — WebSearch (fintechnews/planetscale, 2026-06-11).

**The 32 providers (14 new at Sessions 2026):**
- **NEW (14):** Render, Twilio, Sentry, WorkOS, **Browserbase**, GitLab, ElevenLabs, Runloop, PlanetScale (+ others).
- **Existing (→ 32 total):** **Vercel**, **Clerk**, **Supabase**, **Hugging Face**, **Cloudflare** (+ others).
- Categories provisioned: *"hosting, databases, authentication, observability, analytics, and AI."*

**Why it matters for penny / Energy:** this is **Stripe building the exact "agent buys its own compute/infra" rail** that Energy's thesis describes. A coding agent can `stripe` -CLI its way to a Postgres (PlanetScale/Supabase), a sandbox (Runloop/Browserbase), auth (Clerk/WorkOS), and pay for all of it through one Stripe-billed workflow. **This is the supply side of "self-paying compute."** penny should treat **Stripe Projects as the canonical "agent provisions + pays for infra" pattern** and the `stripe` CLI as the provisioning surface (ecosystem-03 §1 — which is *why* the CLI ships daily). 
- Cross-link: Energy's quartermaster catalogs many of these same providers; Stripe Projects is the *paid-provisioning* layer on top. Browserbase + Runloop being in BOTH Energy's stack (INFRA-STACK.md) and Stripe Projects is a strong convergence signal.
- **Caveat:** the Sessions *blog* didn't state "32" explicitly (it listed categories); the "32 providers / 14 new" count comes from secondary coverage (fintechnews.sg, planetscale.com, 2026-06-11). **Flagged as secondary-sourced.**

---

## 5. THE CONSOLIDATED COMPETITIVE TAKE (penny's read)
- **Stripe is vertically integrating the entire billing+agent+infra stack** in 2026: bought Metronome (usage), built Managed Payments from Lemon Squeezy (MoR), co-authored MPP with Tempo (agent rail), shipped Issuing/Link for agents (agent spend), and launched Stripe Projects (agent infra provisioning). For penny, this means **Stripe is the safe default across the board** — but also a **single-vendor concentration risk** (one fund-hold/account-action hits everything).
- **The defensible non-Stripe choices in 2026:** **Orb** (late-event/retroactive usage billing Stripe Meters can't do), **Lago** (OSS/no-revenue-%/data-residency), **Paddle** (broadest third-party MoR tax coverage), **x402** (permissionless crypto rail, self-custody), and **a second processor** (pure resilience vs fund-holds).
- **penny's product-side value-add survives the consolidation:** Stripe gives you the *rails* (SPT, link-cli, Meters, Managed Payments) but NOT the *governance + reconciliation glue* the community is begging for (`stripe/ai` #356/#402 — ecosystem-04 §0). penny owns that glue.

## 6. OPEN / COULD-NOT-CONFIRM
- **Exact "32 providers" count** — secondary-sourced (fintechnews/planetscale); the Stripe blog listed categories not a number. **GAP (low risk — multiple secondary sources agree on 32 / 14-new).**
- **Metronome acquisition price (~$1B) and exact close date (~Jan 2026)** — secondary-sourced (solvimon/dodopayments); not from a Stripe press release I crawled directly. **GAP.**
- **Orb / Metronome / Lago pricing** — none public; all require a sales conversation. Can't give a real cost comparison beyond Stripe's published 0.7%. **GAP (vendor-opaque).**
- **Whether Stripe Managed Payments truly matches Paddle's tax-jurisdiction breadth** — Stripe says 80+ countries; Paddle's coverage is described as "most mature" — a head-to-head jurisdiction diff wasn't available. **DISPUTE candidate.**
