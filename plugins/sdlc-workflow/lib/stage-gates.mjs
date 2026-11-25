// The facts that code checks before a stage ends (`wf.mjs record stage-done`).
//
// A stage says in its record what it found. These gates compare that record with facts that the
// stage cannot write by its word: the commit that the checkout is on, the results of the slice
// checks that wf saw, and the entries of the decision store.
import { spawnSync } from 'node:child_process';
import { decisionsOf, liveDecisions } from './decisions.mjs';
import { INDEX_NAME, frontmatterOfDoc } from './records.mjs';
import { isProse, sliceCheckState } from './slice-checks.mjs';
import { stageFileOf } from './stage-done.mjs';

const git = (root, args) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true });
const list = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);

/**
 * What blocks the end of a verify of a slice.
 *
 * - A `pass` holds only for the code that the checkout is on: `verified-head` names a commit, and
 *   no code changed after it. Each slice check of the plan is met on that code.
 * - An accept of failing items names who accepted, and the decision store holds that accept.
 *
 * @returns {{ blocking: string[], fix: string }}
 */
export function verifyGate(dir, slice, { checkout, planBody = '' }) {
  const index = frontmatterOfDoc(dir, INDEX_NAME) ?? {};
  const verify = frontmatterOfDoc(dir, stageFileOf(dir, '06-verify', slice, index));
  const blocking = [];
  if (!verify) return { blocking, fix: '' };
  const fixes = [];
  if (String(verify.result ?? '') === 'pass') {
    const head = git(checkout, ['rev-parse', 'HEAD']);
    const vh = String(verify['verified-head'] ?? '').trim();
    if (head.status === 0) {
      const tip = head.stdout.trim();
      const at = vh ? git(checkout, ['rev-parse', '--verify', '--quiet', `${vh}^{commit}`]) : null;
      if (!vh) blocking.push('the record says pass and names no verified-head');
      else if (at.status !== 0 || git(checkout, ['merge-base', '--is-ancestor', at.stdout.trim(), tip]).status !== 0) blocking.push(`verified-head ${vh.slice(0, 8)} is not a commit of this branch`);
      else {
        const d = git(checkout, ['diff', '--name-only', at.stdout.trim(), tip]);
        const code = d.status === 0 ? d.stdout.split(/\r?\n/).filter(Boolean).filter((f) => !isProse(f)) : ['(git cannot compare the commits)'];
        if (code.length) blocking.push(`code changed after verified-head ${vh.slice(0, 8)} (${code.slice(0, 3).join(', ')}${code.length > 3 ? `, and ${code.length - 3} more` : ''})`);
      }
      if (blocking.length) fixes.push('Run the checks of the slice on the code as it is now, then write verified-head with the HEAD sha.');
    }
    const st = sliceCheckState(dir, slice, { checkout, planBody });
    blocking.push(...st.blocking);
    for (const c of st.unmet) blocking.push(`the check "${c.name}" is not met`);
    if (st.blocking.length || st.unmet.length) fixes.push('Run each slice check that is named through wf (step check --run "<command>", or talk job and step check --job <id>). When a check still fails, the result is not pass: write partial or fail, or record the accept.');
  }
  const by = String(verify['accepted-by'] ?? '').trim();
  const items = list(verify['accepted-items']);
  if (by || items.length) {
    const live = liveDecisions(decisionsOf(dir));
    const forSlice = (e) => !e.scope?.slice || e.scope.slice === slice;
    let held = false;
    if (by === 'delegate') held = live.some((e) => String(e.key ?? '').startsWith(`verify-accept:${slice}:`));
    else if (by === 'person') held = live.some((e) => e.by === 'person' && e.kind !== 'steer' && e.kind !== 'note' && forSlice(e));
    else if (/^D-\d+$/.test(by)) held = live.some((e) => e.id === by);
    if (!by) blocking.push('the record lists accepted items and does not say who accepted them');
    else if (!held) blocking.push(`the record says that ${by === 'person' ? 'the person' : by === 'delegate' ? 'a delegate' : by} accepted failing items, and the decision store holds no such accept for ${slice}`);
    if (!by || !held) fixes.push('An accept of the person is an answer that the session recorded with decide add --by person: when there is none, hold the question with decide hold. An accept of a delegate is one decide add --by delegate --key verify-accept:<slice>:<item> for each item.');
  }
  return { blocking, fix: fixes.join(' ') };
}
