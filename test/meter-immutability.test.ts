// Wave-T regression — the meter re-create immutability guard (O-07 / P-10), which the council
// found was a hollow claim on the CLI (a per-process in-memory Set could never fire across two
// `penny meter create` invocations) AND had ZERO test coverage. These tests lock the fixed
// contract: the refusal is backed by an on-disk registry (logs/declared-meters.json) so it
// SURVIVES across processes, and the CLI + the MCP tool share the SAME store — the two faces of
// the headline meter contract now agree.
//
// Isolation: every test points PENNY_METER_REGISTRY at a temp file so the shared logs/ store is
// never polluted (the env var is honoured by meterRegistryPath() in both the in-process tool and
// the spawned CLI).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { meterCreateTool } from "../src/mcp/tools.js";
import { isMeterDeclared, recordMeter } from "../src/wire/meter-registry.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(repoRoot, "bin", "penny.js");

let tmpDir: string;
let registry: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "penny-meter-"));
  registry = join(tmpDir, "declared-meters.json");
  process.env.PENNY_METER_REGISTRY = registry;
});

afterEach(() => {
  delete process.env.PENNY_METER_REGISTRY;
  rmSync(tmpDir, { recursive: true, force: true });
});

// Run the CLI with the temp registry injected into the child process's env.
function runCli(args: string[]): { code: number; out: string } {
  try {
    const out = execFileSync("node", [bin, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PENNY_METER_REGISTRY: registry },
    });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

describe("Wave-T · meter re-create immutability survives across CLI processes (O-07/P-10)", () => {
  it("process 1 creates (exit 0); process 2 with the SAME name is REFUSED (exit 1) — the guard is real", () => {
    const first = runCli(["meter", "create", "tokens_used", "--agg", "sum", "--unit", "token"]);
    expect(first.code).toBe(0);
    expect(first.out).toMatch(/Meter spec validated/);

    // A separate process — the OLD in-memory Set would be empty here and wrongly exit 0.
    const second = runCli(["meter", "create", "tokens_used", "--agg", "sum", "--unit", "token"]);
    expect(second.code).toBe(1);
    expect(second.out).toMatch(/already declared/);
    expect(second.out).toMatch(/REFUSED/);
    expect(second.out).toMatch(/O-07\/P-10/); // brain-cited refusal, not penny's confidence
  });

  it("a DIFFERENT meter name in a fresh process is still allowed (the guard is name-scoped, not a blanket lock)", () => {
    expect(runCli(["meter", "create", "tokens_used", "--agg", "sum", "--unit", "token"]).code).toBe(0);
    expect(runCli(["meter", "create", "api_calls", "--agg", "count", "--unit", "call"]).code).toBe(0);
  });
});

describe("Wave-T · CLI and MCP share ONE meter registry (the two faces agree)", () => {
  it("a meter created via the CLI is REFUSED by penny_meter_create (no CLI≠MCP split)", () => {
    expect(runCli(["meter", "create", "shared_meter", "--agg", "sum", "--unit", "token"]).code).toBe(0);
    // The MCP tool reads the same on-disk registry the CLI just wrote.
    const res = meterCreateTool({ name: "shared_meter", aggregation: "sum", unit: "token" });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/already declared/);
    expect(res.reason).toMatch(/O-07\/P-10/);
  });

  it("a meter created via penny_meter_create is REFUSED by a spawned `penny meter create` (the reverse direction)", () => {
    const created = meterCreateTool({ name: "mcp_first", aggregation: "last", unit: "gb" });
    expect(created.ok).toBe(true);
    const cli = runCli(["meter", "create", "mcp_first", "--agg", "last", "--unit", "gb"]);
    expect(cli.code).toBe(1);
    expect(cli.out).toMatch(/already declared/);
  });

  it("meterCreateTool still fires the in-process refusal on an immediate re-create (MCP long-lived process)", () => {
    expect(meterCreateTool({ name: "once", aggregation: "sum", unit: "token" }).ok).toBe(true);
    const again = meterCreateTool({ name: "once", aggregation: "sum", unit: "token" });
    expect(again.ok).toBe(false);
    expect(again.reason).toMatch(/REFUSED/);
  });
});

describe("Wave-T · the on-disk registry primitive (the durable store under both faces)", () => {
  it("isMeterDeclared is false before recordMeter and true after — and survives a fresh read", () => {
    expect(isMeterDeclared("brand_new", registry)).toBe(false);
    recordMeter({ name: "brand_new", aggregation: "sum", unit: "token" }, registry);
    expect(existsSync(registry)).toBe(true);
    // A brand-new read (no in-memory state) still sees it — the cross-process guarantee.
    expect(isMeterDeclared("brand_new", registry)).toBe(true);
  });
});
