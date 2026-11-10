// lib/hook-runner.mjs — one process per tool event.
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
// are deleted one release after the fold.

import { basename } from 'node:path';
import { loadConfig } from './config.mjs';
import { logError } from './error-log.mjs';
import { errorsLogPath } from './home.mjs';
import { beginSystemMessages, flushSystemMessages, outputSystemMessage, projectRootFromInput } from './hook-utils.mjs';
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
 * Refuse a write that failed a gate, as the checks mode says. `strict` writes the
 * reason to stderr and blocks. `warn` shows the same reason as a warning, and the
 * write stands.
 */
export function refuseWrite(mode, reason) {
  if (mode === 'warn') {
    outputSystemMessage(`${reason.trimEnd()}\n(checks: warn, so the write stands.)`);
    return;
  }
  process.stderr.write(`${reason.trimEnd()}\nFix the write. Only the person decides to set checks: warn in .ai/sdlc-config.json, which lets such a write stand with a warning; an agent does not change that setting itself.\n`);
  blockToolCall();
}

// The checks of one tool event share its project root and its config. Each is read once per
// payload: the root can cost a git process, and on a busy Windows machine a git process takes
// a second or more. The key is the payload object and the directory it names, so a caller that
// changes either gets a fresh read.
const contextMemo = new WeakMap();
function contextOf(input) {
  const key = input && typeof input === 'object' ? input : null;
  const dir = `${key?.cwd ?? ''}`;
  let byDir = key ? contextMemo.get(key) : null;
  if (!byDir && key) contextMemo.set(key, (byDir = new Map()));
  let ctx = byDir?.get(dir);
  if (!ctx) {
    ctx = {};
    byDir?.set(dir, ctx);
  }
  return ctx;
}

/** The project root of a hook payload, resolved once per payload. */
export function hookProjectRoot(input) {
  const ctx = contextOf(input);
  if (!('root' in ctx)) ctx.root = projectRootFromInput(input ?? {});
  return ctx.root;
}

/** The config of the project of a hook payload, loaded once per payload. */
export function hookConfig(input) {
  const ctx = contextOf(input);
  if (!ctx.config) ctx.config = loadConfig(hookProjectRoot(input));
  return ctx.config;
}

/**
 * True when no write-path hook may run: a bulk plugin install, or an
 * external-model dispatch whose writes are not SDLC artifacts.
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
 * The refusal of a gate that failed: it names the hook, the error, and where the log of it is.
 * Pure but for the default log path, so a test can read it.
 */
export function hookFailedMessage(name, what, err, logPath = errorsLogPath()) {
  return `${name}: the hook ${what} (${err?.message ?? err}), so it blocks this tool call.\n`
    + `To see why: the error and its stack are in ${logPath}, and in .ai/_view/.hook-errors.log of a project that runs workflows.\n`
    + 'Show the person that error. The person repairs the plugin install, or sets checks: off in .ai/sdlc-config.json; an agent does not change that setting itself.\n';
}

/**
 * Read the payload once, run the stages `plan(input)` returns
 * (`[[label, run, opts?], …]`), flush systemMessages, return the exit code.
 * A HookBlock → 2 (stop when `stopOnBlock`); any other error is logged and the
 * stage counts as passed — an advisory check that breaks must not break a tool call.
 * A stage with `{ failClosed: true }` is a gate: its error also blocks, because a gate
 * that cannot run must not pass the write. With `inputFailClosed`, a payload that cannot be
 * read blocks too, for the same reason: the gates of that process cannot run on it.
 */
export async function runStages(label, plan, { stopOnBlock = false, inputFailClosed = false } = {}) {
  let input;
  try {
    input = await readStdinJson();
  } catch (err) {
    await safeLog(label, err);
    if (!inputFailClosed) return 0;
    process.stderr.write(hookFailedMessage(label, 'could not read the tool call', err));
    return 2;
  }
  let stages = [];
  try {
    stages = plan(input) ?? [];
  } catch (err) {
    await safeLog(label, err);
  }
  beginSystemMessages();
  let code = 0;
  for (const [name, run, { failClosed = false } = {}] of stages) {
    try {
      await run(input);
    } catch (err) {
      const blocked = err instanceof HookBlock;
      if (!blocked) await safeLog(name, err);
      if (!blocked && failClosed) process.stderr.write(hookFailedMessage(name, 'failed', err));
      if (blocked || failClosed) {
        code = 2;
        if (stopOnBlock) break;
      }
    }
  }
  flushSystemMessages();
  return code;
}

/** The single-purpose entry: one check, one process. */
export async function runStandalone(label, run, { failClosed = false, inputFailClosed = false } = {}) {
  if (hookSuppressed()) process.exit(0);
  process.exit(await runStages(label, () => [[label, run, { failClosed }]], { stopOnBlock: true, inputFailClosed }));
}

/** The per-event entry: every check the payload selects, one process. */
export async function runFolded(label, plan, opts = {}) {
  if (hookSuppressed()) process.exit(0);
  process.exit(await runStages(label, plan, opts));
}
