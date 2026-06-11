---
title: "Ecosystem Intel — INDEX & Synthesis (penny payments ecosystem layer)"
type: synthesis
created: "2026-06-11"
updated: "2026-06-11"
tags: [payments, stripe, ecosystem, index, synthesis, versions, agent-payments, gaps-resolved, ecosystem-intelligence]
sources: ["ecosystem-01..06 (this folder)", "field-00..07 (sibling corpus)", "internal: energy helios funding + quartermaster catalog + checklist Payments"]
summary: "Map of the ecosystem-* corpus (versions / repos / agent-operator / issues / competitors / docs), the cross-walk to the field-* war-stories corpus, the GAPS the ecosystem pass CLOSED (G-02 Dahlia diff, G-04 SPT revocation, the --tools flag, the agent-toolkit version), and the consolidated 'what June-2026 made true' delta."
related: ["[[penny FIELD-INTELLIGENCE — Index & Synthesis]]", "[[penny TOOL-MATRIX]]", "[[EXPERTISE-MAP]]", "[[GAPS-AND-DISPUTES]]"]
---

# penny ECOSYSTEM-INTELLIGENCE — Index & Synthesis

> **Researcher:** ECOSYSTEM (CP123 Wave-R). Domain: Payments / billing, **product side**, the *ecosystem layer* — tool versions, starter repos, official docs, GitHub issues, competing tools, and the agent-operator interface. Complement to the sibling **field-*** corpus (war-stories / taste). Every version + star count + date below was pulled live (`gh api`, doc crawls) on **2026-06-11**, not from memory. **BOUNDARY:** product-billing expertise only — earning strategies/loops stay with helios.

## Files in this corpus (all under `brain/research/raw/`, prefix `ecosystem-`)
1. `ecosystem-01-tool-versions-and-changelog-deltas.md` — verified versions (API `2026-05-27.dahlia`, stripe-node v22.2.0, stripe-cli v1.42.11, agent-toolkit repo renamed `stripe/agent-toolkit`→**`stripe/ai`** 1,602★); **closes G-02** with the full Dahlia changelog diff (`decimal_string`→`Stripe.Decimal`; the `SharedPaymentIssuedToken` API landing 2026-04-22). (~115 lines)
2. `ecosystem-02-starter-template-example-repos.md` — the 5 best + the honest "**most-starred SaaS starter (`vercel/nextjs-subscription-payments`, 7,714★) is 16 months STALE**"; Tier A official samples, Tier B agentic, Tier C boilerplates; x402 repo moved `coinbase/x402`→**`x402-foundation/x402`** (6,159★). (~95 lines)
3. `ecosystem-03-agent-operator-interface.md` — **the centerpiece**: how a non-human drives Stripe (stripe CLI, `@stripe/mcp` 24-tool surface + `--tools` scoping, `@stripe/agent-toolkit` v0.9.0, and the full **`link-cli` spend-request interface verbatim** — the agent-SPEND reference). (~150 lines)
4. `ecosystem-04-github-issues-real-world-breakage.md` — top issues by `commentsCount`; **two LIVE open agent-payments issues** (`stripe/ai` #402 duplicate-charge, #356 governance) that **validate penny's idempotency + scoped-spend mandate**; the 9-year 86-comment raw-body-HMAC footgun (#341); live v22 type-export regressions (#2683/#2662). (~135 lines)
5. `ecosystem-05-competing-tools-and-stripe-projects.md` — honest trade-off matrices (usage-billing: Stripe Meters vs Orb vs Lago vs **Metronome-now-Stripe**; MoR: Stripe vs **Stripe Managed Payments** vs Paddle vs **Lemon-Squeezy-now-Stripe**); **Stripe Projects** (32 providers, CLI-provisioned dev-stack for coding agents). (~135 lines)
6. `ecosystem-06-official-docs-deep-dive.md` — canonical crawl of webhooks (composite dedup key, 3-day/30-day retry, thin-vs-snapshot) + the SPT API surface (`shared_payment.granted_token`, `usage_limits`, redemption, **revocation = `granted_token.deactivated` webhook**); **closes G-04** and confirms **SPT is still PREVIEW** (`2026-04-22.preview`). (~135 lines)
0. `ecosystem-00-INDEX-and-synthesis.md` — this file. (~140 lines)

---

## THE ECOSYSTEM LAYER vs THE FIELD LAYER (how the two corpora compose)
| Field corpus (war-stories) had… | Ecosystem corpus adds (verified) |
|---|---|
| "API is `2026-05-27.dahlia`, Dahlia diff UNCONFIRMED (G-02)" | **The full Dahlia changelog diff** (ecosystem-01) — `decimal_string`→`Stripe.Decimal`, `billed_until` vanishing, the agentic-commerce APIs. **G-02 CLOSED.** |
| "SPT scopes spend; revocation semantics UNCONFIRMED (G-04)" | **The `shared_payment.granted_token` API + `usage_limits` fields + revocation via `granted_token.deactivated` webhook** (ecosystem-06). **G-04 CLOSED.** Also: **SPT is still preview, not GA.** |
| "Stripe agent-toolkit + x402 + link-cli (named in checklist)" | **Verified repos+stars+the rename to `stripe/ai`; link-cli's full verbatim CLI/MCP interface; the `@stripe/mcp` 24-tool surface + `--tools` scoping** (ecosystem-03). |
| "MoR = leave Stripe (Paddle/LS/Dodo)" | **Stripe bought Lemon Squeezy → built Managed Payments (in-Stripe MoR, 80+ countries); bought Metronome ($1B, used by OpenAI/Anthropic/Nvidia)** — the MoR/usage map is being absorbed (ecosystem-05). **Updates field-02 §2.** |
| "webhooks: ordering not guaranteed, dedup on event id" (blog-sourced) | **Canonical docs confirmation + two SHARPER rules: composite dedup key (`data.object.id`+`event.type`, not just `event.id`) and webhook-dedup-TTL-must-be-≥3-days** (ecosystem-06 §1). |
| "agent-payment demand is a mirage (D-02)" | **Developer demand for governance is NOT a mirage** — `stripe/ai` #356 has 55 comments begging for spend-governance primitives (ecosystem-04). Transaction volume ≠ developer demand. |

**One-line composition:** the field corpus tells penny *what breaks in production and why*; the ecosystem corpus tells penny *which exact tool/version/repo/API to reach for, and where the live bugs are right now.* Read field-* for judgment, ecosystem-* for the current map.

---

## GAPS THE ECOSYSTEM PASS CLOSED (the headline deliverable)
| Gap (from field corpus) | Status after ecosystem pass | Source |
|---|---|---|
| **G-02** — exact Dahlia breaking-change list | ✅ **CLOSED** — full diff crawled; headline = `decimal_string`→`Stripe.Decimal` | docs.stripe.com/changelog/dahlia |
| **G-04** — can a customer kill an outstanding SPT mid-flight? | ✅ **CLOSED** — yes, via `shared_payment.granted_token.deactivated` webhook (consumed/expired/agent-revoked) | SPT seller docs |
| **agent-toolkit version** (WebSearch contradicted itself) | ✅ **RESOLVED** — v0.9.0 (quartermaster eval, 2026-05-31); repo `stripe/ai` current (pushed 2026-06-10) | quartermaster + gh |
| **`@stripe/mcp` `--tools` scoping flag** | ✅ **CLOSED** — `--tools=all` or `--tools=a,b,c`; `--stripe-account=` for Connect; RAK-level perms | npm @stripe/mcp |
| **Metronome's status** (not in field corpus) | ✅ **NEW** — Stripe completed acquisition **2026-01-13, ~$1B**; used by OpenAI/Anthropic/Nvidia; Stripe docs now steer new usage-billing to Metronome over legacy Meters | stripe.com/newsroom |

## GAPS THE ECOSYSTEM PASS *opened or carried forward* (feed GAPS-AND-DISPUTES)
1. **SPT in-flight-charge race** — revocation blocks *new* payments; whether a charge already mid-`confirm` completes is unspecified. (ecosystem-06 §5)
2. **Exact `@stripe/mcp` / `@stripe/agent-toolkit` current npm versions** — internal pins v0.3.3 / v0.9.0; couldn't `npm view` (HARD RULE 4). (ecosystem-01, -03)
3. **The 35-day meter window (G-03)** — endpoint + async confirmed; the precise window lives on a sub-page not re-byte-verified this pass; field-03's number stands. (ecosystem-06 §3)
4. **`SharedPaymentIssuedToken` (agent-side) full schema** — crawled the *seller* (`granted_token`) variant; the *issued* variant's fields not fully crawled. (ecosystem-06 §5)
5. **Orb/Metronome/Lago pricing** — none public (sales-call only); no real cost comparison possible beyond Stripe's 0.7%. (ecosystem-05 §6)
6. **"32 providers" / Metronome "$1B"** — corroborated by multiple secondary sources + Stripe newsroom (for Metronome the close date/announcement IS first-party; the price is secondary). (ecosystem-05)

## NEW DISPUTES surfaced (for GAPS-AND-DISPUTES §disputes)
- **Does Stripe Managed Payments match Paddle's tax-jurisdiction breadth?** Stripe says 80+ countries; Paddle described as "most mature." No head-to-head. (ecosystem-05 §2/§6)
- **Has Stripe "fixed Billing" or just bought around it?** Lago's framing — *"Why Stripe paid $1B for Metronome instead of fixing Billing"* (getlago.com, 2026) — vs Stripe's "deeper integrated platform" framing. The honest read: legacy Meters' rigidity (field-03 §2) is real enough that Stripe *bought* the fix. (ecosystem-05 §1, ecosystem-06 §3)
- **Is the agent-payments "mirage" (D-02) contradicted by developer demand?** Transaction volume is partly synthetic (Artemis), but `stripe/ai` #356/#402 engagement shows *developer* demand for the primitives is real. Two different "demand" questions. (ecosystem-04 §0)

---

## THE CONSOLIDATED "WHAT JUNE-2026 MADE TRUE" (ecosystem additions to the field-00 list)
- **`stripe/agent-toolkit` → `stripe/ai`** (repo rename) and **`coinbase/x402` → `x402-foundation/x402`** (Linux Foundation) — two canonical-URL moves any 2025 doc gets wrong.
- **Stripe vertically integrated the billing+agent+infra stack:** bought **Metronome** (usage, Jan 2026, $1B) + built **Managed Payments** from **Lemon Squeezy** (in-Stripe MoR) + co-authored **MPP** with **Tempo** + shipped **Issuing/Link for agents** + launched **Stripe Projects** (agent infra provisioning, 32 providers). Stripe is the safe default across the board — and a single-vendor concentration risk.
- **The SPT API is real but PREVIEW** (`shared_payment.granted_token`, `2026-04-22.preview`) — build behind the preview header, expect shape change before GA.
- **The agent-idempotency gap is LIVE and UNSOLVED upstream** (`stripe/ai` #402) — and **helios already implements the community-requested fix.** This is penny's strongest "we're ahead" claim.
- **For new usage billing, Stripe steers you to Metronome, not legacy Meters** — the rigidity (field-03) is officially worked-around-by-acquisition.

## penny's NET POSITION (from the ecosystem layer)
Stripe gives penny the **rails** (SPT/`granted_token`, `link-cli`, Meters/Metronome, Managed Payments, the `stripe` CLI + `@stripe/mcp` 24-tool surface). Stripe does **NOT** give penny the **governance + reconciliation glue** the community is openly begging for (`stripe/ai` #356 governance, #402 agent-idempotency). **That glue — scoped-credential issuance + balance-budget tracking + signed audit trail + ledger↔provider reconciliation — is penny's product-side reason to exist,** and Energy already owns the spend-ledger half (helios). The ecosystem layer's verdict: **the rails are commoditized; the glue is the moat.**

## NOTE ON X/TWITTER SIGNAL (per HARD RULE 1/3)
Per the sibling field-00 §X-note, X topical search is blocked this session (the energy `scrape.py` SearchTimeline `doc_id` 404'd — X rotated the query id). This ecosystem pass relied on **`gh` (repos/issues/api) + Stripe changelog/docs crawls + Stripe newsroom + practitioner comparisons** — which for *versions/repos/issues/competitors* is the higher-signal corpus than X anyway. **X signal SKIPPED** (consistent with field-00); to revive: refresh the `doc_id` in `scripts/x-content-intel/scrape.py`.
