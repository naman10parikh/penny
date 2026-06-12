---
name: agent-spend-credential
description: Give an agent the ability to spend money with bounded blast radius — the payments-equivalent of "least agency." Use when issuing a scoped spend credential for an agent, designing the "let my agent pay" consent UX, or choosing between card-rail SPT and x402. The on-thesis core of penny.
model-tier: opus  # safety-critical design trajectory (blast-radius, revocation) — highest reasoning
---

# agent-spend-credential

> **Law (JTBD-0 + least-agency):** the agent holds a scoped, capped, expiring credential — never a raw card or an unbounded key — and the spend is double-bounded by the *credential scope* and the *ledger cap*. A bug or prompt-injection must have a bounded blast radius. — `brain/EXPERTISE-MAP.md` JTBD-5. This is penny's reason to exist on an agent platform.

## Trigger

Invoke when ANY of these are true:
- A customer wants their agent to buy compute/services up to $X, at seller Y, expiring at Z.
- You are designing the consent surface ("issue this agent $X at seller Y until Z") or reviewing an agent-payment integration.
- A design hands an agent an API key or a card token with broad scope.
- The ask mentions SPT, ACP, MPP, x402, AP2, or "agent wallet."

## Boundary (read first)

penny owns the **product / charge side**: SPT issuance + scoping, the consent UX, and ledger↔provider reconciliation. **helios owns the spend-side** — the append-only ledger, dedup on txn id, derived balance, and per-loop / daily-loss caps in `funding/state.ts`. penny **fuses** helios's balance-cap with SPT's credential-scope; it does **not** rebuild the ledger (`brain/TOOL-MATRIX.md` §2 "don't rebuild"; import helios, never reimplement).

## Steps

Run in order. Each step cites the brain ref it enforces.

1. **Issue a Shared Payment Token (SPT), never the raw card or a broad key.** The SPT is a scoped grant the customer authorizes: (1) usable only at a **specific seller**, (2) **caps total spend**, (3) **expires at a fixed time** — meaningless outside its narrow scope. The agent only ever holds the SPT; it never touches the PAN. — **O-11 / S-13** (`brain/OPINIONS.md` O-11, `brain/BATTLE-TESTED-SCENARIOS.md` S-13).

2. **Fuse credential-scope with a balance-gated cap (helios).** The SPT bounds *what* the agent can pay (seller + amount + expiry); helios's per-loop / daily-loss caps bound *how much* the ledger will release. Both must agree before money moves — credential scope AND ledger both bound spend. Import `helios funding/state.ts`; do not rebuild it. — **O-11** (`brain/EXPERTISE-MAP.md` 5.8; `brain/TOOL-MATRIX.md` §2).

3. **Reconcile the agent's internal ledger vs the provider record.** After each spend, diff the agent's own ledger against Stripe's record (JTBD-0: the ledger is the truth, not the charge response). A divergence is an alarm, not a rounding error. — **O-11 / JTBD-0** (`brain/EXPERTISE-MAP.md` 5.8).

4. **Default to card-rail SPT (ACP/MPP); keep x402 as an optional escape hatch — don't architect *for* it.** For a product that also serves humans, card-rail SPT gives built-in Radar/tax/reporting and setup in hours; x402 puts compliance + fraud on *you* and self-custody wallet-key risk on the agent. ~Half of observed x402 transactions are "gamified" today and merchants are rare — "the narrative is growing faster than the usage." Build scoped-credential + ledger primitives now (low regret); do **not** require x402 volume in the design. — **O-12 / P-21** (`brain/OPINIONS.md` O-12, `brain/KNOWN-PITFALLS.md` P-21; dispute `brain/GAPS-AND-DISPUTES.md` D-02).

5. **State the revocation caveat explicitly in the consent UX (it's an open gap).** Whether a customer can kill an outstanding SPT **mid-flight** and have Stripe propagate it to the network token **instantly** is **not confirmed** (`brain/GAPS-AND-DISPUTES.md` G-04). Until verified against the agentic-commerce sandbox, the "expiring + capped" guarantees carry the safety weight — the consent UX must say so rather than promise an instant kill-switch. — **G-04** (resolve via `docs.stripe.com/agentic-commerce/concepts/shared-payment-tokens`).

## Output

A test-mode SPT issuance (for authoring) or a findings list (for review), each item shaped:
`{ check: <step>, status: pass|fail, brainRef: O-0n|P-0n|S-0n|G-0n, file:line, fix }`.

- **Authoring:** issue an SPT (seller-locked + capped + expiring), fuse it with the helios balance-cap, wire ledger↔provider reconciliation, and surface the revocation caveat in the consent copy. Test mode only — real money is behind the chairman checklist.
- **Review:** an unbounded credential / raw card / broad API key handed to an agent is a HIGH finding (O-11); an architecture that *requires* x402 volume is a P-21 finding; a consent UX promising an instant SPT kill-switch is a G-04 finding (unverified claim). Cite the brain ref.

## Self-test rig

Stripe **test mode** agentic-commerce sandbox: `penny issue-spt --seller test --cap 50 --expires <ts>` → assert the token is seller-locked + amount-capped + time-expiring and that helios's balance-cap gates the release. SPT/agentic-commerce is an **account feature-flag** keyed by the existing `STRIPE_SECRET_KEY` (not a new secret); if the test account is feature-gated, that goes to CHAIRMAN-CHECKLIST and this is an L3 nightly task, **not** acceptance-blocking (V4).
