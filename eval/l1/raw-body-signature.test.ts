// GT-1 — Raw-body signature (S-03 / P-04) — L1 assertion.
//
// The #1 silent webhook footgun (field-01 §1c): JSON middleware / `req.json()` reserializes the
// body so the HMAC no longer byte-matches what Stripe signed; `constructEvent` 400s with "No
// signatures found." The fix (S-03): read RAW bytes (`req.text()`), disable the body parser, pass
// the exact string to `constructEvent`. The trap: rotating STRIPE_WEBHOOK_SECRET (it's almost never
// the secret).
//
// What this asserts ($0, no live API): the webhook handler penny SCAFFOLDS (the artifact the
// acceptance test drives) reads raw bytes and never `req.json()`s the body before verifying — and
// the review scanner CATCHES a handler that does it wrong. "For the correct reason": both must cite
// S-03 / P-04.

import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeScaffold } from "../../src/wire/scaffold.js";
import { loadSpec, type ProductSpec } from "../../src/wire/spec.js";
import { scanText } from "../../src/review/scan.js";

const ACCEPTANCE_SPEC = join(import.meta.dirname, "..", "..", "examples", "saas-pro.json");

function spec(): ProductSpec {
  const parsed = loadSpec(ACCEPTANCE_SPEC);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.spec;
}

describe("GT-1 · raw-body signature (S-03 — the route reads raw bytes)", () => {
  it("the scaffolded webhook handler reads RAW bytes (req.text()), never req.json()", () => {
    const dir = mkdtempSync(join(tmpdir(), "penny-gt1-"));
    const { files } = writeScaffold(spec(), dir);
    const handlerRel = files.find((f) => f.includes("webhook"));
    expect(handlerRel, "scaffold must write a webhook handler").toBeDefined();

    const handler = readFileSync(join(dir, handlerRel!), "utf8");
    // The fix: raw bytes via req.text(). The HMAC is over the exact bytes Stripe signed.
    expect(handler).toMatch(/req\.text\(\)/);
    // The trap: an actual `req.json()` CALL reserializes the body and breaks the signature. Strip
    // comments first so the handler's own cautionary "never req.json()" note isn't a false positive —
    // assert no real call (e.g. `await req.json()` / `= req.json()`) survives in the code.
    const code = handler
      .split("\n")
      .map((l) => l.replace(/\/\/.*$/, "")) // drop line comments
      .join("\n");
    expect(code).not.toMatch(/req\.json\(\)/);
    // Body parser disabled on the route (Next.js App Router segment config).
    expect(handler).toMatch(/bodyParser:\s*false/);
    // constructEvent gets the raw string + the stripe-signature header.
    expect(handler).toMatch(/constructEvent/);
    expect(handler).toMatch(/stripe-signature/);
  });

  it("a tampered/invalid signature is REJECTED with 400 (not silently accepted)", () => {
    const dir = mkdtempSync(join(tmpdir(), "penny-gt1b-"));
    const { files } = writeScaffold(spec(), dir);
    const handler = readFileSync(join(dir, files.find((f) => f.includes("webhook"))!), "utf8");
    // On a constructEvent failure the handler returns 400 — never proceeds to fulfill.
    expect(handler).toMatch(/status:\s*400/);
  });

  it("the review scanner CATCHES a handler that reserializes the body (the wrong way)", () => {
    // A handler that does `await req.json()` before constructEvent is the P-04 footgun. The scanner
    // must flag it (so penny review gates a real integration). This is the dogfood inverse of the
    // scaffold above.
    const badHandler = [
      'export async function POST(req) {',
      "  const body = await req.json();", // line 2 — the footgun
      "  const event = stripe.webhooks.constructEvent(JSON.stringify(body), sig, secret);",
      "}",
    ].join("\n");
    const findings = scanText("bad.ts", badHandler);
    const p04 = findings.find((f) => f.pitfallId === "P-04");
    expect(p04, "P-04 must be caught on a req.json() webhook").toBeDefined();
    // For the correct reason: the finding cites S-03 / P-04, the severity is high.
    expect(p04!.brainRef).toMatch(/P-04|S-03/);
    expect(p04!.severity).toBe("high");
  });
});
