// The results of the slice checks of an implement (`wf.mjs step check`), and the gate that reads
// them at the end of the stage.
//
// A slice check is a test set, a guard set, a measured run or a device check that the plan names
// under `## Slice Checks`. The implement stage records each one with the commit that it ran on.
// The stage is done only when each required check ran on the code that the slice ends with:
//
//   met       the check passed
//   not-met   the check ran and did not pass: the stage may end, and verify must rule on it
//   not-run   the check did not run: a required check that did not run blocks the end
//
// A check whose commit is older than a code change is stale: it counts as not run. A check that
// is not met because of an earlier slice ("carried") needs the proof: the same check red at the
// base commit of the slice.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { agentFix, refuse } from './fix.mjs';
import { appendRecord } from './atomic-write.mjs';

export const CHECKS_FILE = 'slice-checks.jsonl';
export const RESULTS = ['met', 'not-met', 'not-run'];
/** The heading of the plan that names the slice checks. */
export const CHECKS_HEADING = /^##\s+Slice Checks\s*$/im;

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const git = (root, args) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true });
const redo = (message, fix, command = null) => refuse(message, agentFix(fix, command));

/** A file whose change does not make a check stale: prose, and the records of the workflow. */
export const isProse = (file) => /\.(md|mdx|txt|rst)$/i.test(file) || /^(\.ai|docs)\//.test(String(file).replace(/\\/g, '/'));

/** The text under the `## Slice Checks` heading of a plan, or null when the plan has none. */
export function checksSection(planBody) {
  const m = CHECKS_HEADING.exec(String(planBody ?? ''));
  if (!m) return null;
  const rest = String(planBody).slice(m.index + m[0].length);
  const next = /^##\s+\S/m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

/** The number of checks that the section lists: its top-level list items. */
export const countChecks = (section) => (String(section ?? '').match(/^(?:[-*]|\d+\.)\s+\S/gm) ?? []).length;

/** The rows of the file, oldest first. */
export function readChecks(dir) {
  const file = join(dir, CHECKS_FILE);
  if (!existsSync(file)) return [];
  const out = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* a torn line is left out */ }
  }
  return out;
}

/** The newest row of each check of a slice. */
export function checksOf(dir, slice) {
  const last = new Map();
  for (const r of readChecks(dir)) if (r.slice === slice && r.name) last.set(r.name, r);
  return [...last.values()];
}

/**
 * Record the result of one check.
 *
 * @param {string} dir the folder of the workflow
 * @param {object} c `{ slice, name, result, sha, required, note, carriedFrom, proof, base }`
 *   `proof`: `{ by: 'job' | 'run', id, exit, log, command }`, the run that wf saw. A check is `met` only with one.
 * @param {object} [o]
 * @param {(sha: string) => string | null} [o.resolve] the full commit of a name, or null
 * @param {(base: string, head: string) => boolean} [o.isAncestor]
 * @param {(path: string) => boolean} [o.exists]
 */
export function addCheck(dir, c, { now = nowIso(), resolve = () => null, isAncestor = () => true, exists = existsSync } = {}) {
  const name = String(c.name ?? '').trim();
  if (!c.slice) throw redo('step check: <slice> is required', 'Run the command again with the slice.');
  if (!name) throw redo('step check: --name is required', 'Run the command again with --name, the name of the check as the plan gives it.');
  if (!RESULTS.includes(c.result)) throw redo(`step check: --result must be one of ${RESULTS.join(', ')}`, 'Run the command again with one of those results.');
  if (c.result === 'met' && !(c.proof && c.proof.exit === 0)) {
    throw redo('step check: a check is met by its exit code, not by your word', 'Run the check through wf, so that wf sees its exit code: step check --name "<the check>" --run "<the command>" for a command under 8 minutes, or start it with talk job and give step check --job <the id> when it ended.');
  }
  let sha = null;
  if (c.result !== 'not-run') {
    sha = c.sha ? resolve(c.sha) : null;
    if (!sha) throw redo('step check: --sha <the commit that the check ran on> is required for a check that ran', 'Run the command again with --sha HEAD when the check ran on the code as it is now, else with the commit that it ran on.');
  }
  let carried = null;
  if (c.carriedFrom) {
    if (c.result !== 'not-met') throw redo('step check: --carried-from is for a check that is not met', 'Leave --carried-from out, or record the check as not-met.');
    const base = resolve(c.carriedFrom);
    if (!base || !isAncestor(base, sha)) throw redo(`step check: ${c.carriedFrom} is not a commit before ${sha.slice(0, 8)}`, 'Give --carried-from the base commit of the slice: the commit before its first step.');
    // The proof is a job of this run that ran the same check on the base commit and failed there.
    const b = c.base;
    if (!b || b.head !== base || b.exit === 0 || b.exit == null) throw redo('step check: a red that is carried from an earlier slice needs --base-job, a job that ran the same check at the base commit and failed there', 'Make a scratch worktree at the base commit, start the check there with talk job --cwd <that worktree>, wait for its end, and run the command again with --base-job <its id>. With no such run, the red belongs to this slice: fix it.');
    carried = { base, job: b.id, log: b.log ?? null };
  }
  const row = {
    at: now, slice: c.slice, name, result: c.result, required: c.required !== false,
    ...(sha ? { sha } : {}), ...(c.note ? { note: String(c.note) } : {}), ...(carried ? { carried } : {}),
    ...(c.proof ? { proof: { by: c.proof.by, ...(c.proof.id ? { id: c.proof.id } : {}), exit: c.proof.exit, ...(c.proof.log ? { log: c.proof.log } : {}), ...(c.proof.command ? { command: c.proof.command } : {}) } } : {}),
  };
  appendRecord(join(dir, CHECKS_FILE), `${JSON.stringify(row)}\n`);
  return row;
}

/**
 * The state of the checks of a slice against the code at `head`.
 *
 * @param {object[]} checks the newest row of each check
 * @param {object} o
 * @param {boolean} o.planned the plan has a `## Slice Checks` section
 * @param {number} [o.count] the number of checks that the section lists
 * @param {boolean} [o.optionalOk] the section marks a check as optional
 * @param {string | null} o.head the commit that the slice ends with
 * @param {(sha: string) => string[] | null} o.changedSince the files that changed from `sha` to `head`; null when git cannot say
 * @returns {{ blocking: string[], unmet: object[], stale: object[] }}
 */
export function checkState(checks, { planned, head, changedSince, count = 0, optionalOk = true }) {
  const blocking = [];
  const unmet = [];
  const stale = [];
  if (planned && !checks.length) blocking.push('the plan has slice checks, and no result of a check is recorded');
  else if (planned && checks.length < count) blocking.push(`the plan lists ${count} slice checks, and ${checks.length} ${checks.length === 1 ? 'is' : 'are'} recorded`);
  for (const c of checks) {
    let result = c.result;
    if (result !== 'not-run' && head && c.sha && c.sha !== head) {
      const files = changedSince(c.sha);
      const code = files === null ? ['(git cannot compare the commits)'] : files.filter((f) => !isProse(f));
      if (code.length) { result = 'not-run'; stale.push({ ...c, changed: code.slice(0, 5), more: Math.max(0, code.length - 5) }); }
    }
    // A check is optional only when the plan says so.
    if (result === 'not-run' && (c.required !== false || !optionalOk)) {
      const why = c.result === 'not-run' ? 'did not run' : `ran on ${String(c.sha).slice(0, 8)}, and code changed after it`;
      blocking.push(`the check "${c.name}" ${why}`);
    } else if (result === 'not-met') unmet.push(c);
  }
  return { blocking, unmet, stale };
}

/** The state of the checks of a slice in a checkout. */
export function sliceCheckState(dir, slice, { checkout, planBody = '' }) {
  const r = git(checkout, ['rev-parse', 'HEAD']);
  const head = r.status === 0 ? r.stdout.trim() : null;
  const changedSince = (sha) => {
    // A check that ran on a commit that HEAD does not hold (an amended commit, or another branch)
    // did not run on this code: git cannot compare them, and the check counts as not run.
    if (git(checkout, ['merge-base', '--is-ancestor', sha, head]).status !== 0) return null;
    const d = git(checkout, ['diff', '--name-only', sha, head]);
    return d.status === 0 ? d.stdout.split(/\r?\n/).filter(Boolean) : null;
  };
  const section = checksSection(planBody);
  return { head, ...checkState(checksOf(dir, slice), { planned: section !== null, head, changedSince, count: countChecks(section), optionalOk: /\boptional\b/i.test(section ?? '') }) };
}

/** One line of a check. */
export function checkLine(c) {
  return `${c.name}: ${c.result}${c.required === false ? ' (optional)' : ''}${c.sha ? ` at ${c.sha.slice(0, 8)}` : ''}${c.proof ? ` (${c.proof.by === 'job' ? `job ${c.proof.id}` : 'run by wf'}, exit ${c.proof.exit})` : ''}${c.carried ? ` (carried from ${c.carried.base.slice(0, 8)}, proof ${c.carried.job ?? c.carried.log})` : ''}${c.note ? ` — ${c.note}` : ''}`;
}

/** The lines of the brief of a verify: the checks that the implement left not met. */
export function unmetLines(dir, slice) {
  return checksOf(dir, slice).filter((c) => c.result === 'not-met').map((c) => `- ${checkLine(c)}`);
}
