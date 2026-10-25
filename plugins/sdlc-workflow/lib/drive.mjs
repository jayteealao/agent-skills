// lib/drive.mjs — run a workflow script (skills/wf/workflows/*.js) under plain Node.
//
// A workflow script is the body of an async function with the globals agent, parallel,
// pipeline, phase, log, args and budget. The Workflow tool of Claude Code and the
// workflow runner of pi-subagents give it those globals. On Codex there is neither, so
// `wf.mjs drive` runs the script here: each agent() call becomes one `codex exec` call
// with the prompt on stdin, the schema as --output-schema, and the last message read
// back from -o.
//
// Each run writes one folder: one prompt, events and last-message file per agent, and
// drive.jsonl with one line per agent. A run started with `resume` returns the recorded
// result of each call whose index and prompt are unchanged, and runs the rest live.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The strict form of a JSON schema that Codex accepts: every property is required, an
 * optional property is nullable, every object closes its properties, and a free-form
 * object is sent as a JSON string.
 */
export function strictSchema(s) {
  if (!s || typeof s !== 'object') return s;
  if (Array.isArray(s)) return s.map(strictSchema);
  const out = { ...s };
  if (out.items) out.items = strictSchema(out.items);
  for (const k of ['anyOf', 'oneOf', 'allOf']) if (out[k]) out[k] = out[k].map(strictSchema);
  if (out.type === 'object' && !out.properties) return { type: 'string', description: 'A JSON-encoded object.' };
  if (out.type === 'object' || out.properties) {
    out.type = 'object';
    const required = new Set(out.required || []);
    const props = {};
    for (const [k, v] of Object.entries(out.properties || {})) props[k] = required.has(k) ? strictSchema(v) : nullable(strictSchema(v));
    out.properties = props;
    out.required = Object.keys(props);
    out.additionalProperties = false;
  }
  return out;
}

function nullable(v) {
  if (v.enum) return { ...v, enum: [...v.enum, null], ...(v.type ? { type: [].concat(v.type, 'null') } : {}) };
  if (typeof v.type === 'string') return { ...v, type: [v.type, 'null'] };
  if (Array.isArray(v.type)) return { ...v, type: [...v.type, 'null'] };
  return { anyOf: [v, { type: 'null' }] };
}

/** Undo strictSchema on a value: drop a null that the original schema did not require, and parse a JSON-string object. */
export function fromStrict(v, s) {
  if (s && s.type === 'object' && !s.properties && typeof v === 'string') {
    try { return JSON.parse(v); } catch { return { raw: v }; }
  }
  if (!s || v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => fromStrict(x, s.items));
  const props = s.properties || {};
  const required = new Set(s.required || []);
  const o = {};
  for (const [k, x] of Object.entries(v)) {
    if (x === null && !required.has(k)) continue;
    o[k] = fromStrict(x, props[k]);
  }
  return o;
}

/** Run thunks with at most `limit` at once. Results keep the order of the thunks; a thunk that throws gives null. */
export async function boundedParallel(thunks, limit = 4) {
  const out = new Array(thunks.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < thunks.length) {
      const i = next++;
      try { out[i] = await (typeof thunks[i] === 'function' ? thunks[i]() : thunks[i]); } catch { out[i] = null; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, thunks.length) }, worker));
  return out;
}

/** Each item runs through every stage on its own; a stage that throws drops the item to null. */
export async function pipelineOf(items, stages, limit = 4) {
  return boundedParallel(items.map((item, i) => async () => {
    let v = item;
    for (const stage of stages) v = await stage(v, item, i);
    return v;
  }), limit);
}

const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

/** The Node entry of the Codex CLI, so the runner spawns node and no shell. */
export function codexEntry(env = process.env) {
  if (env.SDLC_CODEX_ENTRY) return { cmd: process.execPath, pre: [env.SDLC_CODEX_ENTRY] };
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['codex'], { encoding: 'utf8' });
  for (const line of (which.stdout || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const js = path.join(path.dirname(line), 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    if (existsSync(js)) return { cmd: process.execPath, pre: [js] };
    if (process.platform !== 'win32') return { cmd: line, pre: [] };
  }
  return null;
}

/** The argv of one `codex exec` call. The prompt goes on stdin. */
export function codexArgs({ cwd, lastFile, schemaFile, model, effort, sandbox = 'workspace-write' }) {
  const a = ['exec', '-C', cwd, '--skip-git-repo-check', '--json', '-s', sandbox, '-o', lastFile];
  if (schemaFile) a.push('--output-schema', schemaFile);
  if (model) a.push('-m', model);
  if (effort) a.push('-c', `model_reasoning_effort=${effort}`);
  a.push('-');
  return a;
}

/** The token usage of one Codex run, from its turn.completed events. */
export function usageOf(events) {
  const u = { input: 0, cached: 0, output: 0, reasoning: 0 };
  for (const line of String(events).split('\n')) {
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    const x = o && o.type === 'turn.completed' ? o.usage : null;
    if (!x) continue;
    u.input += x.input_tokens || 0;
    u.cached += x.cached_input_tokens || 0;
    u.output += x.output_tokens || 0;
    u.reasoning += x.reasoning_output_tokens || 0;
  }
  return u;
}

function killTree(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { /* gone */ } }
}

/** One `codex exec` call. Resolves { code, events } when the process ends or its time box kills it. */
export function runCodex({ entry, args, prompt, eventsFile, errFile, timeoutMs, env }) {
  return new Promise((resolve) => {
    const child = spawn(entry.cmd, [...entry.pre, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'], env, windowsHide: true, detached: process.platform !== 'win32',
    });
    let events = '';
    let timedOut = false;
    child.stdout.on('data', (d) => { events += d; appendFileSync(eventsFile, d); });
    child.stderr.on('data', (d) => appendFileSync(errFile, d));
    const timer = setTimeout(() => { timedOut = true; killTree(child); }, timeoutMs);
    child.on('error', () => { clearTimeout(timer); resolve({ code: -1, events, timedOut }); });
    child.on('exit', (code) => { clearTimeout(timer); resolve({ code, events, timedOut }); });
    child.stdin.end(prompt);
  });
}

/**
 * Run a workflow script on Codex.
 *
 * @param {object} o
 * @param {string} o.source   the script text (it starts with `export const meta`)
 * @param {object} o.args     the script's args
 * @param {string} o.cwd      the project root that each agent runs in
 * @param {string} o.runDir   the folder of this run's records
 * @param {object} [o.resume] the records of an earlier run: { [n]: { hash, result } }
 * @param {number} [o.timeoutMs] the time box of one agent (default 90 minutes)
 * @param {number} [o.limit]  the agents that run at once inside parallel() and pipeline()
 * @param {(line: string) => void} [o.say] the progress line sink
 * @param {Function} [o.exec] a test seam that replaces runCodex
 */
export async function driveScript(o) {
  const entry = o.exec ? { cmd: 'codex', pre: [] } : codexEntry();
  if (!entry) throw new Error('drive: the codex CLI is not on PATH');
  mkdirSync(o.runDir, { recursive: true });
  const journal = path.join(o.runDir, 'drive.jsonl');
  const say = o.say || (() => {});
  const exec = o.exec || runCodex;
  const timeoutMs = o.timeoutMs || 90 * 60_000;
  const resume = o.resume || {};
  // A driven agent changes no repo guidance file and writes no rules block.
  const env = { ...process.env, SDLC_HOST: 'codex', SDLC_DISABLE_MEMORY_SEED: '1' };
  const totals = { agents: 0, failed: 0, replayed: 0, usage: { input: 0, cached: 0, output: 0, reasoning: 0 } };
  let n = 0;

  async function agent(prompt, opts = {}) {
    const i = ++n;
    totals.agents++;
    const label = opts.label || `agent-${i}`;
    const key = hash(`${prompt}\n${JSON.stringify(opts.schema || null)}`);
    const prior = resume[i];
    if (prior && prior.hash === key && prior.ok) {
      totals.replayed++;
      say(`agent ${i} ${label}: replayed from the earlier run`);
      appendFileSync(journal, `${JSON.stringify({ n: i, label, hash: key, ok: true, replayed: true, result: prior.result })}\n`);
      return prior.result;
    }
    const base = path.join(o.runDir, `a${String(i).padStart(3, '0')}-${label.replace(/[^A-Za-z0-9_.-]+/g, '_')}`);
    writeFileSync(`${base}.prompt.txt`, prompt);
    let schemaFile = null;
    if (opts.schema) {
      schemaFile = `${base}.schema.json`;
      writeFileSync(schemaFile, JSON.stringify(strictSchema(opts.schema), null, 2));
    }
    const lastFile = `${base}.last.txt`;
    say(`agent ${i} ${label}: start`);
    const r = await exec({
      entry, prompt, env, timeoutMs, eventsFile: `${base}.events.jsonl`, errFile: `${base}.stderr.log`,
      args: codexArgs({ cwd: o.cwd, lastFile, schemaFile, model: opts.model, effort: opts.effort }),
    });
    const usage = usageOf(r.events);
    for (const k of Object.keys(totals.usage)) totals.usage[k] += usage[k];
    const last = existsSync(lastFile) ? readFileSync(lastFile, 'utf8') : '';
    let result = null;
    let why = '';
    if (r.code !== 0 || !last.trim()) why = r.timedOut ? 'time box' : `exit ${r.code}${last.trim() ? '' : ', no last message'}`;
    else if (!opts.schema) result = last;
    else {
      try { result = fromStrict(JSON.parse(last), opts.schema); } catch (e) { why = `the last message is not JSON: ${e.message}`; }
    }
    if (why) totals.failed++;
    appendFileSync(journal, `${JSON.stringify({ n: i, label, hash: key, ok: !why, why: why || undefined, usage, result })}\n`);
    say(`agent ${i} ${label}: ${why ? `FAILED (${why})` : 'done'}`);
    return result;
  }

  const limit = o.limit || 4;
  const parallel = (thunks) => boundedParallel(thunks, limit);
  const pipeline = (items, ...stages) => pipelineOf(items, stages, limit);
  const phase = (t) => say(`phase ${t}`);
  const log = (m) => say(m);
  const budget = { total: null, spent: () => 0, remaining: () => Infinity };

  const src = String(o.source).replace(/^export const meta\s*=/m, 'const meta =');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const fn = new AsyncFunction('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'budget', src);
  const result = await fn(agent, parallel, pipeline, phase, log, o.args, budget);
  writeFileSync(path.join(o.runDir, 'result.json'), `${JSON.stringify({ result, totals }, null, 2)}\n`);
  return { result, totals };
}

/** The records of an earlier run, for `resume`: the last line of each agent index. */
export function readRun(runDir) {
  const out = {};
  const file = path.join(runDir, 'drive.jsonl');
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    try {
      const r = JSON.parse(line);
      if (r && r.n) out[r.n] = r;
    } catch { /* a torn last line */ }
  }
  return out;
}
