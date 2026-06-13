// On-disk registry of declared meters — the immutability guard that survives across processes.
//
// Why on disk: a meter is near-immutable (only the display name is mutable); re-creating one with a
// different aggregation/unit forces a brand-new meter + a subscription migration (O-07 / P-10). The
// CLI's refusal therefore has to mean something between two `penny meter create` runs — a per-process
// in-memory Set could never fire (each CLI invocation is a fresh process with an empty Set), so the
// "refuses to re-create" promise was hollow on the CLI. This registry persists the declared names to
// logs/declared-meters.json so the CLI refusal matches the (long-lived) MCP server's refusal: the two
// faces of the headline meter contract now agree. (In production the real guard ALSO queries Stripe
// before creating; this local registry is the $0/test-mode mirror of that existence check.)
//
// This deliberately avoids a module-level Set for cross-process state — the codebase's own
// `.claude/rules/typescript.md` bans `new Map()`/Set for state that must survive a process boundary.

import { appendFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../brain-refs.js";

/** Absolute path to the append-only declared-meters registry. `PENNY_METER_REGISTRY` overrides it
 *  (used by the cross-process test to isolate a temp registry — the CLI and MCP both honour it, so a
 *  spawned `penny meter create` and an in-process MCP call share the same store under test). */
export function meterRegistryPath(): string {
  return process.env.PENNY_METER_REGISTRY ?? join(repoRoot(), "logs", "declared-meters.json");
}

/** Read the set of meter names already declared (across all prior processes). Empty if none yet. */
export function declaredMeterNames(registryPath: string = meterRegistryPath()): Set<string> {
  if (!existsSync(registryPath)) return new Set();
  const names = new Set<string>();
  for (const raw of readFileSync(registryPath, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    try {
      const parsed = JSON.parse(line) as { name?: unknown };
      if (typeof parsed.name === "string") names.add(parsed.name);
    } catch {
      // A corrupt line must not crash the guard — skip it (the registry stays append-only & forgiving).
      // Intentionally silent: one bad JSONL line is non-fatal to the existence check.
    }
  }
  return names;
}

/** True if a meter with this name has already been declared in a prior (or this) process. */
export function isMeterDeclared(name: string, registryPath: string = meterRegistryPath()): boolean {
  return declaredMeterNames(registryPath).has(name);
}

/** Record a newly-declared meter. Append-only: never rewrites a prior line (audit-style). */
export function recordMeter(
  entry: { name: string; aggregation: string; unit: string },
  registryPath: string = meterRegistryPath(),
): void {
  const dir = join(repoRoot(), "logs");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n";
  appendFileSync(registryPath, line, "utf8");
}
