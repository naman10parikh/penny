// issue-spt, meter create and reconcile never call Stripe in this version. Their output must say so
// plainly, on the CLI and on the MCP face, and never read as if a token, a meter or a diff was made.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { issueSptTool, meterCreateTool, reconcileTool } from "../src/mcp/tools.js";

const bin = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "penny.js");
let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "penny-nostripe-"));
  process.env.PENNY_METER_REGISTRY = join(tmpDir, "declared-meters.json");
});

afterEach(() => {
  delete process.env.PENNY_METER_REGISTRY;
  rmSync(tmpDir, { recursive: true, force: true });
});

function run(args: string[]): string {
  return execFileSync("node", [bin, ...args], { encoding: "utf8", env: { ...process.env } });
}

describe("the CLI says no Stripe call was made", () => {
  it("issue-spt records the scope locally and says no token was issued", () => {
    const out = run(["issue-spt", "--seller", "acct_test123", "--cap", "50", "--expires", "2099-12-31"]);
    expect(out).toMatch(/No token was issued/);
    expect(out).toMatch(/does not call Stripe/);
  });

  it("meter create records the spec locally and says no Stripe Meter was created", () => {
    const out = run(["meter", "create", "nostripe_meter", "--agg", "sum", "--unit", "token"]);
    expect(out).toMatch(/recorded locally/);
    expect(out).toMatch(/does not call Stripe/);
  });

  it("reconcile --since says nothing was reconciled", () => {
    const out = run(["reconcile", "--since", "2026-06-01"]);
    expect(out).toMatch(/does not call Stripe/);
    expect(out).toMatch(/nothing was reconciled/);
  });
});

describe("the MCP tools say no Stripe call was made", () => {
  it("penny_issue_spt calls its id a local placeholder", () => {
    const res = issueSptTool({ sellerId: "acct_test123", capAmount: 50, expiresAt: "2099-12-31", agentId: "a1" });
    expect(res.ok).toBe(true);
    expect(res.note).toMatch(/does not call Stripe/);
    expect(res.note).toMatch(/placeholder/);
  });

  it("penny_meter_create says the meter was recorded locally", () => {
    const res = meterCreateTool({ name: "nostripe_mcp_meter", aggregation: "sum", unit: "token" });
    expect(res.ok).toBe(true);
    expect(res.note).toMatch(/does not call Stripe/);
  });

  it("penny_reconcile says nothing was diffed", () => {
    const res = reconcileTool({ since: "2026-06-01" });
    expect(res.note).toMatch(/does not call Stripe/);
    expect(res.note).toMatch(/nothing was diffed/);
  });
});
