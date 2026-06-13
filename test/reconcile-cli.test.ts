// T-user regression — `penny reconcile` flag contract (CP123-B/D11, T-user finding #1).
// The bug a cold user hit: `penny reconcile --no-network` — the most natural way to test the
// documented "degrade to 'unknown, reconciling'" behavior (JTBD-0 / chaos §9) — errored with
// "required option '--since <ts>' not specified" because `--since` was a global requiredOption,
// so the unreachable-degrade path was unreachable. The fix made `--since` mandatory only on the
// LIVE path. These three spawns lock that contract (the exact reproduction that found the bug).

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(repoRoot, "bin", "penny.js");

// Run the CLI and return { code, out } — execFileSync throws on non-zero, so we capture both.
function run(args: string[]): { code: number; out: string } {
  try {
    const out = execFileSync("node", [bin, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

describe("T-user · penny reconcile flag contract", () => {
  it("`reconcile --no-network` degrades to 'unknown, reconciling' with NO --since (exit 0) — JTBD-0", () => {
    const { code, out } = run(["reconcile", "--no-network"]);
    expect(code).toBe(0);
    expect(out).toMatch(/unknown, reconciling/i);
    expect(out).toMatch(/JTBD-0/); // the law is cited, not penny's confidence
  });

  it("`reconcile` with no flags fails honestly on the live path (--since required), exit 1", () => {
    const { code, out } = run(["reconcile"]);
    expect(code).toBe(1);
    expect(out).toMatch(/--since/);
    expect(out).toMatch(/--no-network/); // the error guides the user to the degrade path
  });

  it("`reconcile --since <ts>` runs the live reconcile path (exit 0)", () => {
    const { code, out } = run(["reconcile", "--since", "2026-06-01"]);
    expect(code).toBe(0);
    expect(out).toMatch(/2026-06-01/);
  });
});
