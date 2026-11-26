// The events of a run, read from where they are written, with a cursor that says where the reader
// stands: the next line of the driver journal (a byte offset), the newest message of the talk (its
// id) and the time up to which job ends were read. The reader keeps no state and takes no lock, so
// it never takes the place of a watch of the session, and the cursor in a call is enough to read on
// after a compaction: each event after the cursor comes once.
//
// The cursor is `E-<journal bytes>-<talk id>-<job end seconds>`. With no cursor, a read starts now.
import { openSync, readSync, closeSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { listJobs } from './jobs.mjs';
import { workflowDir } from './records-root.mjs';
import { isFor, readTalk } from './talk.mjs';

export const JOURNAL_FILE = '.driver-journal.jsonl';
// A job end is read 2 seconds behind the clock: its record may land a moment after its stamp.
const JOB_LAG_S = 2;
const num = (id) => Number(String(id ?? '').replace(/\D/g, '')) || 0;
const sizeOf = (f) => { try { return statSync(f).size; } catch { return 0; } };

export function parseCursor(c) {
  const m = /^E-(\d+)-(\d+)-(\d+)$/.exec(String(c ?? ''));
  return m ? { bytes: Number(m[1]), talk: Number(m[2]), jobs: Number(m[3]) } : null;
}
const cursorOf = (p) => `E-${p.bytes}-${p.talk}-${p.jobs}`;

/** The cursor of now: past every event that is already written. */
export function cursorNow(root, slug, now = Date.now()) {
  const dir = workflowDir(root, slug);
  return cursorOf({ bytes: sizeOf(join(dir, JOURNAL_FILE)), talk: readTalk(dir).reduce((m, e) => Math.max(m, num(e.id)), 0), jobs: Math.floor(now / 1000) - JOB_LAG_S });
}

/** The whole lines of the journal from a byte offset, and the offset after the last whole line. */
function journalFrom(file, from) {
  const size = sizeOf(file);
  // A journal that is shorter than the cursor was started again: read it from its start.
  const start = size < from ? 0 : from;
  if (size === start) return { lines: [], next: start };
  const fd = openSync(file, 'r');
  try {
    const buf = Buffer.alloc(size - start);
    readSync(fd, buf, 0, buf.length, start);
    const text = buf.toString('utf8');
    const end = text.lastIndexOf('\n');
    if (end < 0) return { lines: [], next: start };
    const lines = [];
    for (const l of text.slice(0, end).split('\n')) { if (l.trim()) { try { lines.push(JSON.parse(l)); } catch { /* a torn line */ } } }
    return { lines, next: start + Buffer.byteLength(text.slice(0, end + 1), 'utf8') };
  } finally { closeSync(fd); }
}

/**
 * The events after `cursor`: run lines of the journal, messages of the talk (with `as`: the ones
 * for that actor), and ends of jobs. Returns `{ events, cursor }`.
 */
export function readRunEvents(root, slug, cursor, { as = null, now = Date.now() } = {}) {
  const at = parseCursor(cursor) ?? parseCursor(cursorNow(root, slug, now));
  const dir = workflowDir(root, slug);
  const events = [];
  const j = journalFrom(join(dir, JOURNAL_FILE), at.bytes);
  for (const l of j.lines) events.push({ kind: 'run', ...l });
  let talk = at.talk;
  for (const e of readTalk(dir)) {
    const n = num(e.id);
    if (n <= at.talk) continue;
    talk = Math.max(talk, n);
    if (e.ev !== 'post' || (as && !isFor(as, e.to, e.by))) continue;
    events.push({ kind: 'message', id: e.id, by: e.by, to: e.to, text: e.text, at: e.at, ...(e.re ? { re: e.re } : {}) });
  }
  const upTo = Math.max(at.jobs, Math.floor(now / 1000) - JOB_LAG_S);
  for (const job of listJobs(root, slug)) {
    const s = job.endedAt ? Math.floor(Date.parse(job.endedAt) / 1000) : null;
    if (s !== null && s >= at.jobs && s < upTo) events.push({ kind: 'job-end', job: job.id, name: job.name, exit: job.exit ?? null, ...(job.stopped ? { stopped: true } : {}), at: job.endedAt });
  }
  return { events, cursor: cursorOf({ bytes: j.next, talk, jobs: upTo }) };
}

/** Wait for the next events after `cursor`, for `seconds` at most. */
export async function waitRunEvents(root, slug, { cursor = null, as = null, seconds = 240, pollMs = 1000 } = {}) {
  const end = Date.now() + seconds * 1000;
  let c = cursor ?? cursorNow(root, slug);
  for (;;) {
    const r = readRunEvents(root, slug, c, { as });
    c = r.cursor;
    if (r.events.length) return { state: 'events', events: r.events, cursor: c };
    if (Date.now() >= end) return { state: 'waiting', events: [], cursor: c };
    await new Promise((done) => setTimeout(done, Math.min(pollMs, Math.max(10, end - Date.now()))));
  }
}
