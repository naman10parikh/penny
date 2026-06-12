// Shared brain-reference helpers. penny's anti-slop gate: every finding / answer cites a
// brain ref (a JTBD law, a pitfall id, or a scenario) — generic Stripe advice without a
// citation is a smell. These constants point at the six brain artifacts under brain/.
//
// Sources (the queryable layer is scripts/memory-search.sh over all six):
//   EXPERTISE-MAP.md · OPINIONS.md · KNOWN-PITFALLS.md · BATTLE-TESTED-SCENARIOS.md
//   TOOL-MATRIX.md · GAPS-AND-DISPUTES.md

import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

/** Absolute path to the repo root (two levels up from dist/ or src/). */
export function repoRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // src/brain-refs.ts → repo root is one up; dist/brain-refs.js → also one up.
  return resolve(here, "..");
}

/** Absolute path to the brain/ directory of expertise artifacts. */
export function brainDir(): string {
  return join(repoRoot(), "brain");
}

/** Absolute path to the BM25 memory-search script (A5), the queryable layer over brain/. */
export function memorySearchScript(): string {
  return join(repoRoot(), "scripts", "memory-search.sh");
}

/**
 * THE LAW (EXPERTISE-MAP JTBD-0): the ledger is the truth, not the status code.
 * Every penny command argues from this — a transport status never proves money moved.
 */
export const JTBD0_LAW =
  "JTBD-0: the ledger is the truth, not the status code — never infer money-moved from a transport status; reconcile against an idempotent ledger.";

/** The pinned Stripe API version penny contracts a shape-test against (O-16 / S-17). */
export const PINNED_STRIPE_VERSION = "2026-05-27.dahlia";
