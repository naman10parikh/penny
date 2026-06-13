# penny

> **The Energy fleet's payments / billing domain-expert employee.** Wires correct
> [Stripe](https://stripe.com) **test-mode** billing into a product — checkout E2E + a raw-body HMAC webhook +
> idempotent replay — reviews an existing integration against 21 known pitfalls, debugs a live incident
> against the ledger-is-truth law, and issues scoped/capped/expiring agent-spend credentials. It treats the
> **silent-failure class** (the 200-that-charged-nothing, the 500-that-charged, the
> `status:active`-that-didn't-pay) as the real adversary. _Counts every cent, trusts no status code._
> Powered by Energy.

penny is a **tool-employee**, not an app: it is consumed over **CLI + MCP** by coding agents and watched
through a local **cockpit** by a human. It owns **product billing only** — earning strategies / trading /
bounty loops are a sibling employee's seam (see [Boundary](#boundary)).

**THE LAW (JTBD-0):** the ledger is the truth, not the status code. penny never infers "money moved" /
"money didn't move" from a transport status — it reconciles against an idempotent ledger, or it says
"unknown, reconciling." Pinned Stripe API version: **`2026-05-27.dahlia`**. Test mode is the default and the
acceptance bar; `sk_live` only behind the chairman checklist.

## What it does

Its acceptance test is one command:

```bash
penny wire --product examples/saas-pro.json --target /tmp/penny-acceptance
```

→ a correct Stripe **test-mode** billing surface scaffolded into a target: a product + recurring + metered
price + a current-Dahlia Checkout Session + a **raw-body webhook handler**. It proves the Checkout completes
E2E (by **re-fetching the canonical Session**, not the redirect payload — Corollary A), the webhook is
**signature-verified over raw bytes** (`constructEvent` over `req.text()`; a tampered body is rejected —
`S-03`/`P-04`), and replaying the same event is a **no-op (idempotent)** — dedup row + side-effect in one
transaction (`S-02`/`O-02`). `billing_mode` is pinned (`P-17`) and `tax_behavior` is explicit per currency
(`S-16`). All asserted in CI, test mode only — no `sk_live`.

## Install

```bash
pnpm install && pnpm build
```

Requires **Node ≥ 20**. As a Claude Code plugin, point Settings → Plugins → Add local plugin at this
directory (or `claude plugin install penny`) — see
[`.claude-plugin/manifest.json`](.claude-plugin/manifest.json). The `stripe` CLI (penny's webhook self-test
rig) installs via [`scripts/install-stripe-cli.sh`](scripts/install-stripe-cli.sh).

## CLI

| Command | What it does |
|---|---|
| `penny wire --product <spec> [--target <dir>] [--dry-run]` | **The acceptance test** — scaffold Stripe test-mode billing → checkout E2E + raw-body HMAC webhook + idempotent replay. `--dry-run` prints the scaffold→verify→self-test step plan. |
| `penny review <path>` | Audit a billing integration against the 21 KNOWN-PITFALLS (`P-04` raw-body footgun, `P-08` dead `createUsageRecord`, `P-14` `status==='active'` entitlement, `P-15` multi-currency tax flip, …); findings keyed by P-/S-ID with file:line + fix + brain ref. Non-zero exit when findings exist. |
| `penny debug <symptom>` | Root-cause a live billing incident via JTBD-0 (e.g. "every webhook 400s" → `P-04`/`S-03`) — never infers money-state from a status code. |
| `penny issue-spt --seller <id> --cap <amt> --expires <ts>` | Issue a scoped/capped/expiring Shared Payment Token (the agent never sees the card); fuses with helios's balance-cap. Test mode; writes an audit line (`S-13`/`O-11`). |
| `penny reconcile --since <ts> [--no-network]` | Diff the internal ledger vs Stripe; alarm on divergence; `--no-network` degrades to "unknown, reconciling" (`S-09`/`O-09`). |
| `penny webhook listen` | Wrap `stripe listen --forward-to` + a raw-body HMAC self-test (`S-01`/`S-02`/`S-03`). |
| `penny meter create <name> --agg <sum\|count\|last> --unit <u>` | Create a near-immutable Stripe Meter ("name it like a public API"); refuses re-create + bad aggregation (`O-07`/`P-10`). |
| `penny check-version [--api-version <v>]` | Contract-test the pinned API-version shape your code reads ($0, no live API) — the headline L1 (`S-17`/`O-16`). |
| `penny explain <topic>` | Ask the payments employee: BM25 over [`brain/`](brain/) → a cited answer. |
| `penny runs-view [--json]` | Aggregate the per-run log + the money-action audit trail (observability). |

`penny --help` lists every command; exit 0 on success / non-zero on error.

## MCP

penny ships **its own** MCP server (`penny-mcp`) exposing the same operations as 8 JSON-RPC tools:
`penny_wire` · `penny_review_integration` · `penny_debug` · `penny_issue_spt` · `penny_reconcile` ·
`penny_meter_create` · `penny_check_version` · `penny_explain`. It adds the **taste/correctness layer** — it
is not a raw `@stripe/mcp` passthrough (penny *lists* `@stripe/mcp` for raw ops, it does not merely wrap it).
Default transport is stdio (`node dist/mcp/server.js`); hosted-OAuth is documented-deferred. See
[`.mcp.json`](.mcp.json) and the A2A card at [`.well-known/agent.json`](.well-known/agent.json).

## The brain

penny is *opinionated*. Its expertise lives in [`brain/`](brain/) (six Wave-R artifacts) and is queryable
via `penny explain` / `bash scripts/memory-search.sh`:

- [`OPINIONS.md`](brain/OPINIONS.md) — the anti-slop taste layer (ALWAYS X / NEVER Y, because Z). e.g.
  *webhooks at-least-once into your own DB as the entitlement source of truth, then reconcile; card-rail SPT
  is the lower-regret agent default, x402 is an escape hatch.*
- [`KNOWN-PITFALLS.md`](brain/KNOWN-PITFALLS.md) — the version-specific gotcha table (symptom → condition →
  detect → fix). e.g. `P-04` raw-body HMAC footgun (`req.json()` before `constructEvent` → every webhook
  400s); `P-08` `createUsageRecord` removed since Basil (metered now requires a Meter); `P-14`
  `status==='active'` reads usable in dunning grace.
- [`BATTLE-TESTED-SCENARIOS.md`](brain/BATTLE-TESTED-SCENARIOS.md) — 18 real failure/migration scenarios, the
  golden eval tasks (`S-01`…`S-18`).

## The single taste

**The ledger is the truth, not the status code.** Almost every payments bug hides behind a *success-looking*
signal — a 200, an `undefined`, a dropped row, a `status: active`. penny's edge is refusing to read money-state
off the transport: re-fetch the canonical object, commit the dedup row and the side-effect in one transaction,
sync into your own DB, and treat a non-2xx as *ambiguous* (it may have charged) rather than as a failure.

## Boundary

penny owns **product billing ONLY** — checkout, subscriptions, webhooks, metering, tax, agent-spend
credentials. It is helios's product-side twin: helios owns the spend ledger + caps + per-agent virtual card +
P&L; penny owns the *charge* side (issuing/scoping the credential, the consent UX, ledger↔provider
reconciliation) and **consumes and fuses** helios `funding/state.ts` — it never rebuilds it. **Earning
strategies / trading / bounty loops → helios.** Auth → badge; the Postgres surface → acorn; the web/mobile
shell → pixel/pebble. penny does not move real money.

## More

- [`AGENTS.md`](AGENTS.md) — the agent-facing operating guide (CLI/MCP tool list, the `stripe` self-test rig, the boundary, the NOT-list).
- [`llms.txt`](llms.txt) — the LLM index (skills, MCP, brain, P-/S-/O- ID index, the `stripe` self-test path).
- [`CLAUDE.md`](CLAUDE.md) — voice, THE LAW, the test-mode default, the cluster order.
- [`identity/SOUL.md`](identity/SOUL.md) — the full persona.

## License

MIT.
