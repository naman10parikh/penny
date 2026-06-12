// `penny explain <topic>` — ask-the-employee. Queries the brain (BM25 over brain/*.md via
// the A5 memory-search script) and prints the ranked, cited hits. The cockpit's
// Ask-the-employee view (G2) reuses this exact path. (PLAN §4; EXPERTISE-MAP is the corpus.)

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { Command } from "commander";
import chalk from "chalk";
import { memorySearchScript } from "../brain-refs.js";

export function registerExplain(program: Command): void {
  program
    .command("explain")
    .description("ask the payments employee: query the brain (BM25 over brain/) → cited answer")
    .argument("<topic...>", "the question / topic to look up in penny's expertise brain")
    .action((topicWords: string[]) => {
      const query = topicWords.join(" ").trim();
      const script = memorySearchScript();

      if (!existsSync(script)) {
        process.stderr.write(
          chalk.red(`penny explain: brain search script not found at ${script}\n`),
        );
        process.exit(1);
      }

      // The brain is the source of truth; the BM25 script (A5) ranks hits across all six
      // brain artifacts. No model call — this is a $0 lookup over local markdown.
      const res = spawnSync("bash", [script, query], { encoding: "utf8" });

      if (res.status !== 0) {
        process.stderr.write(
          chalk.red(
            `penny explain: brain search failed (exit ${res.status ?? "null"}).\n` +
              (res.stderr ? res.stderr : ""),
          ),
        );
        process.exit(res.status ?? 1);
      }

      process.stdout.write(
        chalk.yellow(`penny — answering from the brain: "${query}"\n`) +
          chalk.dim("(ranked hits over brain/*.md; cite the O-/P-/S-/JTBD ref, not penny's confidence)\n\n"),
      );
      process.stdout.write(res.stdout);
      process.exit(0);
    });
}
