#!/bin/bash
# sessionstart-brain-law.sh — SessionStart hook for penny.
#
# Injects penny's non-negotiable brain LAW + version baseline at the top of every
# session, so a fresh Claude session operates from the ledger-is-truth discipline
# WITHOUT re-reading the six brain/*.md first. This is the cheapest persistence
# mechanism penny has: the LAW is in context before the first edit.
#
# Contract (Claude Code SessionStart hook):
#   - stdout = text injected into the session context.
#   - exit 0 always (a SessionStart hook must never fail the session).
# Wiring (see .claude/settings.json): SessionStart matcher "*" -> this script.

set -uo pipefail

REPO_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

cat <<'LAW'
=== penny — THE LAW (read before touching any billing code) ===

JTBD-0 — THE LEDGER IS THE TRUTH, NOT THE STATUS CODE.
Never infer "money moved" or "money didn't move" from an HTTP status or a webhook's
arrival. A non-2xx may have charged (500-that-charged). A 200 webhook may have processed
nothing. A 200 with `undefined` fields silently broke charge math (Basil). Reconcile
against an idempotent ledger, or say "unknown, reconciling."

The 4 corollaries:
  A. Re-fetch the canonical object; never trust payload or event order. Entitlement keys
     off YOUR derived paid-through date, not the raw `subscription.status`.
  B. Idempotency record + side-effect go in ONE transaction (or event-id-as-unique-PK).
     Otherwise crash-between = double-fulfill. (helios funding/state.ts is the proof.)
  C. Sync Stripe into your own DB as the entitlement source of truth — webhook-fed,
     reconciliation-backed. Pure-webhook and pure-poll are both wrong. Mind 100 rp/s.
  D. The processor balance is not your cash — design around holds/reserves/freezes.

VERSION BASELINE (June 2026):
  - API version: 2026-05-27.dahlia is current. Acacia / Basil tutorials are 1–2 breaking
    releases stale. Pin the version; own a shape-contract test independent of the SDK.
  - Billing mode: new subscriptions default to FLEXIBLE (since 2025-08-27); existing
    integrations preserved as classic. Greenfield credit-proration math ≠ legacy. Pin it.
  - Metered: the legacy usage-records API (`createUsageRecord`) is GONE since Basil —
    every metered price needs a Meter + v1/billing/meter_events.

BOUNDARY: penny = product BILLING only (checkout, subscriptions, webhooks, metering, tax,
agent-spend credentials). Earning strategies/loops stay with helios — import its balance
ledger, never rebuild it. Test mode is the default and the acceptance bar; sk_live only
behind the chairman checklist.

DISCIPLINE: surgical billing changes (a 200-line "improvement" to a working charge path is
a smell). No self-grading — cite the practitioner / the JTBD law, not your own confidence.

Brain: brain/{EXPERTISE-MAP,OPINIONS,KNOWN-PITFALLS,BATTLE-TESTED-SCENARIOS,TOOL-MATRIX,GAPS-AND-DISPUTES}.md
Query it: bash scripts/memory-search.sh "<topic>"  ·  or  node bin/penny.js explain "<topic>"
=== end LAW ===
LAW

exit 0
