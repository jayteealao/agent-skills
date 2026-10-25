// The evidence cap of a workflow: the evidence folders hold at most EVIDENCE_CAP_BYTES.
//
// Each entry directly under an evidence folder (verify-evidence/<slice>/, probe-evidence/<run>/,
// or a file there) is one run. When the evidence is over the cap, the oldest runs are deleted
// first, by the newest time of any file in them, until the evidence fits. The newest run of the
// workflow is never deleted, so a workflow keeps its latest evidence even when that run alone
// is over the cap.
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { EVIDENCE_DIRS } from './hook-utils.mjs';

export const EVIDENCE_CAP_BYTES = 200 * 1024 * 1024;

/** The size and the newest time of a file or a folder. */
function measure(path) {
  const st = statSync(path);
  if (!st.isDirectory()) return { bytes: st.size, newest: st.mtimeMs };
  let bytes = 0;
  let newest = st.mtimeMs;
  for (const e of readdirSync(path)) {
    const m = measure(join(path, e));
    bytes += m.bytes;
    newest = Math.max(newest, m.newest);
  }
  return { bytes, newest };
}

/** Every run of the evidence of a workflow: [{ path, rel, bytes, newest }], oldest first. */
export function evidenceRuns(slugDir) {
  const runs = [];
  for (const d of EVIDENCE_DIRS) {
    const dir = join(slugDir, d);
    if (!existsSync(dir)) continue;
    for (const e of readdirSync(dir)) {
      const path = join(dir, e);
      runs.push({ path, rel: `${d}/${e}`, ...measure(path) });
    }
  }
  return runs.sort((a, b) => a.newest - b.newest || a.rel.localeCompare(b.rel));
}

/**
 * Delete the oldest runs until the evidence fits the cap. Returns { bytes, cap, pruned, kept }:
 * `bytes` is the size after the prune, `pruned` the runs deleted.
 */
export function pruneEvidence(slugDir, { cap = EVIDENCE_CAP_BYTES, dryRun = false } = {}) {
  const runs = evidenceRuns(slugDir);
  let bytes = runs.reduce((n, r) => n + r.bytes, 0);
  const pruned = [];
  for (const r of runs.slice(0, -1)) {
    if (bytes <= cap) break;
    if (!dryRun) rmSync(r.path, { recursive: true, force: true });
    bytes -= r.bytes;
    pruned.push(r.rel);
  }
  return { bytes, cap, pruned, kept: runs.length - pruned.length };
}
