// The clear of a stop request after a run ends.
//
// The person writes a stop request (`.control.json` of a workflow) while a driver runs. When
// the run ends on it, the main session clears the request, so the next run does not stop at
// once. A person can also write a new request after the run stopped and before the relaunch:
// that request is for the next run, and the clear after the stop must keep it.
//
// The rule: a request served a run when it was made at or before the last `run-end` line of
// the driver journal. A request made after that line waits for the next run, and the clear
// keeps it. `force` clears any request: the person asked to withdraw it.
import { existsSync, readFileSync, rmSync } from 'node:fs';

const readJson = (file) => {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
};

/** The time (ms) of the last `run-end` line of a driver journal, or null. */
export function lastRunEndAt(journalFile) {
  let text;
  try { text = readFileSync(journalFile, 'utf8'); } catch { return null; }
  let last = null;
  for (const raw of text.split('\n')) {
    if (!raw.includes('"run-end"')) continue;
    let line;
    try { line = JSON.parse(raw); } catch { continue; }
    const at = line && line.event === 'run-end' ? Date.parse(line.at || '') : NaN;
    if (Number.isFinite(at) && (last === null || at > last)) last = at;
  }
  return last;
}

/**
 * Whether a stop request was made for a run that is gone. The person asked while run R worked
 * (the journal line before the request is a line of R, and not its end), R wrote no end (its
 * host died), and the journal now has lines of another run. That request was for R: it does not
 * stop the run that came after it.
 */
export function madeForGoneRun(request, journalFile) {
  const asked = Date.parse(request?.requestedAt || '');
  if (!Number.isFinite(asked)) return false;
  let text;
  try { text = readFileSync(journalFile, 'utf8'); } catch { return false; }
  let before = null;
  let laterRun = false;
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue;
    let line;
    try { line = JSON.parse(raw); } catch { continue; }
    const at = Date.parse(line?.at || '');
    if (!Number.isFinite(at) || !line.run) continue;
    if (at <= asked) before = line;
    else if (before && line.run !== before.run) laterRun = true;
  }
  return Boolean(before) && before.event !== 'run-end' && laterRun;
}

/**
 * Whether a stop request is newer than the last run end, so it waits for the next run. A request
 * without a readable `requestedAt`, or a journal without a run end, is not newer.
 */
export function madeAfterLastRun(request, runEndAt) {
  const asked = Date.parse(request?.requestedAt || '');
  return Number.isFinite(asked) && runEndAt !== null && asked > runEndAt;
}

/**
 * Clear the stop request of `controlFile` unless the person made it after the last run end of
 * `journalFile`. Returns `{ cleared, kept? }`: `kept` is the request that stays for the next run.
 */
export function clearStopRequest(controlFile, journalFile, { force = false } = {}) {
  if (!existsSync(controlFile)) return { cleared: false };
  const request = readJson(controlFile);
  if (!force && request && typeof request === 'object' && madeAfterLastRun(request, lastRunEndAt(journalFile)) && !madeForGoneRun(request, journalFile)) {
    return { cleared: false, kept: request };
  }
  rmSync(controlFile, { force: true });
  return { cleared: true };
}
