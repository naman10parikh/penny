# penny — Memory (pointer)

> penny's bootstrap memory and queryable expertise live one layer up — this file is a pointer, not a second
> source of truth (consolidate, never duplicate). Powered by Energy.

## Bootstrap (loaded every cycle)

The critical payments facts — the JTBD-0 ledger-is-truth LAW + 4 corollaries, the version baseline
(`2026-05-27.dahlia` / flexible billing mode), and the helios boundary — are in **`memory/MEMORY.md`**
(≤1500-word bootstrap).

## Queryable expertise

The full expertise brain is **`brain/`** (six artifacts: EXPERTISE-MAP, OPINIONS, KNOWN-PITFALLS,
BATTLE-TESTED-SCENARIOS, TOOL-MATRIX, GAPS-AND-DISPUTES). Query it with BM25 ranking:

```bash
bash scripts/memory-search.sh "your billing question"
```

This is the same engine `penny explain` (CLI) and the cockpit Ask-the-employee view reuse.

## Patterns & errors

Session-scoped learnings append to `memory/LEARNINGS.md`; daily logs to `memory/daily/`. The RSI nightly loop
promotes resolved `brain/GAPS-AND-DISPUTES.md` items into the brain — the GAPS file shrinking is the visible
measure of penny getting smarter.
