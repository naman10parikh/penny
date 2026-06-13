// Contract layer (a) — the MCP JSON-RPC `tools/list` schema round-trip (PLAN §9 testing contract,
// HARNESS-OVERRIDES §7, MASTER-TODOS C1 verify: "a JSON-RPC tools/list returns exactly the 8 tools").
//
// This is a REAL JSON-RPC round-trip, not a static assertion over an array: an MCP Client connects to
// penny's real server (buildPennyMcpServer) over an in-memory transport pair, performs the `initialize`
// handshake, then calls `tools/list` and `tools/call` over the wire. It asserts the wire contract is
// STABLE: exactly the 8 PLAN §4 tools, each with a valid JSON-Schema inputSchema, names frozen, and the
// taste-layer property (a real `tools/call` returns a brain-cited result — not a raw @stripe/mcp echo).
//
// Why it's a contract test: a downstream coding agent (energy, a sibling employee) binds to these tool
// names + input shapes. If the set drifts or a schema regresses, this goes RED — the JSON-RPC surface
// is the integration boundary other agents depend on.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildPennyMcpServer, PENNY_MCP_TOOLS } from "../src/mcp/server.js";

// The frozen wire contract: exactly these 8 tool names, in no required order. Sourced from the server's
// own export so the test and the server can't silently diverge — but the COUNT and MEMBERS are asserted
// against this literal so adding/removing a tool is a deliberate, test-breaking act.
const EXPECTED_TOOLS = [
  "penny_wire",
  "penny_review_integration",
  "penny_debug",
  "penny_issue_spt",
  "penny_reconcile",
  "penny_meter_create",
  "penny_check_version",
  "penny_explain",
] as const;

let client: Client;

beforeAll(async () => {
  // Wire a client↔server transport pair and connect both ends — a real MCP session (initialize +
  // capability negotiation happens here over JSON-RPC).
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = buildPennyMcpServer();
  client = new Client({ name: "penny-contract-test", version: "0.0.0" }, { capabilities: {} });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterAll(async () => {
  await client?.close();
});

describe("contract · MCP JSON-RPC tools/list (the wire surface other agents bind to)", () => {
  it("the server's own tool-name export matches the frozen 8-tool contract", () => {
    // Belt-and-suspenders: the server's exported list and this test's literal must agree.
    expect([...PENNY_MCP_TOOLS].sort()).toEqual([...EXPECTED_TOOLS].sort());
  });

  it("tools/list returns EXACTLY the 8 PLAN §4 tools (no more, no fewer) over JSON-RPC", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names.length).toBe(8);
    expect(names).toEqual([...EXPECTED_TOOLS].sort());
  });

  it("EVERY tool advertises a valid JSON-Schema object inputSchema (the bind contract)", async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.inputSchema, `${tool.name} must advertise an inputSchema`).toBeDefined();
      // MCP requires the top-level inputSchema to be a JSON Schema object.
      expect(tool.inputSchema.type, `${tool.name}.inputSchema.type`).toBe("object");
      expect(typeof tool.description, `${tool.name} must have a description`).toBe("string");
      expect((tool.description ?? "").length).toBeGreaterThan(0);
    }
  });

  it("the descriptions cite the brain (the taste-layer / anti-slop gate, not a raw @stripe/mcp wrap)", async () => {
    const { tools } = await client.listTools();
    // At least the core money-correctness tools must cite a JTBD law / pitfall / scenario in their
    // advertised description — penny LISTS @stripe/mcp, it does not merely re-export it.
    const wire = tools.find((t) => t.name === "penny_wire");
    const reconcile = tools.find((t) => t.name === "penny_reconcile");
    const checkVersion = tools.find((t) => t.name === "penny_check_version");
    expect(wire?.description).toMatch(/S-0|P-0/);
    expect(reconcile?.description).toMatch(/JTBD-0|P-18|O-09/);
    expect(checkVersion?.description).toMatch(/S-17|O-16/);
  });

  it("a real tools/call (penny_check_version) round-trips a brain-cited, drift-aware result", async () => {
    // Drive an actual JSON-RPC tools/call end-to-end — the contract is not just discovery, it's that the
    // call returns the taste-layer payload. check-version is the $0/no-network tool, ideal for the wire test.
    const res = await client.callTool({ name: "penny_check_version", arguments: {} });
    const content = res.content as { type: string; text: string }[];
    expect(content[0]?.type).toBe("text");
    const payload = JSON.parse(content[0].text) as {
      shapeOk: boolean;
      pinnedBaseline: string;
      drift: string[];
      fieldsChecked: string[];
    };
    // Pinned to the contract baseline, no drift when reporting the default version.
    expect(payload.pinnedBaseline).toBe("2026-05-27.dahlia");
    expect(payload.shapeOk).toBe(true);
    expect(payload.drift).toEqual([]);
    // The taste layer: the fields it checks cite the brain (S-17 / O-16) — the no-self-grading gate.
    expect(payload.fieldsChecked.join(" ")).toMatch(/S-17|O-16/);
  });

  it("a tools/call with a DRIFTED version reports drift over the wire (the contract catches regressions)", async () => {
    const res = await client.callTool({
      name: "penny_check_version",
      arguments: { apiVersion: "2025-03-31.basil" },
    });
    const content = res.content as { type: string; text: string }[];
    const payload = JSON.parse(content[0].text) as { shapeOk: boolean; drift: string[] };
    expect(payload.shapeOk).toBe(false);
    expect(payload.drift.length).toBeGreaterThan(0);
    expect(payload.drift[0]).toMatch(/basil/);
  });
});
