# penny

<!-- fleet:header:start -->
<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/banner-dark.svg"><img alt="Penny: Payments and billing wired correctly, for products and their agents." src="assets/banner.svg" width="100%"></picture></p>

<p align="center">
<a href="https://github.com/naman10parikh/penny/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/naman10parikh/penny/actions/workflows/ci.yml/badge.svg"></a>
<a href="https://github.com/naman10parikh/penny/releases"><img alt="Latest release" src="https://img.shields.io/github/v/release/naman10parikh/penny?style=flat-square&amp;color=2f5d8a"></a>
<a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-2f5d8a?style=flat-square"></a>
<a href="#use-it-from-any-coding-agent"><img alt="MCP server" src="https://img.shields.io/badge/MCP-server-1e3f60?style=flat-square"></a>
<a href="https://x.com/naman10parikh"><img alt="Follow @naman10parikh on X" src="https://img.shields.io/badge/follow-%40naman10parikh-000000?style=flat-square&amp;logo=x&amp;logoColor=white"></a>
<a href="https://www.linkedin.com/in/naman-parikh1/"><img alt="Naman Parikh on LinkedIn" src="https://img.shields.io/badge/LinkedIn-Naman%20Parikh-0a66c2?style=flat-square"></a>
</p>

<p align="center"><a href="#quick-start">Quick start</a> · <a href="https://naman10parikh.github.io/penny/">Website</a> · <a href="docs/README.md">How it works</a> · <a href="AGENTS.md">AGENTS.md</a> · <a href="llms.txt">llms.txt</a> · <a href="skills/">Skills</a> · <a href="https://github.com/naman10parikh/penny/discussions">Discussions</a> · <a href="https://github.com/naman10parikh">All projects</a></p>

**Payments and billing wired correctly, for products and their agents.**

Penny is an agent employee, a packaged specialist agent with its own skills, memory and tests. It owns one job: payments. Coding agents use it through its skills, its MCP server and its command line. A scheduled job runs its evals and proposes fixes. A person makes every change.

_Penny is part of an agent-native play for agent-native systems that can eventually be recursively self-improving and evolving, operated by agent employees._

<p align="center"><img alt="Penny: a real task, run offline" src="assets/demo.svg" width="880"></p>
<!-- fleet:header:end -->

penny is the payments and billing employee for coding agents. It wires correct Stripe billing into a product in
test mode, reviews an existing integration against 21 known pitfalls, debugs live billing incidents and issues capped,
expiring spending credentials for agents. Its one law: the ledger is the truth, not the status code.

> Tagline: *Counts every cent, trusts no status code.* Powered by Energy.

<!-- fleet:use:start -->
## Use it from any coding agent

**Claude Code**: the plugin brings the skills, sub-agents, hooks and MCP server.

```
/plugin marketplace add naman10parikh/penny
/plugin install penny@penny
```

<details><summary>Its MCP server, Codex, Cursor, Gemini CLI, one skill and the command line</summary>

**Its MCP server**, in any MCP client:

```bash
claude mcp add --transport stdio penny -- npx -y -p github:naman10parikh/penny penny-mcp
codex mcp add penny -- npx -y -p github:naman10parikh/penny penny-mcp
```

Cursor (`.cursor/mcp.json`), Gemini CLI (`.gemini/settings.json`) and most other clients take the same command as JSON:

```json
{
  "mcpServers": {
    "penny": {
      "command": "npx",
      "args": [
        "-y",
        "-p",
        "github:naman10parikh/penny",
        "penny-mcp"
      ]
    }
  }
}
```

**Gemini CLI**: the extension brings the context and the MCP server.

```bash
gemini extensions install https://github.com/naman10parikh/penny
```

**One skill** (5 in all, in [skills/](skills/)), in any agent that reads Agent Skills:

```bash
gemini skills install https://github.com/naman10parikh/penny --path skills/stripe-webhook-correctness
git clone --depth 1 https://github.com/naman10parikh/penny /tmp/penny && cp -r /tmp/penny/skills/stripe-webhook-correctness ~/.claude/skills/
```

**The command line:**

```bash
npx -y -p github:naman10parikh/penny penny --help
```

</details>

Codex, Cursor, OpenCode, GitHub Copilot and other agents read [AGENTS.md](AGENTS.md); Claude Code reads [CLAUDE.md](CLAUDE.md) and Gemini CLI reads [GEMINI.md](GEMINI.md), which import it. [llms.txt](llms.txt) maps every surface for agents that read first.
<!-- fleet:use:end -->

## Quick start

Run it straight from GitHub, with no clone (npm builds it on install):

```bash
npx -y -p github:naman10parikh/penny penny --help
npx -y -p github:naman10parikh/penny penny explain "raw body webhook signature"
```

From a clone (Node 20 or later):

```bash
pnpm install && pnpm build
node bin/penny.js wire --product examples/saas-pro.json --target /tmp/penny-acceptance --dry-run
node bin/penny.js review fixtures/bad-webhook.ts
pnpm test                     # 77 tests
pnpm run eval                 # L1 golden assertions; add -- --level l2 or -- --level l3
```

`wire --dry-run` prints the ordered plan (scaffold, verify, self-test) without touching Stripe. `review` finds three
problems in the sample webhook, starting with `P-04` (the body is parsed before the signature check), and exits
non-zero. A live `wire` run needs a Stripe test-mode key in `STRIPE_SECRET_KEY`; penny never uses a live key. The
`stripe` CLI, penny's webhook self-test rig, installs with
[`scripts/install-stripe-cli.sh`](scripts/install-stripe-cli.sh).

## How it works

**The law (JTBD-0).** The ledger is the truth, not the status code. penny never decides that money moved, or did
not move, from a transport status. It reconciles against an idempotent ledger, or it says "unknown, reconciling."
The pinned Stripe API version is `2026-05-27.dahlia`. Test mode is the default and the acceptance bar.

**The acceptance test** is one command: `penny wire --product examples/saas-pro.json --target /tmp/penny-acceptance`.
It scaffolds a product with a recurring and a metered price, a current Dahlia Checkout Session and a raw-body webhook
handler into the target. It then proves three things in CI, in test mode only:

- the Checkout completes end to end, checked by re-fetching the canonical Session rather than trusting the redirect
  payload (Corollary A);
- the webhook is verified over the raw bytes (`constructEvent` over `req.text()`), and a tampered body is rejected
  (`S-03`, `P-04`);
- replaying the same event does nothing, because the dedup row and the side effect commit in one transaction
  (`S-02`, `O-02`).

`billing_mode` is pinned (`P-17`) and `tax_behavior` is explicit per currency (`S-16`).

**The commands.** Every one exits 0 on success and non-zero on error; `penny --help` lists them.

| Command | MCP tool | What it does |
| --- | --- | --- |
| `penny wire --product <spec> [--target <dir>] [--dry-run]` | `penny_wire` | The acceptance test above. `--dry-run` prints the plan. |
| `penny review <path>` | `penny_review_integration` | Audits a billing integration against the 21 known pitfalls (for example `P-04` the raw-body trap, `P-08` the dead `createUsageRecord`, `P-14` trusting `status==='active'`, `P-15` the multi-currency tax flip). Each finding has its ID, file:line, a fix and a brain reference. Exits non-zero when it finds any. |
| `penny debug <symptom>` | `penny_debug` | Root-causes a live incident through JTBD-0 (for example "every webhook 400s" leads to `P-04`, `S-03`). |
| `penny issue-spt --seller <id> --cap <amt> --expires <ts>` | `penny_issue_spt` | Issues a scoped, capped, expiring Shared Payment Token, so the agent never sees the card. It fuses with helios's balance cap, runs in test mode and writes an audit line (`S-13`, `O-11`). |
| `penny reconcile --since <ts> [--no-network]` | `penny_reconcile` | Diffs the internal ledger against Stripe and alarms on a divergence; with no network it says "unknown, reconciling" (`S-09`, `O-09`). |
| `penny webhook listen` | | Wraps `stripe listen --forward-to` with a raw-body HMAC self-test (`S-01` to `S-03`). |
| `penny meter create <name> --agg <sum\|count\|last> --unit <u>` | `penny_meter_create` | Creates a near-immutable Stripe Meter ("name it like a public API") and refuses a re-create or a bad aggregation (`O-07`, `P-10`). |
| `penny check-version [--api-version <v>]` | `penny_check_version` | Contract-tests the pinned API-version shape your code reads, with no live API: the headline L1 test (`S-17`, `O-16`). |
| `penny explain <topic>` | `penny_explain` | Asks the payments employee: BM25 over [`brain/`](brain/) gives a cited answer. |
| `penny runs-view [--json]` | | Summarises the per-run log and the money-action audit trail. |

**The MCP server** (`penny-mcp`, stdio) exposes eight of these as tools. It adds the taste and correctness layer on
top of Stripe; it is not a raw `@stripe/mcp` passthrough (penny lists `@stripe/mcp` for raw operations in
`.mcp.dev.json`). Hosted OAuth is documented as deferred. The A2A card is
[`.well-known/agent.json`](.well-known/agent.json).

**The brain.** penny is opinionated, and its expertise lives in [`brain/`](brain/), queryable with `penny explain`
or `bash scripts/memory-search.sh`:

- [`OPINIONS.md`](brain/OPINIONS.md), the taste layer (always X, never Y, because Z). For example: take webhooks
  at least once into your own database as the entitlement source of truth, then reconcile; the card-rail token is
  the lower-regret default for agent payments, and x402 is an escape hatch.
- [`KNOWN-PITFALLS.md`](brain/KNOWN-PITFALLS.md), the version-specific gotchas (symptom, condition, detection,
  fix). For example `P-04` (`req.json()` before `constructEvent` makes every webhook 400), `P-08`
  (`createUsageRecord` is gone since Basil, so metered prices need a Meter) and `P-14` (`status==='active'` still
  reads as usable during dunning grace).
- [`BATTLE-TESTED-SCENARIOS.md`](brain/BATTLE-TESTED-SCENARIOS.md), 18 real failure and migration scenarios that
  are the golden eval tasks (`S-01` to `S-18`).

**The single taste.** Almost every payments bug hides behind a signal that looks like success: a 200, an
`undefined`, a dropped row, a `status: active`. penny refuses to read money state off the transport. It re-fetches
the canonical object, commits the dedup row and the side effect in one transaction, syncs into your own database,
and treats a non-2xx as ambiguous (it may have charged) rather than as a failure.

**The boundary.** penny owns product billing only: checkout, subscriptions, webhooks, metering, tax and agent-spend
credentials. It is the product-side twin of helios, which owns the spend ledger, the caps, the per-agent virtual card
and the P&L. penny owns the charge side (issuing and scoping the credential, the consent flow, reconciling the ledger
with the provider) and consumes helios's `funding/state.ts` rather than rebuilding it. Earning strategies, trading and
bounty loops belong to helios; auth to badge; the Postgres surface to acorn; the web and mobile shell to pixel and
pebble. penny does not move real money.

**For agents:** [AGENTS.md](AGENTS.md) is the operating guide (tools, the `stripe` rig, the boundary, the NOT-list),
[llms.txt](llms.txt) maps every surface, [CLAUDE.md](CLAUDE.md) holds the voice and the law, and
[identity/SOUL.md](identity/SOUL.md) is the full persona.

<!-- fleet:anatomy:start -->
## What it is made of

Every project in this fleet is graded on the same 11 harness components and on self-improvement. Each mark is backed by a file you can open.

| Component | Grade | Where |
| --- | --- | --- |
| Identity | ✅ | identity/SOUL.md:10 |
| Memory | ✅ | memory/MEMORY.md:1 + scripts/memory-search.sh:1 |
| Skills | ✅ | skills/stripe-webhook-correctness/SKILL.md:1 |
| Tools/CLIs | ✅ | bin/penny.js:1 |
| Hooks | ✅ | .claude/settings.json:4 + hooks/hooks.json:4 |
| Sub-agents | ✅ | .claude/agents/billing-reviewer.md:1 |
| MCPs | ✅ | src/mcp/server.ts:162 |
| Dispatch | ✅ | src/wire/router.ts:24 + .github/workflows/rsi.yml:12 |
| Evals | ✅ | eval/run.ts:1 + .github/workflows/ci.yml:61 |
| Observability | ✅ | src/obs/log-run.ts:46 |
| Sandbox/Infra | ✅ | scripts/sandbox-acceptance.mjs:112 |
| Self-improvement | ✅ | dsip.json:1 + .github/workflows/rsi.yml:58 |

✅ real and tested · 🟡 partial, with the reason in the row · ❌ absent
<!-- fleet:anatomy:end -->

<!-- fleet:footer:start -->
## How it improves itself

It carries its own evals and a self-improvement contract, [`dsip.json`](dsip.json), which says what it may change and how a change is judged. A scheduled job runs its evals and proposes fixes. A person makes every change. Lessons it learns are kept as rules in its memory files.

## Part of a fleet

One of the projects by [Naman Parikh](https://github.com/naman10parikh). Each owns one part of an agent's harness, or of the product around an agent, and all of them follow one standard.

| Related project | What it owns |
| --- | --- |
| [AgentDial](https://github.com/naman10parikh/agentdial) | Identity |
| [WikiMem](https://github.com/naman10parikh/wikimem) | Memory |
| [Skillsmith](https://github.com/naman10parikh/skillsmith) | Skills |
| [Agent Booster](https://github.com/naman10parikh/agent-booster) | Tools / CLIs |
| [Hooksmith](https://github.com/naman10parikh/hooksmith) | Hooks |
| [AgentCast](https://github.com/naman10parikh/agentcast) | Sub-agents |
| [Plugsmith](https://github.com/naman10parikh/plugsmith) | Plugins |
| [Armory](https://github.com/naman10parikh/armory) | MCPs and the component registry |
| [AgentGrid](https://github.com/naman10parikh/agentgrid) | Dispatch |
| [AgentSwarm](https://github.com/naman10parikh/agentswarm) | Dispatch |
| [AgentBench](https://github.com/naman10parikh/agentbench) | Evals |
| [AgentMoney](https://github.com/naman10parikh/agentmoney) | Observability |
| [Sandforge](https://github.com/naman10parikh/sandforge) | Sandbox / Infra |
| [Claude Harness](https://github.com/naman10parikh/claude-harness) | The whole harness, as a template |

## Community

Questions and ideas go to [Discussions](https://github.com/naman10parikh/penny/discussions); bugs go to [issues](https://github.com/naman10parikh/penny/issues/new/choose). Follow the work on [X](https://x.com/naman10parikh) and [LinkedIn](https://www.linkedin.com/in/naman-parikh1/).

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md). AI-assisted pull requests are welcome. Report a vulnerability privately, as [SECURITY.md](SECURITY.md) explains.

## Star history

If it is useful to you, a star helps other people find it.

<a href="https://star-history.com/#naman10parikh/penny&Date"><picture><source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=naman10parikh/penny&type=Date&theme=dark"><img alt="Star history chart" src="https://api.star-history.com/svg?repos=naman10parikh/penny&type=Date" width="640"></picture></a>

## Contributors

<a href="https://github.com/naman10parikh/penny/graphs/contributors"><img alt="Contributors" src="https://contrib.rocks/image?repo=naman10parikh/penny"></a>
<!-- fleet:footer:end -->

## License

MIT. See [LICENSE](LICENSE).
