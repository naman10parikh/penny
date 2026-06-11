---
title: "Ecosystem Intel — The Agent-Operator Interface (CLIs / APIs / MCP for non-human operators)"
type: source
created: "2026-06-11"
updated: "2026-06-11"
tags: [payments, stripe, mcp, cli, link-cli, agent-toolkit, agent-operator, ecosystem-intelligence]
sources:
  - "https://github.com/stripe/link-cli/blob/main/README.md (fetched 2026-06-11)"
  - "https://docs.stripe.com/mcp (fetched 2026-06-11)"
  - "internal: ~/quartermaster/brain/tools/{stripe-mcp,stripe-agent-toolkit}.md (last_verified 2026-05-31)"
summary: "Exactly what a Claude session (NOT a human) needs to drive the Stripe payments stack: the stripe CLI as a first-class agent tool, the @stripe/mcp 24-tool surface (local npx + hosted OAuth), the @stripe/agent-toolkit function-calling layer, and the full link-cli spend-request interface verbatim. This is the deliverable for HARD-RULE requirement (6)."
related: ["[[penny TOOL-MATRIX]]", "[[Ecosystem Intel — Tool Versions & Changelog Deltas]]", "[[Field Intel — Agent Payments: Who Holds the Token, Scoped Spend]]"]
---

# Ecosystem Intel — The Agent-Operator Interface

> **Researcher:** ECOSYSTEM (CP123 Wave-R). The brief's requirement (6): *"what an agent (not a human) operating these tools needs to know (CLIs, APIs, MCP servers that exist for them)."* This file is that. Three layers an agent can drive Stripe through — **CLI**, **MCP**, **function-calling SDK** — plus the **agent-spend CLI** (`link-cli`). All syntax quoted from primary sources fetched 2026-06-11.

## 0. The four ways an agent touches Stripe (pick by task)
| Layer | Tool | Agent uses it for | Auth | Local/remote |
|---|---|---|---|---|
| **CLI** | `stripe` (v1.42.11) | local webhook test/replay, trigger events, fixtures, one-off resource CRUD | `stripe login` (or `--api-key`) | local binary |
| **MCP** | `@stripe/mcp` / `mcp.stripe.com` | structured tool-calls (create customer/price/payment-link, search docs) from inside an agent loop | API key (local) or **OAuth** (hosted) | both |
| **SDK (function-calling)** | `@stripe/agent-toolkit` (v0.9.0) | wiring Stripe tools into OpenAI Agents SDK / LangChain / CrewAI / Vercel AI SDK | `STRIPE_SECRET_KEY` | in-process |
| **Agent-spend CLI** | `@stripe/link-cli` (568★) | the agent *spending money* with scoped/approved credentials (SPT / one-time card) | `link-cli auth login` (OAuth-style device flow) | local CLI / MCP / HTTP |

**Internal eval status (quartermaster, last_verified 2026-05-31):** `stripe`, `stripe-agent-toolkit` (v0.9.0), `stripe-mcp` (v0.3.3) all carry **eval_score 1 (1/1 golden)**; `stripe-link-cli` cataloged under `identity` at eval_score 1. ⚠️ The quartermaster `stripe-agent-toolkit.md` `source:` still points to `github.com/stripe/agent-toolkit` — **that repo was renamed to `stripe/ai`** (ecosystem-01 §0); the internal brain link is stale and should be updated on the next RSI pass.

---

## 1. The `stripe` CLI — the agent's local payments workbench
*This is how penny self-tests webhook handling WITHOUT a live customer (the BATTLE-TESTED-SCENARIOS S-01/02/03 loop). The single most important agent tool for the test-mode E2E pattern.*

The load-bearing commands an agent must know:
- **`stripe listen --forward-to localhost:PORT/api/webhook`** — opens a webhook tunnel from Stripe → your local handler AND **prints the `whsec_…` signing secret** to use for HMAC verification (field-01 §1c / P-04). This is the entire local-webhook test rig in one command. *Without this, you cannot exercise webhook code locally.*
- **`stripe trigger <event>`** — fires a *real test-mode event* (e.g. `stripe trigger checkout.session.completed`, `stripe trigger invoice.payment_succeeded`, `stripe trigger customer.subscription.updated`). This is how you reproduce the ordering/idempotency war stories (field-01) deterministically.
- **`stripe trigger <event> --add <resource>:<param>=<value>`** — parametrize the triggered event to hit edge cases.
- **`stripe fixtures <file.json>`** — seed a full object graph (customer→product→price→subscription) for a repeatable test fixture.
- **`stripe samples create <sample>`** — clone a `stripe-samples/*` repo locally, pre-wired.
- **`stripe logs tail`** — live API request log (debug what the agent's calls actually did).
- **`stripe trigger --help` / `stripe resources`** — discover the full trigger event list + resource CRUD surface.

**Why the CLI matters for an agent specifically:** it turns the entire "did money move correctly?" question into a **deterministic, $0, offline-ish loop** the agent can run in CI. The canonical penny self-test: `stripe listen --forward-to …` in one process, `stripe trigger checkout.session.completed` in another, assert the handler wrote exactly one ledger row (idempotency), then `stripe trigger` the SAME event again and assert the second is a no-op (field-01 §3, helios dedup). **Cadence caveat:** the CLI ships ~daily (5 releases on 2026-06-09 — ecosystem-01 §0), so it's a living tool; `stripe version` before relying on flag behavior.

---

## 2. `@stripe/mcp` — the structured tool surface (24 tools)
*Source: docs.stripe.com/mcp (2026-06-11). Internal pin: v0.3.3 (quartermaster).*

### 2a. The exact tools exposed (enumerate-able, so an agent can plan against them)
| Resource | Tools |
|---|---|
| Account | `get_stripe_account_info` |
| Balance | `retrieve_balance` |
| Coupon | `create_coupon`, `list_coupons` |
| Customer | `create_customer`, `list_customers` |
| Dispute | `list_disputes`, `update_dispute` |
| Invoice | `create_invoice`, `create_invoice_item`, `finalize_invoice`, `list_invoices` |
| Payment Link | `create_payment_link` |
| PaymentIntent | `list_payment_intents` |
| Price | `create_price`, `list_prices` |
| Product | `create_product`, `list_products` |
| Refund | `create_refund` |
| Subscription | `cancel_subscription`, `list_subscriptions`, `update_subscription` |
| Search/Fetch | `search_stripe_resources`, `fetch_stripe_resources`, **`search_stripe_documentation`** |

**Agent-operator notes:**
- **`search_stripe_documentation`** is the sleeper — it lets the agent RAG Stripe's own docs in-loop (answer "how does proration work in flexible mode?" without a web fetch). penny's RSI loop should prefer this over external search for Stripe-specific questions.
- The surface is **create/list-heavy and update-light** — note there's **no `create_subscription`** (only cancel/list/update) and **no `create_charge`/`create_payment_intent`** (only `list_payment_intents`). The MCP is tuned for *commerce setup + read* (products/prices/payment-links/customers), **not** for moving money directly. For actual charge creation, the agent uses a Payment Link (`create_payment_link`) or the SDK. **This is a deliberate blast-radius limit** — the MCP can set up a catalog and read state but can't silently charge a card. Good default.

### 2b. Local vs hosted (the two deployment modes — checklist §MCP "dual-mode" requirement)
**Local (stdio), API-key auth:**
```
npx -y @stripe/mcp@latest --api-key=$STRIPE_SECRET_KEY
# or:  STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY npx -y @stripe/mcp@latest
```
**Hosted (Streamable HTTP), OAuth:** endpoint `https://mcp.stripe.com`. Adding it to a client triggers an **OAuth consent form**; sessions are managed in Stripe Dashboard → user settings → **OAuth sessions**. Bearer-token (restricted key) also works:
```
curl https://mcp.stripe.com/ -H "Authorization: Bearer $RESTRICTED_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"create_customer","arguments":{"name":"Jenny Rosen","email":"jenny@example.com"}},"id":1}'
```
This is exactly the checklist §MCP "dual-mode (stdio local + hosted-OAuth prod, Stripe standard)" pattern — **Stripe is the reference implementation of it.** penny's own MCP should mirror this shape.

> ⚠️ **`--tools` scoping is UNCONFIRMED from the canonical docs.** WebSearch/community sources mention scoping which tools are exposed, but docs.stripe.com/mcp (2026-06-11) does **not** document a `--tools` flag — it says availability is governed by the authenticated key's permissions, not a startup filter. **GAP** — verify the actual flag (`--tools=all` or a comma list) against the `@stripe/mcp` README before relying on per-tool scoping for least-privilege.

---

## 3. `@stripe/agent-toolkit` (now in `stripe/ai`) — function-calling for agent frameworks
*Internal pin: v0.9.0, eval_score 1 (quartermaster, 2026-05-31). Repo: `stripe/ai` (renamed from `stripe/agent-toolkit`, 1,602★).*
- **What it is:** Python + TS library that exposes Stripe operations as **function-calling tools** for popular agent frameworks — **OpenAI Agents SDK, LangChain, CrewAI, Vercel AI SDK** (and the MCP format, which is how `@stripe/mcp` is generated from it).
- **Install:** `npm i @stripe/agent-toolkit` (project dep) **or** `pip install stripe-agent-toolkit`.
- **When penny uses it vs the MCP:** use `@stripe/agent-toolkit` when penny's agent runs *inside* one of those frameworks and wants Stripe tools as native function calls; use `@stripe/mcp` when the agent speaks MCP (Claude Code / Cursor / any MCP client). They're the same capability, two delivery shapes — the toolkit is the library, the MCP is the server it emits.
- **The on-thesis line (verbatim from the catalog):** *"function-calling tools so an agent can pay/charge/issue ('agent funds its own compute')."* This is the literal Energy/helios thesis tool.

---

## 4. `link-cli` — the agent-SPEND interface (the most important new tool for JTBD-5)
*Source: github.com/stripe/link-cli README (fetched 2026-06-11). 568★, MIT, pushed today. This is the "agent spends money safely" reference — quoted verbatim because the exact flags ARE the safety model.*

### 4a. Install + register (three ways an agent can mount it)
```
npm i -g @stripe/link-cli                       # CLI
npx skills add stripe/link-cli                  # as a Claude skill
# as an MCP server (.mcp.json):
{ "mcpServers": { "link": { "command": "npx", "args": ["@stripe/link-cli","--mcp"] } } }
link-cli serve [--port 8080]                    # as an HTTP MCP endpoint
```

### 4b. The spend lifecycle (the core flow)
```
link-cli auth login [--client-name "..."] [--interval 5] [--timeout 300]
link-cli payment-methods list
link-cli spend-request create \
  --payment-method-id <id> \
  --merchant-name "Powdur" --merchant-url "https://powdur.com" \
  --context "Purchasing the Powdur Glow Renewal Serum as a gift for $35." \
  --amount 3500 \
  [--credential-type "shared_payment_token"] \
  [--test] [--request-approval]
link-cli spend-request retrieve <id> [--include card] [--output-file <path>] \
  [--interval <s>] [--max-attempts <n>] [--format json|yaml|md|jsonl|toon]
link-cli spend-request request-approval <id>
link-cli spend-request cancel <id>
```

### 4c. The safety model IS the flag set (penny: copy this exactly)
- **`--include card` is OFF by default.** Retrieving a spend request returns **redacted** data (brand, last4, expiry). You must *explicitly* pass `--include card` to see the unmasked PAN/CVC. → **least-exposure by default.**
- **`--output-file <path>`** writes the full card to a **0600-perm file** while stdout shows only redacted data — *"To avoid leaking card credentials into agent transcripts or logs."* → **the card never enters the agent's context window / logs.** This is THE pattern penny must enforce: an agent must never `--include card` to stdout in a logged loop.
- **`--request-approval`** triggers a **push notification** and polls until **approved/denied** — human-in-the-loop is a first-class flag, not an afterthought. Aligns with checklist "link-cli (human-approved spends)."
- **Terminal statuses:** `approved` · `denied` · `expired` · `canceled`. Polling exits non-zero with `code: "POLLING_TIMEOUT"` on timeout/max-attempts. → an agent can deterministically branch on outcome.
- **Hard caps baked in (verbatim from README):** context field **min 100 chars** (forces the agent to justify the spend), **amount max 500,000 cents ($5,000)**, **approval window 10 min**, one-time credentials **valid 12h**, plus daily/monthly spend limits + concurrency caps.
- **`--credential-type "shared_payment_token"`** selects SPT (for MPP); default is a **one-time virtual card**. So link-cli is the *client* that obtains both the SPT and the one-time card from the Link wallet.
- **`--test`** uses test card `4242 4242 4242 4242` → penny can exercise the *entire* agent-spend flow in test mode (no real money) — the JTBD-5 analogue of `stripe listen`/`trigger` for the receive side.
- **MPP integration:** `link-cli mpp pay <url> --spend-request-id <id> --method POST --data '{...}'` and `link-cli mpp decode --challenge '...'` — link-cli is *also* the MPP client (decodes the HTTP-402-style `Payment` challenge, pays it with a spend request).

### 4d. Why this is the penny keystone
The brief says penny's value-add over helios is *"SPT issuance/scoping flows, the consent UX, and reconciliation between the agent's internal ledger and the provider's record."* **`link-cli` is the reference implementation of the first two.** Its flag set encodes the exact "least agency" model the field corpus argued for (field-04 §1): scoped (merchant-name/url) + capped (amount, ≤$5k) + expiring (12h) + redacted-by-default + human-approvable. penny should **fuse link-cli's credential-scope with helios's balance-cap** (O-11): the agent gets a spend-request from link-cli *and* the spend must pass `riskCapsFromBalance()` (helios `state.ts`) before `--request-approval`. That's the complete "scoped credential AND balance-gated cap" primitive.

---

## 5. The test-mode E2E pattern (stripe listen) — the agent's CI loop
Putting it together, penny's self-test (no human, no real money), runnable by an agent:
1. **Receive side:** `stripe listen --forward-to localhost:3000/api/funding/webhook` (prints `whsec_…`) → in another process `stripe trigger checkout.session.completed` → assert exactly one ledger row written; trigger the SAME event id again → assert no-op (helios dedup, field-01 §3).
2. **Spend side:** `link-cli spend-request create --test --amount 3500 …` → `link-cli spend-request retrieve <id>` (redacted) → assert terminal status branch; never `--include card` to stdout.
3. **Catalog side:** `@stripe/mcp` `create_product`/`create_price`/`create_payment_link` to stand up a test catalog; `search_stripe_resources` to read it back.
4. **Reconcile:** diff internal helios ledger vs Stripe `meter-event-summary` / balance (the daily drift alarm, field-03 §6 / TOOL-MATRIX §5).
All four are **deterministic, test-mode, $0** — which is exactly what makes them suitable for an autonomous agent's eval pyramid (`dsip.eval`).

## 6. OPEN / COULD-NOT-CONFIRM
- **`@stripe/mcp` `--tools` scoping flag** — not in canonical docs (2026-06-11); verify against the package README. **GAP.**
- **Exact `@stripe/mcp` and `@stripe/agent-toolkit` current npm versions** — internal pins are v0.3.3 / v0.9.0 (2026-05-31); couldn't run `npm view` (HARD RULE 4). The repo (`stripe/ai`) is current (pushed 2026-06-10). **GAP (minor).**
- **Whether `link-cli auth login` uses true OAuth or a Stripe-proprietary device flow** — README shows `--interval`/`--timeout` (device-flow-shaped) but doesn't name the grant type. **GAP (minor).**
