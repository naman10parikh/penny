// penny cockpit — vanilla-JS SPA (Cluster G / PLAN §10). Zero dependencies. Renders the 5 views
// from the stdlib server's JSON API into #stage. The chairman's read-surface: brain browser,
// run log (+ money-action audit trail highlighted), eval scores (the L1/L2/L3 pyramid + the
// acceptance badge), ask-the-employee (keyless brain BM25), and the shrinking gaps tracker.
//
// Design notes: no framework, no build step — a tiny render-on-click router keyed to the nav rail.
// Every fetch is defensive (a failed endpoint shows an honest empty state, never a blank screen).
// A minimal markdown renderer keeps the brain viewer dependency-free (headings/code/lists/links).

(() => {
  "use strict";

  const stage = document.getElementById("stage");
  const railButtons = [...document.querySelectorAll(".rail button[data-view]")];

  // ── tiny utils ────────────────────────────────────────────────────────────────────────────────
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  async function getJson(url, opts) {
    try {
      const r = await fetch(url, opts);
      if (!r.ok) return { __error: `HTTP ${r.status}` };
      return await r.json();
    } catch (e) {
      return { __error: String(e && e.message ? e.message : e) };
    }
  }

  function emptyState(big, sub) {
    return `<div class="empty"><span class="big">${esc(big)}</span>${sub ? esc(sub) : ""}</div>`;
  }

  // a deliberately small markdown renderer for the brain viewer (headings, code, lists, links,
  // bold, wikilinks). Not a full CommonMark engine — just enough to read penny's brain notes.
  function renderMarkdown(md) {
    const lines = String(md ?? "").split("\n");
    const out = [];
    let inCode = false;
    let inList = false;
    const closeList = () => {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
    };
    const inline = (s) =>
      esc(s)
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\[\[([^\]]+)\]\]/g, '<a href="#" class="wikilink" data-link="$1">$1</a>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    for (const raw of lines) {
      if (/^```/.test(raw)) {
        closeList();
        if (!inCode) {
          out.push("<pre><code>");
          inCode = true;
        } else {
          out.push("</code></pre>");
          inCode = false;
        }
        continue;
      }
      if (inCode) {
        out.push(esc(raw) + "\n");
        continue;
      }
      // strip YAML frontmatter fences entirely (the brain notes lead with ---\n...\n---).
      const h = /^(#{1,4})\s+(.*)$/.exec(raw);
      if (h) {
        closeList();
        const lvl = Math.min(h[1].length, 3);
        out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`);
        continue;
      }
      const li = /^\s*[-*]\s+(.*)$/.exec(raw);
      if (li) {
        if (!inList) {
          out.push("<ul>");
          inList = true;
        }
        out.push(`<li>${inline(li[1])}</li>`);
        continue;
      }
      closeList();
      if (raw.trim() === "" || /^---+$/.test(raw.trim())) continue;
      out.push(`<p>${inline(raw)}</p>`);
    }
    closeList();
    if (inCode) out.push("</code></pre>");
    return out.join("\n");
  }

  // ── masthead stat-strip ─────────────────────────────────────────────────────────────────────
  async function refreshStatus() {
    const s = await getJson("/api/status");
    if (s.__error) return;
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    };
    set("stat-runs", s.runs ?? 0);
    set("stat-audit", s.audit_lines ?? 0);
    set("stat-brain", s.brain_notes ?? 0);
    set("stat-gaps", s.gaps_open ?? 0);
  }

  // ── view 1: Brain Browser ─────────────────────────────────────────────────────────────────────
  async function viewBrain() {
    stage.innerHTML = `<div class="spinner">loading the brain&hellip;</div>`;
    const data = await getJson("/api/brain");
    if (data.__error || !data.files || data.files.length === 0) {
      stage.innerHTML =
        `<h2 class="view-title">Brain Browser</h2>` +
        emptyState("the brain is empty", data.__error || "no brain/*.md found");
      return;
    }
    const graph = renderGraph(data.files, data.edges || []);
    const search = `
      <div class="searchbar">
        <input type="search" id="brain-q" placeholder="search penny's brain (BM25 over brain/) — e.g. idempotency one transaction" />
        <button class="go" id="brain-go">Search</button>
      </div>`;
    const list = data.files
      .map(
        (f) => `
      <div class="hit" data-file="${esc(f.file)}" style="cursor:pointer">
        <div class="hit-head">
          <span class="hit-file">${esc(f.file)}</span>
          ${f.core ? '<span class="chip ok">&#9679; core</span>' : '<span class="chip skip">nav</span>'}
          <span class="hit-score">${(f.bytes / 1024).toFixed(1)} KB &middot; ${f.links.length} links</span>
        </div>
        <div class="hit-snip">${esc(f.summary || f.title)}</div>
      </div>`,
      )
      .join("");
    stage.innerHTML = `
      <h2 class="view-title">Brain Browser</h2>
      <p class="view-sub">penny's six expertise artifacts — the field-tested opinions, pitfalls, scenarios, and the JTBD map. Click a note to read it; search runs BM25 over the brain (the same engine as <code>penny explain</code>).</p>
      <div class="graph-wrap">${graph}</div>
      ${search}
      <div id="brain-results"></div>
      <div id="brain-list">${list}</div>`;

    // file click → render the markdown; node click → same.
    const openFile = async (file) => {
      const res = document.getElementById("brain-results");
      res.innerHTML = `<div class="spinner">loading ${esc(file)}&hellip;</div>`;
      const doc = await getJson("/api/brain/file?f=" + encodeURIComponent(file));
      if (doc.__error || !doc.markdown) {
        res.innerHTML = emptyState("could not load", file);
        return;
      }
      res.innerHTML = `<div class="panel full"><div class="md">${renderMarkdown(doc.markdown)}</div></div>`;
      res.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    stage.querySelectorAll("#brain-list .hit").forEach((el) =>
      el.addEventListener("click", () => openFile(el.dataset.file)),
    );
    stage.querySelectorAll(".graph-node").forEach((el) =>
      el.addEventListener("click", () => openFile(el.dataset.file)),
    );

    const runSearch = async () => {
      const q = document.getElementById("brain-q").value.trim();
      const res = document.getElementById("brain-results");
      if (!q) {
        res.innerHTML = "";
        return;
      }
      res.innerHTML = `<div class="spinner">searching&hellip;</div>`;
      const data2 = await getJson("/api/brain/search?q=" + encodeURIComponent(q));
      res.innerHTML = renderHits(data2, q);
    };
    document.getElementById("brain-go").addEventListener("click", runSearch);
    document.getElementById("brain-q").addEventListener("keydown", (e) => {
      if (e.key === "Enter") runSearch();
    });
  }

  function renderHits(data, q) {
    if (data.__error) return emptyState("search failed", data.__error);
    if (!data.hits || data.hits.length === 0)
      return `<div class="panel full"><p class="muted">No brain hits for &ldquo;${esc(q)}&rdquo;.</p></div>`;
    return (
      `<div class="panel full"><h3>Brain hits for &ldquo;${esc(q)}&rdquo;</h3>` +
      data.hits
        .map(
          (h) => `
        <div class="hit">
          <div class="hit-head"><span class="hit-file">${esc(h.file)}</span><span class="hit-score">score ${esc(h.score)}</span></div>
          <div class="hit-snip">${esc((h.snippet || "").slice(0, 600))}</div>
        </div>`,
        )
        .join("") +
      `</div>`
    );
  }

  // a simple radial layout of the brain notes + their wikilink edges (no force sim — deterministic).
  function renderGraph(files, edges) {
    const W = 900;
    const H = 240;
    const cx = W / 2;
    const cy = H / 2;
    const R = 95;
    const pos = new Map();
    files.forEach((f, i) => {
      const a = (i / files.length) * Math.PI * 2 - Math.PI / 2;
      pos.set(f.file, { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * (R - 10) });
    });
    const edgeSvg = edges
      .map((e) => {
        const a = pos.get(e.from);
        const b = pos.get(e.to);
        if (!a || !b) return "";
        return `<line class="graph-edge" x1="${a.x.toFixed(0)}" y1="${a.y.toFixed(0)}" x2="${b.x.toFixed(0)}" y2="${b.y.toFixed(0)}" />`;
      })
      .join("");
    const nodeSvg = files
      .map((f) => {
        const p = pos.get(f.file);
        const label = f.file.replace(/\.md$/, "").replace(/^MOC - /, "");
        return `<g class="graph-node ${f.core ? "core" : ""}" data-file="${esc(f.file)}">
          <circle cx="${p.x.toFixed(0)}" cy="${p.y.toFixed(0)}" r="7" />
          <text x="${p.x.toFixed(0)}" y="${(p.y + (p.y < cy ? -12 : 20)).toFixed(0)}" text-anchor="middle">${esc(label.slice(0, 22))}</text>
        </g>`;
      })
      .join("");
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="brain wikilink graph">${edgeSvg}${nodeSvg}</svg>`;
  }

  // ── view 2: Run Log ───────────────────────────────────────────────────────────────────────────
  async function viewRuns() {
    stage.innerHTML = `<div class="spinner">loading the run log&hellip;</div>`;
    const data = await getJson("/api/runs?last=200");
    if (data.__error) {
      stage.innerHTML = `<h2 class="view-title">Run Log</h2>` + emptyState("could not read the log", data.__error);
      return;
    }
    const rows = (data.rows || []).slice().reverse(); // newest first
    const audits = data.audits || [];
    const auditTs = new Set(audits.map((a) => a.ts));
    const runTable = rows.length
      ? `<table>
          <thead><tr><th>time</th><th>command</th><th>model</th><th class="num">ms</th><th class="num">exit</th></tr></thead>
          <tbody>${rows
            .map(
              (r) => `<tr class="${r.auditId || auditTs.has(r.ts) ? "money" : ""}">
                <td class="mono">${esc((r.ts || "").replace("T", " ").slice(0, 19))}</td>
                <td><strong>${esc(r.command)}</strong></td>
                <td class="muted">${esc(r.model || "$0 deterministic")}</td>
                <td class="num">${esc(r.durationMs ?? "")}</td>
                <td class="num">${r.exitCode === 0 ? '<span class="chip ok">&#9679; 0</span>' : `<span class="chip fail">&#9679; ${esc(r.exitCode)}</span>`}</td>
              </tr>`,
            )
            .join("")}</tbody>
        </table>`
      : emptyState("no runs yet", "run a penny command — every invocation appends one line here");

    // the money-action audit trail — highlighted (the ledger-is-truth law, BRAND.md).
    const auditCard = audits.length
      ? `<div class="panel full">
          <h3>Money-action audit trail &mdash; the ledger is the truth</h3>
          <p class="view-sub">Every action that <em>would</em> move money (issue-SPT, reconcile-divergence) writes an append-only audit line. This is the ledger-is-truth law applied to penny's own telemetry.</p>
          <table>
            <thead><tr><th>time</th><th>action</th><th>brain ref</th><th>id</th></tr></thead>
            <tbody>${audits
              .slice()
              .reverse()
              .map(
                (a) => `<tr class="money">
                  <td class="mono">${esc((a.ts || "").replace("T", " ").slice(0, 19))}</td>
                  <td><strong>${esc(a.action)}</strong></td>
                  <td class="mono">${esc(a.brainRef || "")}</td>
                  <td class="mono muted">${esc(String(a.id || "").slice(0, 8))}</td>
                </tr>`,
              )
              .join("")}</tbody>
          </table>
        </div>`
      : `<div class="panel full"><h3>Money-action audit trail</h3><p class="muted">No money-relevant actions yet &mdash; <code>penny issue-spt</code> / reconcile-divergence write here.</p></div>`;

    stage.innerHTML = `
      <h2 class="view-title">Run Log</h2>
      <p class="view-sub">Every <code>penny</code> invocation, newest first (model · duration · exit). Rows that took a money-relevant action are highlighted, and broken out below as the append-only audit trail. Total runs: ${esc(data.total ?? rows.length)}.</p>
      ${auditCard}
      <div class="panel full" style="margin-top:var(--s5)"><h3>All runs</h3>${runTable}</div>`;
  }

  // ── view 3: Eval Scores ───────────────────────────────────────────────────────────────────────
  async function viewEvals() {
    stage.innerHTML = `<div class="spinner">running the eval pyramid&hellip; (this shells out — a few seconds)</div>`;
    const data = await getJson("/api/eval");
    if (data.__error) {
      stage.innerHTML = `<h2 class="view-title">Eval Scores</h2>` + emptyState("eval failed", data.__error);
      return;
    }
    const a = data.acceptance || {};
    const badge = `
      <div class="accept-badge ${esc(a.status)}">
        <span class="dotlight"></span>
        ${a.status === "wired" ? "Acceptance test: WIRED &amp; red-blocking in CI" : a.status === "missing" ? "Acceptance test: MISSING" : "Acceptance test"}
      </div>
      <p class="view-sub" style="margin-top:var(--s3)">${esc(a.note || "")}</p>`;

    const levelCard = (title, sub, lvl) => {
      if (!lvl || !lvl.ran) {
        return `<div class="panel full"><h3>${esc(title)}</h3><p class="muted">${esc((lvl && lvl.note) || "not run")}</p></div>`;
      }
      const head =
        lvl.f1 != null || lvl.kappa != null
          ? `<span class="chip ${lvl.pass ? "ok" : "fail"}">&#9679; ${lvl.pass ? "PASS" : "FAIL"}</span> ` +
            (lvl.f1 != null ? `F1 ${lvl.f1.toFixed(3)} ` : "") +
            (lvl.kappa != null ? `&kappa; ${lvl.kappa.toFixed(3)}` : "")
          : `<span class="chip ${lvl.pass ? "ok" : "fail"}">&#9679; ${lvl.pass ? "PASS" : "FAIL"}</span>`;
      const tasks = (lvl.tasks || [])
        .map((t) => {
          const ok = t.ok != null ? t.ok : t.agreed === t.total;
          const label = t.ok != null ? (ok ? "pass" : "fail") : `${t.agreed}/${t.total}`;
          return `<div class="gt ${ok ? "ok" : "fail"}"><span class="gt-id">${esc(t.task)}</span><span class="gt-state">${esc(label)}</span></div>`;
        })
        .join("");
      const body = tasks
        ? `<div class="gt-grid">${tasks}</div>`
        : `<p class="muted">judged as a calibrated aggregate over the golden set (no per-task split) &mdash; see &kappa; above.</p>`;
      return `<div class="panel full"><h3>${esc(title)} &nbsp; ${head}</h3><p class="view-sub">${esc(sub)}</p>${body}</div>`;
    };

    stage.innerHTML = `
      <h2 class="view-title">Eval Scores</h2>
      <p class="view-sub">penny's Hamel pyramid (PLAN §6). L1 is the merge-blocking $0 floor; L2 is binary behavioral gates (F1&ge;0.8 / &kappa;&ge;0.6); L3 is the calibrated trajectory judge (PR + nightly). The acceptance test is the operational spine on top &mdash; it always blocks.</p>
      <div class="panel full" style="margin-bottom:var(--s5)">${badge}</div>
      ${levelCard("L1 — pure $0 assertions", "GT-1 raw-body · GT-2 shape-contract (headline) · GT-3 tax-flip · GT-4 mode-pin. No live API.", data.l1)}
      ${levelCard("L2 — binary behavioral gates", "GT-5 crash-double-fulfill · GT-6 reordered webhook · GT-7 grace-period · GT-8 metered drop · GT-9 trial anchor.", data.l2)}
      ${levelCard("L3 — calibrated trajectory judge", "GT-10 scoped SPT (flagship) · GT-11 upgrade rollback · GT-12 bill-shock · GT-13 migration cutover. Not merge-blocking.", data.l3)}`;
  }

  // ── view 4: Ask the Employee ──────────────────────────────────────────────────────────────────
  function viewAsk() {
    stage.innerHTML = `
      <h2 class="view-title">Ask the Employee</h2>
      <p class="view-sub">Ask penny anything about Stripe billing. The answer is the keyless BM25 search over penny's brain (the same engine as <code>penny explain</code>) &mdash; penny cites the O-/P-/S-/JTBD ref, never its own confidence.</p>
      <div class="searchbar">
        <input type="text" id="ask-q" placeholder="e.g. how do I stop a webhook double-fulfilling on a crash?" />
        <button class="go" id="ask-go">Ask</button>
      </div>
      <div id="ask-results"></div>`;
    const run = async () => {
      const q = document.getElementById("ask-q").value.trim();
      const res = document.getElementById("ask-results");
      if (!q) return;
      res.innerHTML = `<div class="spinner">penny is checking the brain&hellip;</div>`;
      const data = await getJson("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: q }),
      });
      res.innerHTML = renderHits(data, q);
    };
    document.getElementById("ask-go").addEventListener("click", run);
    document.getElementById("ask-q").addEventListener("keydown", (e) => {
      if (e.key === "Enter") run();
    });
  }

  // ── view 5: Gaps Tracker ──────────────────────────────────────────────────────────────────────
  async function viewGaps() {
    stage.innerHTML = `<div class="spinner">loading the gaps tracker&hellip;</div>`;
    const data = await getJson("/api/gaps");
    if (data.__error) {
      stage.innerHTML = `<h2 class="view-title">Gaps Tracker</h2>` + emptyState("could not read GAPS", data.__error);
      return;
    }
    const items = data.open || [];
    const list = items.length
      ? items
          .map(
            (g) => `
        <div class="gap-item">
          <div class="gap-box" aria-hidden="true"></div>
          <div class="gap-body">
            <div><span class="gap-id">${esc(g.id)}</span> <span class="gap-title">${esc(g.title)}</span>${g.highValue ? '<span class="gap-hi">HIGH VALUE</span>' : ""}</div>
            <div class="gap-why">${esc(g.why)}</div>
          </div>
        </div>`,
          )
          .join("")
      : emptyState("all gaps closed", "penny has resolved every open dispute — the brain is fully grounded");
    stage.innerHTML = `
      <h2 class="view-title">Gaps Tracker</h2>
      <p class="view-sub">The open items in <code>brain/GAPS-AND-DISPUTES.md</code> Part B &mdash; the things penny does not yet know for sure, each with a live test-mode resolution path. The nightly RSI loop closes these one at a time; <strong>this list shrinking is the visible measure of penny getting smarter</strong>. Open now: ${esc(data.count ?? items.length)}.</p>
      <div class="panel full">${list}</div>`;
  }

  // ── router ────────────────────────────────────────────────────────────────────────────────────
  const VIEWS = { brain: viewBrain, runs: viewRuns, evals: viewEvals, ask: viewAsk, gaps: viewGaps };

  function show(view) {
    railButtons.forEach((b) => b.setAttribute("aria-current", b.dataset.view === view ? "true" : "false"));
    (VIEWS[view] || viewBrain)();
  }

  railButtons.forEach((b) => b.addEventListener("click", () => show(b.dataset.view)));

  // keyboard: "/" focuses the active search box; Esc returns to the brain view.
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !/input|textarea/i.test(document.activeElement.tagName)) {
      const box = document.querySelector('input[type="search"], #ask-q');
      if (box) {
        e.preventDefault();
        box.focus();
      }
    } else if (e.key === "Escape") {
      show("brain");
    }
  });

  // boot
  refreshStatus();
  show("brain");
})();
