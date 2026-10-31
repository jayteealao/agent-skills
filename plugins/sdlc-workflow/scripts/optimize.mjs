#!/usr/bin/env node
/**
 * scripts/optimize.mjs — the disk side of /wf loop optimize.
 * skills/wf/scripts/optimize.mjs runs this script.
 *
 *   baseline        <root> <slug>                     the worktree, the guard, the metric `repeat` times, the holdout
 *   status          <root> <slug>                     running | complete | stopped | finished, and the next action
 *   propose-context <root> <slug> [--on <lane>]       the digest of the next proposer and the worktree of its lane
 *   trial           <root> <slug> <id> [--on <lane>] [--hypothesis t | --hypothesis-file f] [--expected e]
 *                                                     judge the change in the worktree of the lane: kept, reverted, rejected, crashed, timeout
 *   round-open      <root> <slug> [schedule|plateau]  open a branch round: one branch and one worktree for each branch
 *   round-close     <root> <slug>                     pick the winner, fast-forward the trunk, remove the branch worktrees and branches
 *   merge-consider  <root> <slug> --try b2,b4 --skip "b3:<reason>"
 *                                                     record which candidates of the closed round to merge into the trunk
 *   merge-trial     <root> <slug> --branch <name>     merge one candidate into the trunk, and judge it as a trial
 *   merge-close     <root> <slug>                     end the merge step: skip the rest, delete the branches, checkpoint
 *   checkpoint      <root> <slug>                     run the holdout and compare it to the baseline
 *   finish          <root> <slug> [--message m] [--no-ablate] [--no-holdout] [--stash]
 *                                                     squash the kept trials onto the slug branch; write the slice artifacts; clean up
 *   cleanup         <root> <slug>                     remove what finish could not: worktrees, the trunk branch, the build folder
 *   probe-open      <root> <slug> [--on <lane>]       a probe worktree at the best of the lane, for the proposer to instrument
 *   probe           <root> <slug> [--on <lane>] --cmd "<command>" [--label t]
 *                                                     run one command in the probe worktree, under the measure lock
 *                                                     (probe-open and probe refuse a proposer past twice its propose-time)
 *   idea-claim      <root> <slug> [--on <lane>] --target t [--family f] [--again "<reason>"]
 *                                                     claim an idea in the shared ideas ledger before the edit
 *   profile         <root> <slug>                     run the profile command of the spec on the trunk best
 *   profile-record  <root> <slug> --file <json> | --skip "<reason>"
 *                                                     record the profile of the profiler agent
 *   prune           <root> <slug>                     give the trials of a trailing branch to a new fork of the leader
 *   ablate          <root> <slug>                     revert each kept change alone and measure what it still gives (finish runs it too)
 *
 * `--on <lane>` names a branch that status lists in `next.ready`. A round whose branches have
 * their own worktrees lets the driver edit them at the same time; `trial` holds the measure
 * lock (optimize/.measure.lock), so one guard and one measurement run at a time. A proposer
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
  branchNameOf, settleIdea, noiseOf, pairOrder, pairedActive, pairedDecision, keepThreshold, noiseFor, seedsOf, paceOf,
  ablationDue, ablationTable, ablationVerdict, nearMisses, normTarget, proposeOvertime, overtimeRefusal,
} from '../lib/optimize.mjs';
import { workflowDir } from '../lib/records-root.mjs';
import { findRunFile } from '../lib/run-files.mjs';
import { pidAlive as alive } from '../lib/proc.mjs';
import { costFiles, readCostRows } from '../lib/cost-ledger.mjs';
import { INDEX_NAME, hasDoc, readDoc, writeDoc } from '../lib/records.mjs';

const USAGE = 'Usage: optimize.mjs <baseline|status|propose-context|trial|round-open|round-close|merge-consider|merge-trial|merge-close|checkpoint|finish|cleanup|probe-open|probe|idea-claim|profile|profile-record|prune|ablate> <projectRoot> <slug> ...';
const PLUGIN_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SLICE = 'optimize';

const wfDir = workflowDir;
const optDir = (root, slug) => join(wfDir(root, slug), 'optimize');
const statePath = (root, slug) => join(optDir(root, slug), 'state.json');
const resultsPath = (root, slug) => join(optDir(root, slug), 'results.jsonl');
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
// The ideas ledger. Proposers claim ideas while a trial runs, so each change of the file
// holds a short lock of its own: a read, the change, and an atomic write.
const ideasPath = (root, slug) => join(optDir(root, slug), 'ideas.json');
/**
 * Whether the saved diffs (absolute paths) apply together, in order, on the committed code of a
 * worktree. The check reads the index, so an edit in the worktree does not change the answer.
 */
function diffsApply(wt, files) {
  return !!wt && existsSync(wt) && files.length > 0 && files.every((f) => existsSync(f)) && git(wt, ['apply', '--check', '--cached', ...files]).ok;
}
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

// The stop request is a run file: <root>/.ai/run/<slug>/.control.json, else the workflow folder of an older run.
function readControl(root, slug) {
  const f = findRunFile(root, slug, '.control.json');
  if (!f) return null;
  try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return { action: 'stop', reason: '.control.json does not parse' }; }
}

/** The tokens of the slug since the start, from the cost ledger (lib/cost-ledger.mjs). */
function tokensSince(root, slug, startedAt) {
  const dir = wfDir(root, slug);
  if (!costFiles(dir).length) return null;
  let sum = 0;
  const t0 = Date.parse(startedAt);
  for (const row of readCostRows(dir)) {
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
// Two measured runs on one machine corrupt each other's numbers.
// ---------------------------------------------------------------------------
const lockPath = (root, slug) => join(optDir(root, slug), '.measure.lock');
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

// ---------------------------------------------------------------------------
// The reference worktree and paired measurement
// ---------------------------------------------------------------------------
/** The reference worktree: detached at the commit that a trial is compared with. */
const refPath = (state) => `${state.worktree}--ref`;
function refEnvOf(state, spec) {
  if (!spec.sharedBuild || !state.buildDir) return null;
  mkdirSync(`${state.buildDir}-ref`, { recursive: true });
  return { [spec.sharedBuild]: `${state.buildDir}-ref` };
}
/** Put the reference worktree at `commit`. It has its own build folder, so its binary never replaces the binary of a lane. */
function ensureRef(root, state, spec, commit) {
  const wt = refPath(state);
  if (existsSync(wt)) {
    assertWorktreePath(root, wt);
    gitOk(wt, ['checkout', '-q', '--detach', '-f', commit], 'checkout');
    gitOk(wt, ['clean', '-fd'], 'clean');
    return { ok: true, worktree: wt };
  }
  gitOk(root, ['worktree', 'add', '-q', '--detach', wt, commit], 'worktree add');
  if (spec.setup) {
    const s = runCommand(spec.setup, wt, 60 * 60_000, refEnvOf(state, spec));
    if (s.code !== 0) return { ok: false, error: `the setup command failed in ${wt} (exit ${s.code})`, output: tail(s.stdout + s.stderr) };
  }
  return { ok: true, worktree: wt };
}

/**
 * One paired block: a warm-up run on each side, then `n` pairs in the order A B, B A, A B, …
 * The gain of a pair is the gain of side B over side A. A is the reference; B is the trial.
 */
function pairedBlock(spec, a, b, n) {
  const one = (side) => {
    const r = runCommand(spec.metric.command, side.cwd, spec.budget.trialTimeoutMs, side.env);
    if (r.timedOut) return { timeout: true, output: tail(r.stdout + r.stderr) };
    const v = r.code === 0 ? parseMetricLine(r.stdout, spec.metric.key) : null;
    return v === null ? { crashed: true, output: tail(r.stdout + r.stderr) } : { v };
  };
  const out = { ref: [], cand: [], gains: [] };
  for (const side of [a, b]) {
    const w = one(side);
    if (w.v === undefined) return { ...out, ...w };
  }
  for (let i = 0; i < n; i++) {
    const got = {};
    for (const s of pairOrder(i)) {
      const r = one(s === 'A' ? a : b);
      if (r.v === undefined) return { ...out, ...r };
      got[s] = r.v;
    }
    out.ref.push(got.A);
    out.cand.push(got.B);
    out.gains.push(gainOf(spec.metric.direction, got.A, got.B));
  }
  return { ...out, median: median(out.gains) };
}

/**
 * Judge a committed change that passed the guard: the metric, the keep rule and the confirm run.
 * It fills `line` and returns { verdict, extra }. With paired measurement on, each block runs the
 * reference (the best of the lane) and the trial in turns; otherwise the trial runs alone and is
 * compared with the best value.
 */
function judge(root, state, spec, wt, env, best, line) {
  if (pairedActive(spec, state)) {
    const ref = ensureRef(root, state, spec, best.commit);
    if (!ref.ok) return { verdict: 'crashed', extra: { reason: ref.error, output: ref.output } };
    const A = { cwd: ref.worktree, env: refEnvOf(state, spec) };
    const B = { cwd: wt, env };
    const first = pairedBlock(spec, A, B, spec.metric.repeat);
    if (first.timeout || first.crashed) return { verdict: first.timeout ? 'timeout' : 'crashed', extra: { reason: `the metric ${first.timeout ? 'timed out' : 'did not print a number'} in a paired block`, values: first.cand, output: first.output } };
    line.values = first.cand;
    line.median = median(first.cand);
    line.delta = first.median;
    line.paired = { ref: first.ref, gains: first.gains };
    let d = pairedDecision({ spec, best: best.value, noise: state.baseline.pairedNoise, gains: first.gains });
    line.threshold = d.threshold;
    if (d.needConfirm) {
      const c = pairedBlock(spec, A, B, spec.metric.repeat);
      if (c.timeout || c.crashed) return { verdict: c.timeout ? 'timeout' : 'crashed', extra: { reason: 'the confirm block failed', output: c.output } };
      line.confirm = c.cand;
      Object.assign(line.paired, { confirmRef: c.ref, confirmGains: c.gains });
      d = pairedDecision({ spec, best: best.value, noise: state.baseline.pairedNoise, gains: first.gains, confirm: c.gains });
      if (d.kept) {
        line.median = median([...first.cand, ...c.cand]);
        line.delta = median([...first.gains, ...c.gains]);
      }
    }
    if (!d.kept) return { verdict: 'reverted', extra: { reason: d.wins ? 'the confirm block did not agree' : `the paired gain ${line.delta} is not above the threshold ${d.threshold}, or fewer than ${Math.max(1, first.gains.length - 1)} pairs gained` } };
    return { verdict: 'kept' };
  }
  const m = measure(spec, wt, spec.metric.repeat, undefined, undefined, env);
  if (m.timeout) return { verdict: 'timeout', extra: { reason: 'the metric timed out', values: m.values, output: m.output } };
  if (m.crashed) return { verdict: 'crashed', extra: { reason: 'the metric did not print a number', values: m.values, output: m.output } };
  line.values = m.values;
  line.median = m.median;
  line.delta = gainOf(spec.metric.direction, best.value, m.median);
  let d = keepDecision({ spec, best: best.value, noise: state.baseline.noise, first: m.median });
  line.threshold = d.threshold;
  if (d.needConfirm) {
    const c = measure(spec, wt, spec.metric.repeat, undefined, undefined, env);
    if (c.timeout || c.crashed) return { verdict: c.timeout ? 'timeout' : 'crashed', extra: { reason: 'the confirm run failed', output: c.output } };
    line.confirm = c.values;
    d = keepDecision({ spec, best: best.value, noise: state.baseline.noise, first: m.median, confirm: c.median });
    if (d.kept) {
      line.median = median([...m.values, ...c.values]);
      line.delta = gainOf(spec.metric.direction, best.value, line.median);
    }
  }
  if (!d.kept) return { verdict: 'reverted', extra: { reason: d.wins ? 'the confirm run did not agree' : `the gain ${line.delta} is not above the threshold ${d.threshold}` } };
  return { verdict: 'kept' };
}

/**
 * The ablation: each kept change of the trunk, reverted alone in the reference worktree on
 * top of the final code, and a paired block of the code without it against the final code. A
 * change whose removal costs no more than the keep threshold is weak. A revert that conflicts, or
 * a block that fails, is not checked. Nothing is removed: the person decides at verify.
 */
function runAblation(root, slug, state, spec) {
  checkout(root, state, state.trunk);
  const threshold = keepThreshold(spec, state.best.value, noiseFor(spec, state));
  const results = readResults(root, slug);
  const commits = git(root, ['rev-list', '--first-parent', '--reverse', `${state.baseCommit}..${state.best.commit}`]).out.split(/\r?\n/).filter(Boolean);
  const final = { cwd: state.worktree, env: envOf(state, spec) };
  const changes = [];
  for (const commit of commits) {
    const parents = git(root, ['rev-list', '--parents', '-n', '1', commit]).out.split(' ').length - 1;
    const subject = git(root, ['log', '-1', '--format=%s', commit]).out;
    const trial = results.find((x) => x.event === 'trial' && x.commit === commit)?.trial ?? null;
    const c = { commit, subject, trial, gain: null };
    changes.push(c);
    const ref = ensureRef(root, state, spec, state.best.commit);
    if (!ref.ok) { Object.assign(c, { verdict: 'not checked', reason: ref.error }); continue; }
    const rv = git(ref.worktree, ['revert', '--no-commit', ...(parents > 1 ? ['-m', '1'] : []), commit]);
    if (!rv.ok) {
      git(ref.worktree, ['revert', '--abort']);
      Object.assign(c, { verdict: 'not checked', reason: 'the revert conflicts with a later change' });
      continue;
    }
    git(ref.worktree, ['revert', '--quit']);
    const blk = pairedBlock(spec, { cwd: ref.worktree, env: refEnvOf(state, spec) }, final, spec.metric.repeat);
    if (blk.timeout || blk.crashed) { Object.assign(c, { verdict: 'not checked', reason: `the metric ${blk.timeout ? 'timed out' : 'did not print a number'}` }); continue; }
    c.gain = blk.median;
    c.verdict = ablationVerdict(c.gain, threshold);
  }
  const ablation = { at: nowIso(), threshold, changes };
  appendResult(root, slug, { event: 'ablate', threshold, changes: changes.map(({ commit, trial, gain, verdict }) => ({ commit, trial, gain, verdict })) });
  return ablation;
}

function ablate(root, slug) {
  const state = readState(root, slug);
  if (!state) throw new Error('no baseline: nothing to check');
  if (state.finished) throw new Error('the loop is finished');
  if (state.round) throw new Error('a branch round is open: run round-close first');
  if (state.merge) throw new Error('the merge step is open: run merge-close first');
  const { spec } = loadSpec(root, slug);
  const err = consistency(root, slug, state, readResults(root, slug), spec);
  if (err) throw new Error(`state-error: ${err}`);
  state.ablation = runAblation(root, slug, state, spec);
  saveState(root, slug, state);
  return { ...optimizeStatus(root, slug), ok: true, ablation: state.ablation };
}

/** state.json and results.jsonl must agree, and the branch must sit where the loop left it, or the status is state-error. */
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
  const ideas = readIdeas(root, slug);
  // A bundle of the ideas ledger joins only ideas whose last diffs apply together on the trunk.
  const canApply = (trials) => diffsApply(state.worktree, trials.map((t) => join(patchesDir(root, slug), `${t}.patch`)));
  const st = nextAction({ state, spec, control: readControl(root, slug), tokensUsed: tokensSince(root, slug, state.startedAt), ideas, pace: paceOf(results), canApply });
  // A port or a bundle has no proposer: the script applies the kept diffs, and the editor makes them by hand when they do not apply.
  if (st.next?.port) {
    const c = state.merge?.candidates.find((x) => x.name === st.next.port);
    if (c?.kind === 'bundle') {
      st.next.portOf = { kind: 'bundle', trials: c.trials, trial: c.trials[0], branch: c.branch, ideas: c.ideas, hypotheses: c.hypotheses, hypothesis: c.hypotheses.join(' | '), gain: c.gain, patches: c.patches.map((x) => join(optDir(root, slug), x)) };
      st.next.portOf.patch = st.next.portOf.patches[0];
    } else if (c) st.next.portOf = { trial: c.trial, branch: c.branch, idea: c.idea ?? null, hypothesis: c.hypothesis, gain: c.gain, patch: join(optDir(root, slug), c.patch), patches: [join(optDir(root, slug), c.patch)] };
  }
  if (st.next?.bundle) {
    const results = readResults(root, slug);
    st.next.bundleOf = st.next.bundle.map((id) => {
      const i = ideas.ideas.find((x) => x.id === id);
      return { id, target: i?.target, family: i?.family, pooled: i?.pooled, hypotheses: results.filter((r) => r.event === 'trial' && r.idea === id).map((r) => r.hypothesis?.text ?? ''), patches: (i?.patches ?? []).map((t) => join(patchesDir(root, slug), `${t}.patch`)) };
    });
  }
  return {
    ok: true,
    ...st,
    best: state.best,
    baseline: { median: state.baseline.median, noise: state.baseline.noise, ...(state.baseline.pairedNoise !== undefined ? { pairedNoise: state.baseline.pairedNoise } : {}) },
    counters: state.counters,
    budget: { trials: spec.budget.trials, roundsMax: spec.rounds.at.length + spec.rounds.maxExtra, branches: spec.rounds.branches, width: spec.width },
    round: state.round ? { n: state.round.n, reason: state.round.reason, branches: state.round.branches.map((b) => ({ k: b.k, name: b.name, trials: b.trials, keeps: b.keeps, best: b.best.value })) } : null,
    merge: state.merge ? { ...state.merge, candidates: state.merge.candidates.map((c) => mergeView(root, slug, c, ideas, results)) } : null,
    rounds: state.rounds.length,
    metric: { command: spec.metric.command, unit: spec.metric.unit, direction: spec.metric.direction },
    worktree: state.worktree,
    profile: spec.profile ? { mode: spec.profile === 'agent' ? 'agent' : 'command', last: state.profile ?? null, patch: existsSync(profilePatch(root, slug)) ? profilePatch(root, slug) : null } : null,
  };
}

/**
 * A merge candidate as the consider step reads it: a port or a bundle names its diff files, its
 * targets, and every idea of the ledger on those targets, with the lanes of their trials and their status.
 */
function mergeView(root, slug, c, ideas, results) {
  if (!c.kind) return c;
  const own = c.kind === 'port' ? [c.idea] : c.ideas ?? [];
  const targets = [...new Set(own.map((id) => ideas.ideas.find((i) => i.id === id)?.target).filter(Boolean))];
  const laneOfTrial = (t) => results.find((x) => x.event === 'trial' && x.trial === t)?.branch ?? 'trunk';
  const ledger = ideas.ideas.filter((i) => targets.some((t) => normTarget(t) === normTarget(i.target)))
    .map((i) => ({ id: i.id, target: i.target, status: i.status, pooled: i.pooled, trials: i.trials.map((t) => ({ trial: t, lane: laneOfTrial(t) })) }));
  return c.kind === 'port'
    ? { ...c, patchFile: join(optDir(root, slug), c.patch), targets, ledger }
    : { ...c, patchFiles: c.patches.map((x) => join(optDir(root, slug), x)), targets, ledger };
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
  // An A/A block of the reference worktree against the trunk worktree, at the same commit,
  // gives the noise of a paired comparison.
  let pairedNoise = null;
  let aa = null;
  if (spec.metric.paired) {
    const ref = ensureRef(root, build, spec, base.out);
    if (!ref.ok) return { ok: false, error: ref.error, output: ref.output };
    aa = pairedBlock(spec, { cwd: ref.worktree, env: refEnvOf(build, spec) }, { cwd: wt, env }, spec.metric.repeat);
    if (aa.timeout || aa.crashed) return { ok: false, error: 'the metric failed in the paired A/A block of the baseline', output: aa.output };
    pairedNoise = noiseOf(aa.gains);
  }
  const state = newState({ slug, worktree: wt, baseCommit: base.out, values: m.values, holdoutValue: holdout, startedAt: nowIso(), slugBranch, pairedNoise });
  state.buildDir = build.buildDir ?? null;
  appendResult(root, slug, { event: 'baseline', commit: base.out, values: m.values, median: state.baseline.median, noise: state.baseline.noise, holdout, ...(aa ? { pairedNoise, aa: aa.gains } : {}) });
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

/**
 * The refusal of a probe whose proposer runs past twice its propose-time, or null. The proposer
 * of a lane starts at its `propose-context` stamp. A probe is the costly work of a proposer, so
 * the refusal ends its research, and the loop goes on with the hypothesis that it returns.
 */
function proposerOverTime(root, slug, state, spec, lane) {
  const tag = laneTagOf(state, lane);
  let at = null;
  try { at = JSON.parse(readFileSync(proposeStamp(root, slug, tag), 'utf8')).at; } catch { return null; }
  const over = proposeOvertime(at, spec.budget.proposeTimeMs);
  if (!over) return null;
  appendResult(root, slug, { event: 'propose-overtime', lane: tag, ms: over.elapsedMs });
  return { ok: false, refused: true, overtime: true, lane, error: overtimeRefusal(lane, over) };
}

function probeOpen(root, slug, f, { locked = false, proposer = false } = {}) {
  const state = readState(root, slug);
  if (!state) throw new Error('no baseline: run baseline first');
  const { spec } = loadSpec(root, slug);
  const lane = probeLane(state, f);
  const over = proposer ? proposerOverTime(root, slug, state, spec, lane) : null;
  if (over) return over;
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
  const over = proposerOverTime(root, slug, state, spec, lane);
  if (over) return over;
  const l = waitLock(root, slug, spec, lane, 'probe', () => true);
  if (!l.ok) return l;
  try {
    const r = runCommand(command, wt, spec.budget.trialTimeoutMs, probeEnvOf(state, spec));
    appendResult(root, slug, { event: 'probe', lane: tag, label, code: r.code, ms: r.ms, ...(r.timedOut ? { timedOut: true } : {}) });
    return { ok: true, lane, worktree: wt, code: r.code, timedOut: r.timedOut, ms: r.ms, output: tail(r.stdout + r.stderr, 80) };
  } finally { dropLock(root, slug); }
}

// ---------------------------------------------------------------------------
// ideas and the profile
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
  // A port applies a kept idea of a branch that was not merged again; a bundle tries marginal ideas together.
  const mg = state.merge;
  const port = st.next.port ? mg?.candidates.find((c) => c.name === st.next.port) ?? null : null;
  const bundle = Array.isArray(st.next.bundle) ? st.next.bundle : null;
  // The near misses of the winner are a port of several diffs.
  const nearSet = port?.kind === 'bundle';
  if (port) line.port = nearSet ? { round: mg.round, trials: port.trials, branch: port.branch, kind: 'bundle' } : { round: mg.round, trial: port.trial, branch: port.branch };
  if (bundle) line.bundle = bundle;
  // `--apply` makes the change of a port or a bundle from its saved diffs. A diff that does not
  // apply leaves the worktree as it was and records no trial: the editor then makes the change by hand.
  if (f.apply === true && (port || bundle) && !dirtyPaths(wt).length) {
    const book = bundle ? readIdeas(root, slug) : null;
    const files = port
      ? (port.patches ?? [port.patch]).map((x) => join(optDir(root, slug), x))
      : bundle.map((id) => book.ideas.find((i) => i.id === id)?.patches?.at(-1)).filter((t) => t !== undefined).map((t) => join(patchesDir(root, slug), `${t}.patch`));
    const a = files.length && files.every((x) => existsSync(x)) ? git(wt, ['apply', '--3way', ...files]) : { ok: false, err: 'a saved diff is missing' };
    if (!a.ok) {
      resetTo(root, wt, best.commit);
      return { ok: false, apply: 'failed', error: `the saved diffs do not apply: ${tail(`${a.out ?? ''}\n${a.err ?? ''}`)}`, next: st.next };
    }
    line.applied = files.map((x) => basename(x));
  }
  const bundleSum = bundle ? Number(readIdeas(root, slug).ideas.filter((i) => bundle.includes(i.id)).reduce((s, i) => s + (i.pooled?.mean ?? 0), 0).toPrecision(6)) : null;
  // The idea of the trial: --idea, the idea of a port, or the claim in flight of its lane (a trial that waited through a stop).
  const ideaId = port ? (nearSet ? null : port.idea) : bundle ? null
    : typeof f.idea === 'string' && f.idea ? f.idea : readIdeas(root, slug).ideas.find((i) => i.claim === laneName)?.id ?? null;
  if (ideaId) line.idea = ideaId;
  const finish = (verdict, extra = {}) => {
    Object.assign(line, { verdict, ...extra });
    if (verdict === 'kept' && port) line.additive = nearSet ? { measured: line.delta, sum: port.gain } : { measured: line.delta, alone: port.gain };
    if (verdict === 'kept' && bundle) line.additive = { measured: line.delta, sum: bundleSum };
    // A kept change, and a reverted change with a real gain, keep their diff: a port or a bundle can use it.
    const keepPatch = !!line.commit && (verdict === 'kept' || (verdict === 'reverted' && Number.isFinite(line.delta) && line.delta > 0));
    if (keepPatch) {
      mkdirSync(patchesDir(root, slug), { recursive: true });
      writeFileSync(join(patchesDir(root, slug), `${n}.patch`), git(wt, ['diff', `${line.commit}~1`, line.commit]).out + '\n');
      line.patch = `patches/${n}.patch`;
    }
    if (ideaId) withIdeas(root, slug, (book) => settleIdea(book, ideaId, { trial: n, verdict, gain: line.delta, patch: keepPatch }));
    const together = bundle ?? (nearSet ? port.ideas ?? [] : null);
    if (together?.length && verdict === 'kept') withIdeas(root, slug, (book) => { for (const i of book.ideas) if (together.includes(i.id)) { i.status = 'bundled'; i.trials.push(n); } });
    // A set of ideas that was tried together is not tried again as a bundle of the trunk.
    if (nearSet && port.ideas?.length) state.bundlesTried = [...(state.bundlesTried ?? []), [...port.ideas].sort().join(',')];
    if (verdict !== 'kept') resetTo(root, wt, best.commit);
    state.counters.trials = n;
    if (port) {
      // A port counts against budget.trials. It is not a hypothesis of the trunk, so the plateau streak does not change.
      port.verdict = verdict;
      if (line.reason) port.reason = line.reason;
    } else if (isTrunk) {
      // A scheduled round that did not fit in the time left is used up, and the line records it.
      if (st.next.skipRound !== undefined && !state.schedule.used.includes(st.next.skipRound)) {
        state.schedule.used.push(st.next.skipRound);
        line.skippedRound = { point: st.next.skipRound, why: st.next.why };
      }
      state.counters.trunkTrials++;
      state.counters.sinceCheckpoint++;
      state.counters.streak = verdict === 'kept' ? 0 : state.counters.streak + 1;
      if (bundle) state.bundlesTried = [...(state.bundlesTried ?? []), [...bundle].sort().join(',')];
    } else {
      branch.trials++;
    }
    appendResult(root, slug, line);
    if (port && !mg.order.some((name) => !mg.candidates.find((c) => c.name === name).verdict)) closeMerge(root, slug, state, spec, 'not tried');
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
  // The time of the guard and the measurement goes on the line: the schedule fits a round in the time left with it.
  const t0 = Date.now();
  const g = runCommand(spec.guard.command, wt, spec.budget.trialTimeoutMs, env);
  line.guard = g.code === 0 ? 'pass' : 'fail';
  if (g.timedOut) return finish('timeout', { reason: 'the guard timed out', output: tail(g.stdout + g.stderr) });
  if (g.code !== 0) return finish('reverted', { reason: `the guard failed (exit ${g.code})`, output: tail(g.stdout + g.stderr) });
  const j = judge(root, state, spec, wt, env, best, line);
  line.ms = Date.now() - t0;
  if (j.verdict !== 'kept') return finish(j.verdict, j.extra);
  const kept = { commit: line.commit, value: line.median, trial: n, reachedAt: n };
  if (isTrunk) state.best = kept;
  else { branch.best = kept; branch.keeps++; }
  state.counters.keeps++;
  return finish('kept');
}

// ---------------------------------------------------------------------------
// branch rounds
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
  // Each branch starts at its own hot spot of the profile.
  const prof = readProfile(root, slug);
  if (prof?.entries?.length) {
    const seeds = seedsOf(prof.entries, readIdeas(root, slug), state.best.value, keepThreshold(spec, state.best.value, noiseFor(spec, state)), branches.length);
    branches.forEach((b, i) => { if (seeds[i]) b.seed = seeds[i]; });
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

/**
 * Prune a branch that trails the leader with no keep. Its worktree and its branch go; its
 * other trials go to a new branch forked from the best of the leader, with the next free seed.
 */
function prune(root, slug) {
  const st = requireNext(root, slug, 'prune');
  const state = readState(root, slug);
  const { spec } = loadSpec(root, slug);
  const r = state.round;
  const b = r.branches.find((x) => x.name === st.next.branch);
  const leader = pickWinner({ branches: r.branches.filter((x) => !x.pruned) }, spec.metric.direction);
  if (!b || !leader) throw new Error(`prune: ${st.next.branch} or the leader of round ${r.n} is missing`);
  if (existsSync(b.worktree) && dirtyPaths(b.worktree).length) resetTo(root, b.worktree, b.best.commit);
  const res = removeWorktree(root, b.worktree);
  if (res.removed) git(root, ['branch', '-D', b.name]);
  else (state.leftovers ??= []).push({ path: b.worktree, branch: b.name, reason: res.reason });
  removeProbes(root, state, [`r${r.n}b${b.k}`], { removed: [], kept: [] });
  const left = (b.limit ?? r.branchTrials) - b.trials;
  Object.assign(b, { pruned: true, limit: b.trials, worktree: null });
  const k = Math.max(...r.branches.map((x) => x.k)) + 1;
  const name = branchNameOf(slug, r.n, k);
  const worktree = join(dirname(state.worktree), `${basename(state.worktree)}--r${r.n}b${k}`);
  if (git(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${name}`]).ok || existsSync(worktree)) throw new Error(`${name} or ${worktree} exists from another run. Ask the person.`);
  gitOk(root, ['branch', name, leader.best.commit], 'branch');
  gitOk(root, ['worktree', 'add', '-q', worktree, name], 'worktree add');
  if (spec.setup) {
    const s = runCommand(spec.setup, worktree, 60 * 60_000, envOf(state, spec));
    if (s.code !== 0) return { ok: false, error: `the setup command failed in ${worktree} (exit ${s.code})`, output: tail(s.stdout + s.stderr) };
  }
  const prof = readProfile(root, slug);
  const used = new Set(r.branches.filter((x) => !x.pruned).map((x) => x.seed).filter(Boolean));
  const seeds = prof?.entries?.length ? seedsOf(prof.entries, readIdeas(root, slug), leader.best.value, keepThreshold(spec, leader.best.value, noiseFor(spec, state)), r.branches.length + 1) : [];
  const seed = seeds.find((x) => x && !used.has(x)) ?? null;
  r.branches.push({ k, name, worktree, best: { ...leader.best, reachedAt: 0 }, trials: 0, keeps: 0, limit: left, forkedFrom: leader.name, ...(seed ? { seed } : {}) });
  appendResult(root, slug, { event: 'prune', round: r.n, branch: b.name, into: name, from: leader.name, trials: left, ...(seed ? { seed } : {}) });
  saveState(root, slug, state);
  return { ...optimizeStatus(root, slug), ok: true, pruned: b.name, into: name, from: leader.name, trials: left, seed };
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
  // Each kept trial of a branch that did not win, and that no merge candidate can bring in whole,
  // is a port candidate: its saved diff can be applied again on the trunk code. A diff that does not
  // apply to the new trunk is skipped as a conflict.
  const whole = new Set(candidates.filter((c) => !c.conflict).map((c) => c.name));
  const ports = spec.rounds.merge === 'off' ? [] : results.filter((x) => x.event === 'trial' && x.round === r.n && x.branch && x.branch !== winner?.name && !whole.has(x.branch) && x.verdict === 'kept' && x.patch).map((x) => {
    const file = join(optDir(root, slug), x.patch);
    const conflict = !existsSync(file) || !git(state.worktree, ['apply', '--check', file]).ok;
    return {
      kind: 'port', name: `t${x.trial}`, trial: x.trial, branch: x.branch, idea: x.idea ?? null, hypothesis: x.hypothesis?.text ?? '', patch: x.patch, gain: x.delta, paths: x.paths ?? [], conflict,
      ...(conflict ? { decision: 'skip', reason: 'conflict', verdict: 'skipped' } : {}),
    };
  });
  // The near misses of the winner: its reverted trials with a gain above 0. They were measured
  // on the code that is now the trunk, so their saved diffs apply as they are, and together they can pass.
  const near = winner && spec.rounds.merge !== 'off'
    ? nearMisses(results, r.n, winner.name, (patches) => diffsApply(state.worktree, patches.map((x) => join(optDir(root, slug), x))))
    : [];
  const bundles = near.length ? [{
    kind: 'bundle', name: `n${r.n}`, trials: near.map((x) => x.trial), branch: winner.name, ideas: near.map((x) => x.idea).filter(Boolean),
    hypotheses: near.map((x) => x.hypothesis?.text ?? ''), patches: near.map((x) => x.patch), gains: near.map((x) => x.delta),
    gain: Number(near.reduce((s, x) => s + x.delta, 0).toPrecision(6)), paths: [...new Set(near.flatMap((x) => x.paths ?? []))], conflict: false,
  }] : [];
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
  appendResult(root, slug, { event: 'round-close', round: r.n, winner: summary.winner, branches: summary.branches, candidates: candidates.map((c) => ({ name: c.name, gain: c.gain, conflict: c.conflict })), ports: ports.map((c) => ({ name: c.name, branch: c.branch, gain: c.gain, conflict: c.conflict })), bundles: bundles.map((c) => ({ name: c.name, trials: c.trials, gain: c.gain })) });
  let cp = { ran: false };
  const all = [...candidates, ...ports, ...bundles];
  if (all.length && !state.stopped) {
    state.merge = { round: r.n, from: r.from, base, worktree: state.worktree, considered: all.every((c) => c.conflict), order: [], candidates: all };
    if (state.merge.considered) cp = closeMerge(root, slug, state, spec, 'no candidate applies cleanly');
  } else if (!state.stopped) cp = runCheckpoint(root, slug, state, spec);
  saveState(root, slug, state);
  return { ok: true, round: r.n, winner: summary.winner ?? 'trunk', deleted, removed, leftovers: state.leftovers ?? [], candidates: candidates.map((c) => ({ name: c.name, conflict: c.conflict })), ports: ports.map((c) => ({ name: c.name, branch: c.branch, conflict: c.conflict })), bundles: bundles.map((c) => ({ name: c.name, trials: c.trials })), checkpoint: cp, ...optimizeStatus(root, slug) };
}

// ---------------------------------------------------------------------------
// The merge step after a round (F)
// ---------------------------------------------------------------------------

/** A candidate by its full branch name, `b<k>` or `r<n>b<k>`. */
function candidateOf(merge, token) {
  const t = String(token ?? '').trim();
  return merge.candidates.find((c) => c.name === t || (!c.kind && (`b${c.k}` === t || `r${merge.round}b${c.k}` === t))) ?? null;
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
  for (const c of mg.candidates) if (!c.kind) git(root, ['branch', '-D', c.name]);
  const merged = mg.candidates.filter((c) => !c.kind && c.verdict === 'kept').map((c) => c.name);
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
  const t0 = Date.now();
  const g = runCommand(spec.guard.command, wt, spec.budget.trialTimeoutMs, env);
  line.guard = g.code === 0 ? 'pass' : 'fail';
  if (g.timedOut) return done('timeout', { reason: 'the guard timed out', output: tail(g.stdout + g.stderr) });
  if (g.code !== 0) return done('reverted', { reason: `the guard failed (exit ${g.code})`, output: tail(g.stdout + g.stderr) });
  const j = judge(root, state, spec, wt, env, best, line);
  line.ms = Date.now() - t0;
  if (j.verdict !== 'kept') return done(j.verdict, j.extra);
  state.best = { commit: line.commit, value: line.median, trial: n, reachedAt: n };
  state.counters.keeps++;
  if (state.digestFrom?.round === mg.round) state.digestFrom.merged = [...(state.digestFrom.merged ?? []), cand.name];
  // The ideas of a merged branch are in the trunk now: their ports have nothing left to do.
  for (const c of mg.candidates) if (c.kind === 'port' && c.branch === cand.name && !c.verdict) Object.assign(c, { verdict: 'skipped', reason: 'merged with its branch' });
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
  // The ablation runs before the squash, while the trunk worktree holds the final code.
  if (ablationDue(spec, state) && f['no-ablate'] !== true) {
    state.ablation = runAblation(root, slug, state, spec);
    saveState(root, slug, state);
  }
  // A change kept after the last checkpoint is checked on the holdout before the squash.
  if (spec.holdout && f['no-holdout'] !== true && state.best.commit !== state.baseCommit && (state.lastCheckpoint?.trial ?? 0) < (state.best.trial ?? 0)) {
    const cp = runCheckpoint(root, slug, state, spec);
    saveState(root, slug, state);
    if (!cp.ok) throw new Error(`the holdout regressed before finish: ${state.stopped?.detail ?? `it reads ${cp.value}`}. Look at the trials since the last good checkpoint; finish --no-holdout squashes anyway`);
  }
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
  // --stash puts the person's uncommitted tracked files aside for the squash, and restores them after it.
  const stash = stashForFinish(root, slug, state, f);
  let out;
  try {
    out = squash();
  } catch (e) {
    if (stash) e.message += `; ${JSON.stringify(popFinishStash(root, stash))}`;
    throw e;
  }
  if (stash) out.stash = popFinishStash(root, stash);
  return out;

  function squash() {
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
    ...(spec.holdout && state.lastCheckpoint?.value !== null && state.lastCheckpoint?.value !== undefined ? [`- The holdout moved from ${state.baseline.holdout} to ${state.lastCheckpoint.value} (checked at trial ${state.lastCheckpoint.trial}).`] : []),
      `- One squashed commit: ${sha}.`, '', '## Kept Trials', '', keptTable(lineage, spec), '',
      ...(state.ablation ? ['## Ablation', '',
        `Each kept change, reverted alone on the final code and measured in pairs against it. A change whose removal costs no more than ${state.ablation.threshold}${unit} is weak; decide at verify whether it stays.`, '',
        ablationTable(state.ablation, spec), ''] : []),
      '## Files Changed', '', ...files.map((p) => `- ${p}`), '',
      ].join('\n'),
    });
    state.finished = { commit: sha, at, gain, kept: kept.length };
    appendResult(root, slug, { event: 'finish', commit: sha, gain, kept: kept.length });
    saveState(root, slug, state);
    // The loop is done: its worktrees, its trunk branch and its build folder go. A cleanup that
    // cannot remove a worktree never fails the finish; the result names what is left.
    return { ok: true, commit: sha, gain, kept: kept.length, ...(state.ablation ? { weak: state.ablation.changes.filter((c) => c.verdict === 'weak').length } : {}), files, wrote: ['03-slice.md', `03-slice-${SLICE}.md`, `05-implement-${SLICE}.md`], cleanup: cleanupAll(root, slug, state), next: { action: 'verify', invocation: `/wf verify ${slug} ${SLICE}` } };
  }
}

/**
 * The stash of finish. Without --stash, uncommitted changes to tracked files stop the finish. With
 * it, each such file is copied to optimize/finish-stash/ and stashed. A file that the squash or the
 * records of finish also write is refused: its pop would conflict.
 */
function stashForFinish(root, slug, state, f) {
  const tracked = git(root, ['status', '--porcelain', '--untracked-files=no']).out;
  if (!tracked) return null;
  if (f.stash !== true) throw new Error('the main checkout has uncommitted changes to tracked files: commit or stash them, or run finish --stash, then finish again');
  const files = git(root, ['diff', '--name-only', 'HEAD']).out.split(/\r?\n/).filter(Boolean);
  const squashed = new Set(git(root, ['diff', '--name-only', 'HEAD', state.trunk]).out.split(/\r?\n/).filter(Boolean));
  const records = relative(root, wfDir(root, slug)).split('\\').join('/');
  const overlap = files.filter((x) => squashed.has(x) || x === records || x.startsWith(`${records}/`));
  if (overlap.length) throw new Error(`finish --stash: ${overlap.join(', ')} also change in the squash or in the records of finish; commit them first`);
  const dir = join(optDir(root, slug), 'finish-stash');
  rmSync(dir, { recursive: true, force: true });
  const copies = files.map((x) => {
    const from = join(root, x);
    const to = join(dir, x);
    mkdirSync(dirname(to), { recursive: true });
    if (!existsSync(from)) return { path: x, deleted: true };
    writeFileSync(to, readFileSync(from));
    return { path: x, deleted: false };
  });
  gitOk(root, ['stash', 'push', '-q', '-m', `optimize finish ${slug}`, '--', ...files], 'stash');
  return { files, copies, dir };
}

/**
 * Pop the stash of finish. The pop gives back the index; the copies then give back the exact bytes,
 * because a checkout can change the line ends of a file. A failed pop keeps the stash and the copies.
 */
function popFinishStash(root, stash) {
  const pop = git(root, ['stash', 'pop', '-q', '--index']);
  if (!pop.ok) return { restored: false, files: stash.files, copies: stash.dir, error: `git stash pop failed: ${pop.err || pop.out}. The stash stays in git stash list, and the copies stay in ${stash.dir}` };
  const missing = [];
  for (const c of stash.copies) {
    const at = join(root, c.path);
    if (c.deleted) { if (existsSync(at)) missing.push(c.path); continue; }
    if (!existsSync(at)) { missing.push(c.path); continue; }
    writeFileSync(at, readFileSync(join(stash.dir, c.path)));
  }
  if (missing.length) return { restored: false, files: stash.files, copies: stash.dir, error: `${missing.join(', ')} did not come back from the stash; the copies stay in ${stash.dir}` };
  rmSync(stash.dir, { recursive: true, force: true });
  return { restored: true, files: stash.files };
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
  if (existsSync(refPath(state))) {
    try { assertWorktreePath(root, refPath(state)); resetTo(root, refPath(state), 'HEAD'); } catch { /* removeWorktree reports it */ }
    drop(refPath(state), null);
  }
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
      case 'finish': out = withLock(root, slug, null, () => finish(root, slug, f)); break;
      case 'ablate': out = withLock(root, slug, null, () => ablate(root, slug)); break;
      case 'cleanup': out = cleanup(root, slug); break;
      case 'probe-open': out = probeOpen(root, slug, f, { proposer: true }); break;
      case 'probe': out = probe(root, slug, f); break;
      case 'idea-claim': out = ideaClaim(root, slug, f); break;
      case 'profile': out = withLock(root, slug, null, () => profileRun(root, slug)); break;
      case 'profile-record': out = profileRecord(root, slug, f); break;
      case 'prune': out = withLock(root, slug, null, () => prune(root, slug)); break;
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
