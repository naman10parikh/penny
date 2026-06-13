// E6 · Observability — `penny runs-view`: aggregate logs/runs.jsonl + logs/audit.jsonl.
//
// Renders the per-run telemetry (count, by-command, total duration, failures) and HIGHLIGHTS the
// money-relevant audit lines (issue-SPT, reconcile-divergence) — the ledger-is-truth law made
// visible. The cockpit Run-log view (G2) reuses `aggregate()` for the same data. Pure read; never
// mutates a log.

import { readFileSync, existsSync } from "node:fs";
import { Command } from "commander";
import chalk from "chalk";
import { runsLogPath, type RunLine } from "./log-run.js";
import { auditLogPath, type AuditLine } from "../mcp/audit.js";

export interface RunsAggregate {
  readonly totalRuns: number;
  readonly failures: number;
  readonly totalDurationMs: number;
  readonly totalCostUsd: number;
  /** run count per command */
  readonly byCommand: Record<string, number>;
  readonly runs: readonly RunLine[];
  readonly audits: readonly AuditLine[];
}

/** Parse a JSONL file into typed lines, skipping unparseable rows. */
function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  const out: T[] = [];
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const t = raw.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t) as T);
    } catch {
      // skip a corrupt line — don't crash the view
    }
  }
  return out;
}

/** Aggregate the run log + audit log. The cockpit (G2) imports this. */
export function aggregate(): RunsAggregate {
  const runs = readJsonl<RunLine>(runsLogPath());
  const audits = readJsonl<AuditLine>(auditLogPath());
  const byCommand: Record<string, number> = {};
  let failures = 0;
  let totalDurationMs = 0;
  let totalCostUsd = 0;
  for (const r of runs) {
    byCommand[r.command] = (byCommand[r.command] ?? 0) + 1;
    if (r.exitCode !== 0) failures += 1;
    totalDurationMs += r.durationMs || 0;
    totalCostUsd += r.costUsd || 0;
  }
  return { totalRuns: runs.length, failures, totalDurationMs, totalCostUsd, byCommand, runs, audits };
}

/** Render the aggregate as a human-readable report (the CLI face). */
export function renderAggregate(agg: RunsAggregate): string {
  const lines: string[] = [];
  lines.push(chalk.yellow("penny runs-view — observability (logs/runs.jsonl + logs/audit.jsonl)\n"));
  lines.push(`  total runs    : ${agg.totalRuns}`);
  lines.push(`  failures      : ${agg.failures}`);
  lines.push(`  total time    : ${agg.totalDurationMs} ms`);
  lines.push(`  total cost    : $${agg.totalCostUsd.toFixed(4)} (deterministic CLI is $0)`);
  lines.push("");
  if (Object.keys(agg.byCommand).length > 0) {
    lines.push(chalk.bold("  by command:"));
    for (const [cmd, n] of Object.entries(agg.byCommand).sort((a, b) => b[1] - a[1])) {
      lines.push(`    ${cmd.padEnd(14)} ${n}`);
    }
    lines.push("");
  }
  // Money-relevant audit lines — highlighted (the ledger-is-truth trail).
  if (agg.audits.length > 0) {
    lines.push(chalk.bold.red(`  money-action audit trail (${agg.audits.length} line(s)) — the ledger is the truth:`));
    for (const a of agg.audits.slice(-10)) {
      lines.push(chalk.red(`    [${a.ts}] ${a.action}  [${a.brainRef}]  id=${a.id.slice(0, 8)}`));
    }
  } else {
    lines.push(chalk.dim("  money-action audit trail: (none yet — issue-spt / reconcile-divergence write here)"));
  }
  return lines.join("\n") + "\n";
}

export function registerRunsView(program: Command): void {
  program
    .command("runs-view")
    .description("aggregate the per-run log + the money-action audit trail (observability)")
    .option("--json", "emit the aggregate as JSON")
    .action((opts: { json?: boolean }) => {
      const agg = aggregate();
      if (opts.json) {
        process.stdout.write(JSON.stringify(agg, null, 2) + "\n");
      } else {
        process.stdout.write(renderAggregate(agg));
      }
      process.exit(0);
    });
}
