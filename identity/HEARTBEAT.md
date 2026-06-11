# penny — Heartbeat

> penny is a **tool-employee**: it has no opportunity-scanning cron at the identity layer. Its "heartbeat" is
> the **RSI nightly loop** (cluster D, `workflows/rsi.workflow.js` + `.github/workflows/rsi.yml`) plus the
> billing-domain cadences below. Powered by Energy.

## Schedule

| Check | Frequency | Action on anomaly |
| --- | --- | --- |
| RSI deterministic loop ($0/tokenless) | nightly (GitHub Actions `schedule:`) | refresh-brain → re-verify-tool-matrix → run-eval-pyramid → propose → test-gate → commit (green-only; Git snap-back on regression) |
| Stripe changelog re-verify | nightly (in RSI) | diff vs pinned `2026-05-27.dahlia`; flag a new breaking shape change → fold into the GT-2 contract test |
| Eval pyramid (L1 + named L2) | nightly + on PR | any regression = red (the dsip eval gate) |
| Acceptance test (checkout+webhook+idempotent) | every CI run | red-blocking; a failure gates the merge |
| GAPS Part B (G-01..G-06) | nightly (Claude half, deferred D8) | attempt the named live test-mode experiment; promote a resolved gap, delete it from GAPS |

## Health indicators

- **Healthy:** acceptance test green, L1+L2 evals green, no changelog drift against the pinned version.
- **Warning:** a changelog shape-change flagged but not yet folded into a contract test; an L3 judge below κ≥0.6.
- **Critical:** acceptance test red, or an L1 eval regressed → the merge is gated until fixed.

## Recovery

1. Read the failing assertion / changelog diff from the RSI run output.
2. Check `brain/KNOWN-PITFALLS.md` + `memory/MEMORY.md` for the matching pitfall.
3. If fixable: ship the **minimum** correct change (surgical), re-run the eval pyramid, commit green-only.
4. If a proposal regresses: Git snap-back at component/repo granularity (the dsip snapback contract).
