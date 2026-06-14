// hooks/_adapter.mjs — native Codex hook adapter layer.
//
// NATIVE-INTEROP-REWRITE-PLAN "Native Codex Hooks": host payload → host adapter →
// normalized event → shared policy. This module is the host adapter. It parses a
// Codex hook event off stdin, determines the final touched files (apply_patch /
// Edit / Write), and reshapes them into the SHARED normalized event — which here
// is exactly the stdin contract the bundled shared-runtime policy entrypoints
// already consume (`{ cwd, tool_input:{ file_path, edits[] } }`, read by
// runtime/dist/{pre-write-validate,post-write-verify,post-write-auto-stage,
// post-write-render}.mjs via projectRootFromInput + collectToolInputPaths).
//
// Reusing those bundled entrypoints — rather than re-implementing validation —
// is what guarantees Claude/Codex parity: the SAME runtime bytes run the schema,
// sibling, fragment, and auto-stage policy on both hosts. The Codex-native part
// is only the adapter (stdin parsing, apply_patch parsing, the Stop enforcement
// boundary, the once-only activation record) — never the policy itself.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Bump only on a real change to the Codex hook stdin/matcher/output contract.
// A changed value invalidates every activation record (forces re-activation).
export const HOOK_CONTRACT_VERSION = 1;
export const PLUGIN_NAME = 'sdlc-workflow-codex';
export const HUB_NAME = 'sdlc-workflow-hub';

// ── stdin / argv ──────────────────────────────────────────────────────────────

/** Read + parse the single JSON event Codex writes to the hook's stdin. */
export function readEvent() {
  try {
    const text = readFileSync(0, 'utf-8');
    if (!text || !text.trim()) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
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
 * The shared runtime lives at <pluginRoot>/runtime (Workstream D); the bundled
 * policy entrypoints are at <pluginRoot>/runtime/dist/<name>.mjs. PLUGIN_DATA is
 * the Codex-plugin-local writable dir; fall back to <pluginRoot>/.plugin-data so
 * manual/test runs without the Codex substitution still work.
 */
export function resolveLayout({ pluginRoot, pluginData } = {}) {
  const root = pluginRoot ? resolve(pluginRoot) : resolve(new URL('..', import.meta.url).pathname);
  const runtimeRoot = join(root, 'runtime');
  return {
    pluginRoot: root,
    runtimeRoot,
    distDir: join(runtimeRoot, 'dist'),
    pluginData: pluginData ? resolve(pluginData) : join(root, '.plugin-data'),
  };
}

export function bundledEntry(runtimeRoot, name) {
  return join(runtimeRoot, 'dist', `${name}.mjs`);
}

/**
 * Spawn a bundled shared-runtime policy entrypoint with `stdin` (an object,
 * JSON-encoded) on its stdin. Synchronous so the serialized dispatcher stays
 * sequential. Returns `{ status, stdout, stderr, timedOut }`. Never throws.
 */
export function runBundled(runtimeRoot, name, stdin, { cwd, timeoutMs = 12000 } = {}) {
  const r = spawnSync(process.execPath, [bundledEntry(runtimeRoot, name)], {
    input: JSON.stringify(stdin ?? {}),
    cwd: cwd || process.cwd(),
    encoding: 'utf-8',
    timeout: timeoutMs,
    windowsHide: true,
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

/** Synthesize the stdin the bundled multi-path policy (verify/render) consumes. */
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

/** Synthesize the single-file stdin the bundled validate/auto-stage consume. */
export function synthSingleStdin(cwd, eventName, path, content) {
  const ti = { file_path: path };
  if (typeof content === 'string') ti.content = content;
  return { cwd, hook_event_name: eventName, tool_name: 'Write', tool_input: ti };
}

// ── runtime identity / activation ───────────────────────────────────────────────

export function readRuntimeIdentity(runtimeRoot) {
  try {
    const m = JSON.parse(readFileSync(join(runtimeRoot, 'runtime-manifest.json'), 'utf-8'));
    return { runtimeVersion: m.runtimeVersion ?? null, buildId: m.buildId ?? null, hubName: m.hubName ?? HUB_NAME };
  } catch {
    return { runtimeVersion: null, buildId: null, hubName: HUB_NAME };
  }
}

function readPluginVersion(pluginRoot) {
  for (const rel of [join('.codex-plugin', 'plugin.json'), 'package.json']) {
    try {
      const v = JSON.parse(readFileSync(join(pluginRoot, rel), 'utf-8')).version;
      if (typeof v === 'string' && v) return v;
    } catch { /* try next */ }
  }
  return '0.0.0';
}

/** sha256 of the hook registration — a changed manifest invalidates activation. */
export function hookDefinitionHash(pluginRoot) {
  try {
    return createHash('sha256').update(readFileSync(join(pluginRoot, 'hooks', 'hooks.json'))).digest('hex');
  } catch {
    return '';
  }
}

/** The activation baseline this installed plugin+runtime+hooks represents. */
export function computeBaseline({ pluginRoot, runtimeRoot }) {
  const id = readRuntimeIdentity(runtimeRoot);
  return {
    schemaVersion: 1,
    pluginName: PLUGIN_NAME,
    pluginVersion: readPluginVersion(pluginRoot),
    hookContractVersion: HOOK_CONTRACT_VERSION,
    hookDefinitionHash: hookDefinitionHash(pluginRoot),
    runtimeVersion: id.runtimeVersion,
    runtimeBuildId: id.buildId,
    hubName: id.hubName,
  };
}

export function activationPath(pluginData) { return join(pluginData, 'activation.json'); }

export function readActivation(pluginData) {
  try { return JSON.parse(readFileSync(activationPath(pluginData), 'utf-8')); }
  catch { return null; }
}

/**
 * Does the recorded activation still match the installed baseline? A missing,
 * malformed, or mismatched record is NOT active — the next trusted SessionStart
 * must (re)activate. Keys on plugin version, hook contract, hook-definition hash,
 * and the bundled runtime build (NATIVE-INTEROP "Activation Record Contract").
 */
export function needsActivation(record, baseline) {
  if (!record || typeof record !== 'object') return true;
  for (const k of ['pluginName', 'pluginVersion', 'hookContractVersion', 'hookDefinitionHash', 'runtimeBuildId']) {
    if (record[k] !== baseline[k]) return true;
  }
  return false;
}

/** Atomically write the activation record (temp sibling + rename). */
export function writeActivationAtomic(pluginData, baseline) {
  mkdirSync(pluginData, { recursive: true });
  const record = { ...baseline, activatedAt: new Date().toISOString() };
  const tmp = `${activationPath(pluginData)}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`, 'utf-8');
  renameSync(tmp, activationPath(pluginData));
  return record;
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

// ── small host-native path helpers ──────────────────────────────────────────────

/**
 * Climb from `cwd` to the project root: the nearest ancestor holding
 * `.ai/workflows`, else the nearest `.git` toplevel, else `cwd`. Mirrors the
 * shared lib's resolveProjectRoot intent without importing it (kept host-native
 * so the adapter has no bundled-chunk dependency).
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

/** True for a managed sdlc artifact markdown path (mirrors isManagedArtifactMarkdownPath). */
export function isManagedArtifactPath(path) {
  const n = String(path ?? '').replace(/\\/g, '/');
  return (
    /(?:^|\/)\.ai\/workflows\/[^/]+\/.+\.md$/.test(n) ||
    /(?:^|\/)\.ai\/simplify\/.+\.md$/.test(n) ||
    /(?:^|\/)\.ai\/profiles\/.+\/.+\.md$/.test(n) ||
    /(?:^|\/)\.ai\/docs\/[^/]+\/.+\.md$/.test(n) ||
    /(?:^|\/)(PRODUCT|DESIGN)\.md$/.test(n)
  );
}
