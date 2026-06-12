#!/bin/bash
# pretooluse-billing-guard.sh — PreToolUse(Write|Edit) billing-taste gate for penny.
#
# Dogfood: flags the two silent footguns penny exists to kill, BEFORE they land in a file:
#   P-08 — a call to the DEAD `createUsageRecord` API. Removed since Basil (2025-03-31);
#          metered prices now require a Meter + v1/billing/meter_events. Any code (or
#          LLM-generated code) calling it writes against a deleted endpoint → usage
#          silently never appears on invoices. (brain/KNOWN-PITFALLS.md P-08, S-09.)
#   P-04 — a webhook handler that parses the body (`req.json()` / `JSON.parse(req.body)`
#          / a body-parser) BEFORE `constructEvent`, with no raw-body read. The
#          reserialized body breaks HMAC → every webhook 400s "No signatures found".
#          (brain/KNOWN-PITFALLS.md P-04, brain/BATTLE-TESTED-SCENARIOS.md S-03.)
#
# Contract (Claude Code PreToolUse hook):
#   - stdin = JSON with .tool_name and .tool_input (.file_path + .content / .new_string)
#   - exit 0  => allow
#   - exit 2  => BLOCK (stderr is shown to Claude)
# P-08 (dead API) BLOCKS (exit 2). P-04 (missing raw-body read) WARNS but allows
# (exit 0 + stderr) — a webhook handler can legitimately read the raw body in a
# helper the single diff doesn't show, so we warn rather than hard-block.
#
# Every firing is appended to the single canonical log: hooks/billing-guard.log
#
# Wiring (see .claude/settings.json): PreToolUse matcher "Write|Edit" -> this script.

set -uo pipefail

REPO_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
GUARD_LOG="$REPO_DIR/hooks/billing-guard.log"
TS="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

PAYLOAD="$(cat 2>/dev/null || true)"

# Pull a field out of the PreToolUse JSON payload. node is the reliable multi-line parser;
# jq is the fallback. file_path => .tool_input.file_path; content => .content || .new_string.
read_field() {
  local field="$1"
  if command -v node >/dev/null 2>&1; then
    printf '%s' "$PAYLOAD" | ( export FIELD="$field"; node -e '
      let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
        try{const j=JSON.parse(s);const ti=j.tool_input||{};
          const f=process.env.FIELD;
          let v="";
          if(f==="file_path"){v=ti.file_path||"";}
          else{v=ti.content||ti.new_string||"";}
          process.stdout.write(String(v));
        }catch{process.stdout.write("");}
      });' ) 2>/dev/null
    return 0
  fi
  if command -v jq >/dev/null 2>&1; then
    if [ "$field" = "file_path" ]; then
      printf '%s' "$PAYLOAD" | jq -r '.tool_input.file_path // empty' 2>/dev/null
    else
      printf '%s' "$PAYLOAD" | jq -r '.tool_input.content // .tool_input.new_string // empty' 2>/dev/null
    fi
    return 0
  fi
  printf ''
}

FILE_PATH="$(read_field file_path)"
CONTENT="$(read_field content)"

# Nothing to inspect (e.g. a read-only tool slipped the matcher) -> allow.
[ -z "$CONTENT" ] && exit 0

log() { printf '%s\t%s\t%s\n' "$TS" "$1" "${FILE_PATH:-<unknown>}" >> "$GUARD_LOG" 2>/dev/null || true; }

# ---------------------------------------------------------------------------
# P-08 — dead createUsageRecord API. Hard BLOCK (exit 2).
# Matches `createUsageRecord(` and `subscriptionItems.createUsageRecord`.
# ---------------------------------------------------------------------------
if printf '%s' "$CONTENT" | grep -qE 'createUsageRecord'; then
  log "BLOCK P-08 createUsageRecord"
  {
    echo "🛑 penny billing-guard BLOCK — P-08: dead \`createUsageRecord\` API."
    echo "   \`subscriptionItems.createUsageRecord()\` was removed in Stripe Basil (2025-03-31)."
    echo "   Usage reported through it is SILENTLY dropped — it never appears on invoices."
    echo "   Fix: create a Meter and report via \`v1/billing/meter_events\` (the /metered-billing skill)."
    echo "   Refs: brain/KNOWN-PITFALLS.md P-08 · brain/BATTLE-TESTED-SCENARIOS.md S-09."
    echo "   File: ${FILE_PATH:-<unknown>}"
  } >&2
  exit 2
fi

# ---------------------------------------------------------------------------
# P-04 — webhook handler parsing the body before HMAC verification, with no
# raw-body read. WARN (exit 0 + stderr): the file looks like a webhook handler
# (calls constructEvent / mentions stripe-signature) AND parses JSON AND does
# NOT read raw bytes (req.text() / express.raw / rawBody / arrayBuffer / req.body
# as a Buffer). Warn, don't block — the raw read may live in a helper.
# ---------------------------------------------------------------------------
looks_like_webhook=0
printf '%s' "$CONTENT" | grep -qE 'constructEvent|stripe-signature|webhooks\.constructEvent' && looks_like_webhook=1

if [ "$looks_like_webhook" = "1" ]; then
  parses_json=0
  reads_raw=0
  printf '%s' "$CONTENT" | grep -qE 'req\.json\(\)|request\.json\(\)|JSON\.parse\(|bodyParser|express\.json\(\)|app\.use\(.*json' && parses_json=1
  printf '%s' "$CONTENT" | grep -qE 'req\.text\(\)|request\.text\(\)|express\.raw|rawBody|raw_body|arrayBuffer\(\)|bodyParser:\s*false|api:\s*\{[^}]*bodyParser:\s*false' && reads_raw=1

  if [ "$parses_json" = "1" ] && [ "$reads_raw" = "0" ]; then
    log "WARN P-04 webhook-no-rawbody"
    {
      echo "⚠️  penny billing-guard WARN — P-04: webhook handler parses the body before raw-body HMAC."
      echo "   This handler calls constructEvent but appears to read JSON (req.json()/JSON.parse/bodyParser)"
      echo "   with no raw-byte read. Stripe signs the RAW bytes — any reserialization breaks the HMAC and"
      echo "   EVERY webhook 400s \"No signatures found matching the expected signature.\""
      echo "   Fix: read raw bytes (await req.text() / express.raw), disable the body parser for this route,"
      echo "   pass the raw string + stripe-signature header to constructEvent. Do NOT rotate the secret first."
      echo "   Refs: brain/KNOWN-PITFALLS.md P-04 · brain/BATTLE-TESTED-SCENARIOS.md S-03 · /stripe-webhook-correctness."
      echo "   File: ${FILE_PATH:-<unknown>}  (warning only — allowing; verify the raw read isn't in a helper.)"
    } >&2
    exit 0
  fi
fi

exit 0
