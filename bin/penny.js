#!/usr/bin/env node
// penny CLI entrypoint (A0 skeleton stub — B2 fills the command tree).
// Once `src/cli/index.ts` is built (`pnpm build` -> dist/), this forwards to it.
// Until then it prints a build hint and exits non-zero so callers see an honest state.

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const built = join(here, "..", "dist", "cli", "index.js");

if (existsSync(built)) {
  await import(built);
} else {
  process.stderr.write(
    "penny: CLI not built yet. Run `pnpm install && pnpm build` (B2 wires the command tree).\n",
  );
  process.exit(1);
}
