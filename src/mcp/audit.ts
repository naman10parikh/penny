// Append-only money-action audit trail (the ledger-is-truth law applied to penny's OWN
// telemetry). Every penny operation that WOULD move money — issue-SPT, reconcile-divergence,
// force-pay — writes one immutable line here BEFORE/at the action, so there is always a record
// even if the provider call is ambiguous (JTBD-0: never infer money-state from a status code).
//
// This is the money-action half of Observability (HARNESS-OVERRIDES §10). The general per-run
// telemetry (model/duration/cost) is E6's logs/runs.jsonl; this file (logs/audit.jsonl) is the
// narrower, money-relevant audit trail written at the point of the action. Neither is gitignored.

import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { repoRoot } from "../brain-refs.js";

export interface AuditLine {
  readonly ts: string;
  readonly id: string;
  readonly action: string;
  readonly brainRef: string;
  readonly detail: Record<string, unknown>;
}

/** Absolute path to the append-only money-action audit log. */
export function auditLogPath(): string {
  return join(repoRoot(), "logs", "audit.jsonl");
}

/**
 * Append one money-action audit line. Returns the audit id (so the caller can reference it).
 * Append-only: never truncates, never rewrites a prior line. Creates logs/ on first use.
 */
export function appendAudit(entry: { action: string; brainRef: string; detail: Record<string, unknown> }): string {
  const dir = join(repoRoot(), "logs");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const line: AuditLine = {
    ts: new Date().toISOString(),
    id: randomUUID(),
    action: entry.action,
    brainRef: entry.brainRef,
    detail: entry.detail,
  };
  appendFileSync(auditLogPath(), JSON.stringify(line) + "\n", "utf8");
  return line.id;
}
