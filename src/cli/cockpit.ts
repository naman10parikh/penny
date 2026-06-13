// `penny cockpit [--port <n>]` — boot the localhost read-surface (Cluster G / PLAN §10).
//
// Launches the stdlib Node `http` server in src/cockpit/server.mjs serving the vanilla-JS SPA
// (brain browser · run log + money-action audit trail · eval scores · ask-the-employee · gaps
// tracker). The server is an UNCOMPILED .mjs (tsconfig excludes src/cockpit) — the same source
// whether run from src/ or a published dist — so we resolve it relative to THIS compiled file:
//   dist/cli/cockpit.js → ../../src/cockpit/server.mjs.
//
// This is a long-running serve command (it blocks until Ctrl-C). It is the chairman's read-surface
// (D3) — agents use the CLI/MCP. It reads NO secrets: the cockpit shows what penny DID (brain,
// logs, audit, eval gates), it never needs a provider key (the Ask box is the keyless A5 BM25).

import { Command } from "commander";
import chalk from "chalk";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export function registerCockpit(program: Command): void {
  program
    .command("cockpit")
    .description(
      "boot the localhost read-surface (brain browser · run log · eval scores · ask-the-employee · gaps tracker)",
    )
    .option("-p, --port <port>", "port to serve on", "7790")
    .action(async (opts: { port: string }) => {
      const port = String(opts.port ?? "7790");

      // Resolve the uncompiled server relative to this module (works from dist/ and from tsx/src).
      const here = dirname(fileURLToPath(import.meta.url)); // dist/cli or src/cli
      const server = resolve(here, "..", "..", "src", "cockpit", "server.mjs");
      if (!existsSync(server)) {
        process.stderr.write(chalk.red(`penny cockpit: server not found at ${server}\n`));
        process.exit(1);
      }

      process.stdout.write(
        chalk.yellow(`penny cockpit — booting the read-surface on http://127.0.0.1:${port}\n`) +
          chalk.dim("(brain · runs+audit · evals · ask · gaps — Ctrl-C to stop)\n"),
      );

      // Spawn the stdlib server in the foreground, inheriting stdio so its ready line reaches the
      // terminal. PENNY_COCKPIT_PORT is the server's port source (it also accepts argv[2]).
      const child = spawn(process.execPath, [server, port], {
        stdio: "inherit",
        env: { ...process.env, PENNY_COCKPIT_PORT: port },
      });

      const onSig = (): void => {
        child.kill("SIGINT");
      };
      process.on("SIGINT", onSig);
      process.on("SIGTERM", onSig);

      // Resolve only when the child exits, so `penny cockpit` blocks like a real serve command.
      await new Promise<void>((done) => {
        child.on("exit", (code) => {
          process.off("SIGINT", onSig);
          process.off("SIGTERM", onSig);
          // Mirror the child's exit code (0 on clean SIGINT, non-zero on a bind error).
          process.exitCode = code ?? 0;
          done();
        });
        child.on("error", (err) => {
          process.stderr.write(chalk.red(`penny cockpit: failed to launch server: ${err.message}\n`));
          process.exitCode = 1;
          done();
        });
      });
    });
}
