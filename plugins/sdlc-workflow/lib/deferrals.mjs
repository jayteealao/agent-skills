// The deferral record of a workflow: `runtime-evidence-deferrals` in its 00-index.md.
//
// Each open deferral names its clearing event and one side-effect-free `clearing-probe` that
// answers "has the event happened yet?". The check runs that probe only:
//   unchanged   the probe still fails: the wall stands, and no stage probes it again
//   changed     the probe passes: the event happened, so verify or probe can clear the deferral
//   no-probe    the entry has no clearing-probe: a stage must probe the wall itself
// A deferral is a person task. A run stops for it only when the next slice needs it now: the
// entry names that slice in `needed-by`, and the check is not `changed`.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { safeParseFrontmatter } from './frontmatter.mjs';

export const PROBE_TIMEOUT_MS = 30000;

/** The open deferrals of a workflow (cleared-by is empty). */
export function openDeferrals(slugDir) {
  const file = join(slugDir, '00-index.md');
  if (!existsSync(file)) return [];
  const fm = safeParseFrontmatter(readFileSync(file, 'utf8'))?.data ?? {};
  const list = Array.isArray(fm['runtime-evidence-deferrals']) ? fm['runtime-evidence-deferrals'] : [];
  return list.filter((d) => d && typeof d === 'object' && (d['cleared-by'] == null || d['cleared-by'] === ''));
}

/** Run one probe command in the project root through the shell. Returns { ok, tail }. */
export function runProbe(command, cwd, { timeoutMs = PROBE_TIMEOUT_MS } = {}) {
  const r = spawnSync(command, { cwd, shell: true, encoding: 'utf8', timeout: timeoutMs });
  const text = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
  const tail = text.split(/\r?\n/).filter(Boolean).pop() ?? (r.error ? r.error.message : '');
  return { ok: r.status === 0, tail: tail.slice(0, 200) };
}

/**
 * Check every open deferral. Returns { entries, stop } where each entry is { slice, reason,
 * clearingEvent, probe, state, tail, neededBy, neededNow } and `stop` lists the entries that
 * the next slice needs now.
 */
export function checkDeferrals(projectRoot, slug, { next = null, probe = runProbe } = {}) {
  const dir = join(projectRoot, '.ai', 'workflows', slug);
  const entries = openDeferrals(dir).map((d) => {
    const cmd = typeof d['clearing-probe'] === 'string' ? d['clearing-probe'].trim() : '';
    const r = cmd ? probe(cmd, projectRoot) : null;
    const state = !cmd ? 'no-probe' : r.ok ? 'changed' : 'unchanged';
    const neededBy = d['needed-by'] ?? null;
    return {
      slice: d.slice ?? null,
      reason: d.reason ?? null,
      clearingEvent: d['clearing-event'] ?? null,
      probe: cmd || null,
      state,
      tail: r ? r.tail : null,
      neededBy,
      neededNow: Boolean(next && neededBy === next && state !== 'changed'),
    };
  });
  return { entries, stop: entries.filter((e) => e.neededNow) };
}

/** One line per entry, for a person. */
export function deferralLine(e) {
  const what = { unchanged: 'still open, not probed again', changed: 'the clearing event happened: clear it with verify or probe', 'no-probe': 'no clearing-probe: probe the wall' }[e.state];
  const need = e.neededBy ? `; needed by ${e.neededBy}${e.neededNow ? ' (now: a person task)' : ''}` : '';
  return `${e.slice ?? '?'}: ${what}${e.clearingEvent ? ` — ${e.clearingEvent}` : ''}${need}`;
}
