// The 21-pitfall review ruleset. Each rule has a code-level detector (a regex over file text)
// for the statically-detectable subset of KNOWN-PITFALLS — the ones with a grep-able signature.
// Pitfalls that are runtime/ops-only (P-11 reporting, P-19 payout holds, P-12/P-13 3DS latency)
// are NOT statically detectable and are intentionally omitted from the scanner (a review reflex
// note, not a false grep). Every finding cites the brain ref (anti-slop gate).

export type Severity = "high" | "medium" | "low";

export interface PitfallRule {
  readonly pitfallId: string;
  readonly brainRef: string;
  readonly severity: Severity;
  /** human-readable description of the trap */
  readonly title: string;
  /** the fix penny prescribes */
  readonly fix: string;
  /** detector: returns true if the line is a hit */
  readonly detect: (line: string) => boolean;
}

/** Does the file (joined) read raw bytes anywhere? Used to suppress the P-04 false-positive
 *  when a handler already does the right thing. */
export function readsRawBody(fileText: string): boolean {
  return /req\.text\(\)|express\.raw|bodyParser:\s*false|await\s+request\.text\(\)|rawBody/.test(fileText);
}

export const RULES: readonly PitfallRule[] = [
  {
    pitfallId: "P-04",
    brainRef: "P-04 / S-03",
    severity: "high",
    title: "Webhook body parsed/reserialized before constructEvent — HMAC will not byte-match",
    fix: "Read RAW bytes (req.text() / express.raw), disable the body parser on the route; pass the raw string to constructEvent.",
    // `req.json()` / `request.json()` / JSON.parse on the body in a webhook context.
    detect: (line) => /\b(req|request)\.json\(\)/.test(line) || /JSON\.parse\([^)]*body/.test(line),
  },
  {
    pitfallId: "P-08",
    brainRef: "P-08 / S-09",
    severity: "high",
    title: "Dead usage-records API (createUsageRecord) — removed since Basil",
    fix: "Use Meters + v1/billing/meter_events; metered prices require a backing Meter.",
    detect: (line) => /createUsageRecord/.test(line) || /usage_type:\s*['"]metered['"]/.test(line),
  },
  {
    pitfallId: "P-14",
    brainRef: "P-14 / S-15",
    severity: "high",
    title: "Entitlement keyed off raw subscription.status === 'active' (grace-period abuse)",
    fix: "Key entitlement off YOUR derived paid-through date, never the raw status string.",
    detect: (line) => /\.status\s*===?\s*['"]active['"]/.test(line),
  },
  {
    pitfallId: "P-16",
    brainRef: "P-16 / S-17",
    severity: "high",
    title: "Reads subscription.current_period_end (moved to the item level at Basil → undefined/NaN)",
    fix: "Read subscription.items.data[0].current_period_end; own a CI shape-contract test pinned to your API version.",
    // The top-level field access (not the item-level path).
    detect: (line) =>
      /subscription\.current_period_end/.test(line) ||
      (/\bcurrent_period_end\b/.test(line) && !/items\.data/.test(line) && !/item/.test(line)),
  },
  {
    pitfallId: "P-18",
    brainRef: "P-18 / O-01",
    severity: "medium",
    title: "Treats a non-2xx as 'no money moved' (a 500 may have charged)",
    fix: "On a non-2xx, reconcile by idempotency key / re-query before retrying — never assume the charge didn't happen.",
    // retry-on-error without an idempotency key in the same line/area.
    detect: (line) => /catch[\s\S]*retry/i.test(line) && !/idempotency/i.test(line),
  },
  {
    pitfallId: "P-15",
    brainRef: "P-15 / S-16",
    severity: "medium",
    title: "Price created without an explicit tax_behavior (multi-currency exclusive↔inclusive flip)",
    fix: "Set tax_behavior explicitly per price/currency (USD/CAD exclusive, others inclusive); assert it in a test.",
    // creating a price/recurring without tax_behavior on the same construct is hard to detect
    // per-line; flag explicit default-tax reliance.
    detect: (line) => /tax_behavior:\s*['"]?(default|unspecified)['"]?/.test(line),
  },
  {
    pitfallId: "P-05",
    brainRef: "P-05",
    severity: "low",
    title: "Idempotency key that is not per-operation / may be reused across param sets",
    fix: "Use a UUID v4 per logical operation; don't reuse a key across different params; don't retry past the 24h window.",
    detect: (line) => /idempotencyKey:\s*['"][a-zA-Z0-9_-]{1,12}['"]/.test(line),
  },
];
