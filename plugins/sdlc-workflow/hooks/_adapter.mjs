// hooks/_adapter.mjs — native Codex hook adapter layer.
//
// Wired by hooks/codex.hooks.json — the hooks file .codex-plugin/plugin.json
// declares. Codex never reads hooks/hooks.json (the Claude Code wiring). Host
// payload → host adapter → normalized event → shared policy. This module is the
// host adapter. It parses a Codex hook event off stdin, determines the final
// touched files (apply_patch / Edit / Write), and reshapes them into the SHARED
// normalized event — exactly the stdin contract the shared policy
// entrypoints already consume (`{ cwd, tool_input:{ file_path, edits[] } }`,
// read by hooks/{pre-write-validate,post-write-verify,post-write-auto-stage}.mjs
// via projectRootFromInput + collectToolInputPaths).
// The plugin root IS the runtime root: one tree, and the hooks run from the source.
//
// Reusing those entrypoints — rather than re-implementing validation —
// is what guarantees Claude/Codex parity: the SAME source runs the schema
// and auto-stage policy on both hosts. The Codex-native part is only the adapter
// (stdin parsing, apply_patch parsing, the Stop enforcement boundary) — never
// the policy itself.

import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── stdin / argv ──────────────────────────────────────────────────────────────

/**
 * Opt-in raw-payload capture. Codex
 * rollout JSONL never records hook executions, so when event delivery breaks
 * (the Desktop PostToolUse gap) there is nothing on disk to diagnose. With
 * SDLC_HOOK_DEBUG=1 in the env — or a `hook-debug` flag file in PLUGIN_DATA —
 * every readEvent() appends one line to PLUGIN_DATA/hook-debug.jsonl: which
 * hook script ran, how many stdin bytes arrived, the parsed top-level keys,
 * and the raw payload. Best-effort and off the critical path: a capture
 * failure never affects the hook, and with neither switch set the cost is one
 * existsSync.
 */
function captureHookDebug(rawText, parsed) {
  try {
    const { pluginData } = resolveLayout(parseHookArgs());
    if (process.env.SDLC_HOOK_DEBUG !== '1' && !existsSync(join(pluginData, 'hook-debug'))) return;
    mkdirSync(pluginData, { recursive: true });
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      hookScript: process.argv[1] ?? null,
      rawStdinLength: rawText == null ? null : rawText.length,
      parsedKeys: parsed && typeof parsed === 'object' ? Object.keys(parsed) : null,
      hook_event_name: parsed?.hook_event_name ?? null,
      tool_name: parsed?.tool_name ?? null,
      raw: rawText ?? null,
    });
    appendFileSync(join(pluginData, 'hook-debug.jsonl'), `${line}\n`, 'utf-8');
  } catch { /* never on the critical path */ }
}

/** Read + parse the single JSON event Codex writes to the hook's stdin. */
export function readEvent() {
  let text = null;
  let parsed = null;
  try {
    text = readFileSync(0, 'utf-8');
    if (text && text.trim()) parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  captureHookDebug(text, parsed);
  return parsed;
}

/** Parse `--plugin-root` / `--plugin-data` (substituted by Codex in hooks.json). */
export function parseHookArgs(argv = process.argv.slice(2)) {
  const out = { pluginRoot: null, pluginData: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--plugin-root') out.pluginRoot = argv[++i];
    else if (argv[i] === '--plugin-data') out.pluginData = argv[++i];
  }
  return out;
}

/**
 * Resolve the package + runtime layout from the (Codex-substituted) plugin root.
 * In the single-source tree the plugin root IS the runtime root: the policy
 * entrypoints are at <pluginRoot>/hooks/<name>.mjs. `runtimeRoot` keeps
 * its name so the hooks read the same way they did when the payload lived
 * under runtime/.
 * PLUGIN_DATA is the Codex-plugin-local writable dir; fall back to
 * <pluginRoot>/.plugin-data so manual/test runs without the substitution work.
 */
export function resolveLayout({ pluginRoot, pluginData } = {}) {
  const root = resolve(pluginRoot ? pluginRoot : fileURLToPath(new URL('..', import.meta.url)));
  const runtimeRoot = root;
  return {
    pluginRoot: root,
    runtimeRoot,
    pluginData: pluginData ? resolve(pluginData) : join(root, '.plugin-data'),
  };
}

export function policyEntry(runtimeRoot, name) {
  return join(runtimeRoot, 'hooks', `${name}.mjs`);
}

/**
 * Env for every shared-runtime spawn from a Codex hook. `SDLC_HOST` is THE host
 * signal: the shared runtime reads it for the
 * seed-memory notice channel and the lifecycle log. An explicit caller
 * `SDLC_HOST` wins so tests and escape hatches can override.
 */
export function codexHostEnv(base = process.env) {
  return { ...base, SDLC_HOST: base.SDLC_HOST || 'codex' };
}

/**
 * Spawn a shared policy entrypoint with `stdin` (an object,
 * JSON-encoded) on its stdin. Synchronous so the serialized dispatcher stays
 * sequential. Returns `{ status, stdout, stderr, timedOut }`. Never throws.
 */
export function runPolicy(runtimeRoot, name, stdin, { cwd, timeoutMs = 12000 } = {}) {
  const r = spawnSync(process.execPath, [policyEntry(runtimeRoot, name)], {
    input: JSON.stringify(stdin ?? {}),
    cwd: cwd || process.cwd(),
    encoding: 'utf-8',
    timeout: timeoutMs,
    windowsHide: true,
    env: codexHostEnv(),
  });
  return {
    status: typeof r.status === 'number' ? r.status : (r.signal ? 1 : 0),
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    timedOut: r.error?.code === 'ETIMEDOUT' || Boolean(r.signal === 'SIGTERM' && r.error),
  };
}

// ── touched files ──────────────────────────────────────────────────────────────

/**
 * Determine the final touched files from a Codex tool event. Handles:
 *   - Write / Edit / MultiEdit-shaped tool_input (file_path / edits[].file_path)
 *   - apply_patch (parse the patch envelope for Add/Update/Delete/Move paths)
 * Returns `[{ path, content }]` (content present only for full-file Add writes,
 * used by best-effort pre-tool validation). Paths are repo-relative or absolute
 * exactly as the event carried them — the shared policy resolves them vs cwd.
 */
export function touchedFromEvent(event) {
  const ti = event?.tool_input ?? {};
  const out = [];
  const push = (path, content) => {
    if (typeof path === 'string' && path) out.push({ path, content });
  };

  if (typeof ti.file_path === 'string') push(ti.file_path, typeof ti.content === 'string' ? ti.content : undefined);
  if (Array.isArray(ti.edits)) for (const e of ti.edits) push(e?.file_path);

  // apply_patch: the patch text may live under several field names depending on
  // how Codex serializes it; also accept a bare-string tool_input.
  const patchText =
    (typeof ti.input === 'string' && ti.input) ||
    (typeof ti.patch === 'string' && ti.patch) ||
    (typeof ti.changes === 'string' && ti.changes) ||
    (typeof event?.tool_input === 'string' && event.tool_input) ||
    null;
  if (patchText) for (const p of parseApplyPatch(patchText)) push(p.path, p.content);

  // Dedupe by path, preferring an entry that carries content.
  const byPath = new Map();
  for (const e of out) {
    const prev = byPath.get(e.path);
    if (!prev || (e.content != null && prev.content == null)) byPath.set(e.path, e);
  }
  return [...byPath.values()];
}

/**
 * Parse the Codex `apply_patch` envelope. Returns `[{ op, path, content? }]`.
 * `content` is the full new file body for Add operations (the lines after the
 * header, with the leading `+` stripped) so pre-tool validation can inspect a
 * brand-new managed artifact. Update/Delete carry no reconstructable full body.
 */
export function parseApplyPatch(text) {
  const lines = String(text).split(/\r?\n/);
  const ops = [];
  let cur = null;
  const flush = () => { if (cur) { if (cur.op === 'add') cur.content = cur._lines.join('\n'); delete cur._lines; ops.push(cur); cur = null; } };
  for (const line of lines) {
    let m;
    if ((m = /^\*\*\* Add File: (.+)$/.exec(line))) { flush(); cur = { op: 'add', path: m[1].trim(), _lines: [] }; }
    else if ((m = /^\*\*\* Update File: (.+)$/.exec(line))) { flush(); cur = { op: 'update', path: m[1].trim(), _lines: [] }; }
    else if ((m = /^\*\*\* Delete File: (.+)$/.exec(line))) { flush(); cur = { op: 'delete', path: m[1].trim(), _lines: [] }; }
    else if (/^\*\*\* (Begin|End) Patch\s*$/.test(line)) { flush(); }
    else if ((m = /^\*\*\* Move to: (.+)$/.exec(line))) { if (cur) cur.path = m[1].trim(); }
    else if (cur && cur.op === 'add') { cur._lines.push(line.startsWith('+') ? line.slice(1) : line); }
  }
  flush();
  return ops.filter((o) => o.path);
}

// ── normalized (shared-policy) stdin synthesis ──────────────────────────────────

/** Synthesize the stdin the multi-path policy (auto-stage + verify) consumes. */
export function synthMultiStdin(cwd, eventName, paths) {
  const list = paths.filter(Boolean);
  return {
    cwd,
    hook_event_name: eventName,
    tool_name: 'Write',
    tool_input: {
      file_path: list[0],
      edits: list.map((p) => ({ file_path: p })),
    },
  };
}

/** Synthesize the single-file stdin the validate/auto-stage consume. */
export function synthSingleStdin(cwd, eventName, path, content) {
  const ti = { file_path: path };
  if (typeof content === 'string') ti.content = content;
  return { cwd, hook_event_name: eventName, tool_name: 'Write', tool_input: ti };
}

// ── Stop-time enforcement ledger ────────────────────────────────────────────────
//
// PostToolUse cannot undo a completed apply_patch, so the enforcement boundary is
// the Stop hook (Resolution 5). Each PostToolUse appends the managed artifacts it
// verified to a per-session ledger; the Stop hook re-checks them and blocks the
// turn from ending until they are valid — with a bounded repair ceiling so a Stop
// block can't loop forever.

export const REPAIR_CEILING = 3;

function ledgerPath(pluginData, sessionId) {
  const safe = String(sessionId || 'nosession').replace(/[^A-Za-z0-9_-]/g, '_');
  return join(pluginData, 'turns', `${safe}.json`);
}

export function readLedger(pluginData, sessionId) {
  try { return JSON.parse(readFileSync(ledgerPath(pluginData, sessionId), 'utf-8')); }
  catch { return { paths: [], repairAttempts: 0 }; }
}

function writeLedger(pluginData, sessionId, ledger) {
  const p = ledgerPath(pluginData, sessionId);
  mkdirSync(join(p, '..'), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(ledger), 'utf-8');
  renameSync(tmp, p);
}

/** Record managed-artifact paths touched this turn (deduped). */
export function recordTouched(pluginData, sessionId, paths) {
  const ledger = readLedger(pluginData, sessionId);
  ledger.paths = [...new Set([...(ledger.paths || []), ...paths])];
  writeLedger(pluginData, sessionId, ledger);
  return ledger;
}

export function bumpRepairAttempt(pluginData, sessionId) {
  const ledger = readLedger(pluginData, sessionId);
  ledger.repairAttempts = (ledger.repairAttempts || 0) + 1;
  writeLedger(pluginData, sessionId, ledger);
  return ledger.repairAttempts;
}

export function clearLedger(pluginData, sessionId) {
  try { renameSync(ledgerPath(pluginData, sessionId), `${ledgerPath(pluginData, sessionId)}.done`); }
  catch { /* nothing to clear */ }
}

// ── output envelopes ────────────────────────────────────────────────────────────

export function emitAdditionalContext(eventName, text) {
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: eventName, additionalContext: text } })}\n`);
}

export function emitStopBlock(reason) {
  process.stdout.write(`${JSON.stringify({ decision: 'block', reason })}\n`);
}

/**
 * Modern PreToolUse permission envelope (hooks GA). `decision` is
 * "deny" | "allow"; "ask" is NOT supported by Codex. Callers pairing this with
 * exit 2 + stderr keep the legacy path as fallback for older CLIs.
 */
export function emitPermissionDecision(decision, reason) {
  const out = { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision } };
  if (reason) out.hookSpecificOutput.permissionDecisionReason = reason;
  process.stdout.write(`${JSON.stringify(out)}\n`);
}

/**
 * PermissionRequest resolution envelope: programmatically resolve an approval
 * prompt. Any deny wins across hooks; absence of output = no opinion.
 */
export function emitPermissionRequestDecision(behavior, message) {
  const decision = { behavior };
  if (message) decision.message = message;
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision } })}\n`);
}

// ── small host-native path helpers ──────────────────────────────────────────────

/**
 * Climb from `cwd` to the project root: the nearest ancestor holding
 * `.ai/workflows`, else the nearest `.git` toplevel, else `cwd`. Mirrors the
 * shared lib's resolveProjectRoot intent without importing it (kept host-native
 * so the adapter has no dependency on lib/).
 */
export function findProjectRoot(cwd) {
  let dir = resolve(cwd || process.cwd());
  let gitRoot = null;
  for (let i = 0; i < 40; i++) {
    if (existsSync(join(dir, '.ai', 'workflows'))) return dir;
    if (!gitRoot && existsSync(join(dir, '.git'))) gitRoot = dir;
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return gitRoot || resolve(cwd || process.cwd());
}

/**
 * True when `dir` or an ancestor (≤ 40 levels) carries `.git` (dir or worktree
 * file). The SessionStart policy: outside a checkout, nothing is set up.
 */
export function insideGitCheckout(dir) {
  let cur = resolve(dir || process.cwd());
  for (let i = 0; i < 40; i++) {
    if (existsSync(join(cur, '.git'))) return true;
    const parent = dirname(cur);
    if (parent === cur) return false;
    cur = parent;
  }
  return false;
}

/**
 * True for a managed sdlc artifact markdown path (mirrors the shared
 * isManagedArtifactMarkdownPath, incl. the project-context paths PRODUCT.md /
 * DESIGN.md / .ai/ship-plan.md). Must stay in sync so every managed artifact the
 * verifier checks at write time is also tracked on the Stop-time ledger.
 */
/** The records clone of this machine: `records.home` of the machine settings, else <state>/records. */
export function recordsHomeOf() {
  const base = process.env.SDLC_HOME && process.env.SDLC_HOME.trim() ? process.env.SDLC_HOME : join(homedir(), '.sdlc');
  try {
    const h = JSON.parse(readFileSync(join(base, 'config.json'), 'utf8')).records?.home;
    if (h && String(h).trim()) return resolve(String(h).trim().replace(/^~(?=$|[\\/])/, homedir()));
  } catch { /* no settings */ }
  return join(base, 'records');
}

/** The records folder of a project, as lib/records-root.mjs resolves it, with no import. */
export function workflowsRootOf(projectRoot) {
  try {
    const project = JSON.parse(readFileSync(join(projectRoot, '.ai', 'sdlc-config.json'), 'utf8')).records?.project;
    const home = recordsHomeOf();
    if (typeof project === 'string' && /^[a-z0-9][a-z0-9._-]*$/.test(project) && existsSync(join(home, '.git')) && existsSync(join(home, project))) return join(home, project);
  } catch { /* not linked */ }
  return join(projectRoot, '.ai', 'workflows');
}

// The machine-local entries of a workflow folder, as LOCAL_ONLY_ENTRIES of lib/records-root.mjs
// lists them; a test keeps the two lists equal. The run files now live in <root>/.ai/run/<slug>/,
// so this list is a guard for old files, and it can go with LOCAL_ONLY_ENTRIES.
export const LOCAL_ONLY_NAMES = ['.draft', 'answers.jsonl', '.control.json', '.watch-state.json', '.driver-outcome.json', '.api-log.jsonl', '.ai'];

/**
 * True for a path in the local workflows folder of a linked project that is not machine-local:
 * the file belongs in the records clone, so the pre-write check refuses it by its local path.
 */
export function isLinkedLocalPath(projectRoot, path) {
  const local = join(projectRoot, '.ai', 'workflows');
  if (workflowsRootOf(projectRoot) === local) return false;
  const fold = (s) => (process.platform === 'win32' ? s.toLowerCase() : s);
  const base = local.replace(/\\/g, '/');
  const n = resolve(projectRoot, String(path ?? '')).replace(/\\/g, '/');
  if (!fold(n).startsWith(`${fold(base)}/`)) return false;
  const parts = n.slice(base.length + 1).split('/').filter(Boolean);
  if (!parts.length || parts[0].startsWith('.') || parts[0] === 'answers.jsonl' || (parts[0].startsWith('_') && parts[0] !== '_design')) return false;
  return !parts.slice(1).some((p) => LOCAL_ONLY_NAMES.includes(p));
}

/** True for a record, draft or message file inside the records clone: the pre-write check sees it. */
export function isRecordsHomePath(path) {
  const fold = (s) => (process.platform === 'win32' ? s.toLowerCase() : s);
  const home = recordsHomeOf().replace(/\\/g, '/').replace(/\/+$/, '');
  const n = String(path ?? '').replace(/\\/g, '/');
  return fold(n).startsWith(`${fold(home)}/`) && /\.(md|yaml|jsonl)$/.test(n);
}

export function isManagedArtifactPath(path) {
  const n = String(path ?? '').replace(/\\/g, '/');
  return (
    /(?:^|\/)\.ai\/workflows\/[^/]+\/.+\.md$/.test(n) ||
    /(?:^|\/)\.ai\/simplify\/.+\.md$/.test(n) ||
    /(?:^|\/)\.ai\/profiles\/.+\/.+\.md$/.test(n) ||
    /(?:^|\/)\.ai\/docs\/[^/]+\/.+\.md$/.test(n) ||
    // Solutions corpus category files (type: solution); the category-subdir
    // requirement keeps the frontmatter-less .ai/solutions/INDEX.md exempt.
    /(?:^|\/)\.ai\/solutions\/[^/]+\/.+\.md$/.test(n) ||
    /(?:^|\/)(PRODUCT|DESIGN)\.md$/.test(n) ||
    /(?:^|\/)\.ai\/ship-plan\.md$/.test(n) ||
    // The audit ledgers are kind-keyed (never schema-gated) but carry their own
    // triage gate in post-write-verify, so the Stop re-check must see them.
    /(?:^|\/)\.ai\/(?:ship-plan|observability)-audit\.md$/.test(n)
  );
}
