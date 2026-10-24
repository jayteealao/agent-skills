#!/usr/bin/env node
/**
 * scripts/goal.mjs — the disk side of /wf loop goal (WF-GOAL-PLAN 4.2).
 * skills/wf/scripts/goal.mjs runs this script.
 *
 *   arm       <root> <slug> [--objective t] [--kind lifecycle|optimize|proofs] [--proof cmd]... [--max-checks n] [--host h]
 *                                         write or re-arm the contract; print the condition and how the host arms it
 *   check     <root> <slug>               run the rule of the kind; print the evidence, then the GOAL: line (plain text)
 *   park      <root> <slug> <gate-id> [--reason r]   record a human gate: the next check prints GOAL: BLOCKED gate <id>
 *   status    <root> <slug>               the state, the check count, and the last verdict
 *   clear     <root> <slug>               set state cleared; print how to clear the host goal
 *   lifecycle <root> <slug>               the lifecycle verdict of lib/lifecycle-done.mjs (for auto and /wf status)
 *
 * Every command except `check` prints one JSON object. `check` prints text, because
 * the host judge reads the transcript, and its last line is the `GOAL:` line (D3).
 * `check` exits 0 for every verdict: a failing proof is evidence, not an error.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { safeParseFrontmatter } from '../lib/frontmatter.mjs';
import {
  DEFAULT_MAX_CHECKS, EVIDENCE_TAIL, HOSTS, armPlan, clearPlan, conditionText, contractErrors, fromLifecycle, fromOptimize, fromProofs,
  goalLine, precheck, renderGoalMd,
} from '../lib/goal.mjs';
import { lifecycleDone } from '../lib/lifecycle-done.mjs';
import { optimizeStatus } from './optimize.mjs';

const USAGE = 'Usage: goal.mjs <arm|check|park|status|clear|lifecycle> <projectRoot> <slug> ...';
// scripts/ sits one level under the plugin root.
const PLUGIN_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const WRAPPER = join(PLUGIN_ROOT, 'skills', 'wf', 'scripts', 'goal.mjs');
const PROOF_TIMEOUT_MS = 30 * 60_000;

const wfDir = (root, slug) => join(root, '.ai', 'workflows', slug);
const goalPath = (root, slug) => join(wfDir(root, slug), 'goal.md');
const goalDir = (root, slug) => join(wfDir(root, slug), 'goal');
const checksPath = (root, slug) => join(goalDir(root, slug), 'checks.jsonl');
const armPath = (root, slug) => join(goalDir(root, slug), 'arm.json');
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

function writeAtomic(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  for (let i = 0; ; i++) {
    try { renameSync(tmp, file); return; } catch (e) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code) || i >= 19) { rmSync(tmp, { force: true }); throw e; }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
}

function readContract(root, slug) {
  const f = goalPath(root, slug);
  if (!existsSync(f)) return null;
  const p = safeParseFrontmatter(readFileSync(f, 'utf8'));
  if (!p.data) throw new Error(`goal.md does not parse: ${p.parseError}`);
  return { ...p.data, prose: (p.content ?? '').trim() };
}
const saveContract = (root, slug, c) => writeAtomic(goalPath(root, slug), renderGoalMd({ ...c, slug }, c.prose));

function readChecks(root, slug) {
  const f = checksPath(root, slug);
  if (!existsSync(f)) return [];
  return readFileSync(f, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
const countOf = (checks, arming) => checks.filter((c) => c.arming === arming).length;

function indexOf(root, slug) {
  const f = join(wfDir(root, slug), '00-index.md');
  return existsSync(f) ? safeParseFrontmatter(readFileSync(f, 'utf8')).data : null;
}

function arm(root, slug, f) {
  if (!existsSync(wfDir(root, slug))) throw new Error(`no workflow ${slug}: start it with /wf intake first`);
  const prior = readContract(root, slug);
  const index = indexOf(root, slug);
  const proofs = [].concat(f.proof ?? []).map(String).filter((p) => p.trim());
  const kind = f.kind ?? prior?.kind ?? (proofs.length ? 'proofs' : index?.['workflow-type'] === 'optimize' ? 'optimize' : 'lifecycle');
  const host = f.host ?? prior?.host ?? 'claude-code';
  if (!HOSTS.includes(host)) throw new Error(`host must be one of ${HOSTS.join(', ')}`);
  const objective = String(f.objective ?? prior?.objective ?? '').trim()
    || (kind === 'lifecycle' ? `Drive slug ${slug} to handoff-ready` : kind === 'optimize' ? `Finish the optimize loop of slug ${slug}` : '');
  const c = {
    objective,
    kind,
    proofs: proofs.length ? proofs : (prior?.proofs ?? []),
    'max-checks': Number(f['max-checks'] ?? prior?.['max-checks'] ?? DEFAULT_MAX_CHECKS),
    arming: Number(prior?.arming ?? 0) + 1,
    'armed-at': nowIso(),
    host,
    state: 'armed',
    parked: null,
    prose: prior?.prose ?? '',
  };
  const errors = contractErrors(c);
  if (errors.length) return { ok: false, error: `the contract is not valid: ${errors.join('; ')}` };
  const condition = conditionText({ script: WRAPPER, root, slug, maxChecks: c['max-checks'] });
  saveContract(root, slug, c);
  const plan = armPlan(host, condition);
  // The mod reads this request at the end of the turn and submits /goal on Desktop (W3).
  writeAtomic(armPath(root, slug), `${JSON.stringify({ slug, host, arming: c.arming, condition, command: plan.command ?? null, requestedAt: c['armed-at'], state: 'pending' }, null, 2)}\n`);
  return { ok: true, resumed: !!prior, kind, host, arming: c.arming, maxChecks: c['max-checks'], condition, arm: plan, contract: 'goal.md' };
}

function runProofs(root, proofs) {
  return proofs.map((command) => {
    const t0 = Date.now();
    const r = spawnSync(command, { cwd: root, shell: true, encoding: 'utf8', windowsHide: true, timeout: PROOF_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 });
    const out = `${r.stdout || ''}${r.stderr || ''}`.split(/\r?\n/).filter((l) => l.trim()).slice(-EVIDENCE_TAIL).join('\n');
    return { command, code: r.status ?? 1, ms: Date.now() - t0, out };
  });
}

/** `check` returns its text; the last line is the GOAL: line. */
function check(root, slug) {
  const lines = [];
  let contract;
  try { contract = readContract(root, slug); } catch (e) { contract = null; lines.push(e.message); }
  const checks = readChecks(root, slug);
  const arming = Number(contract?.arming ?? 0);
  const count = countOf(checks, arming);
  lines.push(`goal check ${count + 1} of ${contract?.['max-checks'] ?? '?'} for ${slug} (kind ${contract?.kind ?? 'none'})`);
  let v = precheck(contract, count);
  if (!v) {
    if (contract.kind === 'lifecycle') {
      const l = lifecycleDone(root, slug);
      for (const s of l.slices) lines.push(`  slice ${s.slice}: verify ${s.verify ?? 'not run'}, review ${s.review ?? 'not run here'}`);
      lines.push(`  lifecycle: ${l.verdict}: ${l.reason}`);
      v = fromLifecycle(l);
    } else if (contract.kind === 'optimize') {
      let s;
      try { s = optimizeStatus(root, slug); } catch (e) { s = { ok: false, error: e.message }; }
      lines.push(`  optimize: ${s.state ?? 'error'}${s.reason ? ` (${s.reason})` : ''}${s.detail ? `: ${s.detail}` : ''}`);
      if (s.best) lines.push(`  best ${s.best.value} against the baseline ${s.baseline?.median}; trials ${s.counters?.trials} of ${s.budget?.trials}`);
      v = fromOptimize(s);
    } else {
      const runs = runProofs(root, contract.proofs);
      for (const r of runs) {
        lines.push(`  $ ${r.command}`, `  exit ${r.code} in ${Math.round(r.ms / 100) / 10}s`);
        if (r.out) lines.push(...r.out.split('\n').map((l) => `  | ${l}`));
      }
      v = fromProofs(runs);
    }
  }
  if (contract) {
    mkdirSync(goalDir(root, slug), { recursive: true });
    appendFileSync(checksPath(root, slug), `${JSON.stringify({ at: nowIso(), arming, n: count + 1, verdict: v.verdict, reason: v.reason })}\n`);
    const next = v.verdict === 'MET' ? 'met' : v.verdict === 'BLOCKED' ? 'blocked' : contract.state;
    if (next !== contract.state && contract.state !== 'cleared') saveContract(root, slug, { ...contract, state: next });
  }
  lines.push(goalLine(v.verdict, v.reason));
  return lines.join('\n');
}

function park(root, slug, gate, f) {
  if (!gate) throw new Error('park needs a gate id');
  const c = readContract(root, slug);
  if (!c) throw new Error('no goal contract: nothing to park');
  const parked = { gate: String(gate), reason: String(f.reason ?? '').trim(), at: nowIso() };
  saveContract(root, slug, { ...c, parked });
  return { ok: true, parked, next: 'run check: it prints GOAL: BLOCKED, and the host goal ends. After the person answers, run /wf loop goal <slug> resume.' };
}

function status(root, slug) {
  const c = readContract(root, slug);
  if (!c) return { ok: true, state: 'none', note: 'no goal contract' };
  const checks = readChecks(root, slug);
  const arming = Number(c.arming ?? 0);
  const mine = checks.filter((x) => x.arming === arming);
  const arm = existsSync(armPath(root, slug)) ? JSON.parse(readFileSync(armPath(root, slug), 'utf8')) : null;
  return { ok: true, state: c.state, kind: c.kind, objective: c.objective, host: c.host, arming, checks: mine.length, maxChecks: c['max-checks'], last: mine.at(-1) ?? null, parked: c.parked ?? null, armRequest: arm?.state ?? null };
}

function clear(root, slug) {
  const c = readContract(root, slug);
  if (!c) return { ok: true, state: 'none', note: 'no goal contract' };
  saveContract(root, slug, { ...c, state: 'cleared' });
  if (existsSync(armPath(root, slug))) {
    const a = JSON.parse(readFileSync(armPath(root, slug), 'utf8'));
    writeAtomic(armPath(root, slug), `${JSON.stringify({ ...a, state: 'cleared' }, null, 2)}\n`);
  }
  return { ok: true, state: 'cleared', host: clearPlan(c.host) };
}

function flags(rest) {
  const pos = [];
  const f = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = rest[i + 1];
      const val = v === undefined || v.startsWith('--') ? true : (i++, v);
      // A flag given twice (--proof) collects a list.
      f[k] = f[k] === undefined ? val : [].concat(f[k], val);
    } else pos.push(a);
  }
  return { pos, f };
}

export function main(argv = process.argv.slice(2)) {
  const [cmd, rootArg, slug, ...rest] = argv;
  if (!cmd || !rootArg || !slug) { process.stderr.write(`${USAGE}\n`); return 2; }
  const root = resolve(rootArg);
  const { pos, f } = flags(rest);
  if (cmd === 'check') {
    process.stdout.write(`${check(root, slug)}\n`);
    return 0;
  }
  let out;
  try {
    switch (cmd) {
      case 'arm': out = arm(root, slug, f); break;
      case 'park': out = park(root, slug, pos[0], f); break;
      case 'status': out = status(root, slug); break;
      case 'clear': out = clear(root, slug); break;
      case 'lifecycle': out = { ok: true, ...lifecycleDone(root, slug) }; break;
      default: out = null;
    }
  } catch (e) {
    out = { ok: false, error: e.message };
  }
  if (out === null) { process.stderr.write(`${USAGE}\n`); return 2; }
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  return out.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
