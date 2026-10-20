# penny — LEARNINGS (append-only)

Every error → root cause → rule. Auto-compressed when >500 lines (memory-compress.sh).

## 2026-10-19 · CP158 standard pass

- **The `penny-mcp` bin never booted when installed by npm.** `isMain` compared `import.meta.url` with
  `process.argv[1]`, which is the `node_modules/.bin` symlink, so the server exited silently. Rule: resolve
  `argv[1]` with `realpathSync` before the comparison, and prove a bin through `npx`, never only with
  `node dist/...`.
- **A git install needs `dist/` built and shipped.** `files` lists `dist/`, so a `prepare: tsc` build survives
  packing. Runtime folders must be in `files` too: `brain/`, `scripts/memory-search.sh` and `src/cockpit/`, or
  `penny explain` and `penny cockpit` fail for anyone who installs from GitHub.
- **Plugin hooks cannot point at `.claude/settings.json`.** Its commands use `$CLAUDE_PROJECT_DIR`, which is the
  user's project for a plugin, so the scripts were not found there. Rule: plugin hooks live in
  `hooks/hooks.json` and use `${CLAUDE_PLUGIN_ROOT}`; logs go to `${CLAUDE_PLUGIN_DATA}`.
- **`dsip.json` must use DSIP's own words.** `selection: "eval-gated"` made `darwin-check` report L0 INVALID.
  Rule: selection is performance, novelty or performance-novelty; snapback granularity is skill, employee or
  company. Run `node ~/darwin/bin/darwin-check.mjs dsip.json` after any edit.
- **A proposal that dies with the runner is not a proposal.** The nightly loop wrote `.rsi/proposed/` on the
  runner and lost it. Rule: upload it as an artifact for a person to review.
