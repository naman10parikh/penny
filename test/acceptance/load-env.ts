// Shared .env loader for the acceptance suite + the sandbox script. Loads the repo's gitignored
// .env into process.env IN-PROCESS (never prints a value). The acceptance test needs STRIPE_SECRET_KEY
// (sk_test) for the live re-fetch assertion and STRIPE_WEBHOOK_SECRET for signing; the rest of the
// assertions are hermetic. In CI these come from GitHub secrets (already in process.env), so the
// .env read is a local-dev convenience that no-ops when the file is absent.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/** Load .env at the repo root into process.env (does not overwrite existing keys). Best-effort. */
export function loadDotEnv(): void {
  const here = dirname(fileURLToPath(import.meta.url)); // test/acceptance/
  const root = join(here, "..", "..");
  const path = join(root, ".env");
  if (!existsSync(path)) return; // CI: secrets already in process.env
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const key = m[1];
      if (process.env[key]) continue; // never clobber an already-set (CI) value
      process.env[key] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  } catch {
    // best-effort; a missing/unreadable .env just means CI provides the secrets
  }
}

/** True when a Stripe TEST secret key is available (gates the one live assertion). */
export function hasStripeTestKey(): boolean {
  return (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");
}
