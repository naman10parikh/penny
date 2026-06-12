// The review scanner. Walks a path (file or directory), applies the pitfall ruleset line by
// line, and returns findings { pitfallId, file, line, severity, fix, brainRef }. Pure over the
// filesystem read — so the eval/test cluster can assert findings against fixtures/bad-webhook.ts.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { RULES, readsRawBody } from "./rules.js";

export interface Finding {
  readonly pitfallId: string;
  readonly brainRef: string;
  readonly severity: "high" | "medium" | "low";
  readonly file: string;
  readonly line: number;
  readonly title: string;
  readonly fix: string;
}

const SCANNABLE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

/** Recursively collect scannable source files under `path` (or just the file if it is one). */
function collectFiles(path: string): string[] {
  const st = statSync(path);
  if (st.isFile()) return SCANNABLE_EXT.has(extname(path)) ? [path] : [];
  const out: string[] = [];
  for (const entry of readdirSync(path)) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) continue;
    out.push(...collectFiles(join(path, entry)));
  }
  return out;
}

/** Scan a single file's text, returning findings. */
export function scanText(file: string, text: string): Finding[] {
  const findings: Finding[] = [];
  const rawBodyOk = readsRawBody(text);
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const rule of RULES) {
      // Suppress the P-04 false-positive: if the file already reads raw bytes, a stray
      // .json() elsewhere is not the webhook footgun.
      if (rule.pitfallId === "P-04" && rawBodyOk) continue;
      if (rule.detect(line)) {
        findings.push({
          pitfallId: rule.pitfallId,
          brainRef: rule.brainRef,
          severity: rule.severity,
          file,
          line: i + 1,
          title: rule.title,
          fix: rule.fix,
        });
      }
    }
  }
  return findings;
}

/** Scan a path (file or dir). Returns all findings across all scannable files. */
export function scanPath(path: string): Finding[] {
  const files = collectFiles(path);
  const findings: Finding[] = [];
  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue; // unreadable file — skip, don't crash the scan
    }
    findings.push(...scanText(file, text));
  }
  return findings;
}
