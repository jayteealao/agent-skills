// The progress record of a workflow: .ai/workflows/<slug>/progress.json, written by scripts only.
//
//   { run, driver, stage, slice, status, step: { n, of, title } | null, startedAt, updatedAt,
//     reason, resume }
//
// status is running, waiting (on the person), stopped or done. A run that says running but has
// written nothing (no progress record, no driver journal line) for DEAD_AFTER_MS is stopped: its
// driver died. The ETA of a slice comes from the start and done times of its steps.
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { readSteps, whereOf } from './steps.mjs';
import { workflowsRoot } from './records-root.mjs';
import { undoGitBashPath } from './msys.mjs';

export const PROGRESS_FILE = 'progress.json';
export const STATUSES = ['running', 'waiting', 'stopped', 'done'];
export const DEAD_AFTER_MS = 30 * 60 * 1000;
const JOURNAL = '.driver-journal.jsonl';

const nowIso = (ms = Date.now()) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const ms = (iso) => (iso ? Date.parse(iso) : NaN);

/** The progress record, or null. */
export function readProgress(slugDir) {
  const file = join(slugDir, PROGRESS_FILE);
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

/** Merge a change into the record and write it. A new run id starts a new record. */
export function writeProgress(slugDir, change, { now = nowIso() } = {}) {
  // `complete` is the word of the stage records; the run record says `done`.
  if (change.status === 'complete' || change.status === 'completed') change = { ...change, status: 'done' };
  if (change.status && !STATUSES.includes(change.status)) throw new Error(`status must be one of ${STATUSES.join(', ')}`);
  if (typeof change.resume === 'string') change = { ...change, resume: undoGitBashPath(change.resume).value };
  const old = readProgress(slugDir) ?? {};
  const fresh = change.run && change.run !== old.run;
  const base = fresh ? {} : old;
  const next = { ...base, ...change, updatedAt: now };
  if (!next.startedAt || fresh) next.startedAt = now;
  const file = join(slugDir, PROGRESS_FILE);
  writeFileSync(`${file}.tmp`, `${JSON.stringify(next, null, 2)}\n`);
  renameSync(`${file}.tmp`, file);
  // The end of a driver run (its last `progress set`) saves the outcome on this machine.
  if (next.driver && change.status && change.status !== 'running') {
    writeDriverOutcome(slugDir, { run: next.run ?? null, driver: next.driver, status: next.status, stage: next.stage ?? null, slice: next.slice ?? null, reason: next.reason ?? null, resume: next.resume ?? null }, { now });
  }
  return next;
}

/** The outcome of the last driver run on this machine; it stays local (lib/records-root.mjs). */
export const OUTCOME_FILE = '.driver-outcome.json';

/** Merge `outcome` into the saved outcome of the run; a new run replaces the old outcome. */
export function writeDriverOutcome(slugDir, outcome, { now = nowIso() } = {}) {
  const old = readDriverOutcome(slugDir);
  const base = old && old.run === (outcome.run ?? old.run) ? old : {};
  const next = { ...base, ...Object.fromEntries(Object.entries(outcome).filter(([, v]) => v !== undefined)), at: now };
  const file = join(slugDir, OUTCOME_FILE);
  writeFileSync(`${file}.tmp`, `${JSON.stringify(next, null, 2)}\n`);
  renameSync(`${file}.tmp`, file);
  return next;
}

export function readDriverOutcome(slugDir) {
  try { return JSON.parse(readFileSync(join(slugDir, OUTCOME_FILE), 'utf8')); } catch { return null; }
}

// The newest `at` of the driver journal, or NaN.
function journalSeen(slugDir) {
  const file = join(slugDir, JOURNAL);
  if (!existsSync(file)) return NaN;
  const lines = readFileSync(file, 'utf8').trim().split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try { const t = ms(JSON.parse(lines[i]).at); if (Number.isFinite(t)) return t; } catch { /* a torn line */ }
  }
  return NaN;
}

/** The seconds that the open steps of a slice still need, from the times of its done steps, or null. */
export function etaSeconds(slugDir, slice) {
  if (!slice) return null;
  const rows = readSteps(slugDir).filter((r) => r.slice === slice);
  const started = new Map();
  const took = [];
  for (const r of rows) {
    if (r.event === 'complete') { started.clear(); took.length = 0; continue; }
    if (r.event === 'start') started.set(r.step, ms(r.at));
    if (r.event === 'done' && started.has(r.step)) {
      const d = ms(r.at) - started.get(r.step);
      if (Number.isFinite(d) && d >= 0) took.push(d / 1000);
    }
  }
  if (!took.length) return null;
  const w = whereOf(slugDir, slice);
  const open = w.total - w.done.length;
  if (open <= 0) return 0;
  return Math.round((took.reduce((a, b) => a + b, 0) / took.length) * open);
}

/** The default resume command of a run. */
export function resumeOf(p, slug) {
  if (p?.resume) return undoGitBashPath(p.resume).value;
  if (p?.driver === 'yolo') return `/wf yolo ${slug}`;
  return `/wf ${slug}`;
}

/**
 * The progress of a workflow as a person reads it, or null when it has none: the record plus
 * `state` (the status, or `stopped` for a dead run), `quietMinutes` and `etaSeconds`.
 */
export function progressOf(slugDir, slug, { now = Date.now() } = {}) {
  const p = readProgress(slugDir);
  if (!p) return null;
  const seen = Math.max(...[ms(p.updatedAt), journalSeen(slugDir)].filter(Number.isFinite), -Infinity);
  const quietMinutes = Number.isFinite(seen) ? Math.floor((now - seen) / 60000) : null;
  const dead = p.status === 'running' && Number.isFinite(seen) && now - seen > DEAD_AFTER_MS;
  return {
    ...p,
    state: dead ? 'stopped' : p.status,
    dead,
    quietMinutes,
    etaSeconds: p.status === 'running' && !dead ? etaSeconds(slugDir, p.slice) : null,
    resume: resumeOf(p, slug),
  };
}

const where = (p) => [p.stage, p.slice].filter(Boolean).join(' ') + (p.step ? ` step ${p.step.n}${p.step.of ? ` of ${p.step.of}` : ''}${p.step.title ? ` (${p.step.title})` : ''}` : '');

/** One line for a person. */
export function progressLine(p) {
  if (!p) return 'no progress record';
  if (p.dead) return `stopped at ${where(p)}: no sign of life for ${p.quietMinutes} min. Resume with ${p.resume}`;
  if (p.state === 'running') return `running ${where(p)}${p.etaSeconds != null ? `, about ${Math.max(1, Math.round(p.etaSeconds / 60))} min left in the slice` : ''}`;
  if (p.state === 'waiting') return `waiting on the person at ${where(p)}${p.reason ? `: ${p.reason}` : ''}`;
  if (p.state === 'stopped') return `stopped at ${where(p)}${p.reason ? `: ${p.reason}` : ''}. Resume with ${p.resume}`;
  return `done${p.stage ? ` after ${p.stage}` : ''}`;
}

// A stopped run older than this is history: the session notice leaves it out.
export const NOTICE_DAYS = 7;

/** The recent stopped runs of a project: one { slug, line } per workflow whose run stopped or died. */
export function stoppedRuns(projectRoot, { now = Date.now() } = {}) {
  const root = workflowsRoot(projectRoot);
  if (!existsSync(root)) return [];
  const out = [];
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const p = progressOf(join(root, e.name), e.name, { now });
    const recent = p && p.quietMinutes != null && p.quietMinutes < NOTICE_DAYS * 24 * 60;
    if (recent && (p.dead || p.state === 'stopped')) out.push({ slug: e.name, line: progressLine(p) });
  }
  return out;
}
