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
import { allOps, argvOf, WF_SCRIPT } from './forms.mjs';

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
export function invoke({ op, fields = {}, root, checkout = root, caller = 'unknown', env: extraEnv = {}, timeoutMs = CALL_TIMEOUT_MS, signal } = {}) {
  const o = allOps().get(op);
  if (!o) return Promise.resolve({ ok: false, exit: null, data: null, warnings: [], error: { message: `no operation ${op}`, who: 'agent' } });
  const f = { ...fields };
  if (o.positionals.some((p) => p.name === 'root') && f.root === undefined) f.root = root;
  const json = o.flags.some((x) => x.name === 'json');
  if (json && f.json === undefined) f.json = true;
  let argv;
  try { argv = argvOf(op, f); } catch (e) { return Promise.resolve({ ok: false, exit: null, data: null, warnings: [], error: { message: e.message, who: 'agent', fix: `Call ${op} with the fields of its form: ${o.forms.join(' / ')}` } }); }
  return new Promise((done) => {
    const child = spawn(process.execPath, [WF_SCRIPT, ...argv], { cwd: checkout, env: workerEnv(caller, extraEnv), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, signal });
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
      if (!failed) { done({ ok: true, exit, data, warnings, argv }); return; }
      const message = (data && typeof data === 'object' && data.error) || warnings.join('\n') || (typeof data === 'string' ? data : '') || `exit ${exit}`;
      const dataFix = data && typeof data === 'object' && data.fix && typeof data.fix === 'object' ? data.fix : null;
      done({ ok: false, exit, data, warnings: [], argv, error: { message: String(message), ...(dataFix ?? fix ?? { who: 'agent' }) } });
    });
  });
}
