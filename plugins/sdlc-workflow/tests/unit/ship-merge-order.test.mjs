// The merge method that ship picks when the plan names none: a merge commit first, then a
// rebase, then a squash. A linear-history rule rules out a merge commit.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MERGE_METHODS, mergeCommand, shipFacts } from '../../lib/last-mile.mjs';

/** A runner that answers gh from fixed facts and fails every other call. */
function fakeRun({ merge = true, squash = true, rebase = true, rules = [], protection = null } = {}) {
  return (cmd, args) => {
    if (cmd !== 'gh') return { status: 1, stdout: '', stderr: 'no git here' };
    if (args[0] === 'repo' && args[1] === 'view') {
      return { status: 0, stdout: JSON.stringify({ nameWithOwner: 'o/r', defaultBranchRef: { name: 'main' }, mergeCommitAllowed: merge, squashMergeAllowed: squash, rebaseMergeAllowed: rebase, deleteBranchOnMerge: false }), stderr: '' };
    }
    if (args[0] === 'api' && /\/rules\/branches\//.test(args[1])) return { status: 0, stdout: JSON.stringify(rules), stderr: '' };
    if (args[0] === 'api' && /\/protection$/.test(args[1])) return protection ? { status: 0, stdout: JSON.stringify(protection), stderr: '' } : { status: 1, stdout: '', stderr: 'not protected' };
    return { status: 1, stdout: '', stderr: 'unknown call' };
  };
}

const facts = (opts, plan = {}) => shipFacts('.', 'main', { run: fakeRun(opts), plan });

test('the order of the methods is merge, rebase, squash', () => {
  assert.deepEqual([...MERGE_METHODS], ['merge', 'rebase', 'squash']);
});

test('with no plan method, ship merges by a merge commit when the repo allows every method', () => {
  const f = facts({});
  assert.deepEqual([f.method, f.allowed], ['merge', ['merge', 'rebase', 'squash']]);
  assert.equal(mergeCommand(f, 7), 'gh pr merge 7 --merge');
});

test('a repo that forbids a merge commit falls to rebase, then to squash', () => {
  assert.equal(facts({ merge: false }).method, 'rebase');
  assert.equal(facts({ merge: false, rebase: false }).method, 'squash');
});

test('a linear-history ruleset rules out a merge commit: the method is rebase', () => {
  const f = facts({ rules: [{ type: 'required_linear_history' }] });
  assert.deepEqual([f.linear, f.method, f.allowed], [true, 'rebase', ['rebase', 'squash']]);
  assert.equal(facts({ rebase: false, rules: [{ type: 'required_linear_history' }] }).method, 'squash');
});

test('classic protection with linear history rules out a merge commit too, even when the plan names it', () => {
  const f = facts({ protection: { required_linear_history: { enabled: true } } }, { governance: { merge: { method: 'merge' } } });
  assert.deepEqual([f.linear, f.method, f.planMethod, f.planMethodAllowed], [true, 'rebase', 'merge', false]);
});

test('the plan method still wins when the repo allows it', () => {
  assert.equal(facts({}, { governance: { merge: { method: 'squash' } } }).method, 'squash');
  assert.equal(facts({}, { merge: { method: 'rebase' } }).method, 'rebase');
});
