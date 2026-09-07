// lib/hook-runner.mjs — one process per tool event (WIDE-VIEW-REPAIR-PLAN §14.2.6).
//
// Every write-path hook exports `run(input)` and does its own work on an
// already-parsed payload. Two runners drive those functions:
//
//   runStandalone(label, run)  — the single-purpose entry (hooks/<name>.mjs):
//                                read stdin once, run one check, exit.
//   runFolded(label, plan)     — the per-event entry (hooks/pre-tool-use-all.mjs,
//                                hooks/post-tool-use-all.mjs): read stdin once,
//                                run every check the payload shape selects, exit.
//
// A check blocks the tool call by writing its reason to stderr and calling
// `blockToolCall()`, which throws `HookBlock`. The runner turns that into exit 2.
// PreToolUse stops at the first block (the host denies the call either way);
// PostToolUse keeps going so the render enqueue still happens after a verify
// block — the behaviour the three separate PostToolUse processes had.
//
// systemMessage output is buffered for the whole process and flushed as ONE
// JSON line: a host parses stdout as a single JSON object, so two checks that
// each printed their own line would have produced unparseable output.
//
// `isEntry(name)` keeps the single-purpose scripts importable: their module-level
// `main()` runs only when the process argv names that script, so the folded
// bundle can import them without re-running each one. The standalone entries
// are deleted one release after the fold (plan §14.2.6 step 4).

import { basename } from 'node:path';
import { logError } from './error-log.mjs';
import { beginSystemMessages, flushSystemMessages } from './hook-utils.mjs';
import { readStdinJson } from './stdin.mjs';

export class HookBlock extends Error {
  constructor() {
    super('tool call blocked by a hook');
    this.name = 'HookBlock';
  }
}

/** Throw the block sentinel. Write the reason to stderr before calling this. */
export function blockToolCall() {
  throw new HookBlock();
}

/**
 * True when no write-path hook may run: a bulk plugin install, or an
 * external-model dispatch whose writes are not SDLC artifacts
 * (EXTERNAL-MODEL-DISPATCH-PLAN §3.1).
 */
export function hookSuppressed(env = process.env) {
  return env.CLAUDE_PLUGIN_INSTALL === '1' || env.SDLC_DISPATCH_ACTIVE === '1';
}

/**
 * True when process.argv names one of the given scripts (basename, with or
 * without `.mjs`). Under esbuild bundling every inlined module shares the
 * bundle's `import.meta.url`, so argv — not the module URL — decides which
 * standalone `main()` runs.
 */
export function isEntry(...names) {
  const entry = process.argv[1];
  if (!entry) return false;
  const base = basename(entry);
  return names.some((n) => base === n || base === `${n}.mjs`);
}

async function safeLog(label, err) {
  try { await logError(label, err); } catch { /* never on the critical path */ }
}

/**
 * Read the payload once, run the stages `plan(input)` returns
 * (`[[label, run], …]`), flush systemMessages, return the exit code.
 * A HookBlock → 2 (stop when `stopOnBlock`); any other error is logged and the
 * stage counts as passed — hook infrastructure must never break a tool call.
 */
export async function runStages(label, plan, { stopOnBlock = false } = {}) {
  let input;
  try {
    input = await readStdinJson();
  } catch (err) {
    await safeLog(label, err);
    return 0;
  }
  let stages = [];
  try {
    stages = plan(input) ?? [];
  } catch (err) {
    await safeLog(label, err);
  }
  beginSystemMessages();
  let code = 0;
  for (const [name, run] of stages) {
    try {
      await run(input);
    } catch (err) {
      if (err instanceof HookBlock) {
        code = 2;
        if (stopOnBlock) break;
      } else {
        await safeLog(name, err);
      }
    }
  }
  flushSystemMessages();
  return code;
}

/** The single-purpose entry: one check, one process. */
export async function runStandalone(label, run) {
  if (hookSuppressed()) process.exit(0);
  process.exit(await runStages(label, () => [[label, run]], { stopOnBlock: true }));
}

/** The per-event entry: every check the payload selects, one process. */
export async function runFolded(label, plan, opts = {}) {
  if (hookSuppressed()) process.exit(0);
  process.exit(await runStages(label, plan, opts));
}
