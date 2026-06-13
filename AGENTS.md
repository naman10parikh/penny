# AGENTS.md — penny, the payments/billing employee

> **Read this first.** This is the invocation guide for **penny** — the Energy fleet's payments-billing
> domain-expert employee. If you are a coding agent (Claude Code, energy, or a sibling employee) and you
> have a billing task — wiring Stripe into a product, reviewing a checkout/webhook/subscription integration,
> debugging a live billing incident, or issuing a scoped agent-spend credential — penny is your hands.
> Operated mostly via the `penny` CLI + the MCP server (employee-first); the local cockpit is the chairman's
> read-surface. Powered by Energy.

## What penny does

The payments-billing domain expert. penny knows the Stripe surface (Billing / Checkout / Meters / Issuing /
Tax / agentic-commerce SPT), the 2026 version landscape (Acacia → Basil → Dahlia, flexible billing mode as
the greenfield default), the agent-payment rail zoo (ACP / MPP / x402 / AP2 / UCP), and — above all — **the
silent-failure class**: the 200-that-charged-nothing, the 500-that-charged, the `status:active`-that-didn't-pay,
the metered event silently dropped at the period boundary.

Pinned Stripe API version: **`2026-05-27.dahlia`** (Dahlia's 2026-03-25 cut shipped breaking changes —
Checkout Session UI-mode enums + card-property requirements + 3DS-on-Payment-Records). Test mode is the
default and the acceptance bar; `sk_live` only behind the chairman checklist.

## THE LAW it serves (JTBD-0)

**The ledger is the truth, not the status code.** A non-2xx may have moved money; a 200 webhook may have
processed nothing; a 200 with `undefined` fields silently broke charge math. penny never infers "money moved"
/ "money didn't move" from a transport status — it reconciles against an idempotent ledger, or it says
"unknown, reconciling." Four corollaries fall out of it: (A) re-fetch the canonical object, never trust
payload/event order; (B) the dedup row and the side-effect commit in ONE transaction; (C) sync into your own
DB as the entitlement source of truth; (D) the processor balance is not your cash. Full detail:
`brain/EXPERTISE-MAP.md` JTBD-0. Every skill, sub-agent, and MCP tool below cites a brain ref
(`O-`/`P-`/`S-`/`JTBD`) — that citation is the anti-slop gate.

## How to invoke penny — the `penny` CLI (Bash-invokable)

```
penny wire --product <spec> [--target <dir>] [--dry-run]
                                 # THE acceptance test: scaffold Stripe test-mode billing into a target →
                                 #   checkout E2E + raw-body HMAC webhook + idempotent replay. --dry-run prints
                                 #   the ordered scaffold→verify→self-test step plan without touching Stripe.
penny review <path>              # audit an existing billing integration against the 21 KNOWN-PITFALLS →
                                 #   findings (pitfall id · file:line · severity · fix · brainRef). Exit non-zero
                                 #   when findings exist. (e.g. fixtures/bad-webhook.ts → P-04/P-14/P-08.)
penny debug <symptom>            # root-cause a live billing incident via JTBD-0 (e.g. "every webhook 400s" →
                                 #   P-04/S-03 raw-body footgun). Never infers money-state from a status code.
penny issue-spt --seller <id> --cap <amt> --expires <ts> [--agent <id>]
                                 # issue a scoped/capped/expiring Shared Payment Token (the agent never sees the
                                 #   card); fuses with helios's balance-cap. Test mode. (JTBD-5 / S-13 / O-11.)
penny reconcile --since <ts> [--no-network]
                                 # diff the internal usage/entitlement ledger vs Stripe (meter-event-summary /
                                 #   canonical objects); alarm on divergence. --no-network degrades to
                                 #   "unknown, reconciling" (JTBD-0). (S-09 / O-09.)
penny webhook listen             # wrap `stripe listen --forward-to` + raw-body HMAC self-test (S-01/S-02/S-03).
penny meter create <name> --agg <sum|count|last> --unit <u>
                                 # create a Meter ("name it like a public API"); refuses re-create + bad agg
                                 #   (near-immutable — O-07 / P-10).
penny check-version [--api-version <v>]
                                 # contract-test the pinned API-version shape your code reads ($0, no live API).
                                 #   The headline L1 contract test (S-17 / O-16).
penny explain <topic>            # ask-the-employee: BM25 over brain/ → cited answer. The cockpit shares this.
penny runs-view [--json]         # aggregate the per-run log + the money-action audit trail (observability).
penny --help | --version         # standard; exit 0 / non-zero.
```

## How to invoke penny — the MCP server (penny's own, 8 tools)

penny ships its **own** MCP server (`node dist/mcp/server.js`, stdio) — listed in `.mcp.json` as `penny`,
beyond the inherited 4-server template. It adds the **taste/correctness layer** on top of Stripe; it is NOT a
raw `@stripe/mcp` passthrough (penny *lists* `@stripe/mcp` for raw operations, it does not merely wrap it).
A JSON-RPC `tools/list` returns exactly 8 tools:

- `penny_wire({ productSpec, targetDir?, dryRun? })` → scaffolds + self-tests billing; returns a step report.
- `penny_review_integration({ path })` → `[{ pitfallId, file, line, severity, fix, brainRef }]`.
- `penny_debug({ symptom, context? })` → `{ rootCause, jtbdLaw, brainRef, fix }`.
- `penny_issue_spt({ sellerId, capAmount, expiresAt, agentId })` → test-mode SPT + audit-log id.
- `penny_reconcile({ since })` → `{ divergences[], alarmed }`.
- `penny_meter_create({ name, aggregation, unit })` → meter id or refusal (immutability guard).
- `penny_check_version({ apiVersion? })` → `{ shapeOk, fieldsChecked[], drift[] }` (the L1 contract test).
- `penny_explain({ question })` → cited brain answer (BM25 over `brain/`).

Dual-mode: **stdio local now**; hosted-OAuth is documented-deferred. Env-ref keys only — no literal secrets
in `.mcp.json`.

## The `stripe` CLI — penny's webhook self-test rig

penny self-tests every webhook claim against Stripe **test mode** via the official `stripe` CLI — it is the
self-test rig, not a runtime dependency of the product:

- `stripe listen --forward-to localhost:<port>/webhook` — forward live test-mode events to a local handler;
  prints the `whsec_…` signing secret. `penny webhook listen` wraps this.
- `stripe trigger checkout.session.completed` — fire a known event to exercise the raw-body HMAC path
  (`constructEvent` over `req.text()` succeeds; a tampered body is rejected — S-03/P-04).
- `stripe fixtures <file>` — drive a scripted multi-event scenario (subscription lifecycle, metered flush).

Install via `scripts/install-stripe-cli.sh`. The acceptance test (`pnpm test:acceptance`) and every webhook
golden task lean on this rig; CI installs it before the `acceptance` job.

## Sub-agents (delegate fresh-context payments work)

Two scoped personas in `.claude/agents/` (flat), each declaring an explicit `model:` tier and citing the brain:

- **`billing-reviewer`** — audits a billing-code tree against the 21 KNOWN-PITFALLS *before* it ships
  (raw-body HMAC P-04, dedup-after-side-effect P-02, dead `createUsageRecord` P-08, `status==='active'`
  entitlement P-14, multi-currency tax flip P-15, …). Shares the exact `penny review` scan logic, so its
  correctness is provable cold in-repo. Packaged reusable: `Agent(subagent_type="billing-reviewer")`.
- **`payment-debugger`** — root-causes a *live* billing incident via JTBD-0 (symptom → silent-failure class →
  brain ref → fix), without inferring money-state from a transport status. Shares the `penny debug` triage map.

## The boundary — billing, NOT earning (the NOT-list)

penny is helios's product-side twin. It handles the **charge** side; helios handles the **earn** side.

- **NOT earning strategy / trading / bounty loops** → **helios**. penny hands an earning-loop request to helios.
- **NOT the spend ledger / per-loop caps / per-agent virtual-card P&L** → helios `funding/state.ts`. penny
  **consumes and fuses** it (O-11); it does NOT rebuild it.
- **NOT auth / sign-in** → **badge** (Clerk). penny assumes an authenticated `userId`; it does not mint sessions.
- **NOT the database engine / migrations / RLS** → **acorn**. penny *specifies* the entitlement
  materialized-view shape (O-09); acorn owns the Postgres surface.
- **NOT the web framework / mobile shell** → **pixel / pebble**. penny's cockpit is a stdlib server, not a Next app.
- **NOT a generic Stripe wrapper.** If the ask is "just call the Stripe SDK," penny points at `stripe-node`;
  its value is the gotchas around the call (the 16 OPINIONS, 21 PITFALLS).
- **NOT real money movement.** Test mode is the default and the acceptance bar; `sk_live_…` only behind the
  chairman checklist. penny does not move real money.

## The brain (penny's expertise — query it before you trust it)

The six expertise artifacts under `brain/` are penny's mastery. Query them with `penny explain "<question>"`
(BM25 ranked) or read directly:

- `brain/MOC - penny.md` — the master hub.
- `brain/EXPERTISE-MAP.md` — everything penny must master, by job-to-be-done (start here; JTBD-0 is THE LAW).
- `brain/OPINIONS.md` — the taste layer (O-01…O-16; always X / never Y / because Z).
- `brain/KNOWN-PITFALLS.md` — version-specific gotchas with detection + fix (P-01…P-21).
- `brain/BATTLE-TESTED-SCENARIOS.md` — the golden eval tasks (S-01…S-18), L1/L2/L3-tagged.
- `brain/TOOL-MATRIX.md` — canonical tools, defaults vs alts, agent-access, required secrets.
- `brain/GAPS-AND-DISPUTES.md` — where sources disagree + the open items (G-01…G-06) the nightly RSI loop
  closes via live test-mode experiments. The file shrinking = penny getting smarter.

## Related surfaces

- `CLAUDE.md` — penny's Claude Code operating doc (the voice, THE LAW, the cluster order).
- `identity/SOUL.md` — the full persona (Identity → Personality → Boundaries).
- `llms.txt` — the agent-readable map of every doc and surface in this repo.
- `.well-known/agent.json` — the A2A agent card (name / description / endpoint / capabilities).
- `.claude-plugin/manifest.json` — the plugin bundle (CLI + MCP + 5 skills + 2 hooks + 2 sub-agents).
