#!/usr/bin/env node
// src/cockpit/server.mjs — penny cockpit HTTP server (G1 shell + G2 data; Cluster G).
// A Node-stdlib `http` server (no framework, no deps) that serves the vanilla-JS SPA in
// ./public and routes the cockpit's JSON API to REAL repo data. It is the chairman's
// read-surface (PLAN §10 / D3): open localhost:7790 and see penny's expertise brain, its run
// log + money-action audit trail, its eval pyramid, an ask-the-employee box, and the shrinking
// gaps tracker. Agents use the CLI/MCP; this is for human eyes.
//
// Design (the proven sentinel/talent-intel/pixel stdlib-cockpit pattern, ported to penny):
//   • REPO = parents[2] of this file = the penny repo root. This .mjs is run DIRECTLY from src/
//     (NOT compiled — tsconfig excludes src/cockpit), so it is the same source whether launched
//     from src/ or a published dist. Paths resolve relative to REPO → cwd-independent.
//   • Static SPA in ./public served with a path-traversal guard (resolved path MUST stay under
//     ./public). Unknown non-API paths fall through to index.html (the SPA owns client routing).
//   • Every JSON endpoint reads real artifacts and NEVER crashes the boot: a missing tool / file
//     returns an honest JSON error (or an empty set with a note), it does not throw the server
//     down — so the server self-tests green even before a single penny command has run.
//   • NO secrets are read or emitted here — the cockpit shows what penny DID (brain, logs, audit,
//     gates), it never needs provider keys. The Ask box runs the keyless brain BM25 only
//     (the same A5 engine `penny explain` uses). This honors the "no secret into context" rule.
//
// Endpoints (G2 — all REAL data, no placeholders):
//   GET /                       → public/index.html (the SPA shell, 5 view anchors)
//   GET /api/status             → masthead stat-strip (runs · audit lines · brain notes · gaps open)
//   GET /api/brain              → the six brain expertise notes (+ MOC) as a list with graph edges
//   GET /api/brain/file?f=...   → one brain file's raw markdown (path-guarded to brain/)
//   GET /api/brain/search?q=..  → BM25 hits over brain/ via scripts/memory-search.sh (A5)
//   GET /api/runs[?last=N]      → logs/runs.jsonl rows + logs/audit.jsonl money-action lines (E6)
//   GET /api/eval               → the eval pyramid: L1/L2/L3 per-golden-task pass/fail + acceptance
//   GET /api/gaps               → GAPS-AND-DISPUTES Part B (G-01..G-06) — the shrinking checklist
//   POST /api/ask {prompt}      → ask-the-employee: brain BM25 cited answer (the keyless A5 path)

import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, extname, basename, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// ── paths ─────────────────────────────────────────────────────────────────────────────────────
const HERE = fileURLToPath(new URL(".", import.meta.url)); // .../src/cockpit/
const REPO = resolve(HERE, "..", ".."); // .../penny
const PUBLIC_DIR = join(HERE, "public");
const BRAIN_DIR = join(REPO, "brain");
const RUNS_LOG = join(REPO, "logs", "runs.jsonl");
const AUDIT_LOG = join(REPO, "logs", "audit.jsonl");
const SEARCH_SH = join(REPO, "scripts", "memory-search.sh");
const GAPS_FILE = join(BRAIN_DIR, "GAPS-AND-DISPUTES.md");

const PORT = Number(process.env.PENNY_COCKPIT_PORT ?? process.argv[2] ?? 7790);
const HOST = "127.0.0.1"; // localhost only — never exposed
const MAX_BODY = 1 * 1024 * 1024; // 1 MB POST-body cap (the Ask box sends a short prompt)

// The six Wave-R EXPERTISE brain files (penny's competence) get surfaced first; the MOC + ORG_*
// notes are the navigation/org layer shown after. Order is the brain-browser display order.
const CORE_BRAIN = [
  "OPINIONS.md",
  "KNOWN-PITFALLS.md",
  "BATTLE-TESTED-SCENARIOS.md",
  "EXPERTISE-MAP.md",
  "TOOL-MATRIX.md",
  "GAPS-AND-DISPUTES.md",
];

// ── tiny helpers ────────────────────────────────────────────────────────────────────────────────
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  res.end(body);
}

function sendText(res, status, type, body) {
  res.writeHead(status, { "content-type": type, "content-length": Buffer.byteLength(body) });
  res.end(body);
}

/** Read & parse a JSONL file into records (skips half-written lines; [] if absent). */
function readJsonl(path) {
  if (!existsSync(path)) return [];
  const out = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      /* a corrupt half-line must not abort aggregation */
    }
  }
  return out;
}

/** Resolve a user-supplied path INSIDE an allowed root, or null if it escapes (traversal guard). */
function safeUnder(root, candidate) {
  const r = resolve(root) + sep;
  const p = resolve(root, candidate);
  return p === resolve(root) || p.startsWith(r) ? p : null;
}

// ── data builders (G2) ───────────────────────────────────────────────────────────────────────

/** List the brain notes: the six core expertise files first, then MOC + ORG_* nav notes, with
 *  wikilink graph edges so the brain browser can draw the MOC graph (PLAN §10 view 1). */
function buildBrainList() {
  if (!existsSync(BRAIN_DIR)) return { files: [], edges: [], note: "brain/ not found" };
  const present = readdirSync(BRAIN_DIR).filter((f) => f.endsWith(".md"));
  const ordered = [
    ...CORE_BRAIN.filter((f) => present.includes(f)),
    ...present.filter((f) => !CORE_BRAIN.includes(f)).sort(),
  ];
  const files = ordered.map((f) => {
    const full = join(BRAIN_DIR, f);
    const raw = readFileSync(full, "utf8");
    const links = [...raw.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].trim());
    const sumMatch = /^summary:\s*"?(.+?)"?\s*$/m.exec(raw);
    const titleMatch = /^title:\s*"?(.+?)"?\s*$/m.exec(raw);
    return {
      file: f,
      core: CORE_BRAIN.includes(f),
      title: titleMatch ? titleMatch[1] : f.replace(/\.md$/, ""),
      summary: sumMatch ? sumMatch[1] : "",
      bytes: statSync(full).size,
      links: [...new Set(links)],
    };
  });
  // graph edges: link target → the brain file whose basename (sans .md) matches the wikilink.
  const stems = new Map(files.map((f) => [f.file.replace(/\.md$/, ""), f.file]));
  const edges = [];
  for (const f of files) {
    for (const l of f.links) {
      const target = stems.get(l) ?? stems.get(l.replace(/^MOC - /, ""));
      if (target && target !== f.file) edges.push({ from: f.file, to: target });
    }
  }
  return { files, edges };
}

/** Parse the `[N] <file> (score: n)` blocks the A5 search script prints into structured hits. */
function parseBrainHits(stdout) {
  const hits = [];
  const headerRe = /^\[\d+\]\s+(\S+)\s+\(score:\s*([\d.]+)\)/;
  let cur = null;
  const flush = () => {
    if (cur) {
      const snippet = cur.buf.join("\n").replace(/^\s*---\s*$/gm, "").trim();
      hits.push({ file: cur.file, score: Number(cur.score), snippet });
      cur = null;
    }
  };
  for (const ln of stdout.split("\n")) {
    const m = headerRe.exec(ln.trim());
    if (m) {
      flush();
      cur = { file: m[1], score: m[2], buf: [] };
    } else if (cur) cur.buf.push(ln);
  }
  flush();
  return hits;
}

/** Run the A5 BM25 brain search (scripts/memory-search.sh) — one source of truth for ranking. */
function brainSearch(query, limit = 8) {
  if (!query || !query.trim()) return { query: query ?? "", hits: [], note: "empty query" };
  if (!existsSync(SEARCH_SH)) return { query, hits: [], note: "memory-search.sh not found" };
  const r = spawnSync("bash", [SEARCH_SH, query], {
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error && r.error.code === "ENOENT") return { query, hits: [], note: "bash unavailable" };
  return { query, hits: parseBrainHits(r.stdout ?? "").slice(0, limit) };
}

/** Run one eval level (L2/L3 print a parseable `EVAL <lvl> result=… f1=… kappa=…` line + per-task
 *  rows; $0, no live API). Returns the machine summary + the per-task agreement rows. */
function runEvalLevel(level) {
  const scorer = join(REPO, "eval", level, "run.ts");
  const tsx = join(REPO, "node_modules", ".bin", "tsx");
  if (!existsSync(scorer)) return { level, ran: false, note: `no ${level} scorer` };
  if (!existsSync(tsx)) return { level, ran: false, note: "tsx unavailable (run pnpm install)" };
  const r = spawnSync(tsx, [scorer], { cwd: REPO, encoding: "utf8", timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  const m = /EVAL\s+(l[123])\s+result=(pass|fail)(?:\s+f1=([\d.]+))?(?:\s+kappa=([\d.]+))?/.exec(out);
  // per-task agreement rows: "GT-x: classifier agreed with a/b labels" (L2) / judge rows (L3).
  const tasks = [];
  for (const ln of out.split("\n")) {
    const t = /\b(GT-\d+)\b.*?(\d+)\/(\d+)\s+labels/.exec(ln);
    if (t) tasks.push({ task: t[1], agreed: Number(t[2]), total: Number(t[3]) });
  }
  return {
    level,
    ran: true,
    pass: m ? m[2] === "pass" : r.status === 0,
    f1: m && m[3] ? Number(m[3]) : null,
    kappa: m && m[4] ? Number(m[4]) : null,
    exit: r.status ?? 1,
    tasks,
  };
}

/** Run the L1 vitest dir and return per-file pass/fail (the merge-blocking $0 floor, GT-1..GT-4). */
function runEvalL1() {
  const vitest = join(REPO, "node_modules", ".bin", "vitest");
  if (!existsSync(vitest)) return { level: "l1", ran: false, note: "vitest unavailable" };
  // JSON reporter → structured per-test results without parsing human output.
  const r = spawnSync(vitest, ["run", "eval/l1", "--reporter=json", "--config", "vitest.config.ts"], {
    cwd: REPO,
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  // vitest prints a json blob to stdout; extract the testResults summary.
  const tasks = [];
  let pass = r.status === 0;
  try {
    const jsonStart = r.stdout.indexOf("{");
    const parsed = JSON.parse(r.stdout.slice(jsonStart));
    pass = parsed.success ?? r.status === 0;
    for (const f of parsed.testResults ?? []) {
      const name = basename(f.name ?? "").replace(/\.test\.ts$/, "");
      const failed = (f.assertionResults ?? []).some((a) => a.status === "failed");
      tasks.push({ task: name, ok: !failed, of: (f.assertionResults ?? []).length });
    }
  } catch {
    // JSON reporter unavailable / parse failed — fall back to the exit code only.
  }
  return { level: "l1", ran: true, pass, exit: r.status ?? 1, tasks };
}

/** The full eval pyramid for the Eval-scores view: L1 ($0 floor) + L2 + L3 + the acceptance badge.
 *  Acceptance is the operational headline (E4) — it runs against live Stripe test-mode in CI, so
 *  here we surface its PRESENCE + red-blocking wiring as the badge (not a token/live run). */
function buildEval() {
  const l1 = runEvalL1();
  const l2 = runEvalLevel("l2");
  const l3 = runEvalLevel("l3");
  const acceptanceTest = join(REPO, "test", "acceptance", "acceptance.test.ts");
  const ciYml = join(REPO, ".github", "workflows", "ci.yml");
  const ciHasAcceptanceJob =
    existsSync(ciYml) && /^\s{2}acceptance:/m.test(readFileSync(ciYml, "utf8"));
  return {
    l1,
    l2,
    l3,
    acceptance: {
      present: existsSync(acceptanceTest),
      ciRedBlocking: ciHasAcceptanceJob,
      // The badge: green when the spine exists AND is wired red-blocking in CI; the live run is in
      // CI/sandbox (test-mode Stripe), never here.
      status: existsSync(acceptanceTest) && ciHasAcceptanceJob ? "wired" : "missing",
      note: "checkout E2E + raw-body HMAC + idempotent replay — runs red-blocking in CI (test-mode only, E4).",
    },
  };
}

/** Parse GAPS-AND-DISPUTES.md PART B (G-01..G-06) into a shrinking checklist (PLAN §10 view 5).
 *  An open gap is a `### G-0N — <title>` heading inside the PART B section. The COUNT shrinking
 *  over RSI nights is the visible measure of penny getting smarter. */
function buildGaps() {
  if (!existsSync(GAPS_FILE)) return { open: [], count: 0, note: "GAPS-AND-DISPUTES.md not found" };
  const raw = readFileSync(GAPS_FILE, "utf8");
  // isolate PART B (open gaps) — from "## PART B" to the next "## PART".
  const partB = /##\s*PART B\b[\s\S]*?(?=\n##\s*PART|$)/.exec(raw);
  const section = partB ? partB[0] : raw;
  const open = [];
  const headRe = /^###\s+(G-\d+)\s+—\s+(.+?)(?:\s+\*\*\(HIGH VALUE\)\*\*)?\s*$/gm;
  let m;
  while ((m = headRe.exec(section)) !== null) {
    const id = m[1];
    const title = m[2].trim();
    // grab the "Why it matters" line as the one-liner, falling back to the gap line.
    const after = section.slice(m.index, m.index + 1400);
    const why = /-\s*\*\*Why it matters\.\*\*\s*(.+)/.exec(after);
    const gap = /-\s*\*\*The gap\.\*\*\s*(.+)/.exec(after);
    open.push({
      id,
      title,
      highValue: /\*\*\(HIGH VALUE\)\*\*/.test(m[0]),
      why: (why ? why[1] : gap ? gap[1] : "").replace(/\s+—\s+field-\d.*$/, "").slice(0, 220),
    });
  }
  return { open, count: open.length, total: open.length };
}

/** Masthead summary: counts for the stat-strip (runs · money-action audit lines · brain · gaps). */
function buildStatus() {
  const runs = readJsonl(RUNS_LOG);
  const audits = readJsonl(AUDIT_LOG);
  const brain = existsSync(BRAIN_DIR) ? readdirSync(BRAIN_DIR).filter((f) => f.endsWith(".md")).length : 0;
  const gaps = buildGaps().count;
  return { runs: runs.length, audit_lines: audits.length, brain_notes: brain, gaps_open: gaps, port: PORT };
}

// ── static serving (the SPA shell + assets) ─────────────────────────────────────────────────────
function serveStatic(res, urlPath) {
  const rel = urlPath === "/" ? "index.html" : decodeURIComponent(urlPath.replace(/^\/+/, ""));
  const safe = safeUnder(PUBLIC_DIR, rel);
  if (!safe || !existsSync(safe) || !statSync(safe).isFile()) {
    // SPA fallback: unknown route → index.html (single-page app owns client routing).
    const index = join(PUBLIC_DIR, "index.html");
    if (existsSync(index)) return sendText(res, 200, MIME[".html"], readFileSync(index));
    return sendText(res, 404, "text/plain", "not found");
  }
  const body = readFileSync(safe);
  const type = MIME[extname(safe).toLowerCase()] ?? "application/octet-stream";
  return sendText(res, 200, type, body);
}

// ── request router ────────────────────────────────────────────────────────────────────────────
const server = createServer((req, res) => {
  let parsed;
  try {
    parsed = new URL(req.url, `http://${HOST}:${PORT}`);
  } catch {
    return sendJson(res, 400, { error: "bad url" });
  }
  const path = parsed.pathname;
  const q = parsed.searchParams;

  try {
    // ── JSON API ──────────────────────────────────────────────────────────────────────────────
    if (path === "/api/status") return sendJson(res, 200, buildStatus());

    if (path === "/api/brain") return sendJson(res, 200, buildBrainList());

    if (path === "/api/brain/file") {
      const f = q.get("f") ?? "";
      const safe = safeUnder(BRAIN_DIR, basename(f)); // basename → no traversal possible
      if (!safe || !existsSync(safe)) return sendJson(res, 404, { error: "brain file not found", f });
      return sendJson(res, 200, { file: basename(safe), markdown: readFileSync(safe, "utf8") });
    }

    if (path === "/api/brain/search") return sendJson(res, 200, brainSearch(q.get("q") ?? "", 8));

    if (path === "/api/runs") {
      const last = Number(q.get("last") ?? 0);
      const all = readJsonl(RUNS_LOG);
      const rows = last > 0 ? all.slice(-last) : all.slice(-200); // cap the default payload
      const audits = readJsonl(AUDIT_LOG); // the money-action trail (highlighted in the view)
      return sendJson(res, 200, { total: all.length, rows, audits });
    }

    if (path === "/api/eval") return sendJson(res, 200, buildEval());

    if (path === "/api/gaps") return sendJson(res, 200, buildGaps());

    if (path === "/api/ask" && req.method === "POST") {
      let body = "";
      let tooBig = false;
      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > MAX_BODY) {
          tooBig = true;
          req.destroy();
        }
      });
      req.on("end", () => {
        if (tooBig) return sendJson(res, 413, { error: "prompt too large" });
        let prompt = "";
        try {
          // Accept any of the three field names the sibling faces use for the same brain-BM25 op:
          // the cockpit SPA sends {prompt}, the MCP tool uses {question}, the CLI verb is `explain`.
          // An agent hitting this endpoint by hand with the intuitive {question} now works too.
          const parsed = JSON.parse(body || "{}");
          prompt = String(parsed.prompt ?? parsed.question ?? parsed.q ?? "");
        } catch {
          return sendJson(res, 400, { error: "body must be JSON {prompt} (or {question})" });
        }
        if (!prompt.trim()) return sendJson(res, 400, { error: "empty prompt" });
        // Ask-the-employee = the keyless A5 brain BM25 (the same engine `penny explain` uses).
        // penny cites the O-/P-/S-/JTBD ref, never its own confidence (the no-self-grading stance).
        return sendJson(res, 200, brainSearch(prompt, 6));
      });
      return undefined;
    }

    if (path.startsWith("/api/")) return sendJson(res, 404, { error: "unknown endpoint", path });

    // ── static SPA ────────────────────────────────────────────────────────────────────────────
    if (req.method !== "GET" && req.method !== "HEAD") return sendJson(res, 405, { error: "method not allowed" });
    return serveStatic(res, path);
  } catch (err) {
    // never crash the server on a single bad request — log + 500 (energy typescript.md).
    console.warn("[cockpit] request error:", err instanceof Error ? err.message : String(err));
    return sendJson(res, 500, { error: "internal error" });
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`penny cockpit: port ${PORT} is already in use — pass a different --port.`);
    process.exit(1);
  }
  console.error("penny cockpit: server error:", err.message);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`penny cockpit → http://${HOST}:${PORT}  (brain · runs+audit · evals · ask · gaps)\n`);
});

// graceful shutdown so `penny cockpit` can be backgrounded + killed cleanly in CI/verify.
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
  });
}
