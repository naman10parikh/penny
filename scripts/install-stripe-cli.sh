#!/usr/bin/env bash
# Install the `stripe` CLI — penny's webhook self-test rig (listen / trigger / fixtures).
#
# The acceptance test's red-blocking assertions verify the raw-body HMAC contract HERMETICALLY (via
# Stripe.webhooks.generateTestHeaderString — no long-running forwarder, so CI is deterministic). The
# `stripe` CLI is installed for the DOCUMENTED self-test path (AGENTS.md / llms.txt) and for local
# `stripe trigger checkout.session.completed` drives. Idempotent: skips if already present.
#
# Used by the `acceptance` CI job. On Linux runners it pulls the published tarball; on macOS it
# defers to Homebrew. Exits 0 if the CLI is available afterward, non-zero only on a real failure.
set -euo pipefail

if command -v stripe >/dev/null 2>&1; then
  echo "stripe CLI already present: $(stripe version 2>/dev/null | head -1)"
  exit 0
fi

OS="$(uname -s)"
case "$OS" in
  Linux)
    VERSION="1.21.8"
    URL="https://github.com/stripe/stripe-cli/releases/download/v${VERSION}/stripe_${VERSION}_linux_x86_64.tar.gz"
    TMP="$(mktemp -d)"
    echo "installing stripe CLI v${VERSION} (linux) → /usr/local/bin"
    curl -fsSL "$URL" -o "$TMP/stripe.tar.gz"
    tar -xzf "$TMP/stripe.tar.gz" -C "$TMP"
    # /usr/local/bin is writable on GitHub-hosted ubuntu runners; fall back to sudo if not.
    if mv "$TMP/stripe" /usr/local/bin/stripe 2>/dev/null; then :; else sudo mv "$TMP/stripe" /usr/local/bin/stripe; fi
    chmod +x /usr/local/bin/stripe || sudo chmod +x /usr/local/bin/stripe
    ;;
  Darwin)
    if command -v brew >/dev/null 2>&1; then
      echo "installing stripe CLI via Homebrew (macOS)"
      brew install stripe/stripe-cli/stripe
    else
      echo "stripe CLI not present and Homebrew unavailable — install manually: https://docs.stripe.com/stripe-cli" >&2
      exit 1
    fi
    ;;
  *)
    echo "unsupported OS for auto-install: $OS — install the stripe CLI manually" >&2
    exit 1
    ;;
esac

stripe version >/dev/null 2>&1 && { echo "stripe CLI installed: $(stripe version | head -1)"; exit 0; }
echo "stripe CLI install did not produce a runnable binary" >&2
exit 1
