// The deferral record of a workflow: `runtime-evidence-deferrals` in its index.
//
// Each open deferral names its clearing event and one side-effect-free `clearing-probe` that
// answers "has the event happened yet?". The check runs that probe only:
//   unchanged   the probe still fails: the wall stands, and no stage probes it again
//   changed     the probe passes: the event happened, so verify or probe can clear the deferral
//   no-probe    the entry has no clearing-probe: a stage must probe the wall itself
//   probe-error the probe could not run (its command is not on this machine, or the shell could
//               not start it): no answer about the event; fix the probe so it runs in any shell
// A deferral is a person task. A run stops for it only when the next slice needs it now: the
// entry names that slice in `needed-by`, and the check is not `changed`.
import { runShell } from './proc.mjs';
import { frontmatterOfDoc } from './records.mjs';
import { workflowDir } from './records-root.mjs';

export const PROBE_TIMEOUT_MS = 30000;

/** The open deferrals of a workflow (cleared-by is empty). */
export function openDeferrals(slugDir) {
  const fm = frontmatterOfDoc(slugDir, '00-index.md') ?? {};
  const list = Array.isArray(fm['runtime-evidence-deferrals']) ? fm['runtime-evidence-deferrals'] : [];
  return list.filter((d) => d && typeof d === 'object' && (d['cleared-by'] == null || d['cleared-by'] === ''));
}

// The exit codes of a command that the shell did not find: 127 in a POSIX shell, 9009 in cmd.exe.
const NOT_FOUND = new Set([127, 9009]);
const NOT_RECOGNIZED = /is not recognized as (?:an internal or external command|the name of a cmdlet)|command not found/i;

/**
 * Run one probe command in the project root through the shell. Returns { ok, error, tail }. A
 * probe past its time is ended with every process that it started, and opens no console window.
 * `error` is true when the probe could not run (the shell did not find its command, or it could
 * not start): that is no answer about the event, so the deferral is not read as unchanged.
 */
export function runProbe(command, cwd, { timeoutMs = PROBE_TIMEOUT_MS } = {}) {
  const r = runShell(command, { cwd, timeoutMs });
  const text = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
  const tail = text.split(/\r?\n/).filter(Boolean).pop() ?? (r.error ? r.error.message : '');
  const error = Boolean(r.error && !r.timedOut && r.status == null) || NOT_FOUND.has(r.status) || (r.status !== 0 && NOT_RECOGNIZED.test(text));
  return { ok: r.status === 0, error, tail: tail.slice(0, 200) };
}

/**
 * Check every open deferral. Returns { entries, stop } where each entry is { slice, reason,
 * clearingEvent, probe, state, tail, neededBy, neededNow } and `stop` lists the entries that
 * the next slice needs now.
 */
export function checkDeferrals(projectRoot, slug, { next = null, probe = runProbe } = {}) {
  const dir = workflowDir(projectRoot, slug);
  const entries = openDeferrals(dir).map((d) => {
    const cmd = typeof d['clearing-probe'] === 'string' ? d['clearing-probe'].trim() : '';
    const r = cmd ? probe(cmd, projectRoot) : null;
    const state = !cmd ? 'no-probe' : r.ok ? 'changed' : r.error ? 'probe-error' : 'unchanged';
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
  const what = { unchanged: 'still open, not probed again', changed: 'the clearing event happened: clear it with verify or probe', 'no-probe': 'no clearing-probe: probe the wall', 'probe-error': `the probe could not run${e.tail ? ` (${e.tail})` : ''}: write a probe that runs in any shell` }[e.state];
  const need = e.neededBy ? `; needed by ${e.neededBy}${e.neededNow ? ' (now: a person task)' : ''}` : '';
  return `${e.slice ?? '?'}: ${what}${e.clearingEvent ? ` — ${e.clearingEvent}` : ''}${need}`;
}
