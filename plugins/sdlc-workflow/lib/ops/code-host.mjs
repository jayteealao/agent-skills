// The host of one code call of the wf MCP server: `wf_query` or `wf_run` with `code`. The MCP
// server starts it as a worker process with WF_ACTOR set, so the person-only guards of the
// library hold. It starts the sandbox child (code-sandbox.mjs), answers each call of the child
// with the wf library (lib/wf-api.mjs), and runs the whole call with all or nothing: a throw, a
// timeout, a crash of the child or `dryRun` puts back every file that the call wrote.
//
// wf_query runs with the read functions only, and always as a dry run.
import { fork } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { dropLock, takeLock } from '../file-lock.mjs';
import { workflowDir } from '../records-root.mjs';
import { openWorkflow, runScript } from '../wf-api.mjs';

const SANDBOX = fileURLToPath(new URL('./code-sandbox.mjs', import.meta.url));
const API_SOURCE = fileURLToPath(new URL('../wf-api.mjs', import.meta.url));

export const READS = ['records.get', 'records.getMany', 'records.fields', 'records.section', 'records.field', 'records.outline', 'records.list',
  'decisions.list', 'decisions.answered', 'findings.list', 'status.summary', 'steps.where', 'board.items'];
export const WRITES = ['records.set', 'records.put', 'records.edit', 'records.draft', 'decisions.add', 'decisions.addMany', 'findings.add', 'findings.set',
  'board.add', 'board.move', 'board.regroup', 'board.remove'];
export const LIMITS = { timeoutMs: 60_000, ops: 2_000 };
// The lock of a code run on a workflow: the sync skips the unit while it is held.
export const RUN_LOCK = 'run.lock';

/** The help of the library: one function, or the list of all. Read from the header of lib/wf-api.mjs. */
export function libraryHelp(name = null, names = [...READS, ...WRITES]) {
  const head = readFileSync(API_SOURCE, 'utf8').split('API:')[1]?.split('*/')[0] ?? '';
  const entries = [];
  for (const line of head.split('\n').map((l) => l.replace(/^\s*\*\s?/, ''))) {
    const m = /^\s{2}(wf\.[a-z]+\.[A-Za-z]+|open)\((.*)\)\s*$/.exec(line);
    if (m) { entries.push({ name: m[1].replace(/^wf\./, ''), call: `${m[1]}(${m[2]})`, text: [] }); continue; }
    if (entries.length && line.trim()) entries.at(-1).text.push(line.trim());
  }
  const shown = entries.filter((e) => e.name === 'open' || names.includes(e.name));
  if (!name) return shown.map((e) => e.call);
  const e = shown.find((x) => x.name === String(name).replace(/^wf\./, ''));
  return e ? { call: e.call, about: e.text.join(' ') } : null;
}

/** The flag of the permission model of this Node, or null when it has none. */
export function permissionFlag() {
  const f = process.allowedNodeEnvironmentFlags;
  if (f.has('--permission')) return '--permission';
  if (f.has('--experimental-permission')) return '--experimental-permission';
  return null;
}

const plain = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

/**
 * Run `code` against workflow `slug` of the project at `root`. `mode` is `query` (reads only,
 * nothing kept) or `run`. Returns `{ ok, value, error, failedOp, ops, changed, applied }`.
 */
export async function runCode(root, { slug = null, code, mode = 'query', dryRun = false, timeoutMs = LIMITS.timeoutMs, maxOps = LIMITS.ops } = {}) {
  const flag = permissionFlag();
  if (!flag) return { ok: false, error: `Node ${process.version} has no permission model, so code mode does not run here: use the typed operations` };
  if (typeof code !== 'string' || !code.trim()) return { ok: false, error: 'code is empty: give the body of a function of wf and open, with return' };
  const names = mode === 'run' ? [...READS, ...WRITES] : READS;
  const locks = [];
  const lock = (s) => {
    const file = join(workflowDir(root, s), RUN_LOCK);
    if (locks.includes(file)) return;
    if (!takeLock(file, { waitMs: 10_000, info: { what: 'code run' } })) throw new Error(`another code run writes ${s}: call again when it ends`);
    locks.push(file);
  };
  let ops = 0;
  const body = ({ wf, open }) => new Promise((resolve, reject) => {
    const child = fork(SANDBOX, [], { execArgv: [flag, '--allow-worker', `--allow-fs-read=${SANDBOX}`, '--max-old-space-size=512'], stdio: ['ignore', 'ignore', 'pipe', 'ipc'], serialization: 'json' });
    let stderr = '';
    let settled = false;
    const end = (fn, v) => { if (settled) return; settled = true; clearTimeout(timer); child.kill(); fn(v); };
    const timer = setTimeout(() => end(reject, new Error(`the code ran past ${timeoutMs / 1000} s and was stopped; nothing it wrote is kept`)), timeoutMs);
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('exit', (c) => end(reject, new Error(`the code stopped (exit ${c})${stderr ? `: ${stderr.trim().split('\n').at(-1)}` : ''}; nothing it wrote is kept`)));
    child.on('message', async (m) => {
      if (m.done !== undefined) { end(resolve, m.done); return; }
      if (m.fail !== undefined) { const e = new Error(m.fail); e.wfOp = m.op; end(reject, e); return; }
      if (!m.rpc) return;
      const { slug: s, op, args } = m.rpc;
      ops += 1;
      try {
        if (ops > maxOps) throw new Error(`the code made more than ${maxOps} calls: do the work in fewer, larger calls`);
        let value;
        if (op === 'help') value = libraryHelp(args?.[0] ?? null, names) ?? (WRITES.includes(String(args?.[0]).replace(/^wf\./, '')) ? `${args[0]} is a write: it runs in wf_run` : `no function ${args?.[0]}; wf.help() lists them`);
        else if (op === 'open') { if (mode === 'run') lock(args[0]); open(args[0]); value = true; }
        else {
          if (!names.includes(op)) throw new Error(`${op} is not a function here`);
          const target = s ? open(s) : wf;
          if (!target) throw new Error('no workflow: give slug, or call open(slug)');
          const [ns, fn] = op.split('.');
          value = plain(await target[ns][fn](...(Array.isArray(args) ? args : [])));
        }
        child.send({ value });
      } catch (e) { child.send({ error: `${op}: ${e.message}` }); }
    });
    child.send({ code, slug, names });
  });
  try {
    if (mode === 'run' && slug) lock(slug);
    const r = await runScript(root, body, { slug, dryRun: mode !== 'run' || dryRun });
    return { ok: r.ok, value: r.ok ? r.value : null, error: r.error ? r.error.message : null, failedOp: r.failedOp ?? null, ops, changed: r.changed, applied: r.applied };
  } catch (e) {
    return { ok: false, value: null, error: e.message, failedOp: null, ops, changed: [], applied: false };
  } finally {
    for (const f of locks) dropLock(f);
  }
}

// As a worker process: the request comes on stdin, the result goes to stdout as one JSON line.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let input = '';
  process.stdin.on('data', (d) => { input += d; });
  process.stdin.on('end', async () => {
    let req;
    try { req = JSON.parse(input); } catch { process.stdout.write(`${JSON.stringify({ ok: false, error: 'the request is not JSON' })}\n`); return; }
    const r = await runCode(req.root, req);
    process.stdout.write(`${JSON.stringify(r)}\n`);
  });
}
