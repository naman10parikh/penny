// `penny review <path>` — audit an existing billing integration against the 21 KNOWN-PITFALLS.
// Emits findings { pitfallId, file:line, severity, fix, brainRef }, cites the brain (anti-slop
// gate), and exits NON-ZERO when findings exist (so it gates a CI / pre-merge check). This is
// also the scan logic the packaged billing-reviewer sub-agent (F4) shares.

import { existsSync } from "node:fs";
import { Command } from "commander";
import chalk from "chalk";
import { scanPath, type Finding } from "./scan.js";

const SEV_COLOR = {
  high: chalk.red,
  medium: chalk.yellow,
  low: chalk.dim,
} as const;

export function registerReview(program: Command): void {
  program
    .command("review")
    .description("audit a billing integration against the 21 KNOWN-PITFALLS → findings list (cites the brain)")
    .argument("<path>", "file or directory to scan")
    .option("--json", "emit findings as JSON")
    .action((path: string, opts: { json?: boolean }) => {
      if (!existsSync(path)) {
        process.stderr.write(chalk.red(`penny review: path not found: ${path}\n`));
        process.exit(1);
      }

      const findings = scanPath(path);

      if (opts.json) {
        process.stdout.write(JSON.stringify(findings, null, 2) + "\n");
        process.exit(findings.length > 0 ? 1 : 0);
      }

      if (findings.length === 0) {
        process.stdout.write(chalk.green(`penny review: no known-pitfall signatures found in ${path}.\n`));
        process.exit(0);
      }

      process.stdout.write(
        chalk.yellow(`penny review: ${findings.length} finding(s) in ${path}\n`) +
          chalk.dim("  (the failure is almost always silent — a 200, an undefined, a status:active.)\n\n"),
      );

      for (const f of bySeverity(findings)) {
        const color = SEV_COLOR[f.severity];
        process.stdout.write(
          color(`  [${f.severity.toUpperCase()}] ${f.pitfallId}  ${f.file}:${f.line}\n`) +
            `    ${f.title}  [${f.brainRef}]\n` +
            chalk.green(`    Fix: ${f.fix}\n\n`),
        );
      }

      // Non-zero exit when findings exist — `penny review` gates a check.
      process.exit(1);
    });
}

/** Sort high → medium → low, then by file:line. */
function bySeverity(findings: Finding[]): Finding[] {
  const rank = { high: 0, medium: 1, low: 2 } as const;
  return [...findings].sort(
    (a, b) => rank[a.severity] - rank[b.severity] || a.file.localeCompare(b.file) || a.line - b.line,
  );
}
