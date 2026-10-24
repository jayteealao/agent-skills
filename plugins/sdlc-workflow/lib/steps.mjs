// The step record of a workflow: .ai/workflows/<slug>/steps.jsonl, one JSON line per event.
//
//   start     { slice, event: 'start', step, title }    a plan step begins
//   done      { slice, event: 'done', step, sha }       a plan step is committed (sha null: no commit)
//   hard-stop { slice, event: 'hard-stop', reason }     the implement agent stopped
//   retry     { slice, event: 'retry' }                 the person asked for one more run
//   complete  { slice, event: 'complete', sha }         the last commit of the slice
//
// Every line also has `at`. The rows of a slice after its last `complete` row are the current
// run of that slice. A step is done when a `done` row names it and its sha is in the history of
// HEAD, so a reset or a rebase that drops a commit makes its step open again. The old record
// .implement-progress.jsonl (event `step` for done) is read too, for one release.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { sectionOf } from './brief.mjs';

export const STEPS_FILE = 'steps.jsonl';
export const LEGACY_PROGRESS = '.implement-progress.jsonl';
export const EVENTS = ['start', 'done', 'hard-stop', 'retry', 'complete'];
// A slice whose implement stopped this many times since the last retry is a split question.
export const SPLIT_AFTER_STOPS = 2;

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

/** Every step row of a workflow: the old record first, then the new one. */
export function readSteps(slugDir) {
  const legacy = readJsonl(join(slugDir, LEGACY_PROGRESS)).map((r) => (r.event === 'step' ? { ...r, event: 'done' } : r));
  return [...legacy, ...readJsonl(join(slugDir, STEPS_FILE))];
}

/** Append one row. */
export function appendStep(slugDir, row, { now = nowIso() } = {}) {
  if (!row.slice) throw new Error('a step row needs a slice');
  if (!EVENTS.includes(row.event)) throw new Error(`event must be one of ${EVENTS.join(', ')}`);
  if ((row.event === 'start' || row.event === 'done') && !(Number.isInteger(row.step) && row.step > 0)) {
    throw new Error(`a ${row.event} row needs a step number above 0`);
  }
  const line = { at: now, ...row };
  appendFileSync(join(slugDir, STEPS_FILE), `${JSON.stringify(line)}\n`);
  return line;
}

/** The numbered steps of the plan of a slice: [{ n, title }]. */
export function planSteps(slugDir, slice) {
  const file = join(slugDir, `04-plan-${slice}.md`);
  if (!existsSync(file)) return [];
  const section = sectionOf(readFileSync(file, 'utf8'), 'Step-by-Step Plan') ?? '';
  const steps = [];
  for (const line of section.split(/\r?\n/)) {
    const m = /^(\d+)\.\s+(.*)$/.exec(line);
    if (!m) continue;
    const t = /^\*\*(.+?)\*\*/.exec(m[2]);
    steps.push({ n: Number(m[1]), title: (t ? t[1] : m[2].split(/\s+[—–-]\s+/)[0]).trim() });
  }
  return steps;
}

/** True when a commit is in the history of HEAD of a checkout. */
export function gitIsAncestor(projectRoot) {
  return (sha) => spawnSync('git', ['merge-base', '--is-ancestor', sha, 'HEAD'], { cwd: projectRoot }).status === 0;
}

/** The sha of a revision of a checkout, or null. */
export function gitRevParse(projectRoot, rev) {
  const r = spawnSync('git', ['rev-parse', '--verify', `${rev}^{commit}`], { cwd: projectRoot, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

/**
 * Where a slice stands. Returns { slice, total, steps, done, next, current, complete, hardStops,
 * splitQuestion }: `done` lists the done steps ({ n, sha }), `next` is the first open step of the
 * plan (or null), `current` a step that started and is not done (or null).
 */
export function whereOf(slugDir, slice, { isAncestor = () => true } = {}) {
  const all = readSteps(slugDir);
  const mine = all.filter((r) => r.slice === slice);
  let from = 0;
  mine.forEach((r, i) => { if (r.event === 'complete') from = i + 1; });
  const run = mine.slice(from);
  const lastComplete = from > 0 ? mine[from - 1] : null;
  const steps = planSteps(slugDir, slice);
  const doneBy = new Map();
  for (const r of run) {
    if (r.event !== 'done') continue;
    if (r.sha && !isAncestor(r.sha)) { doneBy.delete(r.step); continue; }
    doneBy.set(r.step, r.sha ?? null);
  }
  const done = [...doneBy.entries()].sort((a, b) => a[0] - b[0]).map(([n, sha]) => ({ n, sha }));
  const plan = steps;
  const next = plan.find((s) => !doneBy.has(s.n)) ?? null;
  const started = [...run].reverse().find((r) => r.event === 'start');
  const current = started && !doneBy.has(started.step) ? { n: started.step, title: started.title ?? null, at: started.at ?? null } : null;
  let hardStops = 0;
  for (const r of run) {
    if (r.event === 'hard-stop') hardStops += 1;
    if (r.event === 'retry') hardStops = 0;
  }
  const complete = run.length === 0 && Boolean(lastComplete);
  return {
    slice,
    total: plan.length,
    steps: plan,
    done,
    next: complete ? null : next,
    current: complete ? null : current,
    complete,
    completeSha: lastComplete?.sha ?? null,
    hardStops,
    splitQuestion: hardStops >= SPLIT_AFTER_STOPS,
  };
}

/** The slice of the newest row, or null. */
export function lastSlice(slugDir) {
  const all = readSteps(slugDir);
  return all.length ? all[all.length - 1].slice : null;
}

/** One line for a person: where the slice stands. */
export function whereLine(w) {
  if (w.complete) return `${w.slice}: complete${w.completeSha ? ` at ${String(w.completeSha).slice(0, 8)}` : ''}`;
  const n = w.done.length;
  const of = w.total ? ` of ${w.total}` : '';
  const at = w.current ? `step ${w.current.n}${w.current.title ? ` (${w.current.title})` : ''} is running` : w.next ? `next: step ${w.next.n} (${w.next.title})` : 'no open step';
  const stops = w.hardStops ? `; ${w.hardStops} hard-stop(s)${w.splitQuestion ? ': ask the person to split the slice' : ''}` : '';
  return `${w.slice}: ${n}${of} steps done; ${at}${stops}`;
}
