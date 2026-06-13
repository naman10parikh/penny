// `penny issue-spt --seller <id> --cap <amt> --expires <ts>` — issue a scoped/capped/expiring
// Shared Payment Token so an agent can pay WITHOUT ever seeing the card (S-13 / O-11). This is
// penny's reason to exist on an agent platform: the payments-equivalent of "least agency". The
// token is seller-locked + amount-capped + time-expiring; penny fuses it with helios's
// balance-gated cap (consumes helios's funding ledger — does NOT rebuild it). TEST MODE ONLY:
// penny never moves real money; live keys live only behind the chairman checklist.

import { Command } from "commander";
import chalk from "chalk";
import { validateSptScope, parseExpiry } from "../spt.js";
import { appendAudit } from "../mcp/audit.js";

export function registerIssueSpt(program: Command): void {
  program
    .command("issue-spt")
    .description("issue a scoped/capped/expiring Shared Payment Token (agent never sees the card; test mode)")
    .requiredOption("--seller <id>", "the ONLY seller this token can pay (seller-locked, O-11)")
    .requiredOption("--cap <amount>", "total spend cap in the smallest currency unit (e.g. cents)")
    .requiredOption("--expires <ts>", "absolute expiry: unix-ms or ISO date (time-expiring, O-11)")
    .option("--agent <id>", "the agent the credential is issued to (for the audit trail)", "unnamed-agent")
    .action((opts: { seller: string; cap: string; expires: string; agent: string }) => {
      const capAmount = Number(opts.cap);
      const expiresAt = parseExpiry(opts.expires);

      const v = validateSptScope({
        sellerId: opts.seller,
        capAmount,
        expiresAt,
        agentId: opts.agent,
      });

      if (!v.ok) {
        process.stderr.write(
          chalk.red(`penny issue-spt: REFUSED — ${v.reason}\n`) +
            chalk.dim(`  An unbounded credential = unbounded blast radius on a bug/injection. [O-11 / S-13]\n`),
        );
        process.exit(1);
      }

      const { scope } = v;
      // This is the validated least-agency SCOPE. Even though the live Stripe test-mode SPT call +
      // the helios balance-cap fusion happen via the agent-spend skill / MCP tool (C1), issuing a
      // scoped spend credential IS a money-relevant action — so penny writes an append-only audit
      // line HERE (E6 / §10: issue-SPT writes the ledger-is-truth trail). The cap is never logged in
      // a way that exposes a secret; only the bounded scope is recorded.
      const auditId = appendAudit({
        action: "issue-spt",
        brainRef: "O-11 / S-13",
        detail: {
          sellerId: scope.sellerId,
          capAmount: scope.capAmount,
          expiresAt: new Date(scope.expiresAt).toISOString(),
          agentId: scope.agentId,
          mode: "test",
        },
      });
      process.stdout.write(
        chalk.yellow(`penny issue-spt (TEST MODE — penny never moves real money)\n`) +
          `  seller-locked : ${scope.sellerId}\n` +
          `  amount-capped : ${scope.capAmount} (smallest currency unit)\n` +
          `  time-expiring : ${new Date(scope.expiresAt).toISOString()}\n` +
          `  for agent     : ${scope.agentId}\n` +
          chalk.dim(`  fuse: gate spend on helios's balance cap (funding/state.ts) — consume it, do NOT rebuild it. [O-11]\n`) +
          chalk.dim(`  audit: money-action line written → logs/audit.jsonl (id ${auditId.slice(0, 8)}). [JTBD-0]\n`) +
          chalk.green(`\nScope validated as least-agency. (Issue via the agent-spend skill / penny_issue_spt MCP tool.)\n`),
      );
      process.exit(0);
    });
}
