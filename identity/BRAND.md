# penny — BRAND

> Name rationale, tagline, design tokens, landing copy. Powered by Energy.
> These color tokens feed the cockpit (`src/cockpit/`).

## Name rationale

**penny** — a coin: the smallest unit of money, the thing you count exactly. The name is the discipline: a
penny is what you reconcile down to when the ledger has to be _right_, not approximately right. Light,
relatable, animate (the Energy D4 naming family — Spark / Ribbon vibes), one word, lowercase. A penny is also
copper — which is where the accent color comes from.

## Tagline

> **counts every cent, trusts no status code.**

The two halves are the whole personality: _counts every cent_ = receipts-first, ledger-is-truth precision;
_trusts no status code_ = the JTBD-0 law (a 200 can lie, a 500 can charge).

## Design tokens (warm-black + amber/copper — penny = coin)

Energy warm-black editorial system, amber accent (copper coin). **No AI-purple gradients.**

| Token | Value | Use |
| --- | --- | --- |
| `--penny-bg` | `#141312` | warm-black background (NOT pure `#000` / near-black `#09090b`) |
| `--penny-bg-elev` | `#1c1a18` | elevated surfaces / cards |
| `--penny-amber` | `#f5a623` | primary accent — copper/amber, the coin |
| `--penny-amber-dim` | `#c8851b` | hover / pressed amber |
| `--penny-copper` | `#b87333` | secondary accent (deeper copper) |
| `--penny-text` | `#ece8e1` | body text (soft, not pure white) |
| `--penny-text-dim` | `#a39c8f` | muted / captions |
| `--penny-green` | `#4caf7e` | money-moved / paid / green status |
| `--penny-red` | `#e5534b` | divergence / failed / audit alarm |
| `--penny-border` | `#2a2722` | hairline borders |

## Typography

- **Display / headings:** Instrument Serif (the serif + sans pairing is the highest-impact anti-AI-look move).
- **Body:** Poppins.
- **Numbers / ledger / amounts:** tabular-nums, monospace where amounts align in columns.

## Layout

Asymmetric / bento (3+2 splits), editorial, not symmetric AI card grids. Tool/status cards show money-relevant
audit lines as adaptive cards with the amber/green/red status, not plain text badges.

## Landing copy

> **penny**
> _The payments employee that counts every cent and trusts no status code._
>
> penny wires correct Stripe billing into your product on one command — checkout, subscriptions, webhooks,
> meters, scoped agent-spend — and proves money moved by reconciling against a ledger, never a transport code.
> It reviews your billing code against 21 known production pitfalls before your customers find them, and issues
> scoped, capped, expiring credentials so an agent can pay without ever seeing the card. Test-mode by default.
> Powered by Energy.
