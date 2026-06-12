// `penny wire --product <spec>` — THE acceptance test entrypoint. Scaffold Stripe test-mode
// billing into a target → checkout E2E + webhook signature-verified + idempotent. This is the
// dispatch loop (D1) and the spine the acceptance test (E4) drives. --dry-run prints the ordered
// scaffold→verify→self-test step sequence WITHOUT touching Stripe; --target writes the scaffold.

import { Command } from "commander";
import chalk from "chalk";
import { loadSpec } from "./spec.js";
import { buildWirePlan, renderPlan } from "./router.js";
import { writeScaffold } from "./scaffold.js";

export function registerWire(program: Command): void {
  program
    .command("wire")
    .description("scaffold Stripe test-mode billing into a target → checkout E2E + webhook + idempotent")
    .requiredOption("--product <spec>", "path to a product spec JSON (see examples/saas-pro.json)")
    .option("--dry-run", "print the ordered scaffold→verify→self-test steps without touching Stripe")
    .option("--target <dir>", "directory to write the scaffolded billing surface into")
    .action((opts: { product: string; dryRun?: boolean; target?: string }) => {
      const parsed = loadSpec(opts.product);
      if (!parsed.ok) {
        process.stderr.write(chalk.red(`penny wire: ${parsed.error}\n`));
        process.exit(1);
      }
      const { spec } = parsed;
      const plan = buildWirePlan(spec);

      process.stdout.write(
        chalk.yellow(`penny wire — "${spec.name}" (${spec.prices.length} price(s), billing_mode "${spec.billingMode}")\n`) +
          chalk.dim(`  pinned API version ${spec.apiVersion}; TEST MODE only (penny never moves real money).\n`),
      );

      if (opts.dryRun) {
        process.stdout.write(chalk.bold("\nordered routing loop (scaffold → verify → self-test):"));
        process.stdout.write(renderPlan(plan));
        process.stdout.write(chalk.dim("\n\n(dry-run: no Stripe calls, no files written.)\n"));
        process.exit(0);
      }

      if (opts.target) {
        const result = writeScaffold(spec, opts.target);
        process.stdout.write(
          chalk.green(`\nscaffolded ${result.files.length} file(s) into ${result.targetDir}:\n`) +
            result.files.map((f) => `  - ${f}`).join("\n") +
            "\n" +
            chalk.dim("\nnext: run the self-test (stripe listen/trigger) to drive checkout + webhook + idempotent replay.\n"),
        );
        process.exit(0);
      }

      // No --dry-run and no --target: the live self-test path needs sk_test + the stripe CLI
      // (E4 wires the assertions). Without a target, there is nothing to write — print the plan
      // and tell the caller what they need, exit non-zero (honest unfulfilled state).
      process.stderr.write(
        chalk.red(
          "penny wire: provide --target <dir> to scaffold, or --dry-run to preview the plan. " +
            "The live self-test (checkout + webhook + idempotent) runs in CI's acceptance job with sk_test.\n",
        ),
      );
      process.exit(2);
    });
}
