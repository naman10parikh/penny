// `penny webhook listen` — wrap `stripe listen --forward-to` as the webhook self-test rig,
// and document the raw-body HMAC contract (S-01/S-02/S-03, P-04). The `stripe` CLI is penny's
// self-test rig (listen / trigger / fixtures); this command shells out to it and prints the
// raw-body footgun reminder so a builder wires the handler correctly.

import { spawnSync } from "node:child_process";
import { Command } from "commander";
import chalk from "chalk";

export function registerWebhook(program: Command): void {
  const webhook = program.command("webhook").description("webhook self-test rig (wraps the `stripe` CLI)");

  webhook
    .command("listen")
    .description("wrap `stripe listen --forward-to` + the raw-body HMAC contract (S-01/S-02/S-03)")
    .option("--forward-to <url>", "local URL to forward events to", "http://localhost:3000/api/webhooks/stripe")
    .option("--print-only", "print the contract + command without invoking `stripe` (for CI / no-CLI)")
    .action((opts: { forwardTo: string; printOnly?: boolean }) => {
      process.stdout.write(
        chalk.yellow(`penny webhook listen\n`) +
          chalk.dim(`  The raw-body HMAC contract (do NOT get this wrong — P-04 / S-03):\n`) +
          `  1. Read RAW bytes (req.text() / express.raw); disable the body parser on this route.\n` +
          `  2. Pass the raw string + the 'stripe-signature' header to constructEvent.\n` +
          `  3. Acknowledge fast (2xx), process durably (enqueue) — P-03.\n` +
          `  4. Dedup row + side-effect in ONE transaction, or event id as a unique PK — S-02 / O-02.\n` +
          `  5. On ordering-sensitive logic, re-fetch the canonical object — never trust payload order — S-01 / P-01.\n\n`,
      );

      const cmd = `stripe listen --forward-to ${opts.forwardTo}`;
      process.stdout.write(chalk.dim(`  self-test rig: ${cmd}\n`));
      process.stdout.write(
        chalk.dim(`  (the whsec_… printed by 'stripe listen' is your STRIPE_WEBHOOK_SECRET for local runs)\n\n`),
      );

      if (opts.printOnly) {
        process.exit(0);
      }

      // Probe for the stripe CLI; if absent, this is an honest non-fatal note (it's the
      // self-test rig, provisioned per §8 — not a hard runtime dep of penny itself).
      const probe = spawnSync("stripe", ["--version"], { encoding: "utf8" });
      if (probe.status !== 0) {
        process.stderr.write(
          chalk.red(
            `penny webhook listen: the \`stripe\` CLI is not installed (the self-test rig). ` +
              `Install it (scripts/install-stripe-cli.sh) or re-run with --print-only.\n`,
          ),
        );
        process.exit(1);
      }

      // Hand off to `stripe listen` (stdio inherited so the whsec_ prints to the user's terminal).
      const res = spawnSync("stripe", ["listen", "--forward-to", opts.forwardTo], { stdio: "inherit" });
      process.exit(res.status ?? 0);
    });
}
