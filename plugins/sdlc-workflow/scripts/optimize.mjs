#!/usr/bin/env node
/**
 * scripts/optimize.mjs — the disk side of /wf loop optimize (WF-OPTIMIZE-PLAN 4.2, D4).
 * Bundled to dist/optimize.mjs; skills/wf/scripts/optimize.mjs runs the bundle.
 *
 *   baseline        <root> <slug>                     the worktree, the guard, the metric `repeat` times, the holdout
 *   status          <root> <slug>                     running | complete | stopped | finished, and the next action
 *   propose-context <root> <slug>                     the digest of the next proposer (4.5); checks out its branch
 *   trial           <root> <slug> <id> [--hypothesis t | --hypothesis-file f] [--expected e]
 *                                                     judge the change in the worktree: kept, reverted, rejected, crashed, timeout
 *   round-open      <root> <slug> [schedule|plateau]  open a branch round (4.4)
 *   round-close     <root> <slug>                     pick the winner, fast-forward the trunk, delete the other branches
 *   checkpoint      <root> <slug>                     run the holdout and compare it to the baseline (D7)
 *   finish          <root> <slug> [--message m]       squash the kept trials onto the slug branch; write the slice artifacts
 *   cleanup         <root> <slug>                     remove the worktree and the trunk branch after finish
 *
 * Every command prints one JSON object on stdout. The model proposes and edits only:
 * this script makes every git write, every measurement, and every keep or revert.
 *
 * WARNING: this script runs `git reset --hard` and `git clean -fd` inside the optimize
 * worktree. It refuses to run them when the worktree path is the project root, or when
 * git does not report the worktree as its own top level. A reset in the person's own
 * tree destroys uncommitted work.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { safeParseFrontmatter } from '../lib/frontmatter.mjs';
import {
  SPEC_FILE, buildDigest, commandFiles, gainOf, holdoutRegressed, keepDecision, keptTable, laneBest, median, newState,
  nextAction, parseMetricLine, parseSpec, pathViolations, pickWinner, branchNameOf,
} from '../lib/optimize.mjs';

const USAGE = 'Usage: optimize.mjs <baseline|status|propose-context|trial|round-open|round-close|checkpoint|finish|cleanup> <projectRoot> <slug> ...';
const PLUGIN_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SLICE = 'optimize';

const wfDir = (root, slug) => join(root, '.ai', 'workflows', slug);
const optDir = (root, slug) => join(wfDir(root, slug), 'optimize');
const statePath = (root, slug) => join(optDir(root, slug), 'state.json');
const resultsPath = (root, slug) => join(optDir(root, slug), 'results.jsonl');
const controlPath = (root, slug) => join(wfDir(root, slug), '.control.json');
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

function git(cwd, args) {
  const r = spawnSync('git', ['-c', 'core.longpaths=true', '-C', cwd, ...args], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}
const gitOk = (cwd, args, what) => {
  const r = git(cwd, args);
  if (!r.ok) throw new Error(`${what}: git ${args.join(' ')} failed: ${r.err || r.out}`);
  return r.out;
};

/** One shell command in `cwd`, with a timeout. */
function runCommand(command, cwd, timeoutMs) {
  const t0 = Date.now();
  const r = spawnSync(command, { cwd, shell: true, encoding: 'utf8', windowsHide: true, timeout: timeoutMs ?? undefined, maxBuffer: 64 * 1024 * 1024 });
  const timedOut = r.error?.code === 'ETIMEDOUT' || (r.signal && Date.now() - t0 >= (timeoutMs ?? Infinity));
  return { code: r.status ?? (timedOut ? 124 : 1), stdout: r.stdout || '', stderr: r.stderr || '', timedOut: !!timedOut, ms: Date.now() - t0 };
}
const tail = (text, n = 20) => String(text ?? '').split(/\r?\n/).filter((l) => l.trim()).slice(-n).join('\n');

function readFm(file) {
  if (!existsSync(file)) return null;
  const text = readFileSync(file, 'utf8');
  const p = safeParseFrontmatter(text);
  return { data: p.data, content: p.content ?? '', error: p.parseError };
}

function loadSpec(root, slug) {
  const f = readFm(join(wfDir(root, slug), SPEC_FILE));
  if (!f) throw new Error(`no ${SPEC_FILE}: write the spec with /wf intake optimize first`);
  if (f.error) throw new Error(`${SPEC_FILE} does not parse: ${f.error}`);
  const { spec, errors } = parseSpec(f.data);
  if (errors.length) throw new Error(`${SPEC_FILE}: ${errors.join('; ')}`);
  return { spec, prose: f.content.trim() };
}

const readState = (root, slug) => (existsSync(statePath(root, slug)) ? JSON.parse(readFileSync(statePath(root, slug), 'utf8')) : null);
const saveState = (root, slug, state) => writeAtomic(statePath(root, slug), `${JSON.stringify(state, null, 2)}\n`);
function readResults(root, slug) {
  const f = resultsPath(root, slug);
  if (!existsSync(f)) return [];
  return readFileSync(f, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
}
function appendResult(root, slug, line) {
  mkdirSync(optDir(root, slug), { recursive: true });
  appendFileSync(resultsPath(root, slug), `${JSON.stringify({ at: nowIso(), ...line })}\n`);
}
function readControl(root, slug) {
  const f = controlPath(root, slug);
  if (!existsSync(f)) return null;
  try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return { action: 'stop', reason: '.control.json does not parse' }; }
}

/** The tokens of the slug since the start, from the cost ledger (lib/cost-ledger.mjs). */
function tokensSince(root, slug, startedAt) {
  const f = join(wfDir(root, slug), 'cost.jsonl');
  if (!existsSync(f)) return null;
  let sum = 0;
  const t0 = Date.parse(startedAt);
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    if (Date.parse(row.ts) < t0) continue;
    const add = (u) => { if (u) sum += Number(u.input_tokens ?? 0) + Number(u.output_tokens ?? 0); };
    add(row.main);
    for (const s of row.subagents ?? []) add(s);
  }
  return sum;
}

const indexOf = (root, slug) => readFm(join(wfDir(root, slug), '00-index.md'))?.data ?? null;
const samePath = (a, b) => {
  const n = (p) => { try { return realpathSync(p); } catch { return resolve(p); } };
  return n(a).replace(/\\/g, '/').toLowerCase() === n(b).replace(/\\/g, '/').toLowerCase();
};

/** WARNING guard: a reset runs only inside the optimize worktree. */
function assertWorktree(root, state) {
  const wt = state.worktree;
  if (!wt || !existsSync(wt)) throw new Error(`the optimize worktree ${wt} does not exist`);
  if (samePath(wt, root)) throw new Error('the optimize worktree is the project root: refusing to reset it');
  const top = git(wt, ['rev-parse', '--show-toplevel']);
  if (!top.ok || !samePath(top.out, wt)) throw new Error(`git does not report ${wt} as its own top level: refusing to reset it`);
}
const currentBranch = (cwd) => git(cwd, ['branch', '--show-current']).out;
const headOf = (cwd) => git(cwd, ['rev-parse', 'HEAD']).out;
/** The changed paths of the worktree, from the raw `-z` output: a trim would cut the status column. */
const dirtyPaths = (cwd) => {
  const r = spawnSync('git', ['-C', cwd, 'status', '--porcelain', '-z', '-uall'], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const parts = (r.stdout || '').split('\0');
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i];
    if (e.length < 4) continue;
    out.push(e.slice(3));
    // A rename or a copy carries its source path as the next entry.
    if (e[0] === 'R' || e[0] === 'C') out.push(parts[++i]);
  }
  return out.filter(Boolean);
};
function resetTo(root, state, commit) {
  assertWorktree(root, state);
  gitOk(state.worktree, ['reset', '--hard', commit], 'reset');
  gitOk(state.worktree, ['clean', '-fd'], 'clean');
}
function checkout(root, state, branch) {
  if (currentBranch(state.worktree) === branch) return;
  if (dirtyPaths(state.worktree).length) throw new Error(`the worktree has uncommitted changes on ${currentBranch(state.worktree)}: run trial on them, or discard them, before another branch takes its turn`);
  gitOk(state.worktree, ['checkout', '-q', branch], 'checkout');
}

/** The metric `n` times in `cwd`. */
function measure(spec, cwd, n, command = spec.metric.command, key = spec.metric.key) {
  const values = [];
  const runs = [];
  for (let i = 0; i < n; i++) {
    const r = runCommand(command, cwd, spec.budget.trialTimeoutMs);
    runs.push({ code: r.code, ms: r.ms });
    if (r.timedOut) return { values, timeout: true, output: tail(r.stdout + r.stderr) };
    const v = r.code === 0 ? parseMetricLine(r.stdout, key) : null;
    if (v === null) return { values, crashed: true, output: tail(r.stdout + r.stderr), code: r.code };
    values.push(v);
  }
  return { values, median: median(values), runs };
}

/** state.json and results.jsonl must agree, and the branch must sit where the loop left it (4.6 state-error). */
function consistency(root, slug, state, results) {
  const trials = results.filter((r) => r.event === 'trial').length;
  if (trials !== state.counters.trials) return `state.json counts ${state.counters.trials} trials and results.jsonl holds ${trials}`;
  if (state.finished || !state.worktree || !existsSync(state.worktree)) return null;
  const branch = currentBranch(state.worktree);
  const best = laneBest(state, branch === state.trunk ? 'trunk' : branch);
  if (!best) return `the worktree is on ${branch || 'a detached HEAD'}, which is not a branch of the loop`;
  const head = headOf(state.worktree);
  if (head !== best.commit) return `HEAD of ${branch} is ${head.slice(0, 12)}, and the loop left it at ${best.commit.slice(0, 12)}: the branch moved outside the loop`;
  return null;
}

/** The status of the loop. Exported for scripts/goal.mjs (kind optimize). */
export function optimizeStatus(root, slug) {
  const state = readState(root, slug);
  if (!state) return { ok: true, state: 'stopped', reason: 'no-baseline', next: { action: 'baseline' } };
  const { spec } = loadSpec(root, slug);
  const results = readResults(root, slug);
  const err = consistency(root, slug, state, results);
  if (err) return { ok: true, state: 'stopped', reason: 'state-error', detail: err, next: { action: 'person', why: 'report; do not repair' } };
  const st = nextAction({ state, spec, control: readControl(root, slug), tokensUsed: tokensSince(root, slug, state.startedAt) });
  return {
    ok: true,
    ...st,
    best: state.best,
    baseline: { median: state.baseline.median, noise: state.baseline.noise },
    counters: state.counters,
    budget: { trials: spec.budget.trials, roundsMax: spec.rounds.at.length + spec.rounds.maxExtra, width: spec.width },
    round: state.round ? { n: state.round.n, reason: state.round.reason, branches: state.round.branches.map((b) => ({ k: b.k, name: b.name, trials: b.trials, keeps: b.keeps, best: b.best.value })) } : null,
    rounds: state.rounds.length,
  };
}

function requireNext(root, slug, action) {
  const st = optimizeStatus(root, slug);
  if (st.state !== 'running' || st.next?.action !== action) {
    throw new Error(`the next action is ${st.next?.action ?? 'none'} (${st.state}${st.reason && st.reason !== 'running' ? `: ${st.reason}` : ''}${st.detail ? `, ${st.detail}` : ''}), not ${action}`);
  }
  return st;
}

// ---------------------------------------------------------------------------
// baseline
// ---------------------------------------------------------------------------
function baseline(root, slug) {
  if (readState(root, slug)) throw new Error('the baseline exists: run status, or /wf loop optimize <slug> to continue');
  const { spec } = loadSpec(root, slug);
  if (!spec.confirmedBy) throw new Error(`${SPEC_FILE} has no confirmed-by: the person confirms the spec before the first trial (D3)`);
  const index = indexOf(root, slug);
  const slugBranch = String(index?.branch ?? '').trim() || currentBranch(root);
  const base = git(root, ['rev-parse', '--verify', `${slugBranch || 'HEAD'}^{commit}`]);
  if (!base.ok) throw new Error(`the slug branch ${slugBranch} does not resolve`);
  const wt = spec.worktree ? resolve(root, spec.worktree) : join(dirname(root), `${basename(root)}.optimize`, slug);
  const trunk = `optimize/${slug}`;
  if (existsSync(wt)) {
    if (!samePath(git(wt, ['rev-parse', '--show-toplevel']).out || '', wt) || currentBranch(wt) !== trunk) throw new Error(`${wt} exists and is not the optimize worktree of ${slug}: remove it or set worktree: in the spec`);
    if (headOf(wt) !== base.out) throw new Error(`${wt} is at ${headOf(wt).slice(0, 12)}, not at the slug branch ${base.out.slice(0, 12)}`);
  } else {
    mkdirSync(dirname(wt), { recursive: true });
    const has = git(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${trunk}`]).ok;
    if (has) throw new Error(`the branch ${trunk} exists from another run: ask the person to delete or rename it`);
    gitOk(root, ['worktree', 'add', '-q', '-b', trunk, wt, base.out], 'worktree add');
  }
  if (spec.setup) {
    const s = runCommand(spec.setup, wt, 60 * 60_000);
    if (s.code !== 0) return { ok: false, error: `the setup command failed (exit ${s.code})`, output: tail(s.stdout + s.stderr) };
  }
  const g = runCommand(spec.guard.command, wt, spec.budget.trialTimeoutMs);
  if (g.code !== 0) return { ok: false, guardRed: true, error: `the guard fails at the baseline (exit ${g.code}): a loop cannot start from a red guard`, output: tail(g.stdout + g.stderr) };
  const m = measure(spec, wt, spec.metric.repeat);
  if (m.crashed || m.timeout) return { ok: false, error: `the metric ${m.timeout ? 'timed out' : 'did not print a number'} at the baseline`, output: m.output };
  let holdout = null;
  if (spec.holdout) {
    const h = measure(spec, wt, spec.metric.repeat, spec.holdout.command, null);
    if (h.crashed || h.timeout) return { ok: false, error: 'the holdout did not print a number at the baseline', output: h.output };
    holdout = h.median;
  }
  const state = newState({ slug, worktree: wt, baseCommit: base.out, values: m.values, holdoutValue: holdout, startedAt: nowIso(), slugBranch });
  appendResult(root, slug, { event: 'baseline', commit: base.out, values: m.values, median: state.baseline.median, noise: state.baseline.noise, holdout });
  saveState(root, slug, state);
  return { ok: true, worktree: wt, branch: trunk, baseline: state.baseline, ...optimizeStatus(root, slug) };
}

// ---------------------------------------------------------------------------
// propose-context
// ---------------------------------------------------------------------------
function solutionsFor(root, spec) {
  const dir = join(root, '.ai', 'solutions');
  if (!existsSync(dir)) return [];
  const want = new Set(['optimize', ...spec.tags].map((t) => t.toLowerCase()));
  const out = [];
  const stack = [dir];
  while (stack.length && out.length < 10) {
    const d = stack.pop();
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) { stack.push(p); continue; }
      if (!e.name.endsWith('.md') || e.name === 'INDEX.md') continue;
      const f = readFm(p);
      const tags = Array.isArray(f?.data?.tags) ? f.data.tags.map((t) => String(t).toLowerCase()) : [];
      if (f?.data?.status === 'active' && tags.some((t) => want.has(t))) {
        out.push({ path: relative(root, p).replace(/\\/g, '/'), title: (/^#\s+(.+)$/m.exec(f.content) || [])[1] ?? e.name });
      }
    }
  }
  return out;
}

function proposeContext(root, slug) {
  const st = requireNext(root, slug, 'trial');
  const state = readState(root, slug);
  const { spec, prose } = loadSpec(root, slug);
  checkout(root, state, st.next.on);
  const lane = st.next.on === state.trunk ? 'trunk' : st.next.on;
  const digest = buildDigest({ spec, specProse: prose, state, results: readResults(root, slug), lane, solutions: lane === 'trunk' ? solutionsFor(root, spec) : [] });
  return { ok: true, why: st.next.why, digest };
}

// ---------------------------------------------------------------------------
// trial
// ---------------------------------------------------------------------------
function trial(root, slug, id, f) {
  if (!id) throw new Error('trial needs a hypothesis id');
  const st = requireNext(root, slug, 'trial');
  const state = readState(root, slug);
  const { spec } = loadSpec(root, slug);
  assertWorktree(root, state);
  const wt = state.worktree;
  const laneName = st.next.on;
  const isTrunk = laneName === state.trunk;
  if (currentBranch(wt) !== laneName) throw new Error(`the worktree is on ${currentBranch(wt)}, and this trial runs on ${laneName}: run propose-context first`);
  const round = state.round;
  const branch = isTrunk ? null : round.branches.find((b) => b.name === laneName);
  const best = isTrunk ? state.best : branch.best;
  const text = f['hypothesis-file'] ? readFileSync(resolve(root, f['hypothesis-file']), 'utf8').trim() : String(f.hypothesis ?? '').trim();
  const hypothesis = { id, text, expected: String(f.expected ?? '').trim() };
  const n = state.counters.trials + 1;
  const line = { event: 'trial', trial: n, round: isTrunk ? null : round.n, branch: isTrunk ? null : laneName, hypothesis, values: [], median: null, delta: null, noise: state.baseline.noise, guard: null };
  const finish = (verdict, extra = {}) => {
    Object.assign(line, { verdict, ...extra });
    if (verdict !== 'kept') resetTo(root, state, best.commit);
    state.counters.trials = n;
    if (isTrunk) {
      state.counters.trunkTrials++;
      state.counters.sinceCheckpoint++;
      state.counters.streak = verdict === 'kept' ? 0 : state.counters.streak + 1;
    } else {
      branch.trials++;
    }
    appendResult(root, slug, line);
    saveState(root, slug, state);
    return { ok: true, trial: n, lane: isTrunk ? 'trunk' : laneName, verdict, reason: line.reason ?? null, median: line.median, delta: line.delta, threshold: line.threshold ?? null, best: isTrunk ? state.best : branch.best, ...(line.output ? { output: line.output } : {}), next: optimizeStatus(root, slug).next };
  };
  const paths = dirtyPaths(wt);
  if (!paths.length) return finish('rejected', { reason: 'the worktree holds no change' });
  const auto = commandFiles([spec.metric.command, spec.guard.command, spec.holdout?.command], (p) => existsSync(join(wt, p)));
  const bad = pathViolations(paths, spec, auto);
  if (bad.length) return finish('rejected', { reason: `path check: ${bad.map((b) => `${b.path} (${b.reason})`).join(', ')}`, paths });
  gitOk(wt, ['add', '-A'], 'add');
  gitOk(wt, ['commit', '-q', '-m', `experiment ${id}${text ? `: ${text.split(/\r?\n/)[0].slice(0, 60)}` : ''}`], 'commit');
  line.commit = headOf(wt);
  line.paths = paths;
  const g = runCommand(spec.guard.command, wt, spec.budget.trialTimeoutMs);
  line.guard = g.code === 0 ? 'pass' : 'fail';
  if (g.timedOut) return finish('timeout', { reason: 'the guard timed out', output: tail(g.stdout + g.stderr) });
  if (g.code !== 0) return finish('reverted', { reason: `the guard failed (exit ${g.code})`, output: tail(g.stdout + g.stderr) });
  const m = measure(spec, wt, spec.metric.repeat);
  if (m.timeout) return finish('timeout', { reason: 'the metric timed out', values: m.values, output: m.output });
  if (m.crashed) return finish('crashed', { reason: 'the metric did not print a number', values: m.values, output: m.output });
  line.values = m.values;
  line.median = m.median;
  line.delta = gainOf(spec.metric.direction, best.value, m.median);
  let d = keepDecision({ spec, best: best.value, noise: state.baseline.noise, first: m.median });
  line.threshold = d.threshold;
  if (d.needConfirm) {
    const c = measure(spec, wt, spec.metric.repeat);
    if (c.timeout || c.crashed) return finish(c.timeout ? 'timeout' : 'crashed', { reason: 'the confirm run failed', output: c.output });
    line.confirm = c.values;
    d = keepDecision({ spec, best: best.value, noise: state.baseline.noise, first: m.median, confirm: c.median });
    if (d.kept) {
      line.median = median([...m.values, ...c.values]);
      line.delta = gainOf(spec.metric.direction, best.value, line.median);
    }
  }
  if (!d.kept) return finish('reverted', { reason: d.wins ? 'the confirm run did not agree' : `the gain ${line.delta} is not above the threshold ${d.threshold}` });
  const kept = { commit: line.commit, value: line.median, trial: n, reachedAt: n };
  if (isTrunk) state.best = kept;
  else { branch.best = kept; branch.keeps++; }
  state.counters.keeps++;
  return finish('kept');
}

// ---------------------------------------------------------------------------
// branch rounds (4.4)
// ---------------------------------------------------------------------------
function roundOpen(root, slug) {
  const st = requireNext(root, slug, 'round-open');
  const state = readState(root, slug);
  const { spec } = loadSpec(root, slug);
  assertWorktree(root, state);
  if (dirtyPaths(state.worktree).length) throw new Error('the worktree has uncommitted changes: a round forks from the trunk best only');
  const n = state.rounds.length + 1;
  const point = st.next.point;
  const reason = point === 'extra' || /^plateau/.test(st.next.why ?? '') ? 'plateau' : 'schedule';
  const branches = [];
  for (let k = 1; k <= spec.rounds.branches; k++) {
    const name = branchNameOf(slug, n, k);
    if (git(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${name}`]).ok) throw new Error(`the branch ${name} exists: a branch of round ${n} from another run. Ask the person.`);
    gitOk(state.worktree, ['branch', name, state.best.commit], 'branch');
    branches.push({ k, name, best: { ...state.best, reachedAt: 0 }, trials: 0, keeps: 0 });
  }
  state.round = { n, reason, point, why: st.next.why, branchTrials: spec.rounds.branchTrials, openedAtTrial: state.counters.trials, from: state.best.commit, branches };
  if (point === 'extra') state.extraRounds++;
  else state.schedule.used.push(point);
  appendResult(root, slug, { event: 'round-open', round: n, reason, why: st.next.why, from: state.best.commit, branches: branches.map((b) => b.name) });
  saveState(root, slug, state);
  return { ok: true, round: n, reason, why: st.next.why, branches: branches.map((b) => b.name), branchTrials: spec.rounds.branchTrials, next: optimizeStatus(root, slug).next };
}

function runCheckpoint(root, slug, state, spec) {
  if (!spec.holdout) return { ran: false };
  checkout(root, state, state.trunk);
  const h = measure(spec, state.worktree, spec.metric.repeat, spec.holdout.command, null);
  const value = h.crashed || h.timeout ? null : h.median;
  const regressed = value === null || holdoutRegressed(spec, state.baseline.holdout, value);
  const since = state.lastCheckpoint?.trial ?? 0;
  state.counters.sinceCheckpoint = 0;
  if (regressed) {
    state.stopped = { reason: 'holdout-regression', detail: value === null ? 'the holdout did not print a number' : `the holdout is ${value} against the baseline ${state.baseline.holdout}; trials ${since + 1} to ${state.counters.trials}`, at: nowIso() };
  } else state.lastCheckpoint = { trial: state.counters.trials, ok: true, value };
  appendResult(root, slug, { event: 'checkpoint', trial: state.counters.trials, value, baseline: state.baseline.holdout, ok: !regressed });
  return { ran: true, value, ok: !regressed };
}

function roundClose(root, slug) {
  requireNext(root, slug, 'round-close');
  const state = readState(root, slug);
  const { spec } = loadSpec(root, slug);
  assertWorktree(root, state);
  const r = state.round;
  const winner = pickWinner(r, spec.metric.direction);
  checkout(root, state, state.trunk);
  if (winner) {
    gitOk(state.worktree, ['merge', '-q', '--ff-only', winner.best.commit], 'fast-forward');
    state.best = { ...winner.best };
    state.digestFrom = { trial: state.counters.trials, round: r.n, branch: winner.name };
  }
  // CAUTION: delete only the branches that state.json lists for this round, by their exact names.
  const deleted = [];
  for (const b of r.branches) {
    if (git(state.worktree, ['branch', '-D', b.name]).ok) deleted.push(b.name);
  }
  state.counters.streak = 0;
  const summary = { n: r.n, reason: r.reason, from: r.from, winner: winner ? { k: winner.k, name: winner.name, value: winner.best.value, commit: winner.best.commit } : null, branches: r.branches.map((b) => ({ k: b.k, trials: b.trials, keeps: b.keeps, best: b.best.value })) };
  state.rounds.push(summary);
  state.round = null;
  if (!winner && r.reason === 'plateau') state.stopped = { reason: 'plateau', detail: `the trunk found no gain in ${spec.budget.plateau} trials, and no branch of round ${r.n} beat it`, at: nowIso() };
  appendResult(root, slug, { event: 'round-close', round: r.n, winner: summary.winner, branches: summary.branches });
  const cp = state.stopped ? { ran: false } : runCheckpoint(root, slug, state, spec);
  saveState(root, slug, state);
  return { ok: true, round: r.n, winner: summary.winner ?? 'trunk', deleted, checkpoint: cp, ...optimizeStatus(root, slug) };
}

function checkpoint(root, slug) {
  const st = optimizeStatus(root, slug);
  if (st.state !== 'running') throw new Error(`the loop is ${st.state}: ${st.reason}`);
  if (st.round) throw new Error('a branch round is open: the checkpoint runs at round-close');
  const state = readState(root, slug);
  const { spec } = loadSpec(root, slug);
  if (!spec.holdout) return { ok: true, ran: false, note: 'the spec names no holdout' };
  assertWorktree(root, state);
  const cp = runCheckpoint(root, slug, state, spec);
  saveState(root, slug, state);
  return { ok: true, ...cp, ...optimizeStatus(root, slug) };
}

// ---------------------------------------------------------------------------
// finish and cleanup
// ---------------------------------------------------------------------------
const yamlList = (xs) => `[${xs.map((x) => JSON.stringify(x)).join(', ')}]`;

function finish(root, slug, f) {
  const state = readState(root, slug);
  if (!state) throw new Error('no baseline: nothing to finish');
  if (state.finished) return { ok: true, already: true, finished: state.finished };
  if (state.round) throw new Error('a branch round is open: run round-close first');
  const { spec } = loadSpec(root, slug);
  const results = readResults(root, slug);
  const err = consistency(root, slug, state, results);
  if (err) throw new Error(`state-error: ${err}`);
  const at = nowIso();
  // The lineage: the trunk's keeps and the keeps of each round's winner. A losing branch's keeps are not in the squash.
  const winners = new Set(state.rounds.filter((r) => r.winner).map((r) => `${r.n}:${r.winner.name}`));
  const lineage = results.filter((r) => r.event !== 'trial' || r.branch === null || winners.has(`${r.round}:${r.branch}`));
  const kept = lineage.filter((r) => r.event === 'trial' && r.verdict === 'kept');
  if (state.best.commit === state.baseCommit) {
    state.finished = { commit: null, at, gain: 0, kept: 0 };
    appendResult(root, slug, { event: 'finish', commit: null, gain: 0 });
    saveState(root, slug, state);
    return { ok: true, kept: 0, note: 'no trial was kept: nothing to squash. Close the slug, or write a new spec.' };
  }
  const branch = state.slugBranch;
  if (branch && currentBranch(root) !== branch) throw new Error(`the main checkout is on ${currentBranch(root) || 'a detached HEAD'}, not on the slug branch ${branch}: switch to it, then finish again`);
  const tracked = git(root, ['status', '--porcelain', '--untracked-files=no']).out;
  if (tracked) throw new Error('the main checkout has uncommitted changes to tracked files: commit or stash them, then finish again');
  const m = git(root, ['merge', '--squash', state.trunk]);
  if (!m.ok) {
    git(root, ['reset', '--merge']);
    throw new Error(`the squash of ${state.trunk} does not apply cleanly: ${m.err || m.out}`);
  }
  const gain = gainOf(spec.metric.direction, state.baseline.median, state.best.value);
  const unit = spec.metric.unit ? ` ${spec.metric.unit}` : '';
  const message = String(f.message ?? '').trim() || `${spec.objective}: ${state.baseline.median}${unit} to ${state.best.value}${unit}`;
  gitOk(root, ['commit', '-q', '-m', message], 'commit');
  const sha = headOf(root);
  const files = gitOk(root, ['diff', '--name-only', `${sha}~1`, sha], 'diff').split(/\r?\n/).filter(Boolean);
  const stat = gitOk(root, ['diff', '--numstat', `${sha}~1`, sha], 'diff').split(/\r?\n/).filter(Boolean).map((l) => l.split('\t'));
  const added = stat.reduce((s, x) => s + (Number(x[0]) || 0), 0);
  const removed = stat.reduce((s, x) => s + (Number(x[1]) || 0), 0);
  const dir = wfDir(root, slug);
  if (!existsSync(join(dir, '03-slice.md'))) {
    writeAtomic(join(dir, '03-slice.md'), [
      '---', 'schema: sdlc/v1', 'type: slice-index', `slug: ${slug}`, 'status: complete', 'stage-number: 3', `created-at: "${at}"`, `updated-at: "${at}"`,
      'total-slices: 1', `best-first-slice: ${SLICE}`, 'tags: [optimize]', 'slices:', `  - slug: ${SLICE}`, '    status: complete', '    complexity: m', '    depends-on: []',
      'refs:', '  index: 00-index.md', `  spec: ${SPEC_FILE}`, 'next-command: wf-verify', `next-invocation: "/wf verify ${slug} ${SLICE}"`, '---', '',
      '# Slice Index', '', `One slice, \`${SLICE}\`: the kept trials of the optimize loop, squashed into one commit.`, '',
    ].join('\n'));
  }
  const holdoutAc = spec.holdout ? `\n3. When the holdout runs, \`${spec.holdout.command}\` is within ${spec.holdout.tolerance.percent !== undefined ? `${spec.holdout.tolerance.percent}%` : spec.holdout.tolerance.absolute} of the baseline holdout ${state.baseline.holdout}.` : '';
  writeAtomic(join(dir, `03-slice-${SLICE}.md`), [
    '---', 'schema: sdlc/v1', 'type: slice', `slug: ${slug}`, `slice-slug: ${SLICE}`, 'status: complete', 'stage-number: 3', `created-at: "${at}"`, `updated-at: "${at}"`,
    'complexity: m', 'depends-on: []', 'tags: [optimize]', 'ux-impact: none',
    'refs:', '  index: 00-index.md', '  slice-index: 03-slice.md', `  implement: 05-implement-${SLICE}.md`, 'next-command: wf-verify', `next-invocation: "/wf verify ${slug} ${SLICE}"`, '---', '',
    `# Slice: ${SLICE}`, '', `The kept trials of the loop toward: ${spec.objective}`, '',
    '## Acceptance Criteria', '',
    `1. \`${spec.metric.command}\`, ${spec.metric.repeat} runs, reaches ${state.best.value}${unit} within the noise floor ${state.baseline.noise}${unit} (median; direction ${spec.metric.direction}).`,
    `2. \`${spec.guard.command}\` exits 0.${holdoutAc}`, '',
  ].join('\n'));
  writeAtomic(join(dir, `05-implement-${SLICE}.md`), [
    '---', 'schema: sdlc/v1', 'type: implement', `slug: ${slug}`, `slice-slug: ${SLICE}`, 'status: complete', 'stage-number: 5', `created-at: "${at}"`, `updated-at: "${at}"`,
    `metric-files-changed: ${files.length}`, `metric-lines-added: ${added}`, `metric-lines-removed: ${removed}`, 'metric-deviations-from-plan: 0', 'metric-review-fixes-applied: 0',
    `commit-sha: "${sha}"`, `files-modified: ${yamlList(files)}`, 'tags: [optimize]',
    `optimize-baseline: ${state.baseline.median}`, `optimize-kept-value: ${state.best.value}`, `optimize-noise: ${state.baseline.noise}`, `optimize-trials: ${state.counters.trials}`, `optimize-kept: ${kept.length}`, `optimize-rounds: ${state.rounds.length}`,
    'refs:', '  index: 00-index.md', `  slice-def: 03-slice-${SLICE}.md`, `  verify: 06-verify-${SLICE}.md`, '  results: optimize/results.jsonl',
    'next-command: wf-verify', `next-invocation: "/wf verify ${slug} ${SLICE}"`, '---', '',
    `# Implement: ${SLICE}`, '', '## Summary of Changes', '',
    `- The loop ran ${state.counters.trials} trials in ${state.rounds.length} branch round(s) and kept ${kept.length}.`,
    `- The metric moved from ${state.baseline.median}${unit} to ${state.best.value}${unit} (gain ${gain}${unit}; noise floor ${state.baseline.noise}${unit}).`,
    `- One squashed commit: ${sha}.`, '', '## Kept Trials', '', keptTable(lineage, spec), '', '## Files Changed', '', ...files.map((p) => `- ${p}`), '',
  ].join('\n'));
  state.finished = { commit: sha, at, gain, kept: kept.length };
  appendResult(root, slug, { event: 'finish', commit: sha, gain, kept: kept.length });
  saveState(root, slug, state);
  return { ok: true, commit: sha, gain, kept: kept.length, files, wrote: ['03-slice.md', `03-slice-${SLICE}.md`, `05-implement-${SLICE}.md`], next: { action: 'verify', invocation: `/wf verify ${slug} ${SLICE}` } };
}

/** A junction or a symbolic link under the worktree: a recursive delete can follow one into the main checkout. */
function linksUnder(dir, limit = 20) {
  const found = [];
  const stack = [dir];
  while (stack.length && found.length < limit) {
    const d = stack.pop();
    let entries = [];
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.name === '.git') continue;
      const p = join(d, e.name);
      let st;
      try { st = lstatSync(p); } catch { continue; }
      if (st.isSymbolicLink()) found.push(relative(dir, p));
      else if (st.isDirectory()) stack.push(p);
    }
  }
  return found;
}

function cleanup(root, slug) {
  const state = readState(root, slug);
  if (!state) throw new Error('no baseline: nothing to clean up');
  if (!state.finished) throw new Error('the loop is not finished: run finish first');
  const out = { ok: true, removed: [], kept: [] };
  if (existsSync(state.worktree)) {
    // CAUTION: `git worktree remove --force` deletes through a node_modules junction into the main checkout.
    const links = linksUnder(state.worktree);
    if (links.length) return { ok: false, links, error: `the worktree holds links (${links.slice(0, 3).join(', ')}). A recursive delete can follow a link. Remove the links, then run cleanup again.` };
    const r = git(root, ['worktree', 'remove', state.worktree]);
    if (!r.ok) return { ok: false, error: `git worktree remove failed: ${r.err}. The worktree may hold files that git does not track; look at them, then remove the folder yourself.` };
    out.removed.push(state.worktree);
  }
  if (git(root, ['branch', '-D', state.trunk]).ok) out.removed.push(state.trunk);
  state.cleanedAt = nowIso();
  saveState(root, slug, state);
  return out;
}

// ---------------------------------------------------------------------------
function flags(rest) {
  const pos = [];
  const f = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = rest[i + 1];
      if (v === undefined || v.startsWith('--')) f[k] = true;
      else { f[k] = v; i++; }
    } else pos.push(a);
  }
  return { pos, f };
}

export function main(argv = process.argv.slice(2)) {
  const [cmd, rootArg, slug, ...rest] = argv;
  if (!cmd || !rootArg || !slug) { process.stderr.write(`${USAGE}\n`); return 2; }
  const root = resolve(rootArg);
  const { pos, f } = flags(rest);
  let out;
  try {
    switch (cmd) {
      case 'baseline': out = baseline(root, slug); break;
      case 'status': out = optimizeStatus(root, slug); break;
      case 'propose-context': out = proposeContext(root, slug); break;
      case 'trial': out = trial(root, slug, pos[0], f); break;
      case 'round-open': out = roundOpen(root, slug); break;
      case 'round-close': out = roundClose(root, slug); break;
      case 'checkpoint': out = checkpoint(root, slug); break;
      case 'finish': out = finish(root, slug, f); break;
      case 'cleanup': out = cleanup(root, slug); break;
      default: out = null;
    }
  } catch (e) {
    out = { ok: false, error: e.message };
  }
  if (out === null) { process.stderr.write(`${USAGE}\n`); return 2; }
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  return out.ok ? 0 : 1;
}

export { PLUGIN_ROOT };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
