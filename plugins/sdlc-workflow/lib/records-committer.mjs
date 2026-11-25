// The committer: one process per computer that sends the records of this computer and applies
// the work of other computers, with `records.sync: compose` (lib/records-compose.mjs). A write
// does not commit; it saves the file and wakes the committer. The committer:
//
// - holds `~/.sdlc/committer.lock` (pid and time), and refreshes a heartbeat in the sync state;
//   a lock whose process is gone, or whose heartbeat is older than 2 minutes, is taken over;
// - syncs 60 s (with jitter) after the first unsent change, and at once after an urgent change
//   (a close, an answer), with at least 10 s between two pushes;
// - fetches each minute while a wait or a session is registered (`~/.sdlc/sync-watch/`), since a
//   message of another computer arrives only through it;
// - backs off for 5 minutes when GitHub answers with a limit;
// - ends after 10 idle minutes.
//
// It writes `~/.sdlc/sync-state.json`: the last snapshot, push and apply, the parked units and
// the last error. `wf status` reads it and shows a sync that is late or failed.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeFileAtomic } from './atomic-write.mjs';
import { dropLock, lockHolder, takeLock } from './file-lock.mjs';
import { pidAlive } from './proc.mjs';
import { sdlcHomeDir } from './home.mjs';
import { composeOn } from './records-compose.mjs';
import { composeNow } from './records-sync.mjs';

export const TIMES = { tickMs: 1_000, quietMs: 60_000, jitterMs: 15_000, urgentGapMs: 10_000, watchMs: 60_000, idleMs: 10 * 60_000, backoffMs: 5 * 60_000, heartbeatMs: 15_000, deadMs: 2 * 60_000, lateMs: 5 * 60_000 };
// Tests shorten the times: SDLC_COMMITTER_TIMES='{"quietMs":500}'.
try { Object.assign(TIMES, JSON.parse(process.env.SDLC_COMMITTER_TIMES || '{}')); } catch { /* the defaults hold */ }
const SELF = fileURLToPath(import.meta.url);

export const committerLockPath = () => join(sdlcHomeDir(), 'committer.lock');
export const syncStatePath = () => join(sdlcHomeDir(), 'sync-state.json');
export const wakePath = () => join(sdlcHomeDir(), 'sync-wake.json');
export const watchDir = () => join(sdlcHomeDir(), 'sync-watch');

const now = () => Date.now();
const iso = (t) => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
const readJson = (file) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } };

/** The sync state of this computer: `{ heartbeat, lastSync, lastPush, lastApply, parked, lastError, pending }`. */
export const readSyncState = () => readJson(syncStatePath()) ?? {};
function writeSyncState(change) {
  const s = { ...readSyncState(), ...change };
  mkdirSync(sdlcHomeDir(), { recursive: true });
  writeFileAtomic(syncStatePath(), `${JSON.stringify(s, null, 2)}\n`);
  return s;
}

/** True when a committer runs: its lock names a live process, and its heartbeat is fresh. */
export function committerAlive() {
  const h = lockHolder(committerLockPath());
  if (!h?.pid || !pidAlive(h.pid)) return false;
  const beat = Date.parse(readSyncState().heartbeat ?? h.at ?? '');
  return Number.isFinite(beat) && now() - beat < TIMES.deadMs;
}

/**
 * Tell the committer that the records changed: `urgent` for a change that another computer
 * should see soon (a close, an answer, a hand-over). Starts the committer when none runs.
 * SDLC_RECORDS_FOREGROUND=1 runs one sync in this process's time, for tests; SDLC_RECORDS_PUSH=off
 * starts nothing.
 */
export function wakeCommitter({ urgent = false } = {}) {
  if (!composeOn()) return false;
  const prior = readJson(wakePath()) ?? {};
  const at = now();
  mkdirSync(sdlcHomeDir(), { recursive: true });
  writeFileAtomic(wakePath(), `${JSON.stringify({ at, first: prior.first && prior.first > (readSyncState().syncStarted ?? 0) ? prior.first : at, urgent: Boolean(urgent || (prior.urgent && prior.at > (readSyncState().syncStarted ?? 0))) })}\n`);
  if (process.env.SDLC_RECORDS_PUSH === 'off') return true;
  if (process.env.SDLC_RECORDS_FOREGROUND === '1') { spawnSync(process.execPath, [SELF, '--once'], { stdio: 'ignore', windowsHide: true }); return true; }
  if (!committerAlive()) {
    try { spawn(process.execPath, [SELF], { detached: true, stdio: 'ignore', windowsHide: true }).unref(); } catch { /* the next write starts it */ }
  }
  return true;
}

/** Register a wait or a session of this process, so the committer keeps fetching. Returns the function that ends it. */
export function registerWatch(what = 'wait') {
  if (!composeOn()) return () => {};
  const file = join(watchDir(), `${process.pid}-${now().toString(36)}.json`);
  try {
    mkdirSync(watchDir(), { recursive: true });
    writeFileAtomic(file, `${JSON.stringify({ pid: process.pid, what, at: iso(now()) })}\n`);
  } catch { return () => {}; }
  wakeCommitter();
  const end = () => rmSync(file, { force: true });
  process.once('exit', end);
  return end;
}

/** The live watches; a file of a process that is gone is removed. */
export function liveWatches() {
  if (!existsSync(watchDir())) return [];
  const out = [];
  for (const name of readdirSync(watchDir())) {
    const file = join(watchDir(), name);
    const w = readJson(file);
    if (w?.pid && pidAlive(w.pid)) out.push(w);
    else rmSync(file, { force: true });
  }
  return out;
}

const LIMITED = /rate limit|too many requests|\b429\b|abuse|secondary rate/i;

/**
 * One sync, under the records lock, by the compose engine. `syncOnce` is the step of the loop and
 * of `records flush`. Returns the result of the engine, or `{ ok: false, error }`.
 */
export function syncOnce({ compose = composeNow } = {}) {
  const started = now();
  writeSyncState({ syncStarted: started });
  const r = compose();
  const done = now();
  const change = { lastSync: iso(done), syncStarted: started };
  if (r.ok) {
    if (r.pushed && r.sent) change.lastPush = iso(done);
    if (r.applied) change.lastApply = iso(done);
    change.parked = r.parked ? { branch: r.parked, units: r.fenced } : null;
    change.lastError = r.pushError && !r.pushed ? { at: iso(done), error: r.pushError } : null;
    change.pending = Boolean(r.held?.length && r.held.some((h) => /lock/.test(h.why ?? '')));
  } else {
    change.lastError = { at: iso(done), error: r.error };
  }
  const limited = LIMITED.test(String(r.error ?? r.pushError ?? ''));
  change.backoffUntil = limited ? iso(done + TIMES.backoffMs) : null;
  writeSyncState(change);
  return r;
}

/** The decision of one tick: sync now or not. Pure, for tests. */
export function due({ t, wake, state, watches, lastPushAt, jitter = 0 }) {
  const started = state.syncStarted ?? 0;
  if (state.backoffUntil && Date.parse(state.backoffUntil) > t) return false;
  const unsent = wake && wake.at > started;
  if (unsent && wake.urgent && t - (lastPushAt ?? 0) >= TIMES.urgentGapMs) return true;
  if (unsent && t - (wake.first ?? wake.at) >= TIMES.quietMs + jitter) return true;
  if (state.pending && t - started >= TIMES.quietMs) return true;
  if (watches > 0 && t - started >= TIMES.watchMs) return true;
  return false;
}

async function loop() {
  const lock = committerLockPath();
  if (committerAlive()) return;
  const h = lockHolder(lock);
  // A lock whose holder lives but beats no more is a lock of a stuck process, or of a reused pid.
  if (h && pidAlive(h.pid)) rmSync(lock, { force: true });
  if (!takeLock(lock, { waitMs: 0, info: { what: 'committer' } })) return;
  let lastActive = now();
  let lastBeat = 0;
  let jitter = Math.floor(Math.random() * TIMES.jitterMs);
  try {
    for (;;) {
      const t = now();
      if (t - lastBeat >= TIMES.heartbeatMs) { writeSyncState({ heartbeat: iso(t), pid: process.pid }); lastBeat = t; }
      const state = readSyncState();
      const wake = readJson(wakePath());
      const watches = liveWatches().length;
      if (due({ t, wake, state, watches, lastPushAt: Date.parse(state.lastPush ?? '') || 0, jitter })) {
        syncOnce();
        lastActive = now();
        jitter = Math.floor(Math.random() * TIMES.jitterMs);
      } else if (watches || (wake && wake.at > (state.syncStarted ?? 0))) {
        lastActive = t;
      }
      if (now() - lastActive >= TIMES.idleMs) return;
      await new Promise((r) => setTimeout(r, TIMES.tickMs));
    }
  } finally {
    dropLock(lock);
  }
}

/** The line of `wf status` about the sync, or null when it is current. */
export function syncLine(t = now()) {
  if (!composeOn()) return null;
  const s = readSyncState();
  const wake = readJson(wakePath());
  if (s.lastError?.error) return `records sync failed at ${s.lastError.at}: ${s.lastError.error}`;
  if (s.parked?.units?.length) return `records: ${s.parked.units.join(', ')} parked on ${s.parked.branch}: another computer owns it`;
  const since = wake && wake.at > (s.syncStarted ?? 0) ? wake.first ?? wake.at : null;
  if (since && t - since > TIMES.lateMs) return `records: changes since ${iso(since)} are saved on this computer and not sent yet${committerAlive() ? '' : ': no committer runs; run wf.mjs records flush'}`;
  return null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--once')) syncOnce();
  else await loop();
}

