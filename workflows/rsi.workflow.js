#!/usr/bin/env node
/**
 * penny RSI engine (D2) — the deterministic $0/tokenless self-improvement loop.
 *
 * Runs the 6 dsip steps (dsip.json `loop.steps`, with the PLAN §11 aliases in parens):
 *   1. refresh-brain          — re-read brain/TOOL-MATRIX.md pins + brain/GAPS-AND-DISPUTES.md Part B
 *                               (the shrinking G-01..G-06 checklist = "penny getting smarter")
 *   2. re-verify-tool-matrix  — confirm the pinned 2026-05-27.dahlia baseline still holds; PROVE the
 *                               drift detector works by planting a stale version (basil) → penny check-version
 *                               must flag it. (Firecrawl crawl of the live changelog is the OPTIONAL online
 *                               half — degrades to the local pin contract when the key/network is absent.)
 *   3. run-eval-pyramid       — pnpm eval (L1 + named L2). E1/E2 own the real pyramid; until eval/ lands this
 *                               degrades to the $0 `penny check-version` L1 face → reported as "pending", NOT
 *                               a failure (the loop still completes its 6 steps deterministically).
 *   4. propose                — write a proposal artifact to a GATED dir (.rsi/proposed); never auto-apply to
 *                               the real brain (snapback=component|repo).
 *   5. validate (test-gate)   — an OBJECTIVE gate (noSelfGrading): the proposed state must keep the version
 *                               contract intact (penny check-version exits 0 at the baseline; a planted drift
 *                               exits non-zero). No model opinion gates anything.
 *   6. ship (commit)          — GATED. The deterministic run PROPOSES but does NOT commit (a dry proposal);
 *                               Git snap-back guards any real apply. The Claude half (LLM-authored gap-closing
 *                               diffs from GAPS Part B) is dark unless CLAUDE_CODE_OAUTH_TOKEN is set (D8).
 *
 * `--deterministic` → the $0 path (no network needed; the changelog crawl degrades to the local pin contract;
 * no Claude). The Claude half is a no-op when the token is unset (dark = expected, not a miss).
 *
 * Plain ESM `.js` (no build step) so `.github/workflows/rsi.yml` runs it directly with `node`. dsip contract
 * honored: noSelfGrading (the gate is objective — the version contract, not the engine's opinion); snapback
 * granularity = component|repo (git); it NEVER commits unless the gate passes.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url)); // workflows/
const ROOT = join(HERE, ".."); // repo root
const CLI = join(ROOT, "bin", "penny.js");
const MATRIX = join(ROOT, "brain", "TOOL-MATRIX.md");
const GAPS = join(ROOT, "brain", "GAPS-AND-DISPUTES.md");
const PINNED_VERSION = "2026-05-27.dahlia"; // the baseline the contract test pins (O-16 / S-17)

const DETERMINISTIC = process.argv.includes("--deterministic");
const HAS_CLAUDE_TOKEN = Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN);

/** One step's structured result for the run log. */
const steps = [];
function logStep(id, alias, status, detail) {
  const line = `[rsi] step ${steps.length + 1}/6: ${id}${alias ? ` (${alias})` : ""} — ${status}`;
  process.stdout.write(`${line}${detail ? ` :: ${detail}` : ""}\n`);
  steps.push({ id, alias, status, detail });
}

/** Run the built penny CLI, capture stdout/stderr; never throws (returns {ok, out, code}). */
function penny(args) {
  try {
    const out = execFileSync(process.execPath, [CLI, ...args], { cwd: ROOT, encoding: "utf8" });
    return { ok: true, out, code: 0 };
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}` || String(e), code: e.status ?? 1 };
  }
}

async function main() {
  process.stdout.write(
    `penny RSI engine — ${DETERMINISTIC ? "DETERMINISTIC ($0, tokenless)" : "full"} mode; ` +
      `Claude half ${HAS_CLAUDE_TOKEN ? "ARMED (token present)" : "dark (CLAUDE_CODE_OAUTH_TOKEN unset — D8)"}\n`,
  );

  // ── Step 1: refresh-brain — re-read the pin source + the shrinking gaps checklist ───────────────
  let matrixText = "";
  let openGaps = -1;
  try {
    matrixText = readFileSync(MATRIX, "utf8");
    const pinnedOk = matrixText.includes(PINNED_VERSION);
    // GAPS Part B (G-01..G-06) is the visible "penny getting smarter" metric — count the open items.
    const gapsText = existsSync(GAPS) ? readFileSync(GAPS, "utf8") : "";
    openGaps = (gapsText.match(/^### G-0\d/gm) ?? []).length;
    logStep(
      "refresh-brain",
      null,
      pinnedOk ? "ok" : "error",
      `re-read brain/TOOL-MATRIX.md (baseline ${PINNED_VERSION} ${pinnedOk ? "present" : "MISSING"}); ` +
        `GAPS Part B open items: ${openGaps} (the shrinking checklist)`,
    );
  } catch (e) {
    logStep("refresh-brain", null, "error", `cannot read TOOL-MATRIX.md: ${e.message}`);
  }

  // ── Step 2: re-verify-tool-matrix — confirm the baseline + PROVE drift detection ────────────────
  // The deterministic proof (analogous to turbo's planted stale-pin): ask penny check-version to report a
  // KNOWN-stale version (basil) and assert it flags drift (exit non-zero). Then confirm the real baseline
  // (no override) is clean (exit 0). This proves the detector that the GT-2 contract test relies on works.
  // The online half (Firecrawl-crawl docs.stripe.com/changelog/ for a post-Dahlia release) is OPTIONAL and
  // degrades to this local contract when FIRECRAWL_API_KEY / network is absent.
  let driftDetectorWorks = false;
  {
    const planted = penny(["check-version", "--api-version", "2025-03-31.basil"]);
    const baseline = penny(["check-version"]);
    // planted stale → must be non-zero (drift flagged); baseline → must be 0 (contract intact).
    driftDetectorWorks = planted.code !== 0 && baseline.code === 0;
    const online = Boolean(process.env.FIRECRAWL_API_KEY);
    logStep(
      "re-verify-tool-matrix",
      "penny check-version / changelog watch",
      driftDetectorWorks ? "ok" : "error",
      driftDetectorWorks
        ? `planted basil → drift flagged (exit ${planted.code}); baseline ${PINNED_VERSION} → contract intact (exit ${baseline.code}); ` +
          `changelog crawl ${online ? "armed (FIRECRAWL_API_KEY present)" : "offline-degraded (local pin contract — D2 deterministic)"}`
        : `detector check failed: planted exit ${planted.code} (want ≠0), baseline exit ${baseline.code} (want 0)`,
    );
  }

  // ── Step 3: run-eval-pyramid — L1 (+ named L2). E1/E2 own the real pyramid ──────────────────────
  // Until eval/ lands (E1/E2, another builder), the $0 face is `penny check-version` (the GT-2 L1 trap).
  // A not-yet-built pyramid is "pending" — NOT a pass and NOT a hard failure; the loop still completes.
  {
    const evalDir = join(ROOT, "eval");
    const hasEvalSuite =
      existsSync(evalDir) && readdirSync(evalDir).some((f) => f === "run.ts" || f.endsWith(".ts"));
    if (hasEvalSuite) {
      // Real pyramid present → run it ($0 L1; pnpm eval default level is l1 per E1's --level selector).
      let r;
      try {
        const out = execFileSync("pnpm", ["eval"], { cwd: ROOT, encoding: "utf8" });
        r = { ok: true, out };
      } catch (e) {
        r = { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
      }
      logStep(
        "run-eval-pyramid",
        "pnpm eval",
        r.ok ? "ok" : "error",
        r.ok ? "eval pyramid L1 green ($0)" : `eval pyramid RED: ${r.out.slice(-160).trim()}`,
      );
    } else {
      // No suite yet → fall back to the $0 contract face that DOES exist (check-version = GT-2 L1).
      const cv = penny(["check-version"]);
      logStep(
        "run-eval-pyramid",
        "pnpm eval",
        "pending",
        `eval/ not yet built (E1/E2 own the pyramid) → $0 L1 face penny check-version exit ${cv.code} ` +
          `(contract intact); reported pending, loop continues`,
      );
    }
  }

  // ── Step 4: propose — write a proposal artifact to a GATED dir (NEVER auto-apply) ───────────────
  // Proposing ≠ applying (snapback contract). When the Claude half lands, it writes a real gap-closing
  // diff here (e.g. promote a resolved G-01..G-06 into OPINIONS/EXPERTISE-MAP); deterministically we record
  // the loop state + the open-gaps count as the proposal surface.
  let proposalPath = null;
  {
    const gatedDir = join(ROOT, ".rsi", "proposed");
    mkdirSync(gatedDir, { recursive: true });
    proposalPath = join(gatedDir, `rsi-${Date.now()}.proposal.md`);
    const proposal =
      `# penny RSI proposal (deterministic) — ${new Date().toISOString()}\n\n` +
      `Baseline pin: ${PINNED_VERSION} (verified ${driftDetectorWorks ? "intact" : "DRIFT — investigate"}).\n` +
      `GAPS Part B open items: ${openGaps} (the visible "penny getting smarter" metric — shrink this).\n\n` +
      (HAS_CLAUDE_TOKEN
        ? `Claude half ARMED: would attempt a live test-mode experiment on the next open GAPS Part B item ` +
          `(e.g. G-01 pay_now rollback, G-04 SPT revocation latency) and, if resolved, promote it into ` +
          `EXPERTISE-MAP/OPINIONS + delete it from GAPS — gated by the eval pyramid (dsip.eval.gate).\n`
        : `Claude half DARK (D8): set CLAUDE_CODE_OAUTH_TOKEN to let penny attempt a GAPS Part B live experiment.\n`) +
      `\nThis artifact is a PROPOSAL — not applied (snapback=component|repo; git).\n`;
    writeFileSync(proposalPath, proposal, "utf8");
    logStep("propose", null, "ok", `wrote proposal artifact → ${proposalPath.replace(ROOT + "/", "")} (NOT applied)`);
  }

  // ── Step 5: validate (test-gate) — OBJECTIVE gate (noSelfGrading) ───────────────────────────────
  // The gate is the version contract, not the engine's opinion: penny check-version at the baseline MUST
  // exit 0 (the shape contract your business logic reads is intact). Any proposal that breaks it fails the
  // gate. (When the real eval pyramid lands, the gate becomes "acceptance-test-green && no-regression"
  // per dsip.eval.gate — E4 wires that.)
  let gatePassed = false;
  {
    const cv = penny(["check-version"]);
    gatePassed = cv.code === 0 && driftDetectorWorks;
    logStep(
      "validate",
      "test-gate",
      gatePassed ? "ok" : "error",
      gatePassed
        ? "version contract intact (check-version exit 0) + drift detector proven — no regression"
        : `gate FAIL — check-version exit ${cv.code} or drift detector broken (no commit allowed)`,
    );
  }

  // ── Step 6: ship (commit) — GATED. Deterministic = dry proposal; never commits ──────────────────
  {
    if (DETERMINISTIC) {
      logStep(
        "ship",
        "commit",
        "skipped",
        gatePassed
          ? `gate green but DETERMINISTIC mode is a dry proposal — NOT committing (proposal at ${proposalPath ? proposalPath.replace(ROOT + "/", "") : "n/a"})`
          : "gate not green — nothing to ship (correct: no commit on a red gate)",
      );
    } else if (HAS_CLAUDE_TOKEN) {
      logStep("ship", "commit", "armed", "CLAUDE_CODE_OAUTH_TOKEN present → Claude half would open a gated PR (snapback=component|repo)");
    } else {
      logStep("ship", "commit", "skipped", gatePassed ? "gate green; Claude token absent → deferred (D8)" : "gate not green — no commit");
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────────────────────────────
  const completed = steps.length === 6;
  const hardErrors = steps.filter((s) => s.status === "error").length;
  process.stdout.write(
    `\n[rsi] DONE — ${steps.length}/6 steps; drift-detector=${driftDetectorWorks ? "PROVEN" : "BROKEN"}; ` +
      `gate=${gatePassed ? "PASS" : "—"}; open-gaps=${openGaps}; committed=false (deterministic dry proposal); ` +
      `hard-errors=${hardErrors}\n`,
  );
  // $0 deterministic run is a success when all 6 steps ran, the drift detector was proven, and no hard error
  // broke the chain. A "pending" eval (E1/E2 not landed) is NOT a failure.
  const success = completed && driftDetectorWorks && hardErrors === 0;
  process.exit(success ? 0 : 1);
}

main().catch((e) => {
  process.stderr.write(`✗ rsi.workflow: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
  process.exit(1);
});
