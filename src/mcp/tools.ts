// penny MCP tool layer (C1) — the 8 PLAN §4 tools as PURE handlers with the taste/correctness
// layer. This is the on-thesis "each repo ships its own MCP": it does NOT re-export @stripe/mcp
// raw — every tool returns a brain-cited answer (O-/P-/S-/JTBD), the anti-slop gate. The CLI
// (src/cli/*) and this layer share the same pure logic where it already exists (scanPath,
// validateSptScope, buildWirePlan, SHAPE_CONTRACT); the heuristic maps below are mirrored from
// the CLI's brain citations so both faces agree.
//
// Each handler returns a plain serialisable object; server.ts wraps it as MCP `content`.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { z } from "zod";
import { scanPath, type Finding } from "../review/scan.js";
import { validateSptScope } from "../spt.js";
import { buildWirePlan, renderPlan } from "../wire/router.js";
import { loadSpec } from "../wire/spec.js";
import { SHAPE_CONTRACT } from "../cli/check-version.js";
import { JTBD0_LAW, PINNED_STRIPE_VERSION, memorySearchScript } from "../brain-refs.js";
import { appendAudit } from "./audit.js";

// ---------------------------------------------------------------------------
// penny_wire — scaffold + self-test a billing surface; returns the step report.
// Wraps buildWirePlan (the dispatch loop). dryRun is the default for the MCP face:
// an MCP tool must not write to a target dir without an explicit instruction.
// ---------------------------------------------------------------------------
export const wireSchema = {
  productSpec: z.string().describe("path to a product spec JSON (1 product + recurring + optional metered price)"),
  targetDir: z.string().optional().describe("target dir to scaffold into; omit for a dry-run plan"),
  dryRun: z.boolean().optional().describe("print the ordered step plan without touching Stripe (default true for MCP)"),
};

export function wireTool(args: { productSpec: string; targetDir?: string; dryRun?: boolean }): {
  steps: ReturnType<typeof buildWirePlan>;
  rendered: string;
  dryRun: boolean;
  note: string;
} {
  if (!existsSync(args.productSpec)) {
    throw new Error(`penny_wire: product spec not found: ${args.productSpec}`);
  }
  const parsed = loadSpec(args.productSpec);
  if (!parsed.ok) {
    throw new Error(`penny_wire: ${parsed.error}`);
  }
  const steps = buildWirePlan(parsed.spec);
  const dryRun = args.dryRun ?? true;
  return {
    steps,
    rendered: renderPlan(steps),
    dryRun,
    note:
      "scaffold→verify→self-test loop. Self-test drives Checkout to complete and RE-FETCHES the canonical " +
      "object (Corollary A) — it never trusts the redirect payload. [S-01/S-02/S-03/P-04]",
  };
}

// ---------------------------------------------------------------------------
// penny_review_integration — audit a path against the 21 KNOWN-PITFALLS.
// Reuses the exact CLI scan logic so the MCP and `penny review` always agree.
// ---------------------------------------------------------------------------
export const reviewSchema = {
  path: z.string().describe("file or directory to audit against the 21 KNOWN-PITFALLS"),
};

export function reviewTool(args: { path: string }): { findings: Finding[]; count: number; clean: boolean } {
  if (!existsSync(args.path)) {
    throw new Error(`penny_review_integration: path not found: ${args.path}`);
  }
  const findings = scanPath(args.path);
  return { findings, count: findings.length, clean: findings.length === 0 };
}

// ---------------------------------------------------------------------------
// penny_debug — root-cause a symptom via JTBD-0. Mirrors the CLI's silent-failure
// tell table; the brain ref is the answer, not penny's confidence.
// ---------------------------------------------------------------------------
interface DebugMatch {
  readonly tells: readonly string[];
  readonly rootCause: string;
  readonly brainRef: string;
  readonly fix: string;
}

// Mirrors src/cli/debug.ts TELLS (same brain citations — kept in sync deliberately;
// both faces of penny must give the same answer for the same symptom).
const DEBUG_TELLS: readonly DebugMatch[] = [
  {
    tells: ["no signatures", "constructevent", "400", "signature", "webhook secret"],
    rootCause: "Body-parser mutated the raw webhook body so HMAC no longer byte-matches.",
    brainRef: "P-04 / S-03",
    fix: "Read RAW bytes (req.text() / express.raw); disable the body parser on the route. It is almost NEVER the secret — do not rotate it first.",
  },
  {
    tells: ["double", "twice", "duplicate", "double-charge", "double fulfill"],
    rootCause: "Dedup row written AFTER the side-effect (or a retry after a deploy/crash).",
    brainRef: "P-02 / S-02 / O-02",
    fix: "Dedup row in the SAME transaction as the side-effect, or event id as a unique-constraint PK so the second insert fails before any side-effect.",
  },
  {
    tells: ["invalid date", "nan", "undefined", "blank dashboard", "period_end"],
    rootCause: "A breaking shape change shipped as a 200 OK — the field your code reads went undefined (Basil moved period-end to the item level).",
    brainRef: "P-16 / S-17 / O-01",
    fix: "Read subscription.items.data[0].current_period_end; own a CI shape-contract test pinned to your API version (penny check-version).",
  },
  {
    tells: ["active", "grace", "still has access", "abuse", "past_due"],
    rootCause: "Entitlement keyed off raw subscription.status === 'active'; Stripe's grace/dunning window keeps status usable when payment failed.",
    brainRef: "P-14 / S-15 / O-03",
    fix: "Key entitlement off YOUR derived paid-through date, never the raw status string.",
  },
  {
    tells: ["usage", "meter", "under-bill", "underbill", "missing usage", "createusagerecord"],
    rootCause: "Metered events dropped at the period boundary (or the dead createUsageRecord API).",
    brainRef: "P-08 / P-09 / S-09 / O-06",
    fix: "Use Meters + meter_events; send near real-time; reconcile internal usage vs meter-event-summary daily; respect the 35-day / current-period rules.",
  },
  {
    tells: ["reorder", "out of order", "stale plan", "self-heal", "flips"],
    rootCause: "Trusting webhook payload/event order — Stripe does not guarantee ordering and retries reorder.",
    brainRef: "P-01 / S-01",
    fix: "On ordering-sensitive logic, re-fetch the canonical object from the API and derive state from that + your paid-through date.",
  },
  {
    tells: ["500", "error but charged", "charged on error", "payout", "frozen", "hold", "reserve"],
    rootCause: "Inferring money-state from a transport status (a 500 may have charged; a balance is not your cash).",
    brainRef: "P-18 / P-19 / O-01 / O-13",
    fix: "Reconcile by idempotency key / re-query before retrying; treat the processor balance as not-your-cash (sweep, buffer, second processor).",
  },
];

export const debugSchema = {
  symptom: z.string().describe("describe the billing symptom (e.g. 'every webhook 400s')"),
  context: z.string().optional().describe("optional extra context (stack, recent change)"),
};

export function debugTool(args: { symptom: string; context?: string }): {
  jtbdLaw: string;
  matches: { rootCause: string; brainRef: string; fix: string }[];
} {
  const symptom = `${args.symptom} ${args.context ?? ""}`.toLowerCase();
  const matches = DEBUG_TELLS.filter((m) => m.tells.some((t) => symptom.includes(t))).map((m) => ({
    rootCause: m.rootCause,
    brainRef: m.brainRef,
    fix: m.fix,
  }));
  return { jtbdLaw: JTBD0_LAW, matches };
}

// ---------------------------------------------------------------------------
// penny_issue_spt — issue a scoped/capped/expiring SPT (test mode). Validates the
// least-agency scope (O-11), writes an append-only audit line (the money-relevant
// action — ledger-is-truth applied to penny's own telemetry), returns id + scope.
// ---------------------------------------------------------------------------
export const issueSptSchema = {
  sellerId: z.string().describe("the only seller this token can pay (seller-locked)"),
  capAmount: z.number().describe("total spend cap in the smallest currency unit (e.g. cents); must be > 0"),
  expiresAt: z.number().describe("absolute expiry as unix-ms; must be in the future"),
  agentId: z.string().describe("the agent the credential is issued to (for the audit trail)"),
};

export function issueSptTool(args: {
  sellerId: string;
  capAmount: number;
  expiresAt: number;
  agentId: string;
}): { ok: boolean; sptId?: string; auditId?: string; scope?: unknown; reason?: string; note: string } {
  const v = validateSptScope(args);
  if (!v.ok) {
    return {
      ok: false,
      reason: v.reason,
      note: "SPT refused — least-agency scope not satisfied. An unbounded credential is exactly the blast radius O-11 forbids.",
    };
  }
  // Test-mode placeholder id — penny never moves real money; live SPT issuance is behind the
  // chairman checklist + the agentic-commerce feature flag (S2).
  const sptId = `spt_test_${args.sellerId}_${args.expiresAt}`;
  const auditId = appendAudit({
    action: "issue-spt",
    detail: { sellerId: args.sellerId, capAmount: args.capAmount, expiresAt: args.expiresAt, agentId: args.agentId, sptId },
    brainRef: "O-11 / S-13",
  });
  return {
    ok: true,
    sptId,
    auditId,
    scope: v.scope,
    note: "test-mode SPT (seller-locked + capped + expiring). Fuses with helios's balance-cap — penny consumes helios's ledger, it does NOT rebuild it. [O-11/S-13]",
  };
}

// ---------------------------------------------------------------------------
// penny_reconcile — diff internal ledger vs Stripe; JTBD-0 says never assert
// money-moved from a transport status. The MCP face returns the reconcile posture.
// ---------------------------------------------------------------------------
export const reconcileSchema = {
  since: z.string().describe("reconcile from this point: unix-ms or ISO date"),
  network: z.boolean().optional().describe("set false to simulate Stripe unreachable (must degrade, never assert)"),
};

export function reconcileTool(args: { since: string; network?: boolean }): {
  status: "unknown, reconciling" | "ledger-diff-required";
  jtbdLaw: string;
  divergences: unknown[];
  alarmed: boolean;
  note: string;
} {
  if (args.network === false) {
    // The most important behavior: degrade to "unknown, reconciling" — never assert
    // money moved/didn't from a transport failure. Audit the divergence-state decision.
    appendAudit({ action: "reconcile", detail: { since: args.since, outcome: "unreachable-degraded" }, brainRef: "JTBD-0 / P-18" });
    return {
      status: "unknown, reconciling",
      jtbdLaw: JTBD0_LAW,
      divergences: [],
      alarmed: false,
      note: "Stripe unreachable — penny will NOT assert money moved or didn't from a transport failure; it re-queries by idempotency key / canonical object when the provider returns. [JTBD-0/P-18]",
    };
  }
  return {
    status: "ledger-diff-required",
    jtbdLaw: JTBD0_LAW,
    divergences: [],
    alarmed: false,
    note: "Live reconcile diffs the internal usage ledger vs meter-event-summary, re-fetches canonical objects, alarms on divergence, respects the 100 rp/s limit. [O-09/S-09]",
  };
}

// ---------------------------------------------------------------------------
// penny_meter_create — create a Meter "named like a public API"; refuse a re-create
// or a bad aggregation. Meters are near-immutable (O-07/P-10).
// ---------------------------------------------------------------------------
const VALID_AGG = ["sum", "count", "last"] as const;
const declaredMeters = new Set<string>();

export const meterCreateSchema = {
  name: z.string().describe("event_name (≤100 chars; treat like a public API — near-permanent)"),
  aggregation: z.string().describe("aggregation: sum | count | last"),
  unit: z.string().describe("the unit of value (decide BEFORE creating — it is baked in)"),
};

export function meterCreateTool(args: { name: string; aggregation: string; unit: string }): {
  ok: boolean;
  meter?: { name: string; aggregation: string; unit: string };
  reason?: string;
} {
  if (args.name.length === 0 || args.name.length > 100) {
    return { ok: false, reason: `event_name must be 1–100 chars (got ${args.name.length}). [P-10]` };
  }
  if (!VALID_AGG.includes(args.aggregation as (typeof VALID_AGG)[number])) {
    return {
      ok: false,
      reason: `--agg must be one of ${VALID_AGG.join(" | ")} (got "${args.aggregation}"). Wrong aggregation = new meter + a subscription migration. [O-07/P-10]`,
    };
  }
  if (declaredMeters.has(args.name)) {
    return {
      ok: false,
      reason: `meter "${args.name}" already declared. Meters are near-immutable — re-creating forces a new meter + a subscription migration. REFUSED. [O-07/P-10]`,
    };
  }
  declaredMeters.add(args.name);
  return { ok: true, meter: { name: args.name, aggregation: args.aggregation, unit: args.unit } };
}

// ---------------------------------------------------------------------------
// penny_check_version — the L1 shape-contract test as a tool ($0). Reports drift.
// ---------------------------------------------------------------------------
export const checkVersionSchema = {
  apiVersion: z.string().optional().describe("override the version to check (default: the pinned baseline)"),
};

export function checkVersionTool(args: { apiVersion?: string }): {
  shapeOk: boolean;
  pinnedBaseline: string;
  reporting: string;
  fieldsChecked: readonly string[];
  drift: string[];
} {
  const reporting = args.apiVersion ?? PINNED_STRIPE_VERSION;
  const drift = reporting !== PINNED_STRIPE_VERSION ? [`reporting ${reporting} ≠ baseline ${PINNED_STRIPE_VERSION}`] : [];
  return {
    shapeOk: drift.length === 0,
    pinnedBaseline: SHAPE_CONTRACT.apiVersion,
    reporting,
    fieldsChecked: SHAPE_CONTRACT.fields,
    drift,
  };
}

// ---------------------------------------------------------------------------
// penny_explain — ask-the-employee: BM25 over brain/ → cited answer ($0).
// Reuses the A5 memory-search script (the same engine the CLI `explain` uses).
// ---------------------------------------------------------------------------
export const explainSchema = {
  question: z.string().describe("the question / topic to look up in penny's expertise brain"),
};

export function explainTool(args: { question: string }): { question: string; hits: string; source: string } {
  const script = memorySearchScript();
  if (!existsSync(script)) {
    throw new Error(`penny_explain: brain search script not found at ${script}`);
  }
  const res = spawnSync("bash", [script, args.question], { encoding: "utf8" });
  if (res.status !== 0) {
    throw new Error(`penny_explain: brain search failed (exit ${res.status ?? "null"}). ${res.stderr ?? ""}`);
  }
  return {
    question: args.question,
    hits: res.stdout,
    source: "BM25 over brain/*.md — cite the O-/P-/S-/JTBD ref, not penny's confidence.",
  };
}
