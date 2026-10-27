// lib/optimize.mjs — the pure parts of /wf loop optimize (WF-OPTIMIZE-PLAN W1).
//
// scripts/optimize.mjs owns every git write, every measurement, every keep or
// revert, and the ledger (D4). This module holds the rules that it applies:
//   - the spec in 02-optimize-spec.md (4.1) and its defaults;
//   - the metric line, the median and the noise floor of the baseline (D6);
//   - the keep rule: a gain larger than max(min-gain, 2 × noise), and a confirm run that agrees;
//   - the path check against allowed-paths and off-limits (D5);
//   - the branch rounds (D12, 4.4): the fixed schedule, the plateau trigger (D14), the
//     turn of each branch, the winner, and the candidates of the merge step after a round;
//   - the two proposer digests (D13, 4.5): the trunk digest and the flushed branch digest;
//   - the next action that `status` prints (4.6).
//
// Source of the branch rounds: Cai, Ziakas et al., "Fork-and-Flush: Escaping Idea
// Basins in Autoresearch Agents", arXiv 2610.07447.

export const SPEC_FILE = '02-optimize-spec.md';
/**
 * 2: each branch of a round has its own worktree (`round.branches[k].worktree`).
 * 3: the profile, the paired noise, the reference worktree, the seeds and the ablation.
 */
export const STATE_VERSION = 3;
export const DIRECTIONS = Object.freeze(['lower', 'higher']);
export const VERDICTS = Object.freeze(['kept', 'reverted', 'rejected', 'crashed', 'timeout']);
/** `branch-rounds.merge`: `consider` tries to merge the other kept branches of a round into the trunk; `off` keeps only the winner. */
export const MERGE_MODES = Object.freeze(['consider', 'off']);
/** The digest shows at most this many trials (4.5). */
export const DIGEST_TRIALS = 20;

export const DEFAULT_SPEC = Object.freeze({
  repeat: 5,
  'min-gain': '2%',
  budget: { trials: 60, plateau: 8, 'wall-clock': '6h', tokens: null, 'trial-timeout': '10m', 'propose-time': '15m' },
  'branch-rounds': { at: ['0%', '33%', '66%'], branches: 4, 'branch-trials': null, 'max-extra': 2, merge: 'consider', prune: 'on' },
  width: 1,
  'checkpoint-every': 5,
  ablate: 'on',
});

const str = (v) => String(v ?? '').trim();
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** `10m`, `6h`, `90s`, `2d`, or a number of milliseconds. null stays null. */
export function parseDuration(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  const m = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)$/i.exec(str(v));
  if (!m) return NaN;
  const n = Number(m[1]);
  return Math.round(n * { ms: 1, s: 1e3, m: 6e4, h: 3.6e6, d: 8.64e7 }[m[2].toLowerCase()]);
}

/** `2%` → { percent: 2 }; `0.5` or 0.5 → { absolute: 0.5 }. */
export function parseAmount(v) {
  if (v === null || v === undefined || v === '') return { absolute: 0 };
  if (typeof v === 'number') return { absolute: v };
  const s = str(v);
  const p = /^(\d+(?:\.\d+)?)\s*%$/.exec(s);
  if (p) return { percent: Number(p[1]) };
  const n = Number(s);
  return Number.isFinite(n) ? { absolute: n } : { invalid: s };
}

/** The amount in metric units, against a reference value. */
export const amountOf = (a, ref) => (a.percent !== undefined ? Math.abs(ref) * (a.percent / 100) : (a.absolute ?? 0));

/** `33%` → 0.33. */
function fraction(v) {
  const a = parseAmount(v);
  if (a.percent !== undefined) return a.percent / 100;
  if (a.absolute !== undefined && a.absolute >= 0 && a.absolute <= 1) return a.absolute;
  return NaN;
}

/** D12 default: 6% of budget.trials, rounded down, at least 3. */
export const defaultBranchTrials = (trials) => Math.max(3, Math.floor(0.06 * trials));

/**
 * Normalize the spec frontmatter and list its errors. The result carries numbers in
 * milliseconds and fractions, so the rest of the code never parses again.
 */
export function parseSpec(fm) {
  const errors = [];
  if (!isObj(fm)) return { spec: null, errors: ['the spec has no frontmatter'] };
  const metric = isObj(fm.metric) ? fm.metric : {};
  if (!str(fm.objective)) errors.push('objective is empty');
  if (!str(metric.command)) errors.push('metric.command is empty');
  const direction = str(metric.direction) || 'lower';
  if (!DIRECTIONS.includes(direction)) errors.push('metric.direction must be lower or higher');
  const repeat = Number(metric.repeat ?? DEFAULT_SPEC.repeat);
  if (!Number.isInteger(repeat) || repeat < 1) errors.push('metric.repeat must be a positive integer');
  const minGain = parseAmount(metric['min-gain'] ?? DEFAULT_SPEC['min-gain']);
  if (minGain.invalid) errors.push(`metric.min-gain does not parse: ${minGain.invalid}`);
  const target = metric.target === null || metric.target === undefined || metric.target === '' ? null : Number(metric.target);
  if (target !== null && !Number.isFinite(target)) errors.push('metric.target must be a number or null');
  const guard = isObj(fm.guard) ? fm.guard : {};
  if (!str(guard.command)) errors.push('guard.command is empty: a loop needs a guard that must pass after every trial');
  const holdout = isObj(fm.holdout) && str(fm.holdout.command) ? fm.holdout : null;
  const tolerance = parseAmount(holdout?.tolerance ?? '1%');
  const allowed = Array.isArray(fm['allowed-paths']) ? fm['allowed-paths'].map(str).filter(Boolean) : [];
  if (!allowed.length) errors.push('allowed-paths is empty');
  const offLimits = Array.isArray(fm['off-limits']) ? fm['off-limits'].map(str).filter(Boolean) : [];
  const b = { ...DEFAULT_SPEC.budget, ...(isObj(fm.budget) ? fm.budget : {}) };
  const trials = Number(b.trials);
  if (!Number.isInteger(trials) || trials < 1) errors.push('budget.trials must be a positive integer');
  const plateau = Number(b.plateau);
  if (!Number.isInteger(plateau) || plateau < 1) errors.push('budget.plateau must be a positive integer');
  const wallClock = parseDuration(b['wall-clock']);
  if (Number.isNaN(wallClock)) errors.push('budget.wall-clock does not parse (use 90s, 10m, 6h or 2d)');
  const trialTimeout = parseDuration(b['trial-timeout']);
  if (Number.isNaN(trialTimeout) || trialTimeout === null) errors.push('budget.trial-timeout does not parse');
  const proposeTime = parseDuration(b['propose-time']);
  if (Number.isNaN(proposeTime) || proposeTime === null) errors.push('budget.propose-time does not parse');
  const tokens = b.tokens === null || b.tokens === undefined || b.tokens === '' ? null : Number(b.tokens);
  if (tokens !== null && !(tokens > 0)) errors.push('budget.tokens must be a positive number or null');
  const rRaw = { ...DEFAULT_SPEC['branch-rounds'], ...(isObj(fm['branch-rounds']) ? fm['branch-rounds'] : {}) };
  const at = (Array.isArray(rRaw.at) ? rRaw.at : []).map(fraction);
  if (at.some((x) => Number.isNaN(x) || x < 0 || x >= 1)) errors.push('branch-rounds.at must hold shares from 0% to below 100%');
  const branches = Number(rRaw.branches);
  if (!Number.isInteger(branches) || branches < 2) errors.push('branch-rounds.branches must be an integer of 2 or more');
  const branchTrials = rRaw['branch-trials'] === null || rRaw['branch-trials'] === undefined ? defaultBranchTrials(trials || 0) : Number(rRaw['branch-trials']);
  if (!Number.isInteger(branchTrials) || branchTrials < 1) errors.push('branch-rounds.branch-trials must be a positive integer');
  const maxExtra = Number(rRaw['max-extra']);
  if (!Number.isInteger(maxExtra) || maxExtra < 0) errors.push('branch-rounds.max-extra must be an integer of 0 or more');
  const merge = str(rRaw.merge) || 'consider';
  if (!MERGE_MODES.includes(merge)) errors.push('branch-rounds.merge must be consider or off');
  const prune = str(rRaw.prune) || 'on';
  if (!['on', 'off'].includes(prune)) errors.push('branch-rounds.prune must be on or off');
  const width = Number(fm.width ?? DEFAULT_SPEC.width);
  if (!Number.isInteger(width) || width < 1) errors.push('width must be a positive integer');
  const sharedBuild = str(fm['shared-build']);
  if (sharedBuild && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(sharedBuild)) errors.push('shared-build must be the name of an environment variable, for example CARGO_TARGET_DIR');
  const profile = str(fm.profile) || null;
  const ablate = str(fm.ablate) || DEFAULT_SPEC.ablate;
  if (!['on', 'off'].includes(ablate)) errors.push('ablate must be on or off');
  const checkpointEvery = Number(fm['checkpoint-every'] ?? DEFAULT_SPEC['checkpoint-every']);
  if (!Number.isInteger(checkpointEvery) || checkpointEvery < 1) errors.push('checkpoint-every must be a positive integer');
  const spec = {
    objective: str(fm.objective),
    metric: { command: str(metric.command), key: str(metric.key) || null, direction, unit: str(metric.unit), target, repeat, minGain, paired: metric.paired === true || str(metric.paired) === 'true' },
    guard: { command: str(guard.command) },
    holdout: holdout ? { command: str(holdout.command), tolerance, direction: DIRECTIONS.includes(str(holdout.direction)) ? str(holdout.direction) : direction } : null,
    setup: str(fm.setup) || null,
    format: str(fm.format) || null,
    sharedBuild: str(fm['shared-build']) || null,
    profile,
    allowedPaths: allowed,
    offLimits,
    budget: { trials, plateau, wallClockMs: wallClock, tokens, trialTimeoutMs: trialTimeout, proposeTimeMs: proposeTime },
    rounds: { at: [...at].sort((x, y) => x - y), branches, branchTrials, maxExtra, merge, prune },
    width,
    checkpointEvery,
    ablate,
    worktree: str(fm.worktree) || null,
    tags: Array.isArray(fm.tags) ? fm.tags.map(str).filter(Boolean) : [],
    confirmedBy: str(fm['confirmed-by']) || null,
  };
  return { spec, errors };
}

/**
 * The value of one metric run: the last non-empty stdout line is one number, or JSON
 * with `key` (4.1). null when it does not parse.
 */
export function parseMetricLine(stdout, key = null) {
  const lines = String(stdout ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const last = lines[lines.length - 1];
  if (last === undefined) return null;
  if (key) {
    try {
      const o = JSON.parse(last);
      const v = key.split('.').reduce((acc, k) => (acc && typeof acc === 'object' ? acc[k] : undefined), o);
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  }
  const n = Number(last);
  return Number.isFinite(n) && last !== '' ? n : null;
}

export function median(values) {
  const v = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** D6: the noise floor is half the range of the baseline runs. */
export function noiseOf(values) {
  const v = values.filter(Number.isFinite);
  if (v.length < 2) return 0;
  return (Math.max(...v) - Math.min(...v)) / 2;
}

/** The gain of `value` over `best`: positive when `value` is better. */
export const gainOf = (direction, best, value) => (direction === 'lower' ? best - value : value - best);
export const isBetter = (direction, a, b) => gainOf(direction, b, a) > 0;

/** D6: a trial must gain more than max(min-gain, 2 × noise). */
export function keepThreshold(spec, best, noise) {
  return Math.max(amountOf(spec.metric.minGain, best), 2 * noise);
}

/**
 * The keep rule (D6). `first` is the median of the first `repeat` runs; `confirm` the
 * median of the confirm run, or null when it has not run.
 *   → { wins: boolean (first), kept: boolean, needConfirm: boolean, threshold }
 */
export function keepDecision({ spec, best, noise, first, confirm = null }) {
  const threshold = keepThreshold(spec, best, noise);
  const wins = first !== null && gainOf(spec.metric.direction, best, first) > threshold;
  if (!wins) return { wins, kept: false, needConfirm: false, threshold };
  if (confirm === null) return { wins, kept: false, needConfirm: true, threshold };
  return { wins, kept: gainOf(spec.metric.direction, best, confirm) > threshold, needConfirm: false, threshold };
}

/**
 * The paired keep rule (G3). `gains` are the gains of the trial run over the reference run next
 * to it, one for each pair. A block passes when the median pair gain is above the threshold and
 * at least all but one of the pairs gain. A trial that wins gets a second block as its confirm.
 */
export function pairedDecision({ spec, best, noise, gains, confirm = null }) {
  const threshold = keepThreshold(spec, best, noise);
  const passes = (g) => {
    const v = (g ?? []).filter(Number.isFinite);
    return v.length > 0 && median(v) > threshold && v.filter((x) => x > 0).length >= Math.max(1, v.length - 1);
  };
  const wins = passes(gains);
  if (!wins) return { wins, kept: false, needConfirm: false, threshold };
  if (confirm === null) return { wins, kept: false, needConfirm: true, threshold };
  return { wins, kept: passes(confirm), needConfirm: false, threshold };
}
/** The side that runs first in pair `i`: A B, then B A, so that a drift adds equally to both sides. */
export const pairOrder = (i) => (i % 2 === 0 ? ['A', 'B'] : ['B', 'A']);
/** Paired measurement is on when the spec asks for it and the baseline measured the paired noise. */
export const pairedActive = (spec, state) => !!spec.metric.paired && Number.isFinite(state?.baseline?.pairedNoise);
/** The noise that the keep rule of a trial uses. */
export const noiseFor = (spec, state) => (pairedActive(spec, state) ? state.baseline.pairedNoise : state.baseline.noise);

/** True when the value reaches the target in the metric's direction. */
export const reachesTarget = (spec, value) => spec.metric.target !== null && value !== null && (spec.metric.direction === 'lower' ? value <= spec.metric.target : value >= spec.metric.target);

/** A glob (`**`, `*`, `?`) as an anchored regular expression over POSIX paths. */
export function globToRegExp(glob) {
  let re = '';
  const g = str(glob).replace(/\\/g, '/').replace(/^\.\//, '');
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        const slash = g[i + 2] === '/';
        re += slash ? '(?:.*/)?' : '.*';
        i += slash ? 2 : 1;
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  // A plain folder name covers what is under it.
  if (!/[*?]/.test(g) && !/\.[^/]+$/.test(g)) re += '(?:/.*)?';
  return new RegExp(`^${re}$`);
}

export const matchesAny = (path, globs) => globs.some((g) => globToRegExp(g).test(path.replace(/\\/g, '/')));

/** The paths that the commands name and that exist: these are off-limits as well (D5). */
export function commandFiles(commands, exists) {
  const out = new Set();
  for (const c of commands.filter(Boolean)) {
    for (const tok of c.split(/\s+/)) {
      const t = tok.replace(/^["']|["']$/g, '').replace(/\\/g, '/').replace(/^\.\//, '');
      if (!t || t.startsWith('-') || /[|&;<>$`]/.test(t) || !/[./]/.test(t)) continue;
      if (exists(t)) out.add(t);
    }
  }
  return [...out];
}

/** D5: the changed paths that break the rule, with the reason for each. */
export function pathViolations(paths, spec, autoOffLimits = []) {
  const off = [...spec.offLimits, ...autoOffLimits, '.ai/**', SPEC_FILE];
  const bad = [];
  for (const p of paths) {
    const n = p.replace(/\\/g, '/');
    if (matchesAny(n, off)) bad.push({ path: n, reason: 'off-limits' });
    else if (!matchesAny(n, spec.allowedPaths)) bad.push({ path: n, reason: 'outside allowed-paths' });
  }
  return bad;
}

/** The branch of branch `k` (1-based) of round `n`. `--`: git cannot hold `optimize/<slug>` and a ref below it. */
export const branchNameOf = (slug, n, k) => `optimize/${slug}--r${n}b${k}`;
export const trunkNameOf = (slug) => `optimize/${slug}`;

/** The value that `state` holds as the best of a lane. */
export function laneBest(state, lane) {
  if (!lane || lane === 'trunk' || lane === state.trunk) return state.best;
  const b = state.round?.branches.find((x) => x.name === lane);
  return b ? b.best : null;
}

/**
 * The next action (4.3, 4.4, 4.6). Read-only: `status` prints it, and `round-open`,
 * `round-close`, `trial` and `checkpoint` refuse to run when it names another action.
 *
 * @returns {{ state: 'running'|'complete'|'stopped'|'finished', reason?: string, detail?: string,
 *            next: { action: string, on?: string, point?: number|'extra', why?: string } | null }}
 */
/**
 * The pace of the loop (G6), from the ledger lines: `trialMs`, the median time between the last 6
 * trial lines, and `measureMs`, the mean time of the guard and the measurement of the last 5
 * trials that have one. Each is null when the ledger cannot tell.
 */
export function paceOf(lines) {
  const trials = (lines ?? []).filter((l) => l.event === 'trial' && l.at);
  const times = trials.slice(-6).map((l) => Date.parse(l.at)).filter(Number.isFinite);
  const gaps = times.slice(1).map((t, i) => t - times[i]).filter((g) => g >= 0).sort((a, b) => a - b);
  const ms = trials.filter((l) => Number.isFinite(l.ms)).slice(-5).map((l) => l.ms);
  return {
    trialMs: gaps.length ? gaps[Math.floor((gaps.length - 1) / 2)] : null,
    measureMs: ms.length ? Math.round(ms.reduce((s, x) => s + x, 0) / ms.length) : null,
  };
}

/** The trials that the wall clock allows (G6): the trials used, plus the time left over the trial time. null with no wall clock or no pace. */
export function projectTrials(spec, state, pace, now) {
  if (spec.budget.wallClockMs === null || !pace?.trialMs) return null;
  const left = Math.max(0, spec.budget.wallClockMs - (now - Date.parse(state.startedAt)));
  return state.counters.trials + Math.floor(left / pace.trialMs);
}

const minutes = (ms) => `${Math.round(ms / 60_000)} min`;

/**
 * A proposer that runs past twice its `budget.propose-time` is over its time. `startedAt` is the
 * time (ms) that `propose-context` stamped for its lane. Returns `{ elapsedMs, limitMs }` when the
 * proposer is over, else null; null too with no start or no propose time.
 */
export function proposeOvertime(startedAt, proposeTimeMs, now = Date.now()) {
  if (!Number.isFinite(startedAt) || !Number.isFinite(proposeTimeMs) || proposeTimeMs <= 0) return null;
  const limitMs = 2 * proposeTimeMs;
  const elapsedMs = now - startedAt;
  return elapsedMs > limitMs ? { elapsedMs, limitMs } : null;
}

/** The refusal that a probe of a proposer over its time prints: the proposer returns what it has. */
export const overtimeRefusal = (lane, over) =>
  `the proposer of ${lane} started ${minutes(over.elapsedMs)} ago, past twice its propose-time (${minutes(over.limitMs)}): ` +
  'no more probes. Stop the research now and return your best hypothesis';

export function nextAction({ state, spec, now = Date.now(), control = null, tokensUsed = null, ideas = null, pace = null, canApply = null }) {
  if (!state) return { state: 'stopped', reason: 'no-baseline', next: { action: 'baseline' } };
  if (state.finished) return { state: 'finished', reason: 'finished', detail: `squashed as ${state.finished.commit ?? 'no commit'}`, next: { action: 'verify' } };
  if (state.stopped) return { state: 'stopped', reason: state.stopped.reason, detail: state.stopped.detail ?? '', next: { action: 'person', why: personNext(state.stopped.reason) } };
  if (control && typeof control === 'object') {
    if (control.action === 'stop') return { state: 'stopped', reason: 'stop-request', detail: str(control.reason), next: { action: 'person', why: 'resume with /wf loop optimize <slug> once the request is cleared' } };
  }
  const B = spec.budget.trials;
  const used = state.counters.trials;
  const overClock = spec.budget.wallClockMs !== null && now - Date.parse(state.startedAt) >= spec.budget.wallClockMs;
  const overTokens = spec.budget.tokens !== null && tokensUsed !== null && tokensUsed >= spec.budget.tokens;
  const timeLeft = spec.budget.wallClockMs === null ? null : spec.budget.wallClockMs - (now - Date.parse(state.startedAt));
  // G9: the end of the clock is kept for the harvest: 2 measurements for the merge step or a bundle,
  // and one more for each keep when the ablation runs.
  const reserveMs = timeLeft !== null && pace?.measureMs ? pace.measureMs * (2 + (spec.ablate !== 'off' ? state.counters.keeps : 0)) : 0;
  const keptFor = `the rest of the wall clock (${minutes(Math.max(0, timeLeft ?? 0))}) is kept for the merge step, the ablation and finish`;
  // The merge step after a round (F): consider the candidates, measure each merge to try, then close.
  const mg = state.merge;
  if (mg) {
    if (used >= B || overClock || overTokens) return running({ action: 'merge-close', why: 'the budget ran out during the merge step' });
    if (!mg.considered) return running({ action: 'merge-consider', why: `round ${mg.round}: ${mg.candidates.filter((c) => !c.conflict).length} branch(es) to consider for a merge into the trunk` });
    const tryNext = (mg.order ?? []).map((name) => mg.candidates.find((c) => c.name === name)).find((c) => c && !c.verdict);
    // G4: a port applies one kept idea of a branch that was not merged again, on the trunk code.
    // G9: a bundle applies the near misses of the winner together.
    if (tryNext?.kind === 'port') return running({ action: 'trial', on: state.trunk, port: tryNext.name, why: `round ${mg.round}: the port of trial ${tryNext.trial} of ${tryNext.branch}` });
    if (tryNext?.kind === 'bundle') return running({ action: 'trial', on: state.trunk, port: tryNext.name, why: `round ${mg.round}: the near misses ${tryNext.trials.map((t) => `t${t}`).join(', ')} of ${tryNext.branch}, together` });
    if (tryNext) return running({ action: 'merge-trial', branch: tryNext.name, why: `round ${mg.round}: the merge of ${tryNext.name}` });
    return running({ action: 'merge-close', why: 'every candidate is tried or skipped' });
  }
  const r = state.round;
  if (r) {
    if (r.branches.some((b) => b.keeps > 0 && reachesTarget(spec, b.best.value))) return running({ action: 'round-close', why: 'a branch reached the target' });
    if (used >= B || overClock || overTokens) return running({ action: 'round-close', why: 'the budget ran out during the round' });
    if (reserveMs && timeLeft < reserveMs) return running({ action: 'round-close', why: keptFor });
    const open = r.branches.filter((b) => !b.pruned && b.trials < (b.limit ?? r.branchTrials));
    if (!open.length) return running({ action: 'round-close', why: `every branch ran ${r.branchTrials} trials` });
    // G5: a branch that trails the leader with no keep gives its other trials to a new fork of the leader.
    const prune = pruneCandidate(r, spec, noiseFor(spec, state));
    if (prune) return running({ action: 'prune', branch: prune.name, why: `${prune.name} has no keep after ${prune.trials} trials and trails the leader of round ${r.n}` });
    // The branches take trials in turn: the one with the fewest trials, first in order.
    const turn = [...open].sort((a, b) => a.trials - b.trials || a.k - b.k)[0];
    // A round whose branches have their own worktrees names every branch that can take a trial:
    // the driver prepares them at the same time, and measures them one at a time.
    const ready = r.branches.filter((b) => !b.pruned).every((b) => b.worktree) ? open.map((b) => b.name) : undefined;
    return running({ action: 'trial', on: turn.name, ...(ready ? { ready } : {}), why: `round ${r.n}, branch ${turn.k}, trial ${turn.trials + 1} of ${turn.limit ?? r.branchTrials}` });
  }
  if (reachesTarget(spec, state.best.value)) return { state: 'complete', reason: 'complete', next: ablationDue(spec, state) ? { action: 'ablate', why: 'a check of each kept change before finish' } : { action: 'finish' } };
  if (used >= B) return { state: 'stopped', reason: 'budget', detail: `${used} of ${B} trials used`, next: { action: 'person', why: personNext('budget') } };
  if (overClock) return { state: 'stopped', reason: 'budget', detail: 'the wall-clock budget is used', next: { action: 'person', why: personNext('budget') } };
  if (overTokens) return { state: 'stopped', reason: 'budget', detail: 'the token budget is used', next: { action: 'person', why: personNext('budget') } };
  const need = spec.rounds.branches * spec.rounds.branchTrials;
  // G6: the schedule follows the budget that ends the run first: budget.trials, or the trials that the wall clock allows.
  const projected = projectTrials(spec, state, pace, now);
  const S = projected === null ? B : Math.min(B, projected);
  const allows = S < B ? `; the wall clock allows about ${S} trials` : '';
  const remaining = S - used;
  // A round opens only when its measurements, and the reserve after them, fit in the time left.
  const fits = timeLeft === null || !pace?.measureMs || need * pace.measureMs + reserveMs <= timeLeft;
  const roundTime = pace?.measureMs ? `its ${need} measurements take about ${minutes(need * pace.measureMs)}, and ${minutes(Math.max(0, timeLeft ?? 0))} are left` : '';
  const points = spec.rounds.at.map((p, i) => ({ p, i })).filter(({ i }) => !state.schedule.used.includes(i));
  // G1: the first profile comes before any trial, and a round opens only on a profile of the trunk best.
  if (spec.profile && !state.profile) return running({ action: 'profile', why: 'the first profile of the code, before any trial' });
  const open = (next) => (spec.profile && state.profile?.commit !== state.best.commit
    ? running({ action: 'profile', why: `a profile of the trunk best before the round (${next.why})` })
    : running(next));
  const due = points.find(({ p }) => used >= Math.ceil(p * S));
  if (due && remaining >= need && fits) return open({ action: 'round-open', point: due.i, why: `scheduled at ${Math.round(due.p * 100)}% of budget.trials${allows}` });
  // A due round that does not fit is skipped: the next trunk trial records it, and the trunk continues.
  const skip = due && remaining >= need && !fits ? { point: due.i, why: `the round of ${Math.round(due.p * 100)}% is skipped: ${roundTime}` } : null;
  const trunk = (next) => running({ ...next, ...(skip ? { skipRound: skip.point } : {}), why: `${skip ? `${skip.why}; ` : ''}${next.why}${allows}` });
  const tryBundle = () => bundleOf(ideas, { tried: state.bundlesTried ?? [], canApply });
  // G9: no time for one more proposed trial before the reserve: a bundle runs now, with no wait; otherwise the loop stops.
  if (reserveMs && pace?.trialMs && timeLeft < pace.trialMs + reserveMs) {
    const bundle = tryBundle();
    if (bundle) return trunk({ action: 'trial', on: state.trunk, bundle: bundle.ids, why: `harvest: the ideas ${bundle.ids.join(', ')} together, before the clock ends` });
    return { state: 'stopped', reason: 'budget', detail: keptFor, next: { action: 'person', why: personNext('budget') } };
  }
  if (state.counters.streak >= spec.budget.plateau) {
    // D14: a plateau opens the next scheduled round early, or adds one, up to max-extra.
    const later = points.find(({ p }) => used < Math.ceil(p * S));
    if (later && remaining >= need && fits) return open({ action: 'round-open', point: later.i, why: `plateau: ${state.counters.streak} trunk trials with no keep; the round of ${Math.round(later.p * 100)}% opens early` });
    if (state.extraRounds < spec.rounds.maxExtra && remaining >= need && fits) return open({ action: 'round-open', point: 'extra', why: `plateau: ${state.counters.streak} trunk trials with no keep; an extra round` });
    const detail = state.extraRounds >= spec.rounds.maxExtra ? `max-extra (${spec.rounds.maxExtra}) is used`
      : remaining < need ? `${remaining} trials are left, and a round needs ${need}` : `no round fits in the time left: ${roundTime}`;
    return { state: 'stopped', reason: 'plateau', detail, next: { action: 'person', why: personNext('plateau') } };
  }
  if (spec.holdout && state.counters.sinceCheckpoint >= spec.checkpointEvery) return running({ action: 'checkpoint', why: `${state.counters.sinceCheckpoint} trunk trials since the last checkpoint` });
  // G4: half a plateau with no keep, and marginal ideas on other targets whose diffs apply together: try them together.
  if (state.counters.streak >= Math.ceil(spec.budget.plateau / 2)) {
    const bundle = tryBundle();
    if (bundle) return trunk({ action: 'trial', on: state.trunk, bundle: bundle.ids, why: `bundle: the ideas ${bundle.ids.join(', ')} gain ${bundle.sum} together` });
  }
  return trunk({ action: 'trial', on: state.trunk, why: `trunk trial ${state.counters.trunkTrials + 1}` });
}
const running = (next) => ({ state: 'running', reason: 'running', next });

/** The ablation (G7) runs before finish: on in the spec, not run yet, and a kept change to check. */
export function ablationDue(spec, state) {
  return spec.ablate !== 'off' && !state.ablation && state.best.commit !== state.baseCommit;
}

/** The verdict of one ablation: the gain that the change still gives at the end, against the keep threshold. */
export function ablationVerdict(gain, threshold) {
  if (gain === null || !Number.isFinite(gain)) return 'not checked';
  return gain > threshold ? 'ok' : 'weak';
}

/** The markdown table of the ablation, for the implement artifact. */
export function ablationTable(ablation, spec) {
  const unit = spec.metric.unit ? ` ${spec.metric.unit}` : '';
  const rows = ablation.changes.map((c) => `| ${c.trial ?? '—'} | ${c.commit.slice(0, 12)} | ${String(c.subject ?? '').replace(/\|/g, '\\|')} | ${c.gain === null ? '—' : `${c.gain}${unit}`} | ${c.verdict}${c.reason ? `: ${c.reason}` : ''} |`);
  return ['| Trial | Commit | Change | Gain at the end | Verdict |', '|---|---|---|---|---|', ...rows].join('\n');
}

/** What the person does after a stop (4.6). */
export function personNext(reason) {
  switch (reason) {
    case 'budget': return 'choose finish, or a new budget in the spec';
    case 'plateau': return 'choose finish, a new spec, or a new budget';
    case 'holdout-regression': return 'look at the trials since the last good checkpoint; then finish, revert, or a new spec';
    case 'state-error': return 'report; do not repair. state.json and results.jsonl disagree, or the branch moved outside the loop';
    case 'guard-red': return 'the guard fails at the baseline: fix it first. A loop cannot start from a red guard';
    default: return 'read the reason';
  }
}

/** The winner of a round (4.4 step 5): the best kept value; a branch with no keep cannot win; the earlier one wins a tie. */
export function pickWinner(round, direction) {
  const kept = round.branches.filter((b) => b.keeps > 0 && b.best.value !== null);
  if (!kept.length) return null;
  return [...kept].sort((a, b) => {
    if (a.best.value !== b.best.value) return isBetter(direction, a.best.value, b.best.value) ? -1 : 1;
    return (a.best.reachedAt ?? 0) - (b.best.reachedAt ?? 0);
  })[0];
}

/**
 * The branches of a closed round that the merge step considers (F): every branch other than the
 * winner with a keep whose gain over the round base `base` passes the keep threshold.
 */
export function mergeCandidates(round, winner, spec, base, noise) {
  if (!winner || spec.rounds.merge === 'off') return [];
  const threshold = keepThreshold(spec, base, noise);
  return round.branches.filter((b) => b.name !== winner.name && b.keeps > 0 && b.best.value !== null && gainOf(spec.metric.direction, base, b.best.value) > threshold);
}

// ---------------------------------------------------------------------------
// The ideas ledger (G2): one record for each idea of every lane. A branch sees the target,
// the status and the gains of each idea, never the hypothesis text of another lane.
// ---------------------------------------------------------------------------
export const IDEA_STATUSES = Object.freeze(['open', 'failed', 'marginal', 'kept', 'bundled']);
const IDEA_RANK = { open: 0, failed: 1, marginal: 2, kept: 3, bundled: 3 };
export const normTarget = (t) => str(t).toLowerCase().replace(/\s+/g, ' ');
export const emptyIdeas = () => ({ next: 1, ideas: [] });

/** The status that one verdict gives an idea: a revert with a real but small gain is marginal. */
export function ideaStatusOf(verdict, gain) {
  if (verdict === 'kept') return 'kept';
  if (verdict === 'reverted' && Number.isFinite(gain) && gain > 0) return 'marginal';
  return 'failed';
}

/** The mean of the measured gains of an idea, and their count. */
export function pooledOf(gains) {
  const g = (gains ?? []).filter(Number.isFinite);
  if (!g.length) return { mean: null, n: 0 };
  return { mean: Number((g.reduce((s, x) => s + x, 0) / g.length).toPrecision(6)), n: g.length };
}

/**
 * Claim an idea for a lane. A lane has one claim in flight: its older claim with no trial is
 * released. A claim of another lane on the same target is refused. A target that a record holds
 * already is refused unless `again` gives a reason, which goes into the record.
 *   → { ok: true, idea } | { ok: false, reason, idea }
 */
export function claimIdea(book, { lane, target, family, again = null }) {
  const t = normTarget(target);
  if (!t) return { ok: false, reason: 'idea-claim needs --target: the function or the profile entry that the change targets' };
  book.ideas = book.ideas.filter((i) => !(i.claim === lane && i.status === 'open' && !i.trials.length && normTarget(i.target) !== t));
  for (const i of book.ideas) if (i.claim === lane && normTarget(i.target) !== t) i.claim = null;
  const same = book.ideas.filter((i) => normTarget(i.target) === t);
  const busy = same.find((i) => i.claim && i.claim !== lane);
  if (busy) return { ok: false, reason: `${busy.claim} has a claim on this target in flight (${busy.id}): choose another target`, idea: brief(busy) };
  const mine = same.find((i) => i.claim === lane);
  if (mine) return { ok: true, idea: mine };
  const tried = same.find((i) => i.status !== 'open' || i.trials.length);
  const why = str(again);
  if (tried && !why) return { ok: false, reason: `this target was tried (${tried.id}: ${tried.status}, pooled gain ${tried.pooled.mean ?? 'none'} over ${tried.pooled.n}): choose another target, or give a new reason with --again`, idea: brief(tried) };
  if (tried) {
    tried.claim = lane;
    tried.again = [...(tried.again ?? []), { lane, reason: why }];
    return { ok: true, idea: tried };
  }
  const idea = { id: `i${book.next++}`, target: str(target), family: str(family), status: 'open', claim: lane, trials: [], gains: [], pooled: { mean: null, n: 0 }, patches: [] };
  book.ideas.push(idea);
  return { ok: true, idea };
}

/** Record the verdict of a trial on its idea. The status keeps the best result: a kept idea stays kept. */
export function settleIdea(book, id, { trial, verdict, gain, patch = false }) {
  const idea = book.ideas.find((i) => i.id === id);
  if (!idea) return null;
  idea.claim = null;
  idea.trials.push(trial);
  if (Number.isFinite(gain)) idea.gains.push(gain);
  idea.pooled = pooledOf(idea.gains);
  if (patch) idea.patches = [...(idea.patches ?? []), trial];
  const next = ideaStatusOf(verdict, gain);
  if (IDEA_RANK[next] >= IDEA_RANK[idea.status]) idea.status = next;
  return idea;
}

const brief = (i) => ({ id: i.id, target: i.target, family: i.family, status: i.status, claim: i.claim ?? null, pooled: i.pooled, trials: i.trials });

/**
 * A bundle (G4, G9): 2 to 4 marginal ideas with a saved diff, a gain above 0 and different targets,
 * the largest pooled gain first. The gains need not add past the threshold: near the noise floor one
 * result says little, and the combined trial is the test. `canApply(trials)` is the check of the
 * script: an idea joins only when the last diff of each idea applies together on the trunk. null
 * when fewer than 2 ideas join, or when the same set was tried before.
 */
export function bundleOf(book, { tried = [], canApply = null } = {}) {
  const pool = (book?.ideas ?? []).filter((i) => i.status === 'marginal' && (i.patches ?? []).length && i.pooled?.mean > 0)
    .sort((a, b) => b.pooled.mean - a.pooled.mean);
  const set = [];
  const targets = new Set();
  for (const i of pool) {
    if (set.length >= 4) break;
    if (targets.has(normTarget(i.target))) continue;
    if (canApply && !canApply([...set, i].map((x) => x.patches.at(-1)))) continue;
    set.push(i);
    targets.add(normTarget(i.target));
  }
  if (set.length < 2) return null;
  const ids = set.map((i) => i.id);
  const key = [...ids].sort().join(',');
  const sum = set.reduce((s, i) => s + i.pooled.mean, 0);
  return tried.includes(key) ? null : { ids, key, sum: Number(sum.toPrecision(6)) };
}

/**
 * The near misses of a lane in a round (G9): its reverted trials with a gain above 0 and a saved
 * diff, the largest gain first, each on paths that no other member touches, while `canApply(patches)`
 * says that the diffs apply together. At most 4; an empty list when fewer than 2 join.
 */
export function nearMisses(results, round, branch, canApply = null) {
  const pool = (results ?? []).filter((x) => x.event === 'trial' && x.round === round && x.branch === branch && x.verdict === 'reverted' && Number.isFinite(x.delta) && x.delta > 0 && x.patch)
    .sort((a, b) => b.delta - a.delta);
  const set = [];
  const paths = new Set();
  for (const x of pool) {
    if (set.length >= 4) break;
    if ((x.paths ?? []).some((p) => paths.has(p))) continue;
    if (canApply && !canApply([...set, x].map((y) => y.patch))) continue;
    set.push(x);
    for (const p of x.paths ?? []) paths.add(p);
  }
  return set.length >= 2 ? set : [];
}

/**
 * The seeds of a round (G5): the largest profile entries that can pass alone, and whose target
 * has no failed idea. Branch k gets entry k − 1; with fewer entries, the seeds repeat.
 */
export function seedsOf(entries, book, best, threshold, count) {
  const failed = new Set((book?.ideas ?? []).filter((i) => i.status === 'failed').map((i) => normTarget(i.target)));
  const pool = profileView(entries ?? [], best, threshold).filter((e) => e.alone && !failed.has(normTarget(e.name)));
  if (!pool.length) return Array.from({ length: count }, () => null);
  return Array.from({ length: count }, (_, k) => pool[k % pool.length].name);
}

/**
 * The branch to prune (G5): 2 or more trials, no keep, trials left, and a best that trails the
 * leader of the round by more than the threshold. null when none.
 */
export function pruneCandidate(round, spec, noise) {
  if (spec.rounds.prune === 'off') return null;
  const live = round.branches.filter((b) => !b.pruned);
  const leader = pickWinner({ branches: live }, spec.metric.direction);
  if (!leader || !live.every((b) => b.worktree)) return null;
  const threshold = keepThreshold(spec, leader.best.value, noise);
  return live.find((b) => b !== leader && b.keeps === 0 && b.trials >= 2 && b.trials < (b.limit ?? round.branchTrials)
    && gainOf(spec.metric.direction, b.best.value, leader.best.value) > threshold) ?? null;
}

// ---------------------------------------------------------------------------
// The profile (G1): where the work of the metric goes, from a profile command or a profiler agent.
// ---------------------------------------------------------------------------
/** Parse the entries of a profile: objects with `name` and `share` (0 to 1), and optional `calls` and `where`. */
export function parseProfile(input) {
  const raw = Array.isArray(input) ? input : Array.isArray(input?.entries) ? input.entries : null;
  if (!raw) return { entries: [], errors: ['the profile holds no entries'] };
  const errors = [];
  const entries = [];
  for (const e of raw) {
    const name = str(e?.name);
    const share = Number(e?.share);
    if (!name || !Number.isFinite(share) || share < 0 || share > 1) { errors.push(`an entry needs a name and a share from 0 to 1: ${JSON.stringify(e).slice(0, 80)}`); continue; }
    entries.push({ name, share, ...(Number.isFinite(Number(e.calls)) && e.calls !== null && e.calls !== undefined ? { calls: Number(e.calls) } : {}), ...(str(e.where) ? { where: str(e.where) } : {}) });
  }
  entries.sort((a, b) => b.share - a.share);
  return { entries, errors };
}

/** JSON lines on stdout, one entry each; other lines are ignored. */
export function profileLines(stdout) {
  const out = [];
  for (const line of String(stdout ?? '').split(/\r?\n/)) {
    const l = line.trim();
    if (!l.startsWith('{')) continue;
    try { out.push(JSON.parse(l)); } catch { /* not an entry */ }
  }
  return out;
}

/**
 * The 15 largest entries for a digest. `maxGain` is the gain when the cost of the entry went to
 * zero. An entry whose maxGain is not above the threshold cannot pass alone: `alone: false`.
 */
export function profileView(entries, best, threshold) {
  return (entries ?? []).slice(0, 15).map((e) => {
    const maxGain = Number((e.share * Math.abs(best)).toPrecision(4));
    return { ...e, maxGain, alone: threshold === null ? true : maxGain > threshold };
  });
}

/**
 * The trials that a proposer of `lane` sees (4.5). A branch sees only its own trials.
 * The trunk sees its trials since `digestFrom`, and the trials of the branch that
 * last won a round: the history from before that fork is flushed (4.4 step 7).
 */
export function digestTrials(results, state, lane) {
  const trials = results.filter((r) => r.event === 'trial');
  const isBranch = lane && lane !== 'trunk' && lane !== state.trunk;
  let mine;
  if (isBranch) {
    mine = trials.filter((r) => r.round === state.round?.n && r.branch === lane);
  } else {
    const from = state.digestFrom ?? { trial: 0, round: null, branch: null };
    // The trunk also sees the kept trials of each branch that the merge step merged into it.
    const merged = from.merged ?? [];
    mine = trials.filter((r) => (r.branch === null && r.trial > from.trial)
      || (from.round !== null && r.round === from.round && (r.branch === from.branch || (merged.includes(r.branch) && r.verdict === 'kept'))));
  }
  return mine.slice(-DIGEST_TRIALS);
}

/**
 * The digest of section 4.5. `solutions` is used on the trunk only. `ideas` (G2) and `profile`
 * (G1) are shared by every lane.
 */
export function buildDigest({ spec, specProse, state, results, lane, solutions = [], ideas = null, profile = null }) {
  const isBranch = lane && lane !== 'trunk' && lane !== state.trunk;
  const trials = digestTrials(results, state, lane);
  const best = laneBest(state, isBranch ? lane : state.trunk);
  const threshold = best ? keepThreshold(spec, best.value, noiseFor(spec, state)) : null;
  const brief = (r) => ({ trial: r.trial, hypothesis: r.hypothesis?.text ?? '', verdict: r.verdict, median: r.median, delta: r.delta });
  return {
    lane: isBranch ? lane : 'trunk',
    flushed: !!isBranch,
    objective: spec.objective,
    specProse,
    metric: { command: spec.metric.command, direction: spec.metric.direction, unit: spec.metric.unit, target: spec.metric.target },
    allowedPaths: spec.allowedPaths,
    offLimits: spec.offLimits,
    best: best ? { value: best.value, commit: best.commit } : null,
    baseline: { value: state.baseline.median, noise: state.baseline.noise, ...(pairedActive(spec, state) ? { pairedNoise: state.baseline.pairedNoise } : {}) },
    paired: pairedActive(spec, state),
    threshold,
    trials: trials.map(brief),
    ideas: ideas ? ideas.ideas.slice(-40).map((i) => ({ id: i.id, target: i.target, family: i.family, status: i.status, claim: i.claim ?? null, pooled: i.pooled })) : [],
    profile: profile?.entries ? profileView(profile.entries, best?.value ?? state.baseline.median, threshold) : null,
    failed: trials.filter((r) => r.verdict !== 'kept').map((r) => r.hypothesis?.text ?? '').filter(Boolean),
    solutions: isBranch ? [] : solutions,
    worktree: laneWorktree(state, isBranch ? lane : state.trunk),
    branch: isBranch ? lane : state.trunk,
    seed: isBranch ? state.round?.branches.find((b) => b.name === lane)?.seed ?? null : null,
    proposeMinutes: Math.round((spec.budget.proposeTimeMs ?? 0) / 60_000),
  };
}

/** The worktree of a lane: a branch of a version 2 round has its own; every other lane uses the trunk worktree. */
export function laneWorktree(state, lane) {
  if (!lane || lane === 'trunk' || lane === state.trunk) return state.worktree;
  return state.round?.branches.find((b) => b.name === lane)?.worktree || state.worktree;
}

/** A new state after the baseline. */
export function newState({ slug, worktree, baseCommit, values, holdoutValue, startedAt, slugBranch, pairedNoise = null }) {
  const med = median(values);
  return {
    version: STATE_VERSION,
    slug,
    worktree,
    trunk: trunkNameOf(slug),
    slugBranch: slugBranch ?? null,
    baseCommit,
    startedAt,
    baseline: { values, median: med, noise: noiseOf(values), holdout: holdoutValue ?? null, ...(pairedNoise !== null ? { pairedNoise } : {}) },
    best: { commit: baseCommit, value: med, trial: 0, reachedAt: 0 },
    counters: { trials: 0, trunkTrials: 0, streak: 0, sinceCheckpoint: 0, keeps: 0 },
    schedule: { used: [] },
    extraRounds: 0,
    round: null,
    merge: null,
    rounds: [],
    digestFrom: { trial: 0, round: null, branch: null },
    lastCheckpoint: { trial: 0, ok: true, value: holdoutValue ?? null },
    buildDir: null,
    profile: null,
    ablation: null,
    leftovers: [],
    stopped: null,
    finished: null,
  };
}

/** A holdout value that regresses past the tolerance (D7). */
export function holdoutRegressed(spec, baseline, value) {
  if (!spec.holdout || baseline === null || value === null) return false;
  const loss = -gainOf(spec.holdout.direction, baseline, value);
  return loss > amountOf(spec.holdout.tolerance, baseline);
}

/** The markdown table of the kept trials, for the implement artifact. */
export function keptTable(results, spec) {
  const kept = results.filter((r) => r.event === 'trial' && r.verdict === 'kept');
  const unit = spec.metric.unit ? ` ${spec.metric.unit}` : '';
  const rows = kept.map((r) => `| ${r.trial} | ${r.merge ? `merge of ${r.merge.branch}` : r.branch ?? 'trunk'} | ${String(r.hypothesis?.text ?? '').replace(/\|/g, '\\|')} | ${r.median}${unit} | ${r.delta}${unit} |`);
  return ['| Trial | Lane | Hypothesis | Median | Gain |', '|---|---|---|---|---|', ...rows].join('\n');
}
