// A call with a wrong field teaches the right one: the context fields slug and json run without
// a warning on an op that takes neither; a near name or a synonym names its field; and the error
// carries the corrected call, with a missing positional as <name>. No process runs here.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { closestField, commandOf } from '../../lib/ops/invoke.mjs';

test('slug and json on an op without them: it runs without them, and says so', () => {
  const c = commandOf('profile show', { slug: 'demo' }, '/r');
  assert.ok(!c.error, JSON.stringify(c.error));
  assert.deepEqual(c.warnings, ['profile show takes no slug: it ran without it']);
  assert.ok(!c.argv.includes('demo'));
});

test('a near name or a synonym names its field, and the error carries the corrected call', () => {
  const known = new Set(['root', 'slug', 'slice', 'reason', 'json']);
  assert.equal(closestField('reasn', known), 'reason');
  assert.equal(closestField('why', known), 'reason');
  assert.equal(closestField('colour', known), null);
  const typo = commandOf('slice drop', { slug: 'demo', slice: 's5', reasn: 'merged' }, '/r');
  assert.match(typo.error.message, /did you mean reason for reasn\?/);
  assert.deepEqual(typo.error.call, { op: 'slice drop', fields: { slug: 'demo', slice: 's5', reason: 'merged' } });
  const synonym = commandOf('record get', { slug: 'demo', record: 'index' }, '/r');
  assert.deepEqual(synonym.error.call.fields, { slug: 'demo', name: 'index' });
  const missing = commandOf('step done', { slug: 'demo', slice: 's3', nn: 3, colour: 'red' }, '/r');
  assert.equal(missing.error.call.fields.n, 3, 'nn is n');
  assert.ok(!('colour' in missing.error.call.fields), 'a name with no near field is left out');
});
