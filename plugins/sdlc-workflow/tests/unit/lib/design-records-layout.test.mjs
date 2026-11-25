// The layout of the design records that two computers can share: a comment is a new event file,
// never a rewrite, and the failures of each screen are a file of that screen. The old layout
// (one comments file per screen, one checks.json) still reads.
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { commentEventsDir, commentsPath, designRecordsDir, itemChecksPath, readChecks, readComments, writeChecks } from '../../../lib/design-records.mjs';

const project = () => { const root = mkdtempSync(join(tmpdir(), 'design-layout-')); mkdirSync(join(root, '.ai', 'workflows'), { recursive: true }); return root; };
const put = (file, value) => { mkdirSync(join(file, '..'), { recursive: true }); writeFileSync(file, JSON.stringify(value)); };

test('the events fold over the old comments file, in the order of their names', () => {
  const root = project();
  try {
    put(commentsPath(root, 'home'), { screen: 'home', threads: [{ id: 'old', open: true, comments: [{ id: 'c0', text: 'from before' }] }] });
    const ev = (name, e) => put(join(commentEventsDir(root, 'home'), name), e);
    // Two computers at the same millisecond: their names differ by the random part.
    ev('20261125T100000000Z-1-aaaa.json', { kind: 'thread', thread: 't1', at: 'a', anchor: { state: 'default' } });
    ev('20261125T100000000Z-2-aaaa.json', { kind: 'comment', thread: 't1', id: 'c1', at: 'a', author: 'p', text: 'first' });
    ev('20261125T100000000Z-1-bbbb.json', { kind: 'comment', thread: 'old', id: 'c2', at: 'a', author: 'q', text: 'reply' });
    ev('20261125T100001000Z-1-cccc.json', { kind: 'resolve', thread: 't1', at: 'b' });
    ev('20261125T100002000Z-1-dddd.json', { kind: 'reopen', thread: 't1', at: 'c' });
    ev('20261125T100003000Z-1-eeee.json', { kind: 'comment', thread: 'nosuch', id: 'x', text: 'lost' });
    ev('20261125T100004000Z-1-ffff.json', 'not an object');
    const { threads } = readComments(root, 'home');
    assert.deepEqual(threads.map((t) => [t.id, t.open, t.comments.map((c) => c.text)]), [['old', true, ['from before', 'reply']], ['t1', true, ['first']]]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a check run writes the failures of each screen to that screen, and reads back whole', () => {
  const root = project();
  try {
    const run = { at: '2026-11-25T10:00:00Z', ran: true, screens: ['home', 'pay'], passed: false, library: [], truncated: {}, notices: [] };
    const failures = [{ screen: 'pay', check: 'token', message: 'a' }, { screen: 'home', check: 'fit', message: 'b' }, { check: 'loose', message: 'c' }];
    writeChecks(root, { ...run, failures });
    const back = readChecks(root);
    assert.deepEqual(back.failures.map((f) => f.message).sort(), ['a', 'b', 'c']);
    assert.equal(back.at, run.at);
    assert.equal('failures-in' in back, false);
    assert.deepEqual(readdirSync(join(designRecordsDir(root), 'items')).sort(), ['home', 'pay']);
    // A second run with the same failures and a new time writes the same screen files.
    const before = JSON.stringify(readChecks(root).failures);
    writeChecks(root, { ...run, at: '2026-11-25T11:00:00Z', failures });
    assert.equal(JSON.stringify(readChecks(root).failures), before);
    assert.doesNotMatch(readFileSync(itemChecksPath(root, 'pay'), 'utf8'), /2026/, 'a screen file holds no time');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a checks.json of the old layout still reads', () => {
  const root = project();
  try {
    put(join(designRecordsDir(root), 'checks.json'), { at: 'x', screens: ['home'], failures: [{ screen: 'home', message: 'old' }, 7] });
    assert.deepEqual(readChecks(root).failures, [{ screen: 'home', message: 'old' }]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
