// One call of an operation, as the MCP server makes it: the same handler of wf.mjs that the CLI
// runs, in a short-lived worker process, so a crash of a handler does not stop the server and a
// new version of the plugin takes effect at the next call. The worker gets structured arguments,
// never a shell line, and runs in the checkout that the call names.
//
// The caller: `person` runs with no WF_ACTOR, as the session of the person does. Every other
// caller, `unknown` too, runs with WF_ACTOR set, so the person-only guards of the handlers refuse
// it. Only the wf_person tool passes `person`, behind its own guards.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SIBLINGS, allOps, argvOf, scriptOf } from './forms.mjs';

export const CALL_TIMEOUT_MS = 10 * 60_000;
export const TEXT_LIMIT = 40_000;

/** The fix lines of a failure of wf.mjs (`fix.who: agent`, `fix.do: …`, `fix.command: …`) as one object. */
export function fixOf(stderr) {
  const fix = {};
  for (const m of String(stderr).matchAll(/^fix(?:\.(who|do|then))?:\s*(.*)$/gm)) fix[m[1] ?? 'command'] = m[2].trim();
  return fix.who ? fix : null;
}

/** The env of the worker: the caller, and the mark that the call comes from the MCP server. */
export function workerEnv(caller, extra = {}, base = process.env) {
  const env = { ...base, SDLC_MCP: '1', ...extra };
  if (caller === 'person') delete env.WF_ACTOR;
  else env.WF_ACTOR = String(caller ?? 'unknown') || 'unknown';
  return env;
}

const CODE_HOST = fileURLToPath(new URL('./code-host.mjs', import.meta.url));

/**
 * Run one code call (`wf_query` or `wf_run` with `code`) in a worker process that runs as the
 * caller: lib/ops/code-host.mjs. Returns its result `{ ok, value, error, ops, changed, applied }`.
 */
export function invokeCode({ root, checkout = root, caller = 'unknown', slug = null, code, mode = 'query', dryRun = false, timeoutMs, env: extraEnv = {} } = {}) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [CODE_HOST], { cwd: checkout, env: workerEnv(caller, extraEnv), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    // The host stops the code at its own limit; this one is for a host that hangs.
    const timer = setTimeout(() => child.kill(), (timeoutMs ?? 60_000) + 30_000);
    child.on('error', (e) => { clearTimeout(timer); done({ ok: false, error: e.message }); });
    child.on('close', (exit) => {
      clearTimeout(timer);
      try { done(JSON.parse(stdout.trim().split('\n').at(-1))); } catch { done({ ok: false, error: `the code host stopped (exit ${exit}): ${stderr.trim().split('\n').at(-1) ?? ''}` }); }
    });
    child.stdin.end(JSON.stringify({ root, slug, code, mode, dryRun, ...(timeoutMs ? { timeoutMs } : {}) }));
  });
}

/**
 * Run one operation. `fields` are its arguments by name; `root` fills `<root>`. Returns
 * `{ ok, exit, data, warnings, error? }`: `data` is the parsed JSON of a form with --json, else
 * the text. A failure carries `error: { message, who, fix, command }`.
 */
/**
 * The process of one operation: `{ argv, words, json }`, where `argv` is the command line that
 * a person would type and `words` the arguments of node (the script first), or `{ error }`.
 */
export function commandOf(op, fields = {}, root = null) {
  const o = allOps().get(op);
  if (!o) return { error: { message: `no operation ${op}`, who: 'agent' } };
  const f = { ...fields };
  const known = new Set([...o.positionals.map((p) => p.name), ...o.flags.map((x) => x.name)]);
  // The context of a call (the slug of the workflow, JSON output) on an op that takes neither:
  // the op runs without it, and says so.
  const warnings = [];
  // A campaign op names its brainstorm `source`; the slug of a call names the same folder.
  if (known.has('source') && !known.has('slug') && f.source === undefined && typeof f.slug === 'string' && f.slug) {
    f.source = f.slug;
    delete f.slug;
    warnings.push(`${op} takes the brainstorm as source: it ran with source ${f.source}`);
  }
  for (const k of HARMLESS) {
    if (f[k] !== undefined && !known.has(k)) { warnings.push(`${op} takes no ${k}: it ran without it`); delete f[k]; }
  }
  if (o.positionals.some((p) => p.name === 'root') && f.root === undefined) f.root = root;
  // A sibling script prints JSON with no flag; wf.mjs does with --json.
  const sibling = SIBLINGS.includes(o.words[0]);
  const json = sibling || o.flags.some((x) => x.name === 'json');
  if (!sibling && json && f.json === undefined) f.json = true;
  let argv;
  try { argv = argvOf(op, f); } catch (e) { return { error: { message: fieldHint(e.message, o, f, known), who: 'agent', fix: `Call ${op} with the fields of its form: ${o.forms.join(' / ')}`, ...callFix(op, o, f, known) } }; }
  return { argv, json, words: [scriptOf(o.words[0]), ...(sibling ? argv.slice(1) : argv)], warnings };
}

/** The fields that a call may carry as context: an op without them runs without them. */
const HARMLESS = ['slug', 'json'];

/** The distance of two names, for the closest field (a typo or a near name). */
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) for (let j = 1; j <= b.length; j += 1) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** The field of the op that a wrong name most likely means, or null. */
/** The names that agents give a field of another name. */
const SYNONYMS = { record: 'name', doc: 'name', document: 'name', file: 'name', why: 'reason', message: 'text', body: 'text', id: 'key', num: 'n', step: 'n', commit: 'sha' };

export function closestField(name, known) {
  if (SYNONYMS[name] && known.has(SYNONYMS[name])) return SYNONYMS[name];
  let best = null;
  for (const k of known) {
    if (k === 'root' || k === 'json') continue;
    const score = k.includes(name) || name.includes(k) ? 0.5 : distance(name, k);
    if (score <= Math.max(2, Math.floor(name.length / 3)) && (!best || score < best.score)) best = { k, score };
  }
  return best?.k ?? null;
}

/** The message of a field error, with the field that each wrong name most likely means. */
function fieldHint(message, o, f, known) {
  const extra = Object.keys(f).filter((k) => !known.has(k) && f[k] !== undefined);
  const near = extra.map((k) => [k, closestField(k, known)]).filter(([, c]) => c);
  return near.length ? `${message} (did you mean ${near.map(([k, c]) => `${c} for ${k}`).join(', ')}?)` : message;
}

/**
 * The corrected call of a field error: the fields that the op has, a wrong name moved to its
 * closest field, and a missing positional as <name>. The server renders it as the tool call.
 */
function callFix(op, o, f, known) {
  const fixed = {};
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || k === 'root' || k === 'json') continue;
    if (known.has(k)) fixed[k] = v;
    else { const c = closestField(k, known); if (c && fixed[c] === undefined) fixed[c] = v; }
  }
  for (const p of o.positionals) if (p.name && p.name !== 'root' && !p.optional && !p.fixed && fixed[p.name] === undefined) fixed[p.name] = `<${p.name}>`;
  return { call: { op, fields: fixed } };
}

export function invoke({ op, fields = {}, root, checkout = root, caller = 'unknown', env: extraEnv = {}, timeoutMs = CALL_TIMEOUT_MS, signal } = {}) {
  const c = commandOf(op, fields, root);
  if (c.error) return Promise.resolve({ ok: false, exit: null, data: null, warnings: [], error: c.error });
  const before = c.warnings ?? [];
  const { argv, json } = c;
  return new Promise((done) => {
    const child = spawn(process.execPath, c.words, { cwd: checkout, env: workerEnv(caller, extraEnv), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, signal });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on('error', (e) => { clearTimeout(timer); done({ ok: false, exit: null, data: null, warnings: [], error: { message: e.message, who: 'agent' } }); });
    child.on('close', (exit) => {
      clearTimeout(timer);
      let data = stdout.trim();
      if (json && data) { try { data = JSON.parse(data); } catch { /* a form that prints text with --json */ } }
      const fix = fixOf(stderr);
      const warnings = stderr.split(/\r?\n/).filter((l) => l && !/^fix(\.\w+)?:/.test(l)).map((l) => l.replace(/^wf\.mjs:\s*/, ''));
      // A check that finds something exits 1 and names no fix (`index --check`, `consent check`):
      // that is its answer. A refusal always names its fix.
      const refused = data && typeof data === 'object' && data.ok === false;
      const failed = exit === null || exit >= 2 || refused || (exit !== 0 && fix !== null);
      if (!failed) { done({ ok: true, exit, data, warnings: [...before, ...warnings], argv }); return; }
      const message = (data && typeof data === 'object' && data.error) || warnings.join('\n') || (typeof data === 'string' ? data : '') || `exit ${exit}`;
      const dataFix = data && typeof data === 'object' && data.fix && typeof data.fix === 'object' ? data.fix : null;
      done({ ok: false, exit, data, warnings: [], argv, error: { message: String(message), ...(dataFix ?? fix ?? { who: 'agent' }) } });
    });
  });
}
