---
title: "Field Intel — Agent Payments: Who Holds the Token, Scoped Spend"
type: source
created: "2026-06-11"
updated: "2026-06-11"
tags: [payments, agent-payments, x402, mpp, acp, ap2, ucp, shared-payment-tokens, field-intelligence]
sources: ["Stripe docs/blog 2026", "WorkOS 2026", "Coindesk 2026-03-11", "gh search 2026-06-11"]
summary: "The 2026 agent-payments landscape (SPT/ACP/MPP/x402/AP2/UCP), who holds the token + scoped spend, and the credible disagreement over whether demand exists yet."
---

# Agent Payments — Who Holds the Token, Scoped Spend (June 2026)

> This is the most penny-relevant section: penny is the payments *product-side* employee for an agent platform whose whole thesis is "self-paying compute." The agent earns + spends; the question "who holds the token, with what scope" is the core safety primitive.

## 1. The canonical answer: Shared Payment Tokens (SPT) — the agent never sees the card

- "A **Shared Payment Token (SPT)** is a **scoped grant** to use the customer's payment method, which the agent grants to your Stripe profile, each with **usage and expiration limits.**" — RisingWave, "Stripe Shared Payment Tokens (SPT) Explained," 2026 — https://risingwave.com/blog/stripe-shared-payment-tokens-spt-explained/
- "The agent **never sees the underlying card or bank account; it only ever holds the SPT,** which is **meaningless outside its narrow scope.**" — same
- The three guardrails baked into an SPT (verbatim shape): "(1) it can only be used at a **specific seller**, (2) it **caps the total amount** the agent can spend, (3) it **expires at a fixed time.**" — same / Stripe docs https://docs.stripe.com/agentic-commerce/concepts/shared-payment-tokens
- Network layer: "when a customer authorizes an agent to make purchases, Stripe provisions an **agentic network token from Mastercard or Visa scoped to the customer's intent** and shares it with the agent." — Stripe blog, "Giving agents the ability to pay" — https://stripe.com/blog/giving-agents-the-ability-to-pay
- **penny design rule (taste):** the agent holds a *scoped, capped, expiring* credential — never raw PAN, never an unbounded API key. This is the payments-equivalent of "least agency." Energy's helios ledger already does the *spend-cap* half (per-loop position cap, daily-loss cap drawn from balance); SPT does the *credential-scope* half. penny should fuse both: scoped credential + balance-gated cap.

## 2. The protocol zoo (2026) — and which layer each occupies

There are at least FIVE named agent-payment protocols in 2026. Credible sources insist they are **complementary layers, not competitors** — but they make genuinely different bets.

| Protocol | Backer(s) | Rail | Who holds token | Best for |
|---|---|---|---|---|
| **ACP** (Agentic Commerce Protocol) | OpenAI + Stripe | card via SPT | Stripe (SPT) | agent↔merchant checkout, discovery |
| **MPP** (Machine Payments Protocol) | Stripe + Tempo | fiat/card/stablecoin, session-aggregated | Stripe (SPT) | high-frequency agent *sessions* |
| **x402** | Coinbase + Cloudflare | stablecoin (USDC on Base/Solana) over HTTP 402 | **agent self-custodies wallet keys** | per-request micropayments, permissionless |
| **AP2** (Agent Payments Protocol) | Google | card/network, FIDO "Human Not Present" | varies | cross-agent mandate/authorization |
| **UCP** (Universal Commerce Protocol) | (NVIDIA reference impl) | merchant-control checkout negotiation | merchant | retail negotiation w/ merchant control |

Sources:
- WorkOS, "x402 vs. Stripe MPP… 2026" — https://workos.com/blog/x402-vs-stripe-mpp-how-to-choose-payment-infrastructure-for-ai-agents-and-mcp-tools-in-2026
- crossmint, "Agentic payments protocols compared (MPP, ACP, AP2, x402)" — https://www.crossmint.com/learn/agentic-payments-protocols-compared
- ATXP, "Every Agent Payment Protocol Compared: X402, ACP, UCP, AP2 (2026)" — https://atxp.ai/blog/agent-payment-protocols-compared/
- Stripe ACP docs — https://docs.stripe.com/agentic-commerce
- Stripe x402 docs (Stripe supports x402 too) — https://docs.stripe.com/payments/machine/x402
- ACP is open-sourced + maintained by OpenAI & Stripe — https://github.com/agentic-commerce-protocol/agentic-commerce-protocol (repo last updated 2026-06-11)
- Vercel reference handler — https://github.com/vercel/acp-handler

## 3. The KEY DISAGREEMENT (verbatim — feeds GAPS-AND-DISPUTES)

### Side A — "who holds the token" is a real architectural fork
WorkOS lays it out as a genuine tradeoff, NOT a solved question:
- x402: "**Agent holds wallet keys (self-custody risk)**" · setup "Minutes (one wallet address)" · "Compliance & Fraud: **Your responsibility**"
- MPP: "**Stripe holds via SPTs**" · setup "Hours (Stripe SDK + session config)" · "Compliance & Fraud: **Built-in via Stripe Radar, tax handling, reporting**"
- WorkOS verdict: "These are **not mutually exclusive**… treat payment protocol selection the way they treat compute infrastructure." (i.e., use multiple)

### Side B — the demand isn't there yet (the skeptics)
This is the sharpest dispute. Coindesk, 2026-03-11 — https://www.coindesk.com/markets/2026/03/11/coinbase-backed-ai-payments-protocol-wants-to-fix-micropayment-but-demand-is-just-not-there-yet
- **Artemis analyst (Feb 2026), verbatim:** "The x402 'agent payments' boom is still **mostly a mirage**" — and roughly **half of observed transactions are "gamified"** (self-dealing / wash trading), not genuine commerce.
- "The merchants that x402 is designed to serve are still **rare.**"
- Article's verdict: "**The narrative around agentic commerce is growing faster than the usage that would justify it.**"
- WorkOS corroborates the small numbers: x402 early-March 2026 daily ≈ "131,000 transactions and ~$28,000 in value, with a meaningful portion being **testing activity**"; MPP "too early for meaningful volume data."

### Side C — the bulls (counter-evidence, verbatim)
- **Erik Reppel, Coinbase (Head of Engineering):** "As teams move from testing to production and start serving real users, these percentages should naturally decline." (re: the gamified-transaction share)
- **Artemis analyst's own long-view:** "We'll probably **overestimate how fast** agentic commerce takes off in the next year, but we're largely **underestimating what it can become in five.**"
- Volume (Coinbase-stated, late April 2026): "**69,000 active agents, 165 million transactions, ~$50 million cumulative volume**" on x402.

**penny's read (for the brain, not a claim):** the *rails* are real and shipping; the *demand* is speculative and partly synthetic today. For penny that means: build the scoped-credential + ledger primitives now (low regret — they're also just good billing hygiene), but do NOT assume agent-to-agent micropayment volume justifies a crypto-first architecture yet. Card-rail SPT (ACP/MPP) is the lower-regret default for a product that also serves humans; x402 is the optional permissionless escape hatch. This matches Energy's checklist default (Stripe agent-toolkit primary, x402 as complement).

## 4. Governance / standards reality (2026)
- **x402 Foundation** announced by Coinbase + Cloudflare 2025-09-23; **formalized under the Linux Foundation 2026-04-02** at the MCP Dev Summit NA. Launch members (22 orgs) include Adyen, AWS, Amex, Base, Circle, Fiserv, Google, Mastercard, Microsoft, Shopify, Stripe, Visa. — KuCoin/BlockEden 2026 syntheses (https://blockeden.xyz/blog/2026/03/05/x402-foundation-ai-payment-internet/)
- **Stripe joined x402 Foundation as a founding member AND ships its own MPP** — i.e., the same vendor hedges across rails. — KuCoin flash, https://www.kucoin.com/news/flash/coinbase-neutrality-move-stripe-s-dual-support-for-x402-and-mpp
- **Amazon Bedrock AgentCore payments** "built with Coinbase and Stripe" — the hyperscalers are wrapping both. — AWS ML blog, https://aws.amazon.com/blogs/machine-learning/agents-that-transact-introducing-amazon-bedrock-agentcore-payments-built-with-coinbase-and-stripe/
- **Visa Trusted Agent Protocol (TAP)** added x402 support; ACP also integrated x402 — the protocols are absorbing each other.

## 5. INTERNAL REFERENCE — Energy already has the spend-side primitives
From `~/energy/audit/HARNESS-CHECKLIST-2026.md` §Payments / Financial Rails:
- Default four-layer stack: **Stripe agent-toolkit + `@stripe/mcp`** · **x402/Coinbase** · **Stripe link-cli** (human-approved spends) · **Stripe Projects**.
- "Minimum for an earning agent: Stripe agent-toolkit wired; **per-agent Stripe Issuing virtual card**; **P&L ledger visible to chairman.**"
- Quartermaster catalogs the payments stack at `eval_score≈1.0` (stripe* tools); helios funding ledger is the working P&L.
- 2026 watch items already logged: "Stripe Link wallet for agents (Apr 29)"; "Stripe MPP (fiat/card/BNPL complement to x402)"; "Google AP2 v0.2 → FIDO (Human Not Present)"; "Meow (agent forms a US company + bank + cards in one prompt)."

**penny's job vs what exists:** Energy has the *spend ledger + caps* (helios) and the *tool catalog* (quartermaster). penny's value-add is the *product-side billing surface*: SPT issuance/scoping flows, the consent UX ("issue this agent a $X cap at seller Y until Z"), and the reconciliation between the agent's internal ledger and the provider's record.

## 6. OPEN / COULD-NOT-CONFIRM (for GAPS-AND-DISPUTES)
- The exact SPT *revocation* semantics (can a customer kill an outstanding SPT mid-flight, and does Stripe propagate that to the network token instantly?) — not confirmed from the secondary sources read.
- AP2's precise "who holds the token" model — sources describe it as mandate/authorization-based with FIDO but were thinner than on SPT/x402.
- Whether penny should prefer ACP vs MPP for a *subscription-plus-usage* agent product — the comparisons frame MPP as session-streaming and ACP as checkout; the subscription overlap is unclear.
