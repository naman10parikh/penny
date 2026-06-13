// E6 · Observability — unit coverage for the run-log + audit aggregation.
// Asserts: a logged run appears in runs.jsonl; a money-action audit line is appended; aggregate()
// counts runs/failures and surfaces the money trail (the data the cockpit Run-log view reads).

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync, existsSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { logRun, runsLogPath, type RunLine } from "../src/obs/log-run.js";
import { appendAudit, auditLogPath } from "../src/mcp/audit.js";
import { aggregate } from "../src/obs/runs-view.js";

// The logs live at the repo root (resolved from src/brain-refs repoRoot). These tests append real
// lines and then read them back; we DON'T delete the shared log (other runs may use it) — instead we
// snapshot counts before/after so the assertions are delta-based and order-independent.

describe("E6 · observability run-log", () => {
  it("logRun appends a parseable line to logs/runs.jsonl with command + exit code + duration", () => {
    const before = existsSync(runsLogPath())
      ? readFileSync(runsLogPath(), "utf8").split("\n").filter(Boolean).length
      : 0;
    logRun({ command: "__test-cmd__", durationMs: 7, exitCode: 0, note: "unit" });
    const lines = readFileSync(runsLogPath(), "utf8").split("\n").filter(Boolean);
    expect(lines.length).toBe(before + 1);
    const last = JSON.parse(lines[lines.length - 1]) as RunLine;
    expect(last.command).toBe("__test-cmd__");
    expect(last.exitCode).toBe(0);
    expect(last.durationMs).toBe(7);
    expect(typeof last.ts).toBe("string");
  });

  it("a failing run records its non-zero exit code (failures are logged, not hidden)", () => {
    logRun({ command: "__test-fail__", durationMs: 3, exitCode: 2 });
    const agg = aggregate();
    const failRun = agg.runs.find((r) => r.command === "__test-fail__");
    expect(failRun?.exitCode).toBe(2);
    expect(agg.failures).toBeGreaterThanOrEqual(1);
  });
});

describe("E6 · money-action audit trail", () => {
  it("appendAudit writes an immutable money-action line (issue-spt) with a brain ref + id", () => {
    const id = appendAudit({
      action: "__test-issue-spt__",
      brainRef: "O-11 / S-13",
      detail: { sellerId: "acct_x", capAmount: 100, mode: "test" },
    });
    expect(id).toMatch(/[0-9a-f-]{36}/); // a uuid
    const audits = readFileSync(auditLogPath(), "utf8").split("\n").filter(Boolean);
    const last = JSON.parse(audits[audits.length - 1]);
    expect(last.action).toBe("__test-issue-spt__");
    expect(last.brainRef).toMatch(/O-11/);
    // The audit must NOT carry a secret — only the bounded scope.
    expect(JSON.stringify(last)).not.toMatch(/sk_(test|live)/);
  });

  it("aggregate() surfaces the money-action trail for the cockpit Run-log view", () => {
    appendAudit({ action: "__test-recon__", brainRef: "JTBD-0", detail: { divergence: true } });
    const agg = aggregate();
    expect(agg.audits.some((a) => a.action === "__test-recon__")).toBe(true);
    expect(agg.totalRuns).toBeGreaterThanOrEqual(2);
  });
});
