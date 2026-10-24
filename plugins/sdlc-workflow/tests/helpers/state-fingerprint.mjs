// tests/helpers/state-fingerprint.mjs — the shape of the REAL machine state dir
// that a leaking test changes (WIDE-VIEW-REPAIR-PLAN §14.2.7).
//
// Imported by tests/run-all.mjs (records the baseline before the suite) and by
// tests/unit/state-dir-guard.test.mjs (compares after it). Not a test.
//
// The fingerprint is the sorted list of top-level entries, so a test that
// forgets SDLC_HOME and creates a file or a folder there shows. It leaves out
// the two logs (errors.log, lifecycle.log and their rotations): a live session
// on this machine writes them during the suite. The directory mtime is
// deliberately absent: an atomic write (temp + rename) of any file moves it.
import { existsSync, readdirSync } from 'node:fs';

const LOG = /\.log(?:\.\d+)?$/;

/** Pure over the filesystem: the same directory in the same state → deepEqual fingerprints. */
export function stateFingerprint(dir) {
  if (!existsSync(dir)) return { exists: false };
  let entries = [];
  try { entries = readdirSync(dir).filter((n) => !LOG.test(n)).sort(); } catch { /* unreadable: empty */ }
  return { exists: true, entries };
}

/** The keys whose values differ, for a readable failure message. */
export function fingerprintDiff(before, after) {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const changed = [];
  for (const k of keys) {
    if (JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k])) {
      changed.push(`${k}: ${JSON.stringify(before?.[k])} → ${JSON.stringify(after?.[k])}`);
    }
  }
  return changed;
}
