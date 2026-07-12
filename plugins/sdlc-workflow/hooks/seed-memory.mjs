#!/usr/bin/env node
/**
 * hooks/seed-memory.mjs — SessionStart entrypoint that seeds the `/wf` rules
 * kernel into the agent memory files (MEMORY-SEED-PLAN).
 *
 * Bundled to dist/seed-memory.mjs and invoked on BOTH hosts (the parity rule —
 * same bytes run everywhere): Claude runs it directly from hooks.json; the native
 * Codex SessionStart hook runs it from runtime/dist/. All the real work is the
 * fail-open seedMemoryKernel; this entrypoint is just stdin → config → seed →
 * one-time notice.
 *
 * The notice is a user-facing `systemMessage`, emitted only on Claude: Codex's
 * native notice channel is model-facing additionalContext, and a committed-file
 * write is self-documenting via the fence comment, so on Codex the seed runs
 * silently. Host is detected by the runtime path (the Codex copy lives under
 * sdlc-workflow-codex/runtime/dist/).
 */

import { loadConfig } from '../lib/config.mjs';
import { logError } from '../lib/error-log.mjs';
import { outputSystemMessage, projectRootFromInput } from '../lib/hook-utils.mjs';
import { seedMemoryKernel } from '../lib/memory-seed.mjs';
import { readStdinJson } from '../lib/stdin.mjs';

const ON_CODEX = import.meta.url.includes('sdlc-workflow-codex');

async function main() {
  if (process.env.CLAUDE_PLUGIN_INSTALL === '1') return;
  // A dispatched read-only sub-agent (consult skill) boots a session in this repo
  // and must not seed. Same isolation sentinel session-start-orient honors.
  if (process.env.SDLC_DISPATCH_ACTIVE === '1') return;
  if (process.env.SDLC_DISABLE_MEMORY_SEED === '1') return;

  const input = await readStdinJson();
  const projectRoot = projectRootFromInput(input);
  const config = await loadConfig(projectRoot);
  const result = seedMemoryKernel(projectRoot, config);

  if (result.notice && !ON_CODEX) outputSystemMessage(result.notice);
}

main().catch(async (err) => {
  try {
    await logError('seed-memory', err);
  } catch {
    // ignore logging failures — seeding must never break session start
  }
  process.exit(0);
});
