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
/** 2: each branch of a round has its own worktree (`round.branches[k].worktree`). */
export const STATE_VERSION = 2;
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
  'branch-rounds': { at: ['0%', '33%', '66%'], branches: 4, 'branch-trials': null, 'max-extra': 2, merge: 'consider' },
  width: 1,
  'checkpoint-every': 5,
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
  const width = Number(fm.width ?? DEFAULT_SPEC.width);
  if (!Number.isInteger(width) || width < 1) errors.push('width must be a positive integer');
  const sharedBuild = str(fm['shared-build']);
  if (sharedBuild && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(sharedBuild)) errors.push('shared-build must be the name of an environment variable, for example CARGO_TARGET_DIR');
  const checkpointEvery = Number(fm['checkpoint-every'] ?? DEFAULT_SPEC['checkpoint-every']);
  if (!Number.isInteger(checkpointEvery) || checkpointEvery < 1) errors.push('checkpoint-every must be a positive integer');
  const spec = {
    objective: str(fm.objective),
    metric: { command: str(metric.command), key: str(metric.key) || null, direction, unit: str(metric.unit), target, repeat, minGain },
    guard: { command: str(guard.command) },
    holdout: holdout ? { command: str(holdout.command), tolerance, direction: DIRECTIONS.includes(str(holdout.direction)) ? str(holdout.direction) : direction } : null,
    setup: str(fm.setup) || null,
    format: str(fm.format) || null,
    sharedBuild: str(fm['shared-build']) || null,
    allowedPaths: allowed,
    offLimits,
    budget: { trials, plateau, wallClockMs: wallClock, tokens, trialTimeoutMs: trialTimeout, proposeTimeMs: proposeTime },
    rounds: { at: [...at].sort((x, y) => x - y), branches, branchTrials, maxExtra, merge },
    width,
    checkpointEvery,
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
export function nextAction({ state, spec, now = Date.now(), control = null, tokensUsed = null }) {
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
  // The merge step after a round (F): consider the candidates, measure each merge to try, then close.
  const mg = state.merge;
  if (mg) {
    if (used >= B || overClock || overTokens) return running({ action: 'merge-close', why: 'the budget ran out during the merge step' });
    if (!mg.considered) return running({ action: 'merge-consider', why: `round ${mg.round}: ${mg.candidates.filter((c) => !c.conflict).length} branch(es) to consider for a merge into the trunk` });
    const tryNext = (mg.order ?? []).map((name) => mg.candidates.find((c) => c.name === name)).find((c) => c && !c.verdict);
    if (tryNext) return running({ action: 'merge-trial', branch: tryNext.name, why: `round ${mg.round}: the merge of ${tryNext.name}` });
    return running({ action: 'merge-close', why: 'every candidate is tried or skipped' });
  }
  const r = state.round;
  if (r) {
    if (r.branches.some((b) => b.keeps > 0 && reachesTarget(spec, b.best.value))) return running({ action: 'round-close', why: 'a branch reached the target' });
    if (used >= B || overClock || overTokens) return running({ action: 'round-close', why: 'the budget ran out during the round' });
    const open = r.branches.filter((b) => b.trials < r.branchTrials);
    if (!open.length) return running({ action: 'round-close', why: `every branch ran ${r.branchTrials} trials` });
    // The branches take trials in turn: the one with the fewest trials, first in order.
    const turn = [...open].sort((a, b) => a.trials - b.trials || a.k - b.k)[0];
    // A round whose branches have their own worktrees names every branch that can take a trial:
    // the driver prepares them at the same time, and measures them one at a time.
    const ready = r.branches.every((b) => b.worktree) ? open.map((b) => b.name) : undefined;
    return running({ action: 'trial', on: turn.name, ...(ready ? { ready } : {}), why: `round ${r.n}, branch ${turn.k}, trial ${turn.trials + 1} of ${r.branchTrials}` });
  }
  if (reachesTarget(spec, state.best.value)) return { state: 'complete', reason: 'complete', next: { action: 'finish' } };
  if (used >= B) return { state: 'stopped', reason: 'budget', detail: `${used} of ${B} trials used`, next: { action: 'person', why: personNext('budget') } };
  if (overClock) return { state: 'stopped', reason: 'budget', detail: 'the wall-clock budget is used', next: { action: 'person', why: personNext('budget') } };
  if (overTokens) return { state: 'stopped', reason: 'budget', detail: 'the token budget is used', next: { action: 'person', why: personNext('budget') } };
  const need = spec.rounds.branches * spec.rounds.branchTrials;
  const remaining = B - used;
  const points = spec.rounds.at.map((p, i) => ({ p, i })).filter(({ i }) => !state.schedule.used.includes(i));
  const due = points.find(({ p }) => used >= Math.ceil(p * B));
  if (due && remaining >= need) return running({ action: 'round-open', point: due.i, why: `scheduled at ${Math.round(due.p * 100)}% of budget.trials` });
  if (state.counters.streak >= spec.budget.plateau) {
    // D14: a plateau opens the next scheduled round early, or adds one, up to max-extra.
    const later = points.find(({ p }) => used < Math.ceil(p * B));
    if (later && remaining >= need) return running({ action: 'round-open', point: later.i, why: `plateau: ${state.counters.streak} trunk trials with no keep; the round of ${Math.round(later.p * 100)}% opens early` });
    if (state.extraRounds < spec.rounds.maxExtra && remaining >= need) return running({ action: 'round-open', point: 'extra', why: `plateau: ${state.counters.streak} trunk trials with no keep; an extra round` });
    const detail = state.extraRounds >= spec.rounds.maxExtra ? `max-extra (${spec.rounds.maxExtra}) is used` : `${remaining} trials are left, and a round needs ${need}`;
    return { state: 'stopped', reason: 'plateau', detail, next: { action: 'person', why: personNext('plateau') } };
  }
  if (spec.holdout && state.counters.sinceCheckpoint >= spec.checkpointEvery) return running({ action: 'checkpoint', why: `${state.counters.sinceCheckpoint} trunk trials since the last checkpoint` });
  return running({ action: 'trial', on: state.trunk, why: `trunk trial ${state.counters.trunkTrials + 1}` });
}
const running = (next) => ({ state: 'running', reason: 'running', next });

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

/** The digest of section 4.5. `solutions` is used on the trunk only. */
export function buildDigest({ spec, specProse, state, results, lane, solutions = [] }) {
  const isBranch = lane && lane !== 'trunk' && lane !== state.trunk;
  const trials = digestTrials(results, state, lane);
  const best = laneBest(state, isBranch ? lane : state.trunk);
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
    baseline: { value: state.baseline.median, noise: state.baseline.noise },
    threshold: best ? keepThreshold(spec, best.value, state.baseline.noise) : null,
    trials: trials.map(brief),
    failed: trials.filter((r) => r.verdict !== 'kept').map((r) => r.hypothesis?.text ?? '').filter(Boolean),
    solutions: isBranch ? [] : solutions,
    worktree: laneWorktree(state, isBranch ? lane : state.trunk),
    branch: isBranch ? lane : state.trunk,
    proposeMinutes: Math.round((spec.budget.proposeTimeMs ?? 0) / 60_000),
  };
}

/** The worktree of a lane: a branch of a version 2 round has its own; every other lane uses the trunk worktree. */
export function laneWorktree(state, lane) {
  if (!lane || lane === 'trunk' || lane === state.trunk) return state.worktree;
  return state.round?.branches.find((b) => b.name === lane)?.worktree || state.worktree;
}

/** A new state after the baseline. */
export function newState({ slug, worktree, baseCommit, values, holdoutValue, startedAt, slugBranch }) {
  const med = median(values);
  return {
    version: STATE_VERSION,
    slug,
    worktree,
    trunk: trunkNameOf(slug),
    slugBranch: slugBranch ?? null,
    baseCommit,
    startedAt,
    baseline: { values, median: med, noise: noiseOf(values), holdout: holdoutValue ?? null },
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
