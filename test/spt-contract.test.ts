// Wave-T regression — the issue-spt INPUT CONTRACT must agree across the CLI and the MCP tool
// (the council found the two faces of the flagship credential op diverged: the CLI accepted an ISO
// date for --expires while penny_issue_spt's schema was z.number() and rejected the same ISO string
// with a hard JSON-RPC -32602 before reaching validateSptScope). The fix made both faces share ONE
// parser (parseExpiry in src/spt.ts) and widened the MCP schema to unix-ms-OR-ISO. These tests lock
// that: an ISO date and the equivalent unix-ms produce the SAME validated scope on BOTH faces, and an
// unparseable/expired value is a soft brain-cited refusal (O-11), never a -32602.

import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildPennyMcpServer } from "../src/mcp/server.js";
import { parseExpiry, validateSptScope } from "../src/spt.js";
import { issueSptTool } from "../src/mcp/tools.js";

const ISO = "2099-12-31T00:00:00.000Z";
const UNIX_MS = Date.parse(ISO); // the equivalent unix-ms — far future so it never expires under test

describe("Wave-T · parseExpiry is the ONE shared input contract (unix-ms ⇄ ISO)", () => {
  it("an ISO date and its unix-ms form normalise to the SAME number", () => {
    expect(parseExpiry(ISO)).toBe(UNIX_MS);
    expect(parseExpiry(String(UNIX_MS))).toBe(UNIX_MS);
    expect(parseExpiry(UNIX_MS)).toBe(UNIX_MS);
  });

  it("an unparseable expiry resolves to undefined → validateSptScope refuses it (soft, brain-cited)", () => {
    expect(parseExpiry("not-a-date")).toBeUndefined();
    const v = validateSptScope({ sellerId: "acct_x", capAmount: 50, expiresAt: parseExpiry("not-a-date"), agentId: "a1" });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/O-11/);
  });
});

describe("Wave-T · penny_issue_spt accepts ISO AND unix-ms (no CLI≠MCP -32602)", () => {
  it("an ISO-string expiresAt round-trips through the real MCP server to a validated scope (was -32602)", async () => {
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const server = buildPennyMcpServer();
    const client = new Client({ name: "spt-contract", version: "0.0.0" }, { capabilities: {} });
    await Promise.all([server.connect(st), client.connect(ct)]);
    try {
      const res = await client.callTool({
        name: "penny_issue_spt",
        arguments: { sellerId: "acct_test123", capAmount: 50, expiresAt: ISO, agentId: "a1" },
      });
      const payload = JSON.parse((res.content as { text: string }[])[0].text) as {
        ok: boolean;
        scope?: { expiresAt: number };
      };
      expect(payload.ok).toBe(true);
      // The ISO string was normalised to the SAME unix-ms the unix-ms caller would pass.
      expect(payload.scope?.expiresAt).toBe(UNIX_MS);
    } finally {
      await client.close();
    }
  });

  it("the unix-ms and ISO faces of penny_issue_spt produce an identical validated scope", () => {
    const fromUnix = issueSptTool({ sellerId: "acct_test123", capAmount: 50, expiresAt: UNIX_MS, agentId: "a1" });
    const fromIso = issueSptTool({ sellerId: "acct_test123", capAmount: 50, expiresAt: ISO, agentId: "a1" });
    expect(fromUnix.ok).toBe(true);
    expect(fromIso.ok).toBe(true);
    expect(fromIso.scope).toEqual(fromUnix.scope);
    expect(fromIso.sptId).toBe(fromUnix.sptId); // same seller + same normalised expiry → same id
  });

  it("an expired ISO date is a soft O-11 refusal (ok:false), NOT a -32602 schema error", () => {
    const past = issueSptTool({ sellerId: "acct_test123", capAmount: 50, expiresAt: "2000-01-01", agentId: "a1" });
    expect(past.ok).toBe(false);
    expect(past.reason).toMatch(/O-11/);
  });
});
