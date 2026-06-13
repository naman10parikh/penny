#!/usr/bin/env node
// penny's own MCP server (C1) — exposes the 8 PLAN §4 payments operations as MCP tools that
// other agents (Claude Code, energy, sibling employees) call over stdio. This is the on-thesis
// "each repo ships its own MCP". It is NOT a raw @stripe/mcp passthrough — every tool returns a
// brain-cited (O-/P-/S-/JTBD) answer, the taste/correctness layer. penny *lists* @stripe/mcp for
// raw Stripe calls; this server adds the gotcha-aware operations on top.
//
// Dual-mode: stdio now (local, the .mcp.json entry). Hosted-OAuth (mcp.stripe.com style) is
// DEFERRED — when penny is published as a remote MCP, the same tool handlers swap StdioServerTransport
// for an HTTP+OAuth transport; the tool layer (src/mcp/tools.ts) is transport-agnostic.

import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PENNY_VERSION } from "../index.js";
import {
  wireSchema,
  wireTool,
  reviewSchema,
  reviewTool,
  debugSchema,
  debugTool,
  issueSptSchema,
  issueSptTool,
  reconcileSchema,
  reconcileTool,
  meterCreateSchema,
  meterCreateTool,
  checkVersionSchema,
  checkVersionTool,
  explainSchema,
  explainTool,
} from "./tools.js";

/** Wrap a pure tool result as an MCP text content block (JSON-stringified, pretty). */
function asContent(payload: unknown): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

/** Build the penny MCP server with all 8 tools registered. Exported so a test can introspect it. */
export function buildPennyMcpServer(): McpServer {
  const server = new McpServer({ name: "penny", version: PENNY_VERSION });

  server.registerTool(
    "penny_wire",
    {
      description:
        "Scaffold + self-test a Stripe test-mode billing surface into a target (checkout E2E + raw-body " +
        "webhook + idempotent). Returns the ordered scaffold→verify→self-test step plan. [S-01/S-02/S-03/P-04]",
      inputSchema: wireSchema,
    },
    async (args) => asContent(wireTool(args)),
  );

  server.registerTool(
    "penny_review_integration",
    {
      description:
        "Audit an existing billing integration against the 21 KNOWN-PITFALLS → findings " +
        "{pitfallId, file, line, severity, fix, brainRef}. Cites the brain (anti-slop gate).",
      inputSchema: reviewSchema,
    },
    async (args) => asContent(reviewTool(args)),
  );

  server.registerTool(
    "penny_debug",
    {
      description:
        "Root-cause a live billing incident via JTBD-0 (the ledger is the truth, not the status code). " +
        "Maps a symptom to the known silent-failure class + the brain ref that explains it.",
      inputSchema: debugSchema,
    },
    async (args) => asContent(debugTool(args)),
  );

  server.registerTool(
    "penny_issue_spt",
    {
      description:
        "Issue a scoped/capped/expiring Shared Payment Token for an agent (test mode). Validates least-agency " +
        "scope (O-11), writes a money-action audit line, fuses with helios's balance-cap. [O-11/S-13]",
      inputSchema: issueSptSchema,
    },
    async (args) => asContent(issueSptTool(args)),
  );

  server.registerTool(
    "penny_reconcile",
    {
      description:
        "Diff the internal usage/entitlement ledger vs Stripe; alarm on divergence. On no-network, degrades to " +
        "'unknown, reconciling' — never asserts money-moved from a transport failure. [JTBD-0/O-09/P-18]",
      inputSchema: reconcileSchema,
    },
    async (args) => asContent(reconcileTool(args)),
  );

  server.registerTool(
    "penny_meter_create",
    {
      description:
        "Create a Stripe Meter 'named like a public API'; refuse a bad aggregation or a re-create (meters are " +
        "near-immutable — wrong agg/unit forces a new meter + a subscription migration). [O-07/P-10]",
      inputSchema: meterCreateSchema,
    },
    async (args) => asContent(meterCreateTool(args)),
  );

  server.registerTool(
    "penny_check_version",
    {
      description:
        "The L1 shape-contract test as a tool ($0): assert the response shape your logic reads, pinned to " +
        "2026-05-27.dahlia; report drift (a breaking change can ship as a 200 OK with fields undefined). [S-17/O-16]",
      inputSchema: checkVersionSchema,
    },
    async (args) => asContent(checkVersionTool(args)),
  );

  server.registerTool(
    "penny_explain",
    {
      description:
        "Ask the payments employee: BM25 over penny's expertise brain (brain/*.md) → cited answer ($0). " +
        "The human + agent front door to penny's taste.",
      inputSchema: explainSchema,
    },
    async (args) => asContent(explainTool(args)),
  );

  return server;
}

/** The canonical list of penny MCP tool names (for the introspection test + docs). */
export const PENNY_MCP_TOOLS = [
  "penny_wire",
  "penny_review_integration",
  "penny_debug",
  "penny_issue_spt",
  "penny_reconcile",
  "penny_meter_create",
  "penny_check_version",
  "penny_explain",
] as const;

/** Boot the server over stdio. The `.mcp.json` entry (`node dist/mcp/server.js`) self-boots via main() below. */
export async function startStdio(): Promise<void> {
  const server = buildPennyMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr (not stdout — stdout is the JSON-RPC channel) so a launching agent sees readiness.
  process.stderr.write(`penny MCP server ready over stdio — ${PENNY_MCP_TOOLS.length} tools.\n`);
}

// Self-boot when this module is the entry point (`node dist/mcp/server.js` — the `.mcp.json` command,
// the `penny-mcp` bin, and the C1 verify line). The MCP host owns the lifecycle; we stay alive on the
// transport until stdin closes. Matches the sibling fleet convention (turbo/acorn/badge).
const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  startStdio().catch((e: unknown) => {
    process.stderr.write(`✗ penny-mcp: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  });
}
