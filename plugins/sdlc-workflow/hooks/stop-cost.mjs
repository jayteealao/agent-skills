#!/usr/bin/env node
// hooks/stop-cost.mjs — Codex Stop adapter for the exact cost ledger
// (WIDE-VIEW-REPAIR-PLAN §10). Host adapter only: read the Codex event, add the
// plugin-data dir (the cursor's home under Codex), and run the SAME bundled
// policy Claude Code runs — dist/cost-ledger.mjs — with SDLC_HOST=codex. The
// bundle locates the rollout by session id when the event names no
// transcript_path. Never blocks; never prints a decision.

import {
  findProjectRoot,
  parseHookArgs,
  readEvent,
  resolveLayout,
  runBundled,
} from './_adapter.mjs';

function main() {
  const args = parseHookArgs();
  const layout = resolveLayout(args);
  const event = readEvent();
  if (!event || !event.session_id) return;
  const cwd = findProjectRoot(event.cwd);
  runBundled(layout.runtimeRoot, 'cost-ledger', { ...event, cwd, sdlc_plugin_data: layout.pluginData }, {
    cwd,
    timeoutMs: 15000,
  });
}

try { main(); } finally { process.exit(0); }
