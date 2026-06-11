---
title: "penny GAPS-AND-DISPUTES — Where Sources Disagree & What's Unconfirmed"
type: synthesis
created: "2026-06-11"
updated: "2026-06-11"
tags: [payments, billing, gaps, disputes, open-questions, taste, field-intelligence]
sources:
  - "[[penny FIELD-INTELLIGENCE — Index & Synthesis]]"
  - "[[Field Intel — Agent Payments: Who Holds the Token, Scoped Spend]]"
  - "[[Field Intel — Subscription Proration Edge Cases]]"
  - "[[Field Intel — Metered / Usage-Based Billing Gotchas]]"
  - "[[Field Intel — SCA / 3DS Flows That Break Conversion]]"
  - "[[Field Intel — Production Postmortems, HN Threads & Where Experts Disagree]]"
  - "[[Field Intel — Migration War Stories & What 2026 Invalidated]]"
related: ["[[EXPERTISE-MAP]]", "[[OPINIONS]]", "[[BATTLE-TESTED-SCENARIOS]]", "[[TOOL-MATRIX]]"]
summary: "Where credible sources genuinely disagree (both sides captured verbatim), where no good source exists so penny must form its own view via experiment, and what could not be confirmed. The intellectual-honesty layer — read this before relying on anything marked single-sourced or directional."
---

# penny GAPS-AND-DISPUTES

> **Why this matters.** A brain that only states conclusions is a liar by omission. This file is where penny is *honest about its edges*: the questions real experts still fight over (don't pick a side without the context here), the things the corpus *could not confirm* (don't cite them as fact), and the holes penny must close itself **via a live experiment**, not another web search. Each open item has a concrete **resolution path** so the nightly RSI loop (`dsip.json`) can actually retire it.

---

## PART A — DISPUTES (credible sources genuinely disagree; both sides verbatim)

### D-01 — Webhooks vs. sync/polling for payment STATE
*The single best "experts disagree" topic in 2026.* — field-07 §3.
- **Side A (webhooks are wrong/overrated for payment state):**
  - **agreeahmed** (zero-webhooks author): the pain is "choreographing the lifecycle of our business domain with the Stripe checkout flow and webhook event types, **of which there are 250+**"; payments shouldn't be "modeled as an events-driven domain" — prefer **direct state queries** (Shopify model).
  - **prasoonds** (stripe-no-webhooks): "**You don't have to figure out which webhooks you need or write listeners for each one.**"
  - **lmz:** "**Cards don't really need webhooks** (unless you get into 3ds)."
- **Side B (webhooks are correct because payments ARE async):**
  - **dxdm:** "**payments are event-driven in reality. Credit card charges can be disputed, some transactions only succeed after a delay… Webhooks are great for that.**"
  - **ramonga:** manual approaches "**miss hidden complexities.**"
- **The honesty footnote:** **bigtones** — "**It's totally using webhooks**" (despite "no-webhooks" branding); **prasoonds** — "**the user does not have to deal with the webhooks!**" → "no-webhooks" = "we run the consumer for you + expose a synced DB."
- **The constraint that breaks the tie:** **prasoonds** — "Stripe's API has a **100 rp_s rate limit**… you'll hit it" with naive polling.
- **penny's resolution (held as [[OPINIONS]] O-09):** **a synced local DB** — webhooks at-least-once → own DB as entitlement source of truth → periodic reconciliation pull → re-fetch on ordering-sensitive logic. Pure-webhook and pure-poll are both wrong.
- **Status:** *resolved into a default*, but the dispute is live — engineers you respect land on both sides, so the synthesis (not either pole) is the defensible stance.

### D-02 — Agent-payment demand: real or mirage?
*The sharpest dispute in the corpus.* — field-04 §3.
- **Side (skeptic), Artemis analyst, Feb 2026 (verbatim):** "The x402 'agent payments' boom is still **mostly a mirage**"; ~**half** of observed transactions are "**gamified**" (self-dealing/wash); "The merchants that x402 is designed to serve are still **rare**"; "**The narrative around agentic commerce is growing faster than the usage that would justify it.**"
- **Side (bull):** **Erik Reppel, Coinbase** — "As teams move from testing to production and start serving real users, **these percentages should naturally decline.**" Volume (Coinbase, late Apr 2026): "**69,000 active agents, 165 million transactions, ~$50 million cumulative volume.**" Even the skeptic's long view: "We'll probably **overestimate how fast** agentic commerce takes off in the next year, but we're largely **underestimating what it can become in five.**"
- **penny's resolution (held as [[OPINIONS]] O-12, P-21):** rails are real and shipping; demand is speculative and partly synthetic *today*. Default to card-rail SPT (ACP/MPP) for a product that also serves humans; build scoped-credential + ledger primitives now (low regret); keep x402 as an optional escape hatch. **Do not** require x402 volume in the architecture.
- **Status:** unresolvable from data alone (it's a forecast); penny's stance is a *low-regret hedge*, revisited as Energy's own agent-spend volume materializes.

### D-03 — Do cards need webhooks at all?
- **lmz:** "**Cards don't really need webhooks** unless you get into 3ds." (Other payment types are fundamentally async and do.)
- **dxdm:** disputes + delayed-success cases mean cards *do* eventually need event awareness.
- **penny's read:** for a *pure* synchronous card charge with no disputes/3DS, you can mostly query state; but disputes (`charge.dispute.created`), delayed captures, and 3DS pull you back into events. Since penny serves subscriptions + agents (both async-prone), assume you need them. — field-00 §disputes-feed, field-07 §3.
- **Status:** narrow/contextual — true for the toy case, false for penny's actual surface.

### D-04 — "No-webhooks" honesty (naming dispute)
- **bigtones:** "It's totally using webhooks." **prasoonds:** "The user does not have to deal with the webhooks!"
- **penny's read:** a labeling argument, not an architecture one. The async reality doesn't disappear; someone consumes the events. Useful as a *bullshit detector* when evaluating "no-webhooks" vendors — ask "who runs the consumer, and what's the reconciliation story?"
- **Status:** resolved (semantic).

### D-05 — Frictionless vs. challenge for conversion
- **Conventional wisdom:** avoid the challenge; chase exemptions.
- **Germain UX (contrarian, verbatim):** "**A well-implemented challenge flow can have better conversion than a poorly implemented frictionless flow**, because perceived responsiveness matters more than whether authentication happened visibly or invisibly" (28s native-biometric challenge converted; 45s frictionless abandoned).
- **penny's resolution (held as [[OPINIONS]] O-04):** optimize *perceived latency + risk-data richness*, not "challenge vs frictionless" as a binary. A fast challenge beats a slow frictionless flow.
- **Status:** resolved into a stance; flagged because it inverts the common advice and will surprise reviewers.

---

## PART B — UNCONFIRMED / OPEN (penny must form its own view; resolution path given)

> These are **not** facts. Cite them as open. Several can only be closed by a **live experiment against the Stripe test API** (the `.env` has `STRIPE_SECRET_KEY` / test keys) — that is the intended job of the nightly RSI loop, not another blog search.

### G-01 — Did Stripe ever ship the `pay_now` upgrade-rollback parameter? **(HIGH VALUE)**
- **The gap.** Jim Danz (Stripe) called the upgrade-with-immediate-charge + rollback story "**actively broken**" and promised a `pay_now` parameter ("failed payment means rollback, and payment won't automatically be reattempted"). The 2026 Stigg guide *still* builds rollback via schedules/webhooks — implying no clean primitive — but no explicit "shipped / not shipped" confirmation was found. — field-06 §3, §7.
- **Why it matters.** It decides whether S-06's rollback is a Stripe primitive or penny-owned orchestration. Building the manual path when a primitive exists is wasted code; relying on a primitive that doesn't exist strands customers.
- **Resolution path.** (1) Crawl `https://docs.stripe.com/changelog/` + the Subscriptions update API ref for `pay_now`/equivalent. (2) **Live test:** create a sub, attempt an immediate-charge upgrade with a card that will decline (`4000000000000341`), observe whether any built-in parameter rolls the plan back. Record the answer in `brain/OPINIONS.md` O-? and update S-06.

### G-02 — The exact Dahlia (2026-05-27) breaking-change list
- **The gap.** Search confirmed the version string + Acacia/Basil details, but the **Dahlia diff was not byte-verified** from the canonical changelog. — field-02 §4, field-00 §gaps.
- **Why it matters.** penny's "what 2026 invalidated" rests on Basil specifics; if Dahlia moved more fields, the contract tests (S-17) need updating.
- **Resolution path.** Crawl `https://docs.stripe.com/changelog/` for the Dahlia entry; diff against Basil; fold any new shape changes into the L1 contract test.

### G-03 — Late-but-within-35-days meter event after the period invoice finalized
- **The gap.** Docs say meter events must be within the *current* billing period; the **cross-period-but-within-35-days** case (event timestamp valid, but the period's invoice already finalized) is **ambiguous** in secondary sources — does it roll to the next invoice or drop? Also unclear whether the "~1 hour" grace applies to the period-boundary rejection or only to invoice-total lag. — field-03 §2, §7.
- **Why it matters.** It's the difference between "late usage rolls forward (recoverable)" and "late usage is lost (revenue leak)." Determines how aggressive the real-time flush deadline in O-06 must be.
- **Resolution path.** **Live test:** create a metered sub, let a period close + invoice finalize, then send a meter event timestamped inside the closed period but within 35 days; observe whether it appears on the next invoice or is rejected. Read the canonical Meter Event API ref alongside.

### G-04 — SPT revocation semantics
- **The gap.** Can a customer **kill an outstanding SPT mid-flight**, and does Stripe **propagate that to the network token instantly**? Not confirmed from the secondary sources. — field-04 §6.
- **Why it matters.** Revocation is the kill-switch for the agent-spend safety story (O-11). If revocation isn't instant/propagated, the "expiring + capped" guarantees carry more weight and the consent UX must say so.
- **Resolution path.** Read `https://docs.stripe.com/agentic-commerce/concepts/shared-payment-tokens`; if ambiguous, test against the agentic-commerce sandbox (issue an SPT, revoke, attempt a charge).

### G-05 — ACP vs MPP for a *subscription-plus-usage* agent product
- **The gap.** Comparisons frame **MPP as session-streaming** and **ACP as checkout**; the **subscription-plus-usage overlap is unclear** — which fits a product that bills a recurring plan *and* metered agent compute? — field-04 §6.
- **Why it matters.** penny's own product is exactly subscription-plus-usage; picking the wrong primary rail is an architecture bet.
- **Resolution path.** Read both Stripe docs sets (ACP + MPP); prototype a recurring+metered agent charge on each in test mode; record which models subscription + per-session usage more cleanly.

### G-06 — US 3DS / SCA in 2026 + exemption-vs-liability quantification
- **The gap.** Sources focus on EU/UK/Japan; **US-specific 2026 3DS adoption data was thin** (US has no SCA mandate). The **"2–3.5% EU / up to 15% US" conversion-cost figure** is widely repeated but not traceable to a single primary study — treat as directional. — field-05 §6.
- **Why it matters.** penny likely serves US customers; over-applying EU 3DS assumptions could add friction where it isn't mandated.
- **Resolution path.** Search for a 2026 primary study on US CNP 3DS adoption; until found, treat US 3DS as optional/risk-based, not mandatory, and don't cite the 15% figure as measured.

---

## PART C — SINGLE-SOURCED / DIRECTIONAL (true-ish, but don't over-rely)
*Flagged as plausible-but-thin; downgrade confidence accordingly.*
- **`billing_thresholds` "removed then reintroduced May 28, 2025"** — single-sourced (flarecanary). Plausible + specific, but not corroborated. — field-02 §4.
- **The "30+ Stripe integrations" double-charge claim** — aggregated, *not* a single named-company public postmortem; the strongest webhook-double-charge evidence is second-hand. — field-01 §5.
- **The $85k EU hold quote (HN 47565502)** — fetched via WebSearch snippet only (direct HN fetch 429'd); consistent with the HK case but second-hand here. Re-fetch to byte-verify. — field-07 §1b, §5.
- **Braintree "charged on HTTP 500"** — firsthand HN anecdotes (scott_w/jwr), not a published vendor postmortem; credible *pattern*, anecdotal evidence. — field-07 §2, §5.
- **"250+ webhook event types"** — directionally true (Stripe has hundreds) but not byte-checked. — field-07 §5.
- **77%/52% browser-vs-mobile 3DS success split** — Nov 2022 datapoint; kept only as a directional "mobile is harder" signal, likely stale post-native-SDK. — field-05 §6.
- **Idempotency-key retention = 24h** — treat as the *documented contract only*; some practitioners claim Stripe keys some operations differently internally. — field-01 §5.
- **Stripe webhook retry schedule (~3 days, exponential backoff)** — described qualitatively in secondary sources; not byte-verified from canonical docs. — field-01 §5.

---

## PART D — RESEARCH-METHOD GAP (a hole in the *corpus*, not the domain)
- **Live X/Twitter topical signal was NOT captured.** energy's `scripts/x-content-intel/scrape.py --search` authenticated fine, but the **SearchTimeline GraphQL `doc_id` (MJpyQGqgklrVl_6rYKQbow) returned HTTP 404** — X rotated the query id, so topical billing search was unavailable this session. The bookmark fetcher targets Naman's *own* bookmarks (not a topical query), so it wasn't a fit. — field-00 §X-note.
- **Impact.** Coverage leans on HN threads, GitHub repos/issues, Stripe changelog/docs, and practitioner blogs. **For this vertical that's arguably the higher-signal corpus** (payments war stories live on HN + docs, not X), so the gap is real but low-cost.
- **Resolution path.** Refresh the SearchTimeline `doc_id` in `scrape.py`, then run a topical sweep ("Stripe Dahlia", "x402 production", "metered billing bug") to backfill recent practitioner chatter.

---

## How the RSI loop should use this file
`dsip.json` runs nightly (`refresh-brain → re-verify-tool-matrix → run-eval-pyramid → propose → test-gate → commit`). The **`refresh-brain`** step should:
1. Walk **Part B** (G-01..G-06) and attempt the named resolution path (docs crawl or **live test-mode experiment**); when one resolves, **promote it** into [[EXPERTISE-MAP]]/[[OPINIONS]] and **delete it from here**.
2. Re-verify **Part C** single-sourced claims against current docs; upgrade or downgrade confidence.
3. Re-check **D-02** (agent-payment demand) against fresh volume numbers — it's a moving forecast.
4. Retire **Part D** once the X `doc_id` is refreshed.
**The shrinking of this file is a direct measure of the employee getting smarter.**
