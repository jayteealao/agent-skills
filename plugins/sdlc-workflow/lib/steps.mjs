// The step record of a workflow: .ai/workflows/<slug>/steps.jsonl, one JSON line per event.
//
//   start     { slice, event: 'start', step, title, head, branch }    a plan step begins
//   done      { slice, event: 'done', step, sha, subject, patchId, branch }
//             { slice, event: 'done', step, noChange: true, head, branch }   a step with no commit
//   hard-stop { slice, event: 'hard-stop', reason, kind }              the implement agent stopped
//   retry     { slice, event: 'retry' }                                 the person asked for one more run
//   complete  { slice, event: 'complete', sha, planHash, skipped }      the last commit of the slice
//   squash    { event: 'squash', sha, patchId, subject, branch, commits }  one commit took the place of
//             the commits in `commits`; a step whose commit is one of them is in the squash commit
//
// Every line also has `at`. The rows of a slice after its last `complete` row are the current
// run of that slice. A step is done while its commit is in the history of its branch
// (`refs/heads/<branch>`, which every worktree of the repo shares), so the answer is the same in
// every checkout. A commit that a rebase or a history rewrite replaced is found again by its
// patch id: the step is `moved`, with the new sha. A commit that a squash took in is found again
// as the squash commit, by its sha or its patch id: the step is `moved` too. A step whose commit
// left the branch is `dropped`, and open again. A branch that this machine lacks makes the step `unverified`. A step
// with no commit is anchored at the HEAD of its start, so a reset past it opens it again. The old
// record .implement-progress.jsonl (event `step` for done) is read too, in time order.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { sectionOf } from './brief.mjs';
import { INDEX_NAME, frontmatterOfDoc, readDoc } from './records.mjs';

export const STEPS_FILE = 'steps.jsonl';
export const LEGACY_PROGRESS = '.implement-progress.jsonl';
export const EVENTS = ['start', 'done', 'hard-stop', 'retry', 'complete'];
/** The kinds of a stop. Only a `fail` counts toward the split question. */
export const STOP_KINDS = ['fail', 'gate', 'question'];
// A slice whose implement failed this many times since the last retry is a split question.
export const SPLIT_AFTER_STOPS = 2;
export const PLAN_SECTION = 'Step-by-Step Plan';

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

function readJsonl(file) {
  if (!existsSync(file)) return [];
  const rows = [];
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { /* a torn line is skipped */ }
  }
  return rows;
}

/** Every step row of a workflow, in time order: the old record and the new one together. */
export function readSteps(slugDir) {
  const legacy = readJsonl(join(slugDir, LEGACY_PROGRESS)).map((r) => (r.event === 'step' ? { ...r, event: 'done' } : r));
  const rows = readJsonl(join(slugDir, STEPS_FILE));
  if (!legacy.length) return rows;
  // A stable sort: rows with the same time, or with no time, keep the order of their file.
  return [...legacy, ...rows].map((r, i) => ({ r, i, t: Date.parse(r.at ?? '') }))
    .sort((a, b) => (Number.isFinite(a.t) && Number.isFinite(b.t) && a.t !== b.t ? a.t - b.t : a.i - b.i))
    .map((x) => x.r);
}

/**
 * Record that one commit, `sha`, took the place of the commits `commits` (a squash). The row
 * names no slice: every step whose commit is one of `commits` is in the squash commit.
 */
export function appendSquash(slugDir, { sha, commits, branch = null, patchId = null, subject = null }, { now = nowIso() } = {}) {
  if (!sha || !Array.isArray(commits) || !commits.length) throw new Error('a squash row needs the squash commit and the commits it holds');
  const line = { at: now, event: 'squash', sha, patchId, subject, branch, commits };
  appendFileSync(join(slugDir, STEPS_FILE), `${JSON.stringify(line)}\n`);
  return line;
}

/** Append one row. */
export function appendStep(slugDir, row, { now = nowIso() } = {}) {
  if (!row.slice) throw new Error('a step row needs a slice');
  if (!EVENTS.includes(row.event)) throw new Error(`event must be one of ${EVENTS.join(', ')}`);
  if ((row.event === 'start' || row.event === 'done') && !(Number.isInteger(row.step) && row.step > 0)) {
    throw new Error(`a ${row.event} row needs a step number above 0`);
  }
  if (row.event === 'hard-stop' && row.kind != null && !STOP_KINDS.includes(row.kind)) {
    throw new Error(`the kind of a stop must be one of ${STOP_KINDS.join(', ')}`);
  }
  const line = { at: now, ...row };
  appendFileSync(join(slugDir, STEPS_FILE), `${JSON.stringify(line)}\n`);
  return line;
}

// ---------------------------------------------------------------- the plan

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^#{1,6}\s/;
const STEP_HEADING = /^#{3,6}\s+Step\s+(\d+)\b\s*[:.)—–-]?\s*(.*?)\s*#*\s*$/i;
const NUMBERED = /^(\d+)\.\s+(.*)$/;

const titleOf = (text) => {
  const t = /^\*\*(.+?)\*\*/.exec(text);
  return (t ? t[1] : text.split(/\s+[—–-]\s+/)[0]).replace(/\*\*/g, '').trim();
};

/**
 * The steps of a plan body: the numbered lines of `## Step-by-Step Plan` up to the next heading,
 * or the `### Step <n>` headings of that section when it has them. Lines in code fences are not
 * steps. A repeated number keeps its first row, and each repeat is a warning. Returns
 * `{ steps: [{ n, title }], warnings, found, hash }`; `found` is false when the body has no plan
 * section, and `hash` is the hash of the section text.
 */
export function readPlan(body) {
  const text = String(body ?? '');
  const section = sectionOf(text, PLAN_SECTION);
  if (section === null) return { steps: [], warnings: [], found: false, hash: null };
  // The section as lines of the body, so that a warning names the line of the body.
  const all = text.split(/\r?\n/);
  let first = 0;
  for (let i = 0, f = false; i < all.length; i += 1) {
    if (FENCE.test(all[i])) f = !f;
    if (!f && new RegExp(`^##\\s+${PLAN_SECTION}\\s*#*\\s*$`, 'i').test(all[i].replace(/`/g, ''))) { first = i + 1; break; }
  }
  const lines = [];
  for (let i = first, f = false; i < all.length; i += 1) {
    if (FENCE.test(all[i])) f = !f;
    if (!f && /^#{1,2}\s/.test(all[i])) break;
    lines.push(all[i]);
  }
  let fence = false;
  const byHeading = lines.some((l) => {
    if (FENCE.test(l)) { fence = !fence; return false; }
    return !fence && STEP_HEADING.test(l);
  });
  fence = false;
  const steps = [];
  const warnings = [];
  const seen = new Map();
  const add = (n, title, line) => {
    if (n === 0) warnings.push(`line ${line}: step 0; number the steps from 1`);
    if (seen.has(n)) { warnings.push(`line ${line}: step ${n} repeats the step of line ${seen.get(n)}`); return; }
    seen.set(n, line);
    steps.push({ n, title });
  };
  for (let i = 0; i < lines.length; i += 1) {
    const l = lines[i];
    if (FENCE.test(l)) { fence = !fence; continue; }
    if (fence) continue;
    if (HEADING.test(l)) {
      const m = STEP_HEADING.exec(l);
      if (byHeading && m) { add(Number(m[1]), titleOf(m[2] || `Step ${m[1]}`), first + i + 1); continue; }
      if (!byHeading) break;
      continue;
    }
    if (byHeading) continue;
    const m = NUMBERED.exec(l);
    if (m) add(Number(m[1]), titleOf(m[2]), first + i + 1);
  }
  const hash = createHash('sha256').update(section.replace(/\r\n/g, '\n').trim()).digest('hex').slice(0, 16);
  return { steps: steps.filter((s) => s.n > 0), warnings, found: true, hash };
}

/** The problems that make a plan body unusable for the step record, each naming its line; [] when none. */
export function planProblems(body) {
  const p = readPlan(body);
  if (!p.found) return [];
  const out = [...p.warnings];
  if (!p.steps.length) out.push(`the ${PLAN_SECTION} section has no step that the step record can read: write each step as a numbered line ("1. **Title** ...") or as a "### Step 1: Title" heading`);
  return out;
}

const planOfSlice = (slugDir, slice) => readPlan(readDoc(slugDir, `04-plan-${slice}.md`)?.body ?? '');

/** The numbered steps of the plan of a slice: [{ n, title }]. */
export function planSteps(slugDir, slice) {
  return planOfSlice(slugDir, slice).steps;
}

/** The repeats and the step 0 of the plan of a slice, as warnings. */
export function planWarnings(slugDir, slice) {
  return planOfSlice(slugDir, slice).warnings;
}

/** The slices of the roster of a workflow: the `slices` of 03-slice.md, by slug. */
export function rosterOf(slugDir) {
  const list = frontmatterOfDoc(slugDir, '03-slice.md')?.slices;
  return Array.isArray(list) ? list.map((s) => (typeof s === 'string' ? s : s?.slug)).filter(Boolean) : [];
}

/**
 * Null when the step record may name `slice`, else the refusal. A workflow with a roster accepts
 * only its slices; a single-scope workflow accepts its slug, its selected slice, and a slice
 * that has a plan.
 */
export function sliceRefusal(slugDir, slug, slice) {
  const roster = rosterOf(slugDir);
  if (roster.length) return roster.includes(slice) ? null : `the slice ${slice} is not in the roster of ${slug}; the slices are: ${roster.join(', ')}`;
  const selected = frontmatterOfDoc(slugDir, INDEX_NAME)?.['selected-slice'];
  if (slice === slug || slice === selected || readDoc(slugDir, `04-plan-${slice}.md`)) return null;
  return `the workflow ${slug} has no slice ${slice}; its one slice is ${selected ?? slug}`;
}

// ---------------------------------------------------------------- git

const git = (cwd, args, input) => spawnSync('git', args, { cwd, input, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });

/** True when a commit is in the history of HEAD of a checkout. */
export function gitIsAncestor(projectRoot) {
  return (sha) => git(projectRoot, ['merge-base', '--is-ancestor', sha, 'HEAD']).status === 0;
}

/** The sha of a revision of a checkout, or null. */
export function gitRevParse(projectRoot, rev) {
  const r = git(projectRoot, ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`]);
  return r.status === 0 ? r.stdout.trim() : null;
}

/**
 * The checkout that a step command acts in: the worktree of the current directory when it is a
 * worktree of the project repo (the same git-common-dir), else the project root.
 */
export function stepCheckout(projectRoot, cwd = process.cwd()) {
  const common = (dir) => {
    const r = git(dir, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
    return r.status === 0 ? r.stdout.trim().replace(/\\/g, '/').toLowerCase() : null;
  };
  const top = git(cwd, ['rev-parse', '--show-toplevel']);
  if (top.status !== 0) return projectRoot;
  const mine = common(cwd);
  return mine && mine === common(projectRoot) ? top.stdout.trim() : projectRoot;
}

/** The branch that a checkout has, or null when its HEAD is detached. */
export function branchOf(checkout) {
  const r = git(checkout, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  return r.status === 0 ? r.stdout.trim() || null : null;
}

/** The subject and the stable patch id of a commit. */
export function commitIdentity(checkout, sha) {
  const subject = git(checkout, ['log', '-1', '--format=%s', sha]).stdout.trim() || null;
  const show = spawnSync('git', ['show', '--format=', sha], { cwd: checkout, windowsHide: true, maxBuffer: 256 * 1024 * 1024 });
  const pid = spawnSync('git', ['patch-id', '--stable'], { cwd: checkout, input: show.stdout, encoding: 'utf8', windowsHide: true });
  return { subject, patchId: pid.stdout.trim().split(/\s+/)[0] || null };
}

/**
 * The git answers of `whereOf` for a project: ancestry on the branch of a row (else HEAD of the
 * project root), whether a branch exists here, and the commit of the branch with a patch id.
 * `base` limits the patch search to the commits of the branch since that base.
 */
export function gitSteps(projectRoot, { base = null } = {}) {
  const patches = new Map();
  const has = (branch) => git(projectRoot, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]).status === 0;
  return {
    isAncestor: (sha, branch) => git(projectRoot, ['merge-base', '--is-ancestor', sha, branch ? `refs/heads/${branch}` : 'HEAD']).status === 0,
    hasBranch: (branch) => !branch || has(branch),
    findMoved: (row) => {
      if (!row.patchId) return null;
      const branch = row.branch ? `refs/heads/${row.branch}` : 'HEAD';
      if (!patches.has(branch)) {
        const range = base && has(base) ? [`refs/heads/${base}..${branch}`] : ['-n', '1000', branch];
        const log = spawnSync('git', ['log', '-p', '--no-color', '--format=commit %H', ...range], { cwd: projectRoot, windowsHide: true, maxBuffer: 512 * 1024 * 1024 });
        const ids = spawnSync('git', ['patch-id', '--stable'], { cwd: projectRoot, input: log.stdout, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
        patches.set(branch, new Map((ids.stdout ?? '').split('\n').filter(Boolean).map((l) => l.trim().split(/\s+/)).reverse().map(([p, c]) => [p, c])));
      }
      return patches.get(branch).get(row.patchId) ?? null;
    },
  };
}

// ---------------------------------------------------------------- where

/** The squash rows of a workflow, as a map from each commit they hold to the newest squash row. */
function squashesOf(rows) {
  const map = new Map();
  for (const r of rows) if (r.event === 'squash' && r.sha && Array.isArray(r.commits)) for (const c of r.commits) map.set(c, r);
  return map;
}

/**
 * Where the squash commit that holds `sha` is on `branch` (or on the branch of the squash): its
 * sha, or the commit with its patch id after a rebase. A squash commit that a later squash took
 * in is followed. Null when none is on the branch.
 */
function squashedInto(sha, branch, squashes, { isAncestor, findMoved }) {
  const seen = new Set();
  for (let sq = squashes.get(sha); sq && !seen.has(sq.sha); sq = squashes.get(sq.sha)) {
    seen.add(sq.sha);
    for (const b of new Set([branch, sq.branch ?? null])) {
      if (isAncestor(sq.sha, b)) return sq.sha;
      const moved = sq.patchId ? findMoved({ patchId: sq.patchId, branch: b }) : null;
      if (moved) return moved;
    }
  }
  return null;
}

/** The state of one done row: done, moved (with the new sha), unverified, dropped, or a legacy row with no sha. */
function stateOf(row, { isAncestor, hasBranch, findMoved }, squashes = new Map()) {
  const anchor = row.noChange ? row.head ?? null : row.sha ?? null;
  if (!anchor) return { state: 'done', legacy: !row.noChange };
  if (row.branch && !hasBranch(row.branch)) return { state: 'unverified' };
  if (isAncestor(anchor, row.branch ?? null)) return { state: 'done' };
  const moved = row.noChange ? null : findMoved(row);
  if (moved) return { state: 'moved', sha: moved, oldSha: row.sha };
  const squashed = squashes.size ? squashedInto(anchor, row.branch ?? null, squashes, { isAncestor, findMoved }) : null;
  if (squashed) return row.noChange ? { state: 'done' } : { state: 'moved', sha: squashed, oldSha: row.sha };
  return { state: 'dropped' };
}

/**
 * Where a slice stands. Returns { slice, total, steps, done, dropped, next, current, stopped,
 * complete, completeSha, replanned, lastRun, hardStops, stops, splitQuestion, warnings, notes }:
 * - `done` lists the done steps ({ n, sha }, with `state` moved or unverified and `oldSha` when
 *   the commit moved, `noChange` for a step with no commit);
 * - `dropped` lists the steps whose commit left the branch (open again);
 * - `next` is the first open step of the plan (or null), `current` a step that started and is
 *   neither done nor stopped (or null), `stopped` the last stop of a started step;
 * - after `complete`, `lastRun` keeps the done and the skipped steps of that run, and
 *   `replanned` is true when the plan changed since: the slice is open again from step 1.
 */
export function whereOf(slugDir, slice, { isAncestor = () => true, hasBranch = () => true, findMoved = () => null } = {}) {
  const resolve = { isAncestor, hasBranch, findMoved };
  const all = readSteps(slugDir);
  const squashes = squashesOf(all);
  const mine = all.filter((r) => r.slice === slice);
  let from = 0;
  mine.forEach((r, i) => { if (r.event === 'complete') from = i + 1; });
  const run = mine.slice(from);
  const lastComplete = from > 0 ? mine[from - 1] : null;
  const plan = planOfSlice(slugDir, slice);
  const steps = plan.steps;
  const notes = [];
  const doneOf = (rows) => {
    const byStep = new Map();
    const gone = new Map();
    for (const r of rows) {
      if (r.event !== 'done') continue;
      const s = stateOf(r, resolve, squashes);
      if (s.state === 'dropped') { byStep.delete(r.step); gone.set(r.step, { n: r.step, sha: r.sha ?? r.head ?? null }); continue; }
      gone.delete(r.step);
      const entry = { n: r.step, sha: s.sha ?? r.sha ?? null };
      if (s.state !== 'done') entry.state = s.state;
      if (s.oldSha) entry.oldSha = s.oldSha;
      if (r.noChange) entry.noChange = true;
      if (s.legacy) { entry.legacy = true; notes.push(`legacy-no-sha: step ${r.step} has a done row with no sha; it counts as done for this release`); }
      byStep.set(r.step, entry);
    }
    return { done: [...byStep.values()].sort((a, b) => a.n - b.n), dropped: [...gone.values()].sort((a, b) => a.n - b.n) };
  };
  const { done, dropped } = doneOf(run);
  const doneSet = new Set(done.map((d) => d.n));
  const replanned = Boolean(lastComplete && run.length === 0 && lastComplete.planHash && plan.hash && lastComplete.planHash !== plan.hash);
  const complete = run.length === 0 && Boolean(lastComplete) && !replanned;
  const next = steps.find((s) => !doneSet.has(s.n)) ?? null;
  const started = [...run].reverse().find((r) => r.event === 'start');
  const startedAt = started ? run.lastIndexOf(started) : -1;
  const stopRow = startedAt >= 0 ? run.slice(startedAt + 1).findLast((r) => r.event === 'hard-stop') : null;
  const current = started && !doneSet.has(started.step) && !stopRow ? { n: started.step, title: started.title ?? null, at: started.at ?? null } : null;
  const stopped = started && !doneSet.has(started.step) && stopRow ? { n: started.step, reason: stopRow.reason ?? null, kind: stopRow.kind ?? 'fail', at: stopRow.at ?? null } : null;
  const stops = { fail: 0, gate: 0, question: 0 };
  for (const r of run) {
    if (r.event === 'hard-stop') stops[STOP_KINDS.includes(r.kind) ? r.kind : 'fail'] += 1;
    if (r.event === 'retry') stops.fail = 0;
  }
  let lastRun = null;
  if (lastComplete) {
    const before = mine.slice(0, from - 1);
    let prev = 0;
    before.forEach((r, i) => { if (r.event === 'complete') prev = i + 1; });
    const ran = doneOf(before.slice(prev));
    lastRun = { done: ran.done, skipped: lastComplete.skipped ?? [], sha: lastComplete.sha ?? null, at: lastComplete.at ?? null, planHash: lastComplete.planHash ?? null };
  }
  return {
    slice,
    total: steps.length,
    steps,
    done: complete ? [] : done,
    dropped: complete ? [] : dropped,
    next: complete ? null : next,
    current: complete ? null : current,
    stopped: complete ? null : stopped,
    complete,
    completeSha: lastComplete?.sha ?? null,
    replanned,
    lastRun,
    hardStops: stops.fail,
    stops,
    splitQuestion: stops.fail >= SPLIT_AFTER_STOPS,
    warnings: plan.warnings,
    notes,
  };
}

/** The slice of the newest row that names one, or null. */
export function lastSlice(slugDir) {
  return readSteps(slugDir).findLast((r) => r.slice)?.slice ?? null;
}

/** One line for a person: where the slice stands. */
export function whereLine(w) {
  if (w.complete) {
    const skipped = w.lastRun?.skipped?.length ? `; skipped ${w.lastRun.skipped.map((s) => s.n).join(', ')}` : '';
    return `${w.slice}: complete${w.completeSha ? ` at ${String(w.completeSha).slice(0, 8)}` : ''}${skipped}`;
  }
  if (!w.total) return `${w.slice}: the plan has no steps that the step record can read${w.warnings?.length ? ` (${w.warnings.join('; ')})` : ''}`;
  const n = w.done.length;
  const at = w.current ? `step ${w.current.n}${w.current.title ? ` (${w.current.title})` : ''} is running`
    : w.stopped ? `step ${w.stopped.n} stopped (${w.stopped.kind}): ${w.stopped.reason ?? 'no reason'}; next: step ${w.next?.n ?? w.stopped.n}`
      : w.next ? `next: step ${w.next.n} (${w.next.title})` : 'no open step';
  const extra = [
    w.replanned ? 'the plan changed since the last complete run; start at the next step' : null,
    ...w.done.filter((d) => d.state === 'moved').map((d) => `step ${d.n} moved ${String(d.oldSha).slice(0, 8)} → ${String(d.sha).slice(0, 8)}`),
    ...w.done.filter((d) => d.state === 'unverified').map((d) => `step ${d.n} is unverified: its branch is not on this machine`),
    ...w.dropped.map((d) => `step ${d.n} dropped: its commit left the branch`),
    w.hardStops ? `${w.hardStops} hard-stop(s)${w.splitQuestion ? ': ask the person to split the slice' : ''}` : null,
  ].filter(Boolean);
  return `${w.slice}: ${n} of ${w.total} steps done; ${at}${extra.length ? `; ${extra.join('; ')}` : ''}`;
}
