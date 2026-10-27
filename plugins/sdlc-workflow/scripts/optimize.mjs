#!/usr/bin/env node
/**
 * scripts/optimize.mjs — the disk side of /wf loop optimize (WF-OPTIMIZE-PLAN 4.2, D4).
 * skills/wf/scripts/optimize.mjs runs this script.
 *
 *   baseline        <root> <slug>                     the worktree, the guard, the metric `repeat` times, the holdout
 *   status          <root> <slug>                     running | complete | stopped | finished, and the next action
 *   propose-context <root> <slug> [--on <lane>]       the digest of the next proposer (4.5) and the worktree of its lane
 *   trial           <root> <slug> <id> [--on <lane>] [--hypothesis t | --hypothesis-file f] [--expected e]
 *                                                     judge the change in the worktree of the lane: kept, reverted, rejected, crashed, timeout
 *   round-open      <root> <slug> [schedule|plateau]  open a branch round (4.4): one branch and one worktree for each branch
 *   round-close     <root> <slug>                     pick the winner, fast-forward the trunk, remove the branch worktrees and branches
 *   merge-consider  <root> <slug> --try b2,b4 --skip "b3:<reason>"
 *                                                     record which candidates of the closed round to merge into the trunk
 *   merge-trial     <root> <slug> --branch <name>     merge one candidate into the trunk, and judge it as a trial
 *   merge-close     <root> <slug>                     end the merge step: skip the rest, delete the branches, checkpoint
 *   checkpoint      <root> <slug>                     run the holdout and compare it to the baseline (D7)
 *   finish          <root> <slug> [--message m]       squash the kept trials onto the slug branch; write the slice artifacts; clean up
 *   cleanup         <root> <slug>                     remove what finish could not: worktrees, the trunk branch, the build folder
 *   probe-open      <root> <slug> [--on <lane>]       a probe worktree at the best of the lane, for the proposer to instrument
 *   probe           <root> <slug> [--on <lane>] --cmd "<command>" [--label t]
 *                                                     run one command in the probe worktree, under the measure lock
 *   idea-claim      <root> <slug> [--on <lane>] --target t [--family f] [--again "<reason>"]
 *                                                     claim an idea in the shared ideas ledger before the edit
 *   profile         <root> <slug>                     run the profile command of the spec on the trunk best
 *   profile-record  <root> <slug> --file <json> | --skip "<reason>"
 *                                                     record the profile of the profiler agent
 *   probe-open      <root> <slug> [--on <lane>]       a probe worktree at the best of the lane, for the proposer to instrument
 *   probe           <root> <slug> [--on <lane>] --cmd "<command>" [--label t]
 *                                                     run one command in the probe worktree, under the measure lock
 *
 * `--on <lane>` names a branch that status lists in `next.ready`. A round whose branches have
 * their own worktrees lets the driver edit them at the same time; `trial` holds the measure
 * lock (optimize/.measure.lock), so one guard and one measurement run at a time. A proposer
 * builds and runs benchmarks only with `probe`, which takes the same lock: a build during a
 * measurement corrupts its numbers. A proposer
 * builds and runs benchmarks only with `probe`, which takes the same lock: a build during a
 * measurement corrupts its numbers.
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
import { appendFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { safeParseFrontmatter } from '../lib/frontmatter.mjs';
import {
  SPEC_FILE, buildDigest, claimIdea, commandFiles, emptyIdeas, gainOf, holdoutRegressed, keepDecision, keptTable, laneBest, median, newState,
  STATE_VERSION, laneWorktree, mergeCandidates, nextAction, parseMetricLine, parseProfile, parseSpec, pathViolations, pickWinner, profileLines,
  branchNameOf, settleIdea,
} from '../lib/optimize.mjs';
import { workflowDir } from '../lib/records-root.mjs';
import { INDEX_NAME, hasDoc, readDoc, writeDoc } from '../lib/records.mjs';

const USAGE = 'Usage: optimize.mjs <baseline|status|propose-context|trial|round-open|round-close|merge-consider|merge-trial|merge-close|checkpoint|finish|cleanup|probe-open|probe|idea-claim|profile|profile-record> <projectRoot> <slug> ...';
const PLUGIN_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SLICE = 'optimize';

const wfDir = workflowDir;
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

/** One shell command in `cwd`, with a timeout. `env` adds variables to the environment of the command. */
function runCommand(command, cwd, timeoutMs, env = null) {
  const t0 = Date.now();
  const r = spawnSync(command, { cwd, shell: true, encoding: 'utf8', windowsHide: true, timeout: timeoutMs ?? undefined, maxBuffer: 64 * 1024 * 1024, env: env ? { ...process.env, ...env } : undefined });
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

/** One workflow record, in either layout, as readFm gives a file: { data, content, error }, or null. */
function readRecord(dir, name) {
  const doc = readDoc(dir, name);
  if (!doc) return null;
  return { data: doc.frontmatter, content: doc.body ?? '', error: doc.parseError };
}

function loadSpec(root, slug) {
  const f = readRecord(wfDir(root, slug), SPEC_FILE);
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
// The ideas ledger (G2). Proposers claim ideas while a trial runs, so each change of the file
// holds a short lock of its own: a read, the change, and an atomic write.
const ideasPath = (root, slug) => join(optDir(root, slug), 'ideas.json');
const patchesDir = (root, slug) => join(optDir(root, slug), 'patches');
const profileFile = (root, slug) => join(optDir(root, slug), 'profile.json');
const profilePatch = (root, slug) => join(optDir(root, slug), 'profile.patch');
function readIdeas(root, slug) {
  const f = ideasPath(root, slug);
  if (!existsSync(f)) return emptyIdeas();
  try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return emptyIdeas(); }
}
function withIdeas(root, slug, fn) {
  const lock = join(optDir(root, slug), '.ideas.lock');
  mkdirSync(dirname(lock), { recursive: true });
  const until = Date.now() + 10_000;
  for (;;) {
    try { writeFileSync(lock, String(process.pid), { flag: 'wx' }); break; } catch {
      let stale = false;
      try { stale = Date.now() - statSync(lock).mtimeMs > 30_000; } catch { /* gone */ }
      if (stale) rmSync(lock, { force: true });
      else if (Date.now() >= until) throw new Error('the ideas ledger is locked by another command: try again');
      else Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  try {
    const book = readIdeas(root, slug);
    const out = fn(book);
    writeAtomic(ideasPath(root, slug), `${JSON.stringify(book, null, 2)}\n`);
    return out;
  } finally { rmSync(lock, { force: true }); }
}
const readProfile = (root, slug) => (existsSync(profileFile(root, slug)) ? JSON.parse(readFileSync(profileFile(root, slug), 'utf8')) : null);

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

const indexOf = (root, slug) => readRecord(wfDir(root, slug), INDEX_NAME)?.data ?? null;
const samePath = (a, b) => {
  const n = (p) => { try { return realpathSync(p); } catch { return resolve(p); } };
  return n(a).replace(/\\/g, '/').toLowerCase() === n(b).replace(/\\/g, '/').toLowerCase();
};

/** WARNING guard: a reset runs only inside an optimize worktree: the trunk worktree, or the worktree of a branch. */
function assertWorktreePath(root, wt) {
  if (!wt || !existsSync(wt)) throw new Error(`the optimize worktree ${wt} does not exist`);
  if (samePath(wt, root)) throw new Error('the optimize worktree is the project root: refusing to reset it');
  const top = git(wt, ['rev-parse', '--show-toplevel']);
  if (!top.ok || !samePath(top.out, wt)) throw new Error(`git does not report ${wt} as its own top level: refusing to reset it`);
}
const assertWorktree = (root, state) => assertWorktreePath(root, state.worktree);

/** The variables that every command of the loop gets: the shared build folder, when the spec names one. */
const envOf = (state, spec) => (spec.sharedBuild && state.buildDir ? { [spec.sharedBuild]: state.buildDir } : null);
/** The probe worktrees build in their own folder, so an instrumented build never replaces a build of a lane. */
function probeEnvOf(state, spec) {
  if (!spec.sharedBuild || !state.buildDir) return null;
  mkdirSync(`${state.buildDir}-probe`, { recursive: true });
  return { [spec.sharedBuild]: `${state.buildDir}-probe` };
}
/** The shared build folder is recorded once, beside the trunk worktree, and later commands use only that record. */
function ensureBuildDir(state, spec) {
  if (!spec.sharedBuild || state.buildDir) return false;
  state.buildDir = join(dirname(state.worktree), `${basename(state.worktree)}.build`);
  mkdirSync(state.buildDir, { recursive: true });
  return true;
}

// ---------------------------------------------------------------------------
// The measure lock: one guard and one measurement at a time, across processes.
// Two measured runs on one machine corrupt each other's numbers (D8).
// ---------------------------------------------------------------------------
const lockPath = (root, slug) => join(optDir(root, slug), '.measure.lock');
const alive = (pid) => {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
};
/** The holder of the lock, or null when no live process holds it. A stale lock is one whose process is dead, or that is older than three trial timeouts. */
function lockHolder(root, slug, trialTimeoutMs) {
  const f = lockPath(root, slug);
  if (!existsSync(f)) return null;
  let h;
  try { h = JSON.parse(readFileSync(f, 'utf8')); } catch { return null; }
  const old = trialTimeoutMs && Date.now() - Date.parse(h.at) > 3 * trialTimeoutMs;
  return !h.pid || !alive(h.pid) || old ? null : h;
}
function takeLock(root, slug, spec, lane, kind = 'trial') {
  const f = lockPath(root, slug);
  mkdirSync(dirname(f), { recursive: true });
  const holder = lockHolder(root, slug, spec.budget.trialTimeoutMs);
  if (holder) return { ok: false, busy: true, holder, error: `a ${holder.kind ?? 'measurement'} runs on ${holder.lane ?? 'a lane'} (process ${holder.pid}, since ${holder.at}): measurements run one at a time` };
  rmSync(f, { force: true });
  try {
    writeFileSync(f, JSON.stringify({ pid: process.pid, at: new Date().toISOString(), lane, kind }), { flag: 'wx' });
  } catch {
    return { ok: false, busy: true, error: 'another measurement took the lock at the same time: measurements run one at a time' };
  }
  return { ok: true };
}
const LOCK_POLL_MS = Number(process.env.OPTIMIZE_LOCK_POLL_MS) || 1000;
const sleepMs = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
/**
 * Take the lock, and wait while `waitFor(holder)` is true, for at most one trial timeout. A probe
 * waits for any holder. A trial waits only for a probe: two trials never overlap, because the
 * driver queues them.
 */
function waitLock(root, slug, spec, lane, kind, waitFor) {
  const until = Date.now() + spec.budget.trialTimeoutMs;
  for (;;) {
    const l = takeLock(root, slug, spec, lane, kind);
    if (l.ok) return l;
    if (l.holder && !waitFor(l.holder)) return l;
    if (Date.now() >= until) return { ...l, error: `${l.error}; this ${kind} waited ${Math.round(spec.budget.trialTimeoutMs / 1000)} s for it` };
    sleepMs(LOCK_POLL_MS);
  }
}
const dropLock = (root, slug) => rmSync(lockPath(root, slug), { force: true });
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
function resetTo(root, wt, commit) {
  assertWorktreePath(root, wt);
  gitOk(wt, ['reset', '--hard', commit], 'reset');
  gitOk(wt, ['clean', '-fd'], 'clean');
}
function checkout(root, state, branch) {
  if (currentBranch(state.worktree) === branch) return;
  if (dirtyPaths(state.worktree).length) throw new Error(`the worktree has uncommitted changes on ${currentBranch(state.worktree)}: run trial on them, or discard them, before another branch takes its turn`);
  gitOk(state.worktree, ['checkout', '-q', branch], 'checkout');
}

/** The metric `n` times in `cwd`. */
function measure(spec, cwd, n, command = spec.metric.command, key = spec.metric.key, env = null) {
  const values = [];
  const runs = [];
  for (let i = 0; i < n; i++) {
    const r = runCommand(command, cwd, spec.budget.trialTimeoutMs, env);
    runs.push({ code: r.code, ms: r.ms });
    if (r.timedOut) return { values, timeout: true, output: tail(r.stdout + r.stderr) };
    const v = r.code === 0 ? parseMetricLine(r.stdout, key) : null;
    if (v === null) return { values, crashed: true, output: tail(r.stdout + r.stderr), code: r.code };
    values.push(v);
  }
  return { values, median: median(values), runs };
}

/** state.json and results.jsonl must agree, and the branch must sit where the loop left it (4.6 state-error). */
function consistency(root, slug, state, results, spec) {
  // A measurement in flight moves its lane and writes the ledger and the state one after the other.
  const holder = lockHolder(root, slug, spec?.budget.trialTimeoutMs);
  if (holder && holder.pid !== process.pid) return null;
  const trials = results.filter((r) => r.event === 'trial').length;
  if (trials !== state.counters.trials) return `state.json counts ${state.counters.trials} trials and results.jsonl holds ${trials}`;
  if (state.finished || !state.worktree || !existsSync(state.worktree)) return null;
  const branch = currentBranch(state.worktree);
  const best = laneBest(state, branch === state.trunk ? 'trunk' : branch);
  if (!best) return `the worktree is on ${branch || 'a detached HEAD'}, which is not a branch of the loop`;
  const head = headOf(state.worktree);
  if (head !== best.commit) return `HEAD of ${branch} is ${head.slice(0, 12)}, and the loop left it at ${best.commit.slice(0, 12)}: the branch moved outside the loop`;
  for (const b of state.round?.branches ?? []) {
    if (!b.worktree) continue;
    if (!existsSync(b.worktree)) return `the worktree of ${b.name} (${b.worktree}) does not exist`;
    const h = headOf(b.worktree);
    if (h !== b.best.commit) return `HEAD of ${b.name} is ${h.slice(0, 12)}, and the loop left it at ${b.best.commit.slice(0, 12)}: the branch moved outside the loop`;
  }
  return null;
}

/** The status of the loop. Exported for scripts/goal.mjs (kind optimize). */
export function optimizeStatus(root, slug) {
  const state = readState(root, slug);
  if (!state) return { ok: true, state: 'stopped', reason: 'no-baseline', next: { action: 'baseline' } };
  const { spec } = loadSpec(root, slug);
  const results = readResults(root, slug);
  const err = consistency(root, slug, state, results, spec);
  if (err) return { ok: true, state: 'stopped', reason: 'state-error', detail: err, next: { action: 'person', why: 'report; do not repair' } };
  const st = nextAction({ state, spec, control: readControl(root, slug), tokensUsed: tokensSince(root, slug, state.startedAt) });
  return {
    ok: true,
    ...st,
    best: state.best,
    baseline: { median: state.baseline.median, noise: state.baseline.noise },
    counters: state.counters,
    budget: { trials: spec.budget.trials, roundsMax: spec.rounds.at.length + spec.rounds.maxExtra, branches: spec.rounds.branches, width: spec.width },
    round: state.round ? { n: state.round.n, reason: state.round.reason, branches: state.round.branches.map((b) => ({ k: b.k, name: b.name, trials: b.trials, keeps: b.keeps, best: b.best.value })) } : null,
    merge: state.merge ?? null,
    rounds: state.rounds.length,
    metric: { command: spec.metric.command, unit: spec.metric.unit, direction: spec.metric.direction },
    profile: spec.profile ? { mode: spec.profile === 'agent' ? 'agent' : 'command', last: state.profile ?? null, patch: existsSync(profilePatch(root, slug)) ? profilePatch(root, slug) : null } : null,
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
  const build = { worktree: wt };
  ensureBuildDir(build, spec);
  const env = envOf(build, spec);
  if (spec.setup) {
    const s = runCommand(spec.setup, wt, 60 * 60_000, env);
    if (s.code !== 0) return { ok: false, error: `the setup command failed (exit ${s.code})`, output: tail(s.stdout + s.stderr) };
  }
  const g = runCommand(spec.guard.command, wt, spec.budget.trialTimeoutMs, env);
  if (g.code !== 0) return { ok: false, guardRed: true, error: `the guard fails at the baseline (exit ${g.code}): a loop cannot start from a red guard`, output: tail(g.stdout + g.stderr) };
  const m = measure(spec, wt, spec.metric.repeat, undefined, undefined, env);
  if (m.crashed || m.timeout) return { ok: false, error: `the metric ${m.timeout ? 'timed out' : 'did not print a number'} at the baseline`, output: m.output };
  let holdout = null;
  if (spec.holdout) {
    const h = measure(spec, wt, spec.metric.repeat, spec.holdout.command, null, env);
    if (h.crashed || h.timeout) return { ok: false, error: 'the holdout did not print a number at the baseline', output: h.output };
    holdout = h.median;
  }
  const state = newState({ slug, worktree: wt, baseCommit: base.out, values: m.values, holdoutValue: holdout, startedAt: nowIso(), slugBranch });
  state.buildDir = build.buildDir ?? null;
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

/** The lane that a trial or a proposer works on: `--on <lane>` when it is ready, else the lane whose turn it is. */
function laneOf(st, f) {
  const on = typeof f.on === 'string' && f.on ? f.on : st.next.on;
  const ready = st.next.ready ?? [st.next.on];
  if (!ready.includes(on)) throw new Error(`the lane ${on} cannot take a trial now; the ready lanes are: ${ready.join(', ')}`);
  return on;
}

function proposeContext(root, slug, f = {}) {
  const st = requireNext(root, slug, 'trial');
  const state = readState(root, slug);
  const { spec, prose } = loadSpec(root, slug);
  const on = laneOf(st, f);
  const wt = laneWorktree(state, on);
  if (wt === state.worktree) checkout(root, state, on);
  const lane = on === state.trunk ? 'trunk' : on;
  // A worktree that holds an edit from before a stop is a prepared trial: `trial` measures it.
  const paths = dirtyPaths(wt);
  // A new proposer of a lane releases the claims that the last proposer of the lane left with no trial.
  const ideas = paths.length ? readIdeas(root, slug) : withIdeas(root, slug, (book) => {
    book.ideas = book.ideas.filter((i) => !(i.claim === on && i.status === 'open' && !i.trials.length));
    for (const i of book.ideas) if (i.claim === on) i.claim = null;
    return book;
  });
  const digest = buildDigest({ spec, specProse: prose, state, results: readResults(root, slug), lane, solutions: lane === 'trunk' ? solutionsFor(root, spec) : [], ideas, profile: readProfile(root, slug) });
  // The start of the proposer of this lane: `trial` records the time from here to the measurement.
  // Each lane has a file of its own, because proposers run while a trial writes state.json.
  if (!paths.length) writeAtomic(proposeStamp(root, slug, laneTagOf(state, on)), `${JSON.stringify({ at: Date.now() })}\n`);
  return { ok: true, why: st.next.why, digest, prepared: paths.length ? { paths } : null };
}

// ---------------------------------------------------------------------------
// probes: the proposer's own builds and benchmarks, under the measure lock
// ---------------------------------------------------------------------------
/** `trunk`, or `r<n>b<k>` for a branch of a round. */
const laneTagOf = (state, lane) => (!lane || lane === 'trunk' || lane === state.trunk ? 'trunk' : (/--(r\d+b\d+)$/.exec(lane) || [])[1] || 'trunk');
const proposeStamp = (root, slug, tag) => join(optDir(root, slug), `.propose-${tag}.json`);
/** The probe worktree of a lane, beside the trunk worktree. Its path follows from the lane, so no write to state.json is needed. */
const probePath = (state, tag) => join(dirname(state.worktree), `${basename(state.worktree)}--probe-${tag}`);
/** The lane of a probe: the trunk, or a branch of the open round. */
function probeLane(state, f) {
  const lane = !f.on || f.on === 'trunk' ? state.trunk : String(f.on);
  if (state.finished) throw new Error('the loop is finished: no probe');
  if (!laneBest(state, lane)) throw new Error(`${lane} is not a lane of the loop now: use the trunk or a branch of the open round`);
  return lane;
}

function probeOpen(root, slug, f, { locked = false } = {}) {
  const state = readState(root, slug);
  if (!state) throw new Error('no baseline: run baseline first');
  const { spec } = loadSpec(root, slug);
  const lane = probeLane(state, f);
  const best = laneBest(state, lane);
  const wt = probePath(state, laneTagOf(state, lane));
  if (existsSync(wt)) {
    assertWorktreePath(root, wt);
    gitOk(wt, ['checkout', '-q', '--detach', '-f', best.commit], 'checkout');
    gitOk(wt, ['clean', '-fd'], 'clean');
    return { ok: true, lane, worktree: wt, commit: best.commit, fresh: false };
  }
  gitOk(root, ['worktree', 'add', '-q', '--detach', wt, best.commit], 'worktree add');
  if (spec.setup) {
    // The setup loads the machine, so it runs under the lock too. A caller that holds the lock passes locked.
    const l = locked ? { ok: true } : waitLock(root, slug, spec, lane, 'probe', () => true);
    if (!l.ok) return l;
    try {
      const r = runCommand(spec.setup, wt, 60 * 60_000, probeEnvOf(state, spec));
      if (r.code !== 0) return { ok: false, error: `the setup command failed in ${wt} (exit ${r.code})`, output: tail(r.stdout + r.stderr) };
    } finally { if (!locked) dropLock(root, slug); }
  }
  return { ok: true, lane, worktree: wt, commit: best.commit, fresh: true };
}

function probe(root, slug, f) {
  const state = readState(root, slug);
  if (!state) throw new Error('no baseline: run baseline first');
  const { spec } = loadSpec(root, slug);
  const lane = probeLane(state, f);
  const tag = laneTagOf(state, lane);
  const wt = probePath(state, tag);
  if (!existsSync(wt)) throw new Error(`no probe worktree for ${lane}: run probe-open --on ${lane} first`);
  const command = typeof f.cmd === 'string' ? f.cmd.trim() : '';
  if (!command) throw new Error('probe needs --cmd "<command>"');
  const label = (typeof f.label === 'string' && f.label.trim()) || command.slice(0, 60);
  const l = waitLock(root, slug, spec, lane, 'probe', () => true);
  if (!l.ok) return l;
  try {
    const r = runCommand(command, wt, spec.budget.trialTimeoutMs, probeEnvOf(state, spec));
    appendResult(root, slug, { event: 'probe', lane: tag, label, code: r.code, ms: r.ms, ...(r.timedOut ? { timedOut: true } : {}) });
    return { ok: true, lane, worktree: wt, code: r.code, timedOut: r.timedOut, ms: r.ms, output: tail(r.stdout + r.stderr, 80) };
  } finally { dropLock(root, slug); }
}

// ---------------------------------------------------------------------------
// ideas and the profile (G1, G2)
// ---------------------------------------------------------------------------
function ideaClaim(root, slug, f) {
  const state = readState(root, slug);
  if (!state) throw new Error('no baseline: run baseline first');
  const lane = probeLane(state, f);
  const res = withIdeas(root, slug, (book) => claimIdea(book, { lane, target: f.target === true ? '' : f.target, family: f.family === true ? '' : f.family, again: typeof f.again === 'string' ? f.again : null }));
  return res.ok ? { ok: true, lane, idea: res.idea } : { ok: false, refused: true, error: res.reason, idea: res.idea ?? null };
}

/** Write the profile, and keep the instrumentation of the trunk probe worktree as a patch for the next profile. */
function saveProfile(root, slug, state, entries, source) {
  const at = nowIso();
  writeAtomic(profileFile(root, slug), `${JSON.stringify({ commit: state.best.commit, at, trial: state.counters.trials, source, entries }, null, 2)}\n`);
  const wt = probePath(state, 'trunk');
  if (source === 'agent' && existsSync(wt)) {
    const d = git(wt, ['diff']).out;
    if (d) writeFileSync(profilePatch(root, slug), `${d}\n`);
  }
  state.profile = { commit: state.best.commit, at, trial: state.counters.trials, source, entries: entries.length };
  appendResult(root, slug, { event: 'profile', commit: state.best.commit, source, entries: entries.length, top: entries.slice(0, 5).map((e) => `${e.name} ${Math.round(e.share * 1000) / 10}%`) });
  saveState(root, slug, state);
}

/** `profile`: run the profile command of the spec in the probe worktree of the trunk. */
function profileRun(root, slug) {
  requireNext(root, slug, 'profile');
  const state = readState(root, slug);
  const { spec } = loadSpec(root, slug);
  if (spec.profile === 'agent') throw new Error('the spec names the profiler agent: the agent writes the profile with profile-record');
  const open = probeOpen(root, slug, { on: 'trunk' }, { locked: true });
  if (!open.ok) return open;
  const r = runCommand(spec.profile, open.worktree, spec.budget.trialTimeoutMs, probeEnvOf(state, spec));
  if (r.code !== 0) return { ok: false, error: `the profile command failed (exit ${r.code})`, output: tail(r.stdout + r.stderr) };
  const { entries, errors } = parseProfile(profileLines(r.stdout));
  if (!entries.length) return { ok: false, error: `the profile command printed no entry${errors.length ? `: ${errors[0]}` : ''}`, output: tail(r.stdout) };
  saveProfile(root, slug, state, entries, 'command');
  return { ...optimizeStatus(root, slug), ok: true, entries: entries.length, top: entries.slice(0, 5) };
}

/** `profile-record`: the profiler agent writes its profile, or skips it with a reason. */
function profileRecord(root, slug, f) {
  requireNext(root, slug, 'profile');
  const state = readState(root, slug);
  if (typeof f.skip === 'string' && f.skip.trim()) {
    state.profile = { commit: state.best.commit, at: nowIso(), trial: state.counters.trials, source: 'skipped', entries: 0, skipped: f.skip.trim() };
    appendResult(root, slug, { event: 'profile', commit: state.best.commit, source: 'skipped', reason: f.skip.trim() });
    saveState(root, slug, state);
    return { ...optimizeStatus(root, slug), ok: true, skipped: true };
  }
  const file = typeof f.file === 'string' ? resolve(root, f.file) : null;
  if (!file || !existsSync(file)) throw new Error('profile-record needs --file <json> with the entries, or --skip "<reason>"');
  let input;
  try { input = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new Error(`the profile file does not parse: ${e.message}`); }
  const { entries, errors } = parseProfile(input);
  if (!entries.length) return { ok: false, error: `the profile holds no valid entry${errors.length ? `: ${errors[0]}` : ''}` };
  saveProfile(root, slug, state, entries, 'agent');
  return { ...optimizeStatus(root, slug), ok: true, entries: entries.length, ignored: errors.length };
}

/** Remove the probe worktree of each tag. The instrumentation in it is reset first, so git removes it without --force. */
function removeProbes(root, state, tags, out) {
  for (const tag of tags) {
    const wt = probePath(state, tag);
    if (!existsSync(wt)) continue;
    try { assertWorktreePath(root, wt); resetTo(root, wt, 'HEAD'); } catch { /* removeWorktree reports it */ }
    const res = removeWorktree(root, wt);
    if (res.removed) out.removed.push(wt);
    else out.kept.push({ path: wt, reason: res.reason });
  }
}
/** The tags of the probe worktrees that exist beside the trunk worktree. */
function probeTags(state) {
  const dir = dirname(state.worktree);
  const pre = `${basename(state.worktree)}--probe-`;
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => n.startsWith(pre)).map((n) => n.slice(pre.length));
}

// ---------------------------------------------------------------------------
// trial
// ---------------------------------------------------------------------------
function trial(root, slug, id, f) {
  if (!id) throw new Error('trial needs a hypothesis id');
  const st = requireNext(root, slug, 'trial');
  const state = readState(root, slug);
  const { spec } = loadSpec(root, slug);
  const laneName = laneOf(st, f);
  const wt = laneWorktree(state, laneName);
  assertWorktreePath(root, wt);
  const isTrunk = laneName === state.trunk;
  if (currentBranch(wt) !== laneName) throw new Error(`the worktree is on ${currentBranch(wt)}, and this trial runs on ${laneName}: run propose-context first`);
  if (ensureBuildDir(state, spec)) saveState(root, slug, state);
  const env = envOf(state, spec);
  const round = state.round;
  const branch = isTrunk ? null : round.branches.find((b) => b.name === laneName);
  const best = isTrunk ? state.best : branch.best;
  const hf = f['hypothesis-file'] ? resolve(root, f['hypothesis-file']) : null;
  const text = hf && existsSync(hf) ? readFileSync(hf, 'utf8').trim() : String(f.hypothesis ?? '').trim();
  const hypothesis = { id, text, expected: String(f.expected ?? '').trim() };
  const n = state.counters.trials + 1;
  const line = { event: 'trial', trial: n, round: isTrunk ? null : round.n, branch: isTrunk ? null : laneName, hypothesis, values: [], median: null, delta: null, noise: state.baseline.noise, guard: null };
  const stamp = proposeStamp(root, slug, laneTagOf(state, laneName));
  if (existsSync(stamp)) {
    try { line.prepareMs = Date.now() - JSON.parse(readFileSync(stamp, 'utf8')).at; } catch { /* no time */ }
    rmSync(stamp, { force: true });
  }
  // The idea of the trial: --idea, or the claim in flight of its lane (a trial that waited through a stop).
  const ideaId = typeof f.idea === 'string' && f.idea ? f.idea : readIdeas(root, slug).ideas.find((i) => i.claim === laneName)?.id ?? null;
  if (ideaId) line.idea = ideaId;
  const finish = (verdict, extra = {}) => {
    Object.assign(line, { verdict, ...extra });
    // A kept change, and a reverted change with a real gain, keep their diff: a port or a bundle can use it (G4).
    const keepPatch = !!line.commit && (verdict === 'kept' || (verdict === 'reverted' && Number.isFinite(line.delta) && line.delta > 0));
    if (keepPatch) {
      mkdirSync(patchesDir(root, slug), { recursive: true });
      writeFileSync(join(patchesDir(root, slug), `${n}.patch`), git(wt, ['diff', `${line.commit}~1`, line.commit]).out + '\n');
      line.patch = `patches/${n}.patch`;
    }
    if (ideaId) withIdeas(root, slug, (book) => settleIdea(book, ideaId, { trial: n, verdict, gain: line.delta, patch: keepPatch }));
    if (verdict !== 'kept') resetTo(root, wt, best.commit);
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
  if (!dirtyPaths(wt).length) return finish('rejected', { reason: 'the worktree holds no change' });
  // The format command runs before the path check, so the check sees each file that it changes.
  if (spec.format) {
    const fr = runCommand(spec.format, wt, spec.budget.trialTimeoutMs, env);
    if (fr.code !== 0) return finish('rejected', { reason: `the format command failed (exit ${fr.code})`, output: tail(fr.stdout + fr.stderr) });
  }
  const paths = dirtyPaths(wt);
  if (!paths.length) return finish('rejected', { reason: 'the worktree holds no change after the format command' });
  const auto = commandFiles([spec.metric.command, spec.guard.command, spec.holdout?.command, spec.format], (p) => existsSync(join(wt, p)));
  const bad = pathViolations(paths, spec, auto);
  if (bad.length) return finish('rejected', { reason: `path check: ${bad.map((b) => `${b.path} (${b.reason})`).join(', ')}`, paths });
  gitOk(wt, ['add', '-A'], 'add');
  // The repo hooks run on this commit. A hook that refuses it rejects the trial. The loop never
  // skips the hooks, because the squash at finish must pass the same hooks.
  const c = git(wt, ['commit', '-q', '-m', `experiment ${id}${text ? `: ${text.split(/\r?\n/)[0].slice(0, 60)}` : ''}`]);
  if (!c.ok) return finish('rejected', { reason: 'the commit hook refused the change', paths, output: tail(`${c.out}\n${c.err}`) });
  line.commit = headOf(wt);
  line.paths = paths;
  const g = runCommand(spec.guard.command, wt, spec.budget.trialTimeoutMs, env);
  line.guard = g.code === 0 ? 'pass' : 'fail';
  if (g.timedOut) return finish('timeout', { reason: 'the guard timed out', output: tail(g.stdout + g.stderr) });
  if (g.code !== 0) return finish('reverted', { reason: `the guard failed (exit ${g.code})`, output: tail(g.stdout + g.stderr) });
  const m = measure(spec, wt, spec.metric.repeat, undefined, undefined, env);
  if (m.timeout) return finish('timeout', { reason: 'the metric timed out', values: m.values, output: m.output });
  if (m.crashed) return finish('crashed', { reason: 'the metric did not print a number', values: m.values, output: m.output });
  line.values = m.values;
  line.median = m.median;
  line.delta = gainOf(spec.metric.direction, best.value, m.median);
  let d = keepDecision({ spec, best: best.value, noise: state.baseline.noise, first: m.median });
  line.threshold = d.threshold;
  if (d.needConfirm) {
    const c = measure(spec, wt, spec.metric.repeat, undefined, undefined, env);
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
  // Each branch gets its own worktree beside the trunk worktree, so the branches can be edited at the same time.
  const branches = [];
  for (let k = 1; k <= spec.rounds.branches; k++) {
    const name = branchNameOf(slug, n, k);
    const worktree = join(dirname(state.worktree), `${basename(state.worktree)}--r${n}b${k}`);
    if (git(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${name}`]).ok) throw new Error(`the branch ${name} exists: a branch of round ${n} from another run. Ask the person.`);
    if (existsSync(worktree)) throw new Error(`${worktree} exists: a worktree of round ${n} from another run. Ask the person.`);
    branches.push({ k, name, worktree, best: { ...state.best, reachedAt: 0 }, trials: 0, keeps: 0 });
  }
  if (ensureBuildDir(state, spec)) saveState(root, slug, state);
  const env = envOf(state, spec);
  const undo = () => {
    for (const b of branches) {
      if (removeWorktree(root, b.worktree).removed) git(root, ['branch', '-D', b.name]);
      else (state.leftovers ??= []).push({ path: b.worktree, branch: b.name });
    }
    saveState(root, slug, state);
  };
  for (const b of branches) {
    gitOk(root, ['branch', b.name, state.best.commit], 'branch');
    const w = git(root, ['worktree', 'add', '-q', b.worktree, b.name]);
    if (!w.ok) { undo(); throw new Error(`git worktree add ${b.worktree} failed: ${w.err}`); }
    if (spec.setup) {
      const s = runCommand(spec.setup, b.worktree, 60 * 60_000, env);
      if (s.code !== 0) { undo(); return { ok: false, error: `the setup command failed in ${b.worktree} (exit ${s.code})`, output: tail(s.stdout + s.stderr) }; }
    }
  }
  state.version = STATE_VERSION;
  state.round = { n, reason, point, why: st.next.why, branchTrials: spec.rounds.branchTrials, openedAtTrial: state.counters.trials, from: state.best.commit, fromValue: state.best.value, branches };
  if (point === 'extra') state.extraRounds++;
  else state.schedule.used.push(point);
  appendResult(root, slug, { event: 'round-open', round: n, reason, why: st.next.why, from: state.best.commit, branches: branches.map((b) => b.name) });
  saveState(root, slug, state);
  return { ok: true, round: n, reason, why: st.next.why, branches: branches.map((b) => b.name), branchTrials: spec.rounds.branchTrials, next: optimizeStatus(root, slug).next };
}

function runCheckpoint(root, slug, state, spec) {
  if (!spec.holdout) return { ran: false };
  checkout(root, state, state.trunk);
  const h = measure(spec, state.worktree, spec.metric.repeat, spec.holdout.command, null, envOf(state, spec));
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
  // The value of the round base: the trunk does not move while a round is open.
  const base = r.fromValue ?? state.best.value;
  checkout(root, state, state.trunk);
  if (winner) {
    gitOk(state.worktree, ['merge', '-q', '--ff-only', winner.best.commit], 'fast-forward');
    state.best = { ...winner.best };
    state.digestFrom = { trial: state.counters.trials, round: r.n, branch: winner.name, merged: [] };
  }
  // The merge step (F): each other branch whose kept gain passes the threshold is a candidate. A
  // test merge onto the new trunk, which touches no worktree, finds the candidates that conflict.
  const results = readResults(root, slug);
  const changed = (commit) => git(root, ['diff', '--name-only', r.from, commit]).out.split(/\r?\n/).filter(Boolean);
  const winnerPaths = winner ? changed(winner.best.commit) : [];
  const candidates = mergeCandidates(r, winner, spec, base, state.baseline.noise).map((b) => {
    const paths = changed(b.best.commit);
    const conflict = !git(root, ['merge-tree', '--write-tree', state.best.commit, b.best.commit]).ok;
    return {
      name: b.name, k: b.k, commit: b.best.commit, value: b.best.value, gain: gainOf(spec.metric.direction, base, b.best.value),
      hypotheses: results.filter((x) => x.event === 'trial' && x.round === r.n && x.branch === b.name && x.verdict === 'kept').map((x) => x.hypothesis?.text ?? ''),
      paths, shared: paths.filter((p) => winnerPaths.includes(p)), conflict,
      ...(conflict ? { decision: 'skip', reason: 'conflict', verdict: 'skipped' } : {}),
    };
  });
  // The branch worktrees go first: git does not delete a branch that a worktree holds. A prepared
  // trial that was not measured is discarded with its worktree.
  const removed = [];
  for (const b of r.branches) {
    if (!b.worktree) continue;
    if (existsSync(b.worktree) && dirtyPaths(b.worktree).length) resetTo(root, b.worktree, b.best.commit);
    const res = removeWorktree(root, b.worktree);
    if (res.removed) removed.push(b.worktree);
    else (state.leftovers ??= []).push({ path: b.worktree, branch: b.name, reason: res.reason });
  }
  const probes = { removed: [], kept: [] };
  removeProbes(root, state, r.branches.map((b) => `r${r.n}b${b.k}`), probes);
  removed.push(...probes.removed);
  for (const k of probes.kept) (state.leftovers ??= []).push(k);
  // CAUTION: delete only the branches that state.json lists for this round, by their exact names.
  // A candidate keeps its branch until the merge step ends.
  const deleted = [];
  for (const b of r.branches) {
    if (candidates.some((c) => c.name === b.name)) continue;
    if (git(root, ['branch', '-D', b.name]).ok) deleted.push(b.name);
  }
  state.counters.streak = 0;
  const summary = { n: r.n, reason: r.reason, from: r.from, winner: winner ? { k: winner.k, name: winner.name, value: winner.best.value, commit: winner.best.commit } : null, branches: r.branches.map((b) => ({ k: b.k, trials: b.trials, keeps: b.keeps, best: b.best.value })), merged: [] };
  state.rounds.push(summary);
  state.round = null;
  if (!winner && r.reason === 'plateau') state.stopped = { reason: 'plateau', detail: `the trunk found no gain in ${spec.budget.plateau} trials, and no branch of round ${r.n} beat it`, at: nowIso() };
  appendResult(root, slug, { event: 'round-close', round: r.n, winner: summary.winner, branches: summary.branches, candidates: candidates.map((c) => ({ name: c.name, gain: c.gain, conflict: c.conflict })) });
  let cp = { ran: false };
  if (candidates.length) {
    state.merge = { round: r.n, from: r.from, base, worktree: state.worktree, considered: candidates.every((c) => c.conflict), order: [], candidates };
    if (state.merge.considered) cp = closeMerge(root, slug, state, spec, 'no candidate merges cleanly');
  } else if (!state.stopped) cp = runCheckpoint(root, slug, state, spec);
  saveState(root, slug, state);
  return { ok: true, round: r.n, winner: summary.winner ?? 'trunk', deleted, removed, leftovers: state.leftovers ?? [], candidates: candidates.map((c) => ({ name: c.name, conflict: c.conflict })), checkpoint: cp, ...optimizeStatus(root, slug) };
}

// ---------------------------------------------------------------------------
// The merge step after a round (F)
// ---------------------------------------------------------------------------

/** A candidate by its full branch name, `b<k>` or `r<n>b<k>`. */
function candidateOf(merge, token) {
  const t = String(token ?? '').trim();
  return merge.candidates.find((c) => c.name === t || `b${c.k}` === t || `r${merge.round}b${c.k}` === t) ?? null;
}

/**
 * End the merge step: a candidate to try that was not tried is skipped with `why`, the branches
 * of the candidates are deleted, and the checkpoint runs on the new trunk.
 */
function closeMerge(root, slug, state, spec, why, { checkpoint: runCp = true } = {}) {
  const mg = state.merge;
  for (const c of mg.candidates) {
    if (!c.verdict) Object.assign(c, { verdict: 'skipped', reason: c.decision === 'try' ? why : (c.reason ?? why) });
  }
  // CAUTION: delete only the candidate branches that state.json lists, by their exact names.
  for (const c of mg.candidates) git(root, ['branch', '-D', c.name]);
  const merged = mg.candidates.filter((c) => c.verdict === 'kept').map((c) => c.name);
  const summary = state.rounds.find((x) => x.n === mg.round);
  if (summary) summary.merged = merged;
  appendResult(root, slug, { event: 'merge-close', round: mg.round, merged, skipped: mg.candidates.filter((c) => c.verdict !== 'kept').map((c) => ({ name: c.name, reason: c.reason ?? c.verdict })) });
  state.merge = null;
  return runCp && !state.stopped ? runCheckpoint(root, slug, state, spec) : { ran: false };
}

function mergeConsider(root, slug, f) {
  requireNext(root, slug, 'merge-consider');
  const state = readState(root, slug);
  const { spec } = loadSpec(root, slug);
  const mg = state.merge;
  const tries = String(f.try ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const skips = (Array.isArray(f.skip) ? f.skip : f.skip ? [f.skip] : []).map(String);
  const decided = new Map();
  const decide = (token, decision, reason) => {
    const c = candidateOf(mg, token);
    if (!c) throw new Error(`merge-consider: ${token} is not a candidate; the candidates are: ${mg.candidates.map((x) => x.name).join(', ')}`);
    if (c.conflict) throw new Error(`merge-consider: ${c.name} conflicts with the trunk; it is skipped already`);
    if (decided.has(c.name)) throw new Error(`merge-consider: ${c.name} has two decisions`);
    decided.set(c.name, { decision, reason });
  };
  for (const t of tries) decide(t, 'try', null);
  for (const s of skips) {
    const i = s.indexOf(':');
    if (i < 1 || !s.slice(i + 1).trim()) throw new Error(`merge-consider: --skip "${s}" needs the form "<branch>:<reason>"`);
    decide(s.slice(0, i), 'skip', s.slice(i + 1).trim());
  }
  const open = mg.candidates.filter((c) => !c.conflict && !decided.has(c.name));
  if (open.length) throw new Error(`merge-consider: decide every candidate with --try or --skip; no decision for: ${open.map((c) => c.name).join(', ')}`);
  for (const [name, d] of decided) Object.assign(mg.candidates.find((c) => c.name === name), d, d.decision === 'skip' ? { verdict: 'skipped' } : {});
  mg.order = tries.map((t) => candidateOf(mg, t).name);
  mg.considered = true;
  appendResult(root, slug, { event: 'merge-consider', round: mg.round, try: mg.order, skip: [...decided].filter(([, d]) => d.decision === 'skip').map(([name, d]) => ({ name, reason: d.reason })) });
  const cp = mg.order.length ? { ran: false } : closeMerge(root, slug, state, spec, 'not tried');
  saveState(root, slug, state);
  return { ...optimizeStatus(root, slug), ok: true, try: mg.order, checkpoint: cp };
}

function mergeTrial(root, slug, f) {
  const st = requireNext(root, slug, 'merge-trial');
  const state = readState(root, slug);
  const { spec } = loadSpec(root, slug);
  const mg = state.merge;
  const cand = f.branch ? candidateOf(mg, f.branch) : mg.candidates.find((c) => c.name === st.next.branch);
  if (!cand || cand.name !== st.next.branch) throw new Error(`the next merge is ${st.next.branch}, not ${f.branch}`);
  assertWorktree(root, state);
  const wt = state.worktree;
  if (currentBranch(wt) !== state.trunk) throw new Error(`the trunk worktree is on ${currentBranch(wt)}, not on ${state.trunk}`);
  if (dirtyPaths(wt).length) throw new Error('the trunk worktree has uncommitted changes: a merge starts from the trunk best only');
  const env = envOf(state, spec);
  const best = state.best;
  const n = state.counters.trials + 1;
  const text = `merge of ${cand.name}: ${cand.hypotheses.join(' | ')}`;
  const line = { event: 'trial', trial: n, round: null, branch: null, merge: { round: mg.round, branch: cand.name }, hypothesis: { id: `m${n}`, text, expected: String(cand.gain) }, values: [], median: null, delta: null, noise: state.baseline.noise, guard: null };
  const done = (verdict, extra = {}) => {
    Object.assign(line, { verdict, ...extra });
    // A reset also ends a merge that stopped at a conflict.
    if (verdict !== 'kept') resetTo(root, wt, best.commit);
    cand.verdict = verdict;
    if (extra.reason) cand.reason = extra.reason;
    // A merge trial counts against budget.trials. It is not a hypothesis of the trunk, so the plateau streak does not change.
    state.counters.trials = n;
    appendResult(root, slug, line);
    const left = mg.order.some((name) => !mg.candidates.find((c) => c.name === name).verdict);
    const cp = left ? { ran: false } : closeMerge(root, slug, state, spec, 'not tried');
    saveState(root, slug, state);
    return { ...optimizeStatus(root, slug), ok: true, trial: n, lane: 'trunk', branch: cand.name, verdict, reason: line.reason ?? null, median: line.median, delta: line.delta, threshold: line.threshold ?? null, checkpoint: cp, ...(line.output ? { output: line.output } : {}) };
  };
  // The merge commit passes the repo hooks, as a trial commit does.
  const m = git(wt, ['merge', '--no-ff', '-q', '-m', `experiment merge r${mg.round}b${cand.k}: ${(cand.hypotheses[0] ?? '').split(/\r?\n/)[0].slice(0, 50)}`, cand.commit]);
  if (!m.ok) return done('rejected', { reason: /CONFLICT/.test(`${m.out}\n${m.err}`) ? 'the merge conflicts' : 'the commit hook refused the merge', output: tail(`${m.out}\n${m.err}`) });
  line.commit = headOf(wt);
  const paths = git(wt, ['diff', '--name-only', best.commit, line.commit]).out.split(/\r?\n/).filter(Boolean);
  line.paths = paths;
  const auto = commandFiles([spec.metric.command, spec.guard.command, spec.holdout?.command, spec.format], (p) => existsSync(join(wt, p)));
  const bad = pathViolations(paths, spec, auto);
  if (bad.length) return done('rejected', { reason: `path check: ${bad.map((b) => `${b.path} (${b.reason})`).join(', ')}` });
  const g = runCommand(spec.guard.command, wt, spec.budget.trialTimeoutMs, env);
  line.guard = g.code === 0 ? 'pass' : 'fail';
  if (g.timedOut) return done('timeout', { reason: 'the guard timed out', output: tail(g.stdout + g.stderr) });
  if (g.code !== 0) return done('reverted', { reason: `the guard failed (exit ${g.code})`, output: tail(g.stdout + g.stderr) });
  const first = measure(spec, wt, spec.metric.repeat, undefined, undefined, env);
  if (first.timeout) return done('timeout', { reason: 'the metric timed out', values: first.values, output: first.output });
  if (first.crashed) return done('crashed', { reason: 'the metric did not print a number', values: first.values, output: first.output });
  line.values = first.values;
  line.median = first.median;
  line.delta = gainOf(spec.metric.direction, best.value, first.median);
  let d = keepDecision({ spec, best: best.value, noise: state.baseline.noise, first: first.median });
  line.threshold = d.threshold;
  if (d.needConfirm) {
    const c = measure(spec, wt, spec.metric.repeat, undefined, undefined, env);
    if (c.timeout || c.crashed) return done(c.timeout ? 'timeout' : 'crashed', { reason: 'the confirm run failed', output: c.output });
    line.confirm = c.values;
    d = keepDecision({ spec, best: best.value, noise: state.baseline.noise, first: first.median, confirm: c.median });
    if (d.kept) {
      line.median = median([...first.values, ...c.values]);
      line.delta = gainOf(spec.metric.direction, best.value, line.median);
    }
  }
  if (!d.kept) return done('reverted', { reason: d.wins ? 'the confirm run did not agree' : `the gain ${line.delta} is not above the threshold ${d.threshold}` });
  state.best = { commit: line.commit, value: line.median, trial: n, reachedAt: n };
  state.counters.keeps++;
  if (state.digestFrom?.round === mg.round) state.digestFrom.merged = [...(state.digestFrom.merged ?? []), cand.name];
  return done('kept');
}

function mergeClose(root, slug) {
  const st = requireNext(root, slug, 'merge-close');
  const state = readState(root, slug);
  const { spec } = loadSpec(root, slug);
  const why = /budget/.test(st.next.why ?? '') ? 'budget' : 'not tried';
  const cp = closeMerge(root, slug, state, spec, why);
  saveState(root, slug, state);
  return { ...optimizeStatus(root, slug), ok: true, checkpoint: cp };
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

function finish(root, slug, f) {
  const state = readState(root, slug);
  if (!state) throw new Error('no baseline: nothing to finish');
  if (state.finished) return { ok: true, already: true, finished: state.finished };
  if (state.round) throw new Error('a branch round is open: run round-close first');
  // A merge step that a stop left open ends here, without its checkpoint: the finish squashes what the trunk holds.
  if (state.merge) closeMerge(root, slug, state, loadSpec(root, slug).spec, 'finish', { checkpoint: false });
  const { spec } = loadSpec(root, slug);
  const results = readResults(root, slug);
  const err = consistency(root, slug, state, results, spec);
  if (err) throw new Error(`state-error: ${err}`);
  const at = nowIso();
  // The lineage: the trunk's keeps and the keeps of each round's winner. A losing branch's keeps are not in the squash.
  const winners = new Set(state.rounds.flatMap((r) => [...(r.winner ? [`${r.n}:${r.winner.name}`] : []), ...(r.merged ?? []).map((name) => `${r.n}:${name}`)]));
  const lineage = results.filter((r) => r.event !== 'trial' || r.branch === null || winners.has(`${r.round}:${r.branch}`));
  const kept = lineage.filter((r) => r.event === 'trial' && r.verdict === 'kept');
  if (state.best.commit === state.baseCommit) {
    state.finished = { commit: null, at, gain: 0, kept: 0 };
    appendResult(root, slug, { event: 'finish', commit: null, gain: 0 });
    saveState(root, slug, state);
    return { ok: true, kept: 0, note: 'no trial was kept: nothing to squash. Close the slug, or write a new spec.', cleanup: cleanupAll(root, slug, state) };
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
  const next = { 'next-command': 'wf-verify', 'next-invocation': `/wf verify ${slug} ${SLICE}` };
  if (!hasDoc(dir, '03-slice.md')) {
    writeDoc(dir, '03-slice.md', {
      frontmatter: {
        schema: 'sdlc/v1', type: 'slice-index', slug, status: 'complete', 'stage-number': 3, 'created-at': at, 'updated-at': at,
        'total-slices': 1, 'best-first-slice': SLICE, tags: ['optimize'], slices: [{ slug: SLICE, status: 'complete', complexity: 'm', 'depends-on': [] }],
        refs: { index: '00-index.md', spec: SPEC_FILE }, ...next,
      },
      body: ['# Slice Index', '', `One slice, \`${SLICE}\`: the kept trials of the optimize loop, squashed into one commit.`, ''].join('\n'),
    });
  }
  const holdoutAc = spec.holdout ? `\n3. When the holdout runs, \`${spec.holdout.command}\` is within ${spec.holdout.tolerance.percent !== undefined ? `${spec.holdout.tolerance.percent}%` : spec.holdout.tolerance.absolute} of the baseline holdout ${state.baseline.holdout}.` : '';
  writeDoc(dir, `03-slice-${SLICE}.md`, {
    frontmatter: {
      schema: 'sdlc/v1', type: 'slice', slug, 'slice-slug': SLICE, status: 'complete', 'stage-number': 3, 'created-at': at, 'updated-at': at,
      complexity: 'm', 'depends-on': [], tags: ['optimize'], 'ux-impact': 'none',
      refs: { index: '00-index.md', 'slice-index': '03-slice.md', implement: `05-implement-${SLICE}.md` }, ...next,
    },
    body: [
      `# Slice: ${SLICE}`, '', `The kept trials of the loop toward: ${spec.objective}`, '',
      '## Acceptance Criteria', '',
      `1. \`${spec.metric.command}\`, ${spec.metric.repeat} runs, reaches ${state.best.value}${unit} within the noise floor ${state.baseline.noise}${unit} (median; direction ${spec.metric.direction}).`,
      `2. \`${spec.guard.command}\` exits 0.${holdoutAc}`, '',
    ].join('\n'),
  });
  writeDoc(dir, `05-implement-${SLICE}.md`, {
    frontmatter: {
      schema: 'sdlc/v1', type: 'implement', slug, 'slice-slug': SLICE, status: 'complete', 'stage-number': 5, 'created-at': at, 'updated-at': at,
      'metric-files-changed': files.length, 'metric-lines-added': added, 'metric-lines-removed': removed, 'metric-deviations-from-plan': 0, 'metric-review-fixes-applied': 0,
      'commit-sha': sha, 'files-modified': files, tags: ['optimize'],
      'optimize-baseline': state.baseline.median, 'optimize-kept-value': state.best.value, 'optimize-noise': state.baseline.noise,
      'optimize-trials': state.counters.trials, 'optimize-kept': kept.length, 'optimize-rounds': state.rounds.length,
      refs: { index: '00-index.md', 'slice-def': `03-slice-${SLICE}.md`, verify: `06-verify-${SLICE}.md`, results: 'optimize/results.jsonl' }, ...next,
    },
    body: [
    `# Implement: ${SLICE}`, '', '## Summary of Changes', '',
    `- The loop ran ${state.counters.trials} trials in ${state.rounds.length} branch round(s) and kept ${kept.length}.`,
    `- The metric moved from ${state.baseline.median}${unit} to ${state.best.value}${unit} (gain ${gain}${unit}; noise floor ${state.baseline.noise}${unit}).`,
    `- One squashed commit: ${sha}.`, '', '## Kept Trials', '', keptTable(lineage, spec), '', '## Files Changed', '', ...files.map((p) => `- ${p}`), '',
    ].join('\n'),
  });
  state.finished = { commit: sha, at, gain, kept: kept.length };
  appendResult(root, slug, { event: 'finish', commit: sha, gain, kept: kept.length });
  saveState(root, slug, state);
  // The loop is done: its worktrees, its trunk branch and its build folder go. A cleanup that
  // cannot remove a worktree never fails the finish; the result names what is left.
  return { ok: true, commit: sha, gain, kept: kept.length, files, wrote: ['03-slice.md', `03-slice-${SLICE}.md`, `05-implement-${SLICE}.md`], cleanup: cleanupAll(root, slug, state), next: { action: 'verify', invocation: `/wf verify ${slug} ${SLICE}` } };
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

/**
 * Remove one optimize worktree, after the link check. It never forces: a worktree that git
 * refuses stays, and the caller records it.
 * CAUTION: `git worktree remove --force` deletes through a node_modules junction into the main checkout.
 */
function removeWorktree(root, wt) {
  if (!wt || !existsSync(wt)) return { removed: true };
  if (samePath(wt, root)) return { removed: false, reason: 'the path is the project root' };
  const links = linksUnder(wt);
  if (links.length) return { removed: false, reason: `the worktree holds links (${links.slice(0, 3).join(', ')}). A recursive delete can follow a link. Remove the links, then run cleanup again.` };
  const r = git(root, ['worktree', 'remove', wt]);
  if (!r.ok) return { removed: false, reason: `git worktree remove failed: ${r.err}. The worktree may hold files that git does not track; look at them, then remove the folder yourself.` };
  return { removed: true };
}

/** The cleanup after finish: the leftover worktrees of the rounds, the trunk worktree and branch, and the shared build folder. */
function cleanupAll(root, slug, state) {
  const out = { removed: [], kept: [] };
  const drop = (wt, branch) => {
    const had = wt && existsSync(wt);
    const res = removeWorktree(root, wt);
    if (!res.removed) { out.kept.push({ path: wt, branch, reason: res.reason }); return; }
    if (had) out.removed.push(wt);
    if (branch && git(root, ['branch', '-D', branch]).ok) out.removed.push(branch);
  };
  const probeLeft = (p) => /--probe-[^\\/]+$/.test(p ?? '');
  for (const l of state.leftovers ?? []) if (!probeLeft(l.path)) drop(l.path, l.branch);
  removeProbes(root, state, probeTags(state), out);
  drop(state.worktree, state.trunk);
  // The build folders: the shared one, and the folders of the probes and of the reference worktree.
  const builds = state.buildDir ? [state.buildDir, `${state.buildDir}-probe`, `${state.buildDir}-ref`] : [];
  for (const bd of builds) {
    if (!existsSync(bd)) continue;
    // WARNING: a recursive delete. It deletes only the exact folders that follow from the folder that
    // state.json records, beside the trunk worktree, and only when they hold no link. A delete of a
    // path from the spec text, or through a link, can delete files of the main checkout.
    const links = linksUnder(bd);
    if (samePath(bd, root) || !samePath(dirname(bd), dirname(state.worktree))) out.kept.push({ path: bd, reason: 'the build folder is not beside the trunk worktree: remove it yourself' });
    else if (links.length) out.kept.push({ path: bd, reason: `the build folder holds links (${links.slice(0, 3).join(', ')}): remove them, then run cleanup again` });
    else { rmSync(bd, { recursive: true, force: true }); out.removed.push(bd); }
  }
  state.leftovers = out.kept.filter((k) => !builds.includes(k.path));
  state.cleanedAt = nowIso();
  saveState(root, slug, state);
  return out;
}

function cleanup(root, slug) {
  const state = readState(root, slug);
  if (!state) throw new Error('no baseline: nothing to clean up');
  if (!state.finished) throw new Error('the loop is not finished: run finish first');
  const out = cleanupAll(root, slug, state);
  return { ok: out.kept.length === 0, ...out, ...(out.kept.length ? { error: out.kept.map((k) => `${k.path}: ${k.reason}`).join('; ') } : {}) };
}

/** Run `fn` while this process holds the measure lock. */
function withLock(root, slug, lane, fn) {
  const { spec } = loadSpec(root, slug);
  const l = waitLock(root, slug, spec, lane, 'trial', (h) => h.kind === 'probe');
  if (!l.ok) return l;
  try { return fn(); } finally { dropLock(root, slug); }
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
      let val = true;
      if (v !== undefined && !v.startsWith('--')) { val = v; i++; }
      // A repeated flag (`--skip a --skip b`) collects its values.
      f[k] = k in f ? [].concat(f[k], val) : val;
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
      case 'propose-context': out = proposeContext(root, slug, f); break;
      case 'trial': out = withLock(root, slug, typeof f.on === 'string' ? f.on : null, () => trial(root, slug, pos[0], f)); break;
      case 'round-open': out = roundOpen(root, slug); break;
      case 'round-close': out = withLock(root, slug, null, () => roundClose(root, slug)); break;
      case 'checkpoint': out = withLock(root, slug, null, () => checkpoint(root, slug)); break;
      case 'merge-consider': out = withLock(root, slug, null, () => mergeConsider(root, slug, f)); break;
      case 'merge-trial': out = withLock(root, slug, null, () => mergeTrial(root, slug, f)); break;
      case 'merge-close': out = withLock(root, slug, null, () => mergeClose(root, slug)); break;
      case 'finish': out = finish(root, slug, f); break;
      case 'cleanup': out = cleanup(root, slug); break;
      case 'probe-open': out = probeOpen(root, slug, f); break;
      case 'probe': out = probe(root, slug, f); break;
      case 'idea-claim': out = ideaClaim(root, slug, f); break;
      case 'profile': out = withLock(root, slug, null, () => profileRun(root, slug)); break;
      case 'profile-record': out = profileRecord(root, slug, f); break;
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
