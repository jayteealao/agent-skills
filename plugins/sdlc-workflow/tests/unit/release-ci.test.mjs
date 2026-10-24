// checkCi reads the last CI run of the release branch through an injected `gh`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCi, CI_WORKFLOW } from '../../scripts/release.mjs';

const ctx = (status, stdout, stderr = '') => ({ repoRoot: '.', branch: 'master', run: () => ({ status, stdout, stderr }) });
const run = (fields) => JSON.stringify([{ status: 'completed', conclusion: 'success', headSha: 'abcdef1234567890', url: 'https://ci/1', ...fields }]);

test('checkCi: green, red, running and no run yet', () => {
  assert.equal(checkCi(ctx(0, run({}))).ok, true);
  const red = checkCi(ctx(0, run({ conclusion: 'failure' })));
  assert.equal(red.ok, false);
  assert.match(red.reason, /failure on abcdef12/);
  assert.match(checkCi(ctx(0, run({ status: 'in_progress' }))).reason, /still running/);
  assert.deepEqual(checkCi(ctx(0, '[]')), { ok: true, reason: `no run of ${CI_WORKFLOW} on master yet` });
});

test('checkCi: a workflow that is not on the remote yet passes; any other gh error stops', () => {
  const missing = checkCi(ctx(1, '', `HTTP 404: workflow ${CI_WORKFLOW} not found on the default branch (https://api.github.com/x)`));
  assert.deepEqual(missing, { ok: true, reason: `${CI_WORKFLOW} is not on the remote yet` });
  const auth = checkCi(ctx(1, '', 'HTTP 401: Bad credentials'));
  assert.equal(auth.ok, false);
  assert.match(auth.reason, /gh cannot read CI: HTTP 401/);
  assert.match(checkCi(ctx(1, '', '')).reason, /gh is not installed/);
});
