---
title: "Ecosystem Intel — Top GitHub Issues That Reveal Real-World Breakage (June 2026)"
type: source
created: "2026-06-11"
updated: "2026-06-11"
tags: [payments, stripe, github-issues, breakage, idempotency, webhooks, agent-payments, ecosystem-intelligence]
sources:
  - "gh search issues --repo stripe/{stripe-node,stripe-python,ai} (2026-06-11), ranked by commentsCount"
  - "https://github.com/stripe/ai/issues/402 (fetched 2026-06-11)"
  - "https://github.com/stripe/ai/issues/356 (fetched 2026-06-11)"
summary: "The highest-engagement Stripe SDK + agent-toolkit issues, ranked by comment count via gh. Two LIVE open agent-payments issues (#402 duplicate-charge, #356 governance) directly validate penny's idempotency + scoped-spend mandate. Plus the 86-comment raw-body-HMAC footgun (#341) in primary-source form."
related: ["[[Field Intel — Webhook Ordering & Idempotency War Stories]]", "[[Field Intel — Agent Payments: Who Holds the Token, Scoped Spend]]", "[[KNOWN-PITFALLS]]"]
---

# Ecosystem Intel — Top GitHub Issues (Real-World Breakage)

> **Researcher:** ECOSYSTEM (CP123 Wave-R). Method: `gh search issues --repo <r> <term> --json …,commentsCount`, ranked client-side by comment count (the gh field is `commentsCount`, not `comments` — a footgun that silently zeroed three earlier passes). These are the issues with the most human engagement = the breakage that bit the most people. **The two `stripe/ai` issues below are the single best external validation of penny's reason to exist.**

## 0. THE TWO LIVE AGENT-PAYMENTS ISSUES (penny-critical — both OPEN as of 2026-06-11)

### `stripe/ai` #402 — "Agent-level retry creates duplicate charges — no idempotency guarantee" (15 comments, OPEN, 2026-05-03)
The most important external issue for penny. Verbatim problem statement:
> *"The SDK correctly generates idempotency keys for network-level retries **within a session**. The gap is at the agent level: when an agent framework retries a tool call as a new invocation (after a timeout, crash, or model loop), a **new session starts with a new auto-generated key.**"* — github.com/stripe/ai/issues/402 (2026-05-03)

- **The failure:** LangChain/CrewAI retries a Stripe tool call after a timeout/crash → fresh session → fresh idempotency key → **duplicate charge**. The orchestration layer lacks idempotency *above* the tool.
- **The proposed fix (reporter):** *"generating a stable request ID from tool arguments before execution, storing it durably, and returning cached results on retry with identical arguments"* (references a ref impl "SafeAgent").
- **Status:** OPEN, no maintainer fix.
- **penny takeaway (this is the validation):** **This is EXACTLY the helios pattern** (`funding/state.ts`: dedup on a deterministic txn id at the *pure* layer, side-effect gated on the dedup'd transition) **applied to agent payments.** Energy already solved the *receive* side of this for funding; #402 proves the *spend* side is an unsolved, in-the-wild problem. penny's reconciliation/idempotency mandate is not theoretical — it's an open Stripe issue. **The fix Stripe's community wants IS what helios already does.** This is penny's headline "we're ahead here" finding.

### `stripe/ai` #356 — "Governance layer for Stripe agent payments — commerce delegation" (55 comments, OPEN, 2026-04-06)
The highest-engagement issue in the agent-toolkit repo. Verbatim:
> *"[Restricted API Keys are static and don't answer:] Who authorized this specific agent to make this specific purchase? What's the **per-task spending ceiling**, not just the API key's scope?"* — github.com/stripe/ai/issues/356 (2026-04-06)

- **The gap:** Restricted API Keys (RAKs) scope *what endpoints* a key can hit, but not *who authorized this agent for this purchase, with what per-task ceiling, to which merchant allowlist, above what human-approval threshold.*
- **Community proposal:** an "Agent Passport System" with a 4-gate preflight: (1) Ed25519 passport validity, (2) delegation-scope authorization, (3) per-delegation budget remaining, (4) merchant-allowlist verification. Plus signed-receipt audit trails linking payment→delegation chain and human-escalation gates.
- **Status:** OPEN, 55 comments, no maintainer resolution.
- **penny takeaway:** This is **the governance/consent surface penny is supposed to own** (the brief: "the consent UX — 'issue this agent a $X cap at seller Y until Z'"). Note that **`link-cli`'s flag set is Stripe's *partial* answer** to #356 already (merchant-name/url scope + amount cap ≤$5k + `--request-approval` human gate + 12h expiry — ecosystem-03 §4c), but it stops short of the per-delegation budget-tracking + signed-receipt audit chain the community wants. **penny's value-add = fuse link-cli's per-spend scope + helios's balance-budget tracking + a signed audit trail (the missing #356 piece).** The 55-comment engagement proves the demand is real (counterpoint to the D-02 "demand is a mirage" dispute — the *developer* demand for governance primitives is clearly not a mirage even if *transaction* volume is).

### Supporting agent-toolkit issues (smaller but corroborating)
- **#320 (closed, 2026-03-23):** *"RFC: Cryptographic signing and spend limits for agent-initiated [payments]"* — same theme, now closed (likely folded into the SPT/link-cli direction).
- **#381 (open, 2026-04-12):** *"Add policy enforcement for payment and financial operations"* — policy-as-code for agent spend.
- **#358 (open, 2026-04-07):** *"Support multiple Stripe accounts in MCP server"* — multi-tenant gap in `@stripe/mcp` (one account per server today; relevant if penny serves multiple agents/customers).
- **#329 (closed, 2026-03-24):** *"@stripe/mcp@0.3.2: Cannot find module './userAgent' — dist/use[rAgent]"* — a real **packaging break** in the MCP at v0.3.2 (a `dist/` file missing). Confirms ecosystem-01's "pin loosely, the MCP ships fast and occasionally breaks." (Current pin is v0.3.3 — this was the bug 0.3.3 likely fixed.)

---

## 1. THE WEBHOOK SIGNATURE / RAW-BODY FOOTGUN (the all-time most-engaged breakage)
*This is field-01 §1c / pitfall P-04 in primary-source form — the single most-commented Stripe SDK issue family, spanning 9 years.*

| Issue | Comments | State | Date | What broke |
|---|---|---|---|---|
| **stripe-node #341** | **86** | closed | 2017-05-26 | *"Webhook signature verification and bodyParser.json issue"* — THE canonical: `bodyParser.json()` mutates the raw body → `constructEvent` fails. 86 comments = the most-engaged issue in the repo. |
| **stripe-node #356** | 51 | closed | 2017-06-23 | *"No signatures found matching the expected signature"* — same root cause, different symptom. |
| stripe-node #1254 | 20 | closed | 2021-09-22 | *"Webhook validate signing error: No signature found matching…"* — STILL recurring 4 years later. |
| stripe-node #1886 | 8 | closed | 2023-08-29 | Express code example doesn't work for webhook sign-in (the docs example itself was wrong). |
| stripe-node #2100 | 5 | closed | 2024-05-31 | *"Please add a Next.js App Router example for Webhook signing"* — the App Router `await req.text()` gap (field-01 §1c). |
| stripe-node #989 | 11 | closed | 2020-08-20 | *"constructEvent is not working in the example"* — example-vs-reality drift. |

**The lesson (9 years, 180+ combined comments):** the raw-body-HMAC footgun is the **single most persistent Stripe integration failure in history.** It recurs because every new framework (Express → Next Pages → Next App Router → edge runtimes) re-introduces a body-parsing layer that mutates the bytes. **penny rule (already O-/P-encoded):** verify HMAC over `await req.text()` / raw `Buffer`, body-parser explicitly disabled, and own a test (`stripe trigger` + assert verification passes) so a framework upgrade can't silently re-break it. **This is why penny self-tests with `stripe listen`/`stripe trigger` (ecosystem-03 §1) — it's the only way to catch this class before prod.**

---

## 2. EDGE / NON-NODE RUNTIME BREAKAGE (the modern recurring class)
*Relevant because agent platforms increasingly run on edge (Cloudflare Workers, Deno, Vercel Edge).*

| Issue | Comments | State | Date | What broke |
|---|---|---|---|---|
| stripe-node #997 | 29 | closed | 2020-09-09 | *"Using stripe-node outside of Node.js (e.g. Cloudflare)"* — the long-running edge-support saga. |
| stripe-node #1428 | 16 | closed | 2022-05-20 | *"The library doesn't work on Deno."* |
| stripe-node #1593 | 15 | closed | 2022-10-29 | *"Unusable in Cloudflare workers due to use of node specific APIs"* — `crypto`/`http` Node built-ins. |
| **stripe-node #2523** | 14 | closed | **2025-12-11** | *"An error occurred with our connection to Stripe. Request was r[etried]…"* — a FRESH (Dec 2025) connection-retry error, still relevant on current SDKs. |

**Resolution status:** Stripe added a Web-crypto / fetch-based runtime (`Stripe(key, { httpClient: Stripe.createFetchHttpClient() })`) — so edge works now, but **the webhook verification on edge needs `constructEventAsync()` (async crypto)**, not `constructEvent()`. **penny rule:** on edge/Workers/Deno, use `constructEventAsync` + the fetch HTTP client; the sync versions throw. (This is the modern incarnation of the #341 footgun — same "raw body + crypto" hazard, new runtime.)

---

## 3. FRESH 2026 SDK TYPE-EXPORT BREAKAGE (live, affects current v22)
*These are OPEN and on the current major — anyone on stripe-node v22 can hit them.*

| Issue | Comments | State | Date | What broke |
|---|---|---|---|---|
| **stripe-node #2683** | 10 | **open** | **2026-04-12** | *"v22.0.1: `import type Stripe from 'stripe'` does not expose `Str[ipe.XXX]` [namespaced types]"* — v22 changed type namespacing; `import type` breaks. |
| **stripe-node #2662** | 8 | **open** | **2026-04-06** | *"[Bug] v22: Params types missing from namespaced resource exports"* — param types (e.g. `Stripe.SubscriptionCreateParams`) missing from the v22 namespace exports. |
| stripe-node #2705 | — | open | 2026 | *"Discount interface is missing field `coupon`"* — a type-completeness gap. |

**penny takeaway:** the **v22 major (current stable) has live TypeScript type-export regressions.** If penny's code does `import type { Stripe } from 'stripe'` and reaches for namespaced param types, it may hit #2683/#2662. **Workaround:** import the concrete `Stripe` value (not `import type`) to get the namespace, or pin to the last v21 if blocked. This reinforces O-01: **SDK types are not a contract** (field-02 §8.2) — they can be *wrong* on a current release, which is precisely why you assert response *shape* in a contract test rather than trusting the `.d.ts`.

---

## 4. PYTHON SDK — the long-tail ergonomics issues
| Issue | Comments | State | Date | Signal |
|---|---|---|---|---|
| stripe-python #327 | 57 | closed | 2017-06-12 | *"Feature request: asyncio support"* — the 57-comment async saga (now `stripe.aio` exists). If penny's product side is Python + async, confirm you're on the async client. |
| stripe-python #1427 | 30 | closed | 2024-11-25 | *"Stripe import is very slow"* — `import stripe` cold-start cost (matters for serverless Lambda cold starts — relevant to the typescript.md "cold Lambda" rule). |
| **stripe-python #1697** | 5 | **open** | **2025-12-15** | *"Provide a public helper to sign webhook data"* — webhook **signing** (not just verifying) still lacks a public helper. Relevant if penny ever needs to *emit* signed webhooks (e.g. penny→downstream). OPEN. |
| stripe-python #874 | 11 | open | 2022-09-15 | *"stripe api with `requests` leaks socket file descriptors"* — fd leak under the sync `requests` transport. Use the async/httpx client to avoid. |

---

## 5. HOW penny SHOULD USE THIS FILE
- **#402 + #356 are the "penny is ahead" proof** — quote them when justifying penny's idempotency + governance mandate. Helios already does the #402 fix; link-cli partially does #356; penny completes both.
- **The webhook-HMAC family (#341 etc.)** is the regression-test justification: penny MUST own a `stripe trigger`→assert-verification test (ecosystem-03 §5), because this footgun is the most persistent in Stripe history.
- **The v22 type-export issues (#2683/#2662)** are a live "don't trust SDK types" datapoint for O-01.
- **RSI watchlist add:** track `stripe/ai` issues #402, #356, #381 for resolution — if Stripe ships an official agent-idempotency/governance primitive, it may obsolete part of penny's hand-rolled layer (low-regret to build now, but watch).

## 6. OPEN / COULD-NOT-CONFIRM
- I ranked by `commentsCount` (engagement proxy) but could NOT sort by reactions (gh `--sort reactions` isn't valid for issues; `reactionGroups` isn't fetchable via `gh search`). Reaction-weighted ranking would surface different issues. **Method GAP.**
- `stripe/link-cli` and `stripe-samples/machine-payments` returned **no issues** via search (too new / issues disabled or empty) — so the *newest* agent tools have no breakage corpus yet. Absence of issues ≠ absence of bugs; it means no one's filed them yet. **GAP (the new tools are unbattle-tested in public).**
- Whether `stripe/ai` #402's "SafeAgent" ref impl is production-grade — not evaluated (didn't crawl it). **GAP.**
