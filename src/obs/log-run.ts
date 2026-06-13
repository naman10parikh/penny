// E6 · Observability — the per-run append-only run log (logs/runs.jsonl).
//
// Every `penny` invocation appends ONE line here: the command, duration, exit code, and (when the
// run took a money-relevant action) the audit id that links to logs/audit.jsonl. This is the energy
// `log-run.mjs` pattern adapted for a CLI employee — the "model/tokens/cost" fields exist for the
// schema (and are populated when the Claude-half RSI runs), but the deterministic CLI is a $0,
// no-LLM tool, so model is "" and cost is 0 for ordinary runs.
//
// Pairing: logs/runs.jsonl (THIS file) = every run's telemetry; logs/audit.jsonl (src/mcp/audit.ts)
// = the narrower money-action trail written AT the action. runs-view aggregates both. NEVER throws
// fatally — observability must not break a billing command (so it is safe to wire into the CLI
// lifecycle). Neither log is gitignored (the ledger-is-truth law applied to penny's own telemetry).

import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../brain-refs.js";

export interface RunLine {
  readonly ts: string;
  /** the penny command (argv[2]) — e.g. "wire", "review", "issue-spt" */
  readonly command: string;
  /** the model that ran this (RSI Claude-half); "" for the deterministic $0 CLI */
  readonly model: string;
  readonly durationMs: number;
  /** process exit code (0 = ok); the run log records failures too */
  readonly exitCode: number;
  /** tool calls made in this run (Stripe CLI, MCP tools, …); 0 for pure local commands */
  readonly toolCalls: number;
  /** estimated cost in USD; 0 for the deterministic CLI */
  readonly costUsd: number;
  /** if the run took a money-relevant action, the linked logs/audit.jsonl id */
  readonly auditId?: string;
  /** freeform note */
  readonly note?: string;
}

/** Absolute path to the append-only per-run log. */
export function runsLogPath(): string {
  return join(repoRoot(), "logs", "runs.jsonl");
}

/**
 * Append one run line. Append-only; never rewrites a prior line; creates logs/ on first use.
 * Never throws — a logging failure must not break the billing command.
 */
export function logRun(entry: {
  command: string;
  durationMs: number;
  exitCode: number;
  model?: string;
  toolCalls?: number;
  costUsd?: number;
  auditId?: string;
  note?: string;
}): void {
  try {
    const dir = join(repoRoot(), "logs");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const line: RunLine = {
      ts: new Date().toISOString(),
      command: entry.command,
      model: entry.model ?? "",
      durationMs: entry.durationMs,
      exitCode: entry.exitCode,
      toolCalls: entry.toolCalls ?? 0,
      costUsd: entry.costUsd ?? 0,
      ...(entry.auditId ? { auditId: entry.auditId } : {}),
      ...(entry.note ? { note: entry.note } : {}),
    };
    appendFileSync(runsLogPath(), JSON.stringify(line) + "\n", "utf8");
  } catch {
    // Observability is best-effort — never fatal to a billing command.
  }
}
