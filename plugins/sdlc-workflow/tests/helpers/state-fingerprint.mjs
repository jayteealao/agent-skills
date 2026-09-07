// tests/helpers/state-fingerprint.mjs — the shape of the REAL machine state dir
// that a leaking test changes (WIDE-VIEW-REPAIR-PLAN §14.2.7).
//
// Imported by tests/run-all.mjs (records the baseline before the suite) and by
// tests/unit/state-dir-guard.test.mjs (compares after it). Not a test.
//
// The fingerprint names the state a test pollutes when it forgets SDLC_HOME —
// a registration, a prune line, a hub start, a materialized runtime — and
// nothing a quiet live hub or the tray touches on its own (the heartbeat file,
// the hub log, lifecycle.log). The directory mtime is deliberately absent: an
// atomic write (temp + rename) of any file in the directory moves it.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return null; }
}

function listDir(path) {
  try { return readdirSync(path).filter((n) => !n.startsWith('.')).sort(); } catch { return []; }
}

function sizeOf(path) {
  try { return statSync(path).size; } catch { return 0; }
}

/** Pure over the filesystem: the same directory in the same state → deepEqual fingerprints. */
export function stateFingerprint(dir) {
  if (!existsSync(dir)) return { exists: false };
  const registry = readJson(join(dir, 'registry.json'));
  const entries = Array.isArray(registry?.entries) ? registry.entries : [];
  return {
    exists: true,
    pruneLogBytes: sizeOf(join(dir, 'registry.prune.log')),
    hubPid: readJson(join(dir, 'hub.pid'))?.pid ?? null,
    registryRoots: entries.map((e) => e?.repoRoot ?? null).sort(),
    registryShards: listDir(join(dir, 'registry.d')),
    runtimeBuilds: listDir(join(dir, 'runtime')),
    activeBuildId: readJson(join(dir, 'active-runtime.json'))?.buildId ?? null,
  };
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
