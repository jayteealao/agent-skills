// The timeouts of the git calls in the records home: a push or a fetch of a large records repo
// must not be cut after 20 seconds, because on Windows the cut leaves the upload running and the
// next try starts the same upload again beside it.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { timeoutOf } from '../../../lib/records-sync.mjs';

test('a transfer runs far longer than a call that only asks the remote', () => {
  assert.equal(timeoutOf(['ls-remote', 'origin'], true), 20_000);
  assert.ok(timeoutOf(['push', '-q', 'origin', 'refs/heads/main:refs/heads/main'], true) >= 30 * 60_000);
  assert.ok(timeoutOf(['fetch', '-q', 'origin'], true) >= 30 * 60_000);
});

test('a local call has minutes, so git add of a large workflow folder is not cut', () => {
  assert.ok(timeoutOf(['add', '-A', '-f', '--', 'notes/w1'], false) >= 5 * 60_000);
});
