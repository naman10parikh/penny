#!/usr/bin/env bash
# Provision STRIPE_WEBHOOK_SECRET (S3) NON-INTERACTIVELY — no `stripe login`, no browser, no 2FA.
#
# The key insight the first S3 pass missed: `stripe listen --api-key <sk_test> --print-secret` obtains a
# valid TEST-MODE webhook signing secret (whsec_) and exits, without the interactive `stripe login` pairing.
# This is the D7 "full autonomy, test-tier" path.
#
# Contract: NEVER prints a secret value. Reads STRIPE_SECRET_KEY from the gitignored .env inside THIS
# process (not the caller's shell). Appends STRIPE_WEBHOOK_SECRET to .env (if absent) + sets the gh secret.
# Test-mode only — penny never moves real money; aborts if the source key is not sk_test_.
#
# Usage: bash scripts/provision-webhook-secret.sh
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=".env"
[ -f "$ENV_FILE" ] || { echo "S3 FAIL: $ENV_FILE not found"; exit 1; }

# Load STRIPE_SECRET_KEY from .env into THIS script's env only (grep the line, never echo the value).
SK="$(grep -E '^STRIPE_SECRET_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
[ -n "$SK" ] || { echo "S3 FAIL: STRIPE_SECRET_KEY not in $ENV_FILE"; exit 1; }
case "$SK" in
  sk_test_*) : ;; # test-mode key — proceed
  *) echo "S3 ABORT: STRIPE_SECRET_KEY is not sk_test_ — penny is test-mode only, refusing to use a live key."; exit 1 ;;
esac

# Already provisioned? Idempotent — do not duplicate.
if grep -qE '^STRIPE_WEBHOOK_SECRET=whsec_' "$ENV_FILE"; then
  echo "S3 OK (already provisioned): STRIPE_WEBHOOK_SECRET present in $ENV_FILE."
else
  command -v stripe >/dev/null 2>&1 || { echo "S3 FAIL: stripe CLI not installed"; exit 1; }
  # The non-interactive print-and-exit. --api-key skips `stripe login`; --print-secret prints whsec_ + exits.
  WHSEC="$(stripe listen --api-key "$SK" --print-secret 2>/dev/null | tr -d '[:space:]')"
  case "$WHSEC" in
    whsec_*) : ;; # got a valid signing secret
    *) echo "S3 FAIL: stripe listen --print-secret did not return a whsec_ (got ${#WHSEC} chars). The test account may need agentic-commerce/webhook enablement → CHAIRMAN-CHECKLIST."; exit 1 ;;
  esac
  printf 'STRIPE_WEBHOOK_SECRET=%s\n' "$WHSEC" >> "$ENV_FILE"
  echo "S3: wrote STRIPE_WEBHOOK_SECRET to $ENV_FILE (value not printed)."
fi

# Set the gh secret (for the CI acceptance job env) — read back from .env, never echoed.
WHSEC="$(grep -E '^STRIPE_WEBHOOK_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
if command -v gh >/dev/null 2>&1; then
  if printf '%s' "$WHSEC" | gh secret set STRIPE_WEBHOOK_SECRET >/dev/null 2>&1; then
    echo "S3: gh secret STRIPE_WEBHOOK_SECRET set."
  else
    echo "S3 NOTE: gh secret set failed (repo perms?) — .env carries the secret; record gh path in CHAIRMAN-CHECKLIST."
  fi
else
  echo "S3 NOTE: gh CLI absent — .env carries the secret."
fi

echo "S3 DONE."
