#!/usr/bin/env node
// hooks/answer-codex.mjs — Codex PostToolUse adapter on request_user_input. Host adapter only:
// read the Codex event and run the SAME policy Claude Code runs — hooks/answer-event.mjs — with
// SDLC_HOST=codex. Never blocks; never prints a decision.

import { findProjectRoot, parseHookArgs, readEvent, resolveLayout, runPolicy } from './_adapter.mjs';

function main() {
  const layout = resolveLayout(parseHookArgs());
  const event = readEvent();
  if (!event) return;
  const cwd = findProjectRoot(event.cwd);
  runPolicy(layout.runtimeRoot, 'answer-event', { ...event, cwd }, { cwd, timeoutMs: 8000 });
}

try { main(); } finally { process.exit(0); }
