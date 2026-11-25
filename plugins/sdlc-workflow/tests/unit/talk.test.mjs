// The talk of a run: messages between the agents of a run, receipts, pings, claims and the wait.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  FALLBACK_MS, PING_MS, QUEUE_STALE_MS, claim, close, dueOf, inboxOf, isFor, markRead, messagesOf, ping, post,
  readTalk, release, renew, resourcesOf, threadsOf, waitTalk,
} from '../../lib/talk.mjs';

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sdlc-talk-'));
  return { dir, done: () => rmSync(dir, { recursive: true, force: true }) };
}
const T0 = Date.parse('2026-11-25T12:00:00Z');
const min = (n) => T0 + n * 60 * 1000;

test('a message reaches the slice, the stage of the slice, or all, and never its own sender', () => {
  assert.equal(isFor('implement:api', ['api'], 'verify:core'), true);
  assert.equal(isFor('implement:api', ['implement:api'], 'verify:core'), true);
  assert.equal(isFor('verify:api', ['implement:api'], 'verify:core'), false);
  assert.equal(isFor('implement:api', ['all'], 'driver'), true);
  assert.equal(isFor('driver', ['all'], 'driver'), false);
  assert.equal(isFor('session', ['api'], 'driver'), false);
});

test('a post, its receipt and its reply: the sender sees the reply, and a second read finds nothing new', () => {
  const f = fixture();
  try {
    const a = post(f.dir, { by: 'verify:core', to: 'api', kind: 'handover', text: 'fix in abc123', refs: 'abc123,src/a.rs' }, { now: T0 }).entry;
    assert.equal(a.id, 'T-1');
    assert.deepEqual(a.refs, ['abc123', 'src/a.rs']);
    const inbox = inboxOf(readTalk(f.dir), 'implement:api');
    assert.deepEqual(inbox.map((m) => m.id), ['T-1']);
    markRead(f.dir, 'implement:api', ['T-1'], { now: min(1) });
    assert.equal(markRead(f.dir, 'implement:api', ['T-1'], { now: min(2) }), null, 'a second receipt writes nothing');
    const r = post(f.dir, { by: 'implement:api', re: 'T-1', text: 'merged at step 5' }, { now: min(3) }).entry;
    assert.deepEqual(r.to, ['verify:core'], 'a reply goes to the sender');
    assert.deepEqual(inboxOf(readTalk(f.dir), 'verify:core').map((m) => m.id), [r.id]);
    assert.deepEqual(inboxOf(readTalk(f.dir), 'implement:api', { after: 'T-1' }), []);
    assert.deepEqual(messagesOf(readTalk(f.dir)).get('T-1').readBy, ['implement:api']);
    assert.equal(threadsOf(readTalk(f.dir))[0].length, 2);
  } finally { f.done(); }
});

test('the person never posts, a question for the person is refused, and a done slice reads no message', () => {
  const f = fixture();
  try {
    assert.throws(() => post(f.dir, { by: 'person', to: 'all', text: 'x' }), /the person does not post here/);
    assert.throws(() => post(f.dir, { by: 'verify api', to: 'all', text: 'x' }), /--as must be/);
    assert.throws(() => post(f.dir, { by: 'session', to: 'person', text: 'x' }), /not a message/);
    assert.throws(() => post(f.dir, { by: 'session', to: 'api', text: 'x' }, { statusOf: () => 'complete' }), /is complete/);
    assert.throws(() => post(f.dir, { by: 'session', to: 'api', text: 'x', wantsReply: true }), /needs --fallback/);
    assert.throws(() => post(f.dir, { by: 'session', re: 'T-9', text: 'x' }), /no message T-9/);
    assert.equal(readTalk(f.dir).length, 0, 'a refused post writes nothing');
    // A slice that has not started takes the message: it reads it when it starts.
    post(f.dir, { by: 'implement:api', to: 'later-slice', text: 'the cache key moved' }, { statusOf: () => 'pending' });
    assert.equal(inboxOf(readTalk(f.dir), 'plan:later-slice').length, 1);
  } finally { f.done(); }
});

test('a post with a key lands once', () => {
  const f = fixture();
  try {
    const a = post(f.dir, { by: 'verify:core', to: 'api', text: 'fix', key: 'fix-abc' });
    const b = post(f.dir, { by: 'verify:core', to: 'api', text: 'fix', key: 'fix-abc' });
    assert.equal(a.again, false);
    assert.equal(b.again, true);
    assert.equal(b.entry.id, a.entry.id);
    assert.equal(readTalk(f.dir).length, 1);
  } finally { f.done(); }
});

test('a closed thread leaves the inbox, and only its sender, its receiver or the session closes it', () => {
  const f = fixture();
  try {
    post(f.dir, { by: 'verify:core', to: 'api', text: 'fix' });
    assert.throws(() => close(f.dir, 'plan:other', 'T-1', 'x'), /not a message of plan:other/);
    close(f.dir, 'implement:api', 'T-1', 'merged');
    assert.deepEqual(inboxOf(readTalk(f.dir), 'implement:api'), []);
    assert.equal(inboxOf(readTalk(f.dir), 'implement:api', { all: true }).length, 1);
    assert.equal(threadsOf(readTalk(f.dir), { open: true }).length, 0);
  } finally { f.done(); }
});

test('a message that wants a reply: a ping is due at the first limit, the fallback at the second, and a reply ends both', () => {
  const f = fixture();
  try {
    post(f.dir, { by: 'implement:api', to: 'verify:core', text: 'more fixes coming?', wantsReply: true, fallback: 'go on with the regeneration' }, { now: T0 });
    const at = (ms) => dueOf(readTalk(f.dir), 'implement:api', ms).map((d) => d.due);
    assert.deepEqual(at(T0 + PING_MS - 1000), [null]);
    assert.deepEqual(at(T0 + PING_MS), ['ping']);
    ping(f.dir, 'talk', 'T-1', { now: T0 + PING_MS });
    assert.deepEqual(at(T0 + PING_MS + 1000), [null], 'one ping, not one per look');
    assert.deepEqual(at(T0 + FALLBACK_MS), ['fallback']);
    post(f.dir, { by: 'verify:core', re: 'T-1', text: 'one more, in 5 minutes' }, { now: T0 + FALLBACK_MS });
    assert.deepEqual(at(T0 + FALLBACK_MS + 1000), [], 'a reply of the receiver ends the wait');
  } finally { f.done(); }
});

test('a receipt with no reply stops the ping and not the fallback', () => {
  const f = fixture();
  try {
    post(f.dir, { by: 'implement:api', to: 'verify:core', text: 'q', wantsReply: true, fallback: 'go on' }, { now: T0 });
    markRead(f.dir, 'verify:core', ['T-1'], { now: min(1) });
    assert.deepEqual(dueOf(readTalk(f.dir), 'implement:api', T0 + PING_MS).map((d) => d.due), [null]);
    assert.deepEqual(dueOf(readTalk(f.dir), 'implement:api', T0 + FALLBACK_MS).map((d) => d.due), ['fallback']);
  } finally { f.done(); }
});

test('a claim: one holder, the queue in order, a lease that runs out, and a late write that is refused', () => {
  const f = fixture();
  try {
    const a = claim(f.dir, 'verify:core', 'test-machine', { leaseMs: 5 * 60 * 1000, now: T0 });
    assert.equal(a.held, true);
    assert.equal(a.epoch, 1);
    const b = claim(f.dir, 'implement:api', 'test-machine', { now: min(1) });
    assert.equal(b.held, false);
    assert.equal(b.holder, 'verify:core');
    assert.equal(claim(f.dir, 'plan:web', 'test-machine', { now: min(2) }).held, false);
    renew(f.dir, 'verify:core', 'test-machine', { epoch: 1, leaseMs: 5 * 60 * 1000, now: min(3) });
    assert.equal(resourcesOf(readTalk(f.dir), min(4)).find((r) => r.resource === 'test-machine').holder, 'verify:core');
    // The lease runs out at minute 8. The second in line does not jump the first.
    claim(f.dir, 'implement:api', 'test-machine', { now: min(7.5) });
    assert.equal(claim(f.dir, 'plan:web', 'test-machine', { now: min(8.5) }).held, false, 'the first in line is still asking');
    const c = claim(f.dir, 'implement:api', 'test-machine', { now: min(8.6) });
    assert.equal(c.held, true);
    assert.equal(c.epoch, 2);
    assert.throws(() => renew(f.dir, 'verify:core', 'test-machine', { epoch: 1, now: min(9) }), /does not hold test-machine/);
    assert.throws(() => release(f.dir, 'verify:core', 'test-machine', { epoch: 1, now: min(9) }), /does not hold test-machine/);
    release(f.dir, 'implement:api', 'test-machine', { epoch: 2, now: min(10) });
    assert.equal(claim(f.dir, 'plan:web', 'test-machine', { now: min(10.1) }).held, true);
  } finally { f.done(); }
});

test('a waiter that stops asking leaves the queue', () => {
  const f = fixture();
  try {
    claim(f.dir, 'verify:core', 'device', { leaseMs: 60 * 1000, now: T0 });
    claim(f.dir, 'implement:api', 'device', { now: min(0.5) });
    // The first waiter is gone. After the stale time the next one takes the free resource.
    const late = min(0.5) + QUEUE_STALE_MS + 1000;
    assert.equal(claim(f.dir, 'plan:web', 'device', { now: late }).held, true);
  } finally { f.done(); }
});

test('the wait returns on a message, on a claim, on the check of the caller, on the fallback, and on the time', () => {
  const f = fixture();
  try {
    let t = T0;
    const clock = { now: () => t, sleep: (ms) => { t += ms; } };
    assert.equal(waitTalk(f.dir, 'implement:api', { callMs: 10_000, ...clock }).state, 'waiting');

    post(f.dir, { by: 'verify:core', to: 'api', text: 'fix' }, { now: t });
    const m = waitTalk(f.dir, 'implement:api', { callMs: 10_000, ...clock });
    assert.equal(m.state, 'message');
    assert.equal(m.messages[0].id, 'T-1');
    assert.equal(waitTalk(f.dir, 'implement:api', { after: 'T-1', callMs: 4000, ...clock }).state, 'waiting', 'the cursor moves past it');

    // A ping of an old message is news again.
    const p = ping(f.dir, 'session', 'T-1', { now: t });
    const again = waitTalk(f.dir, 'implement:api', { after: 'T-1', callMs: 4000, ...clock });
    assert.equal(again.state, 'message');
    assert.equal(again.pings[0].of, 'T-1');
    assert.equal(waitTalk(f.dir, 'implement:api', { after: p.id, callMs: 4000, ...clock }).state, 'waiting');

    let polls = 0;
    const d = waitTalk(f.dir, 'implement:api', { after: p.id, done: () => (++polls >= 3 ? { exit: 0 } : null), callMs: 60_000, ...clock });
    assert.equal(d.state, 'done');
    assert.deepEqual(d.done, { exit: 0 });

    const c = waitTalk(f.dir, 'implement:api', { after: p.id, resource: 'device', callMs: 4000, ...clock });
    assert.equal(c.state, 'claimed');
    assert.equal(c.claim.epoch, 1);

    // The sender's own wait writes the ping, then returns the fallback.
    post(f.dir, { by: 'verify:core', to: 'api', text: 'q', wantsReply: true, fallback: 'go on' }, { now: t });
    const w = waitTalk(f.dir, 'verify:core', { callMs: FALLBACK_MS + 60_000, pollMs: 30_000, ...clock });
    assert.equal(w.state, 'fallback');
    assert.equal(w.fallback[0].fallback, 'go on');
    assert.equal(readTalk(f.dir).filter((e) => e.ev === 'ping' && e.by === 'talk').length, 1);
    assert.deepEqual(dueOf(readTalk(f.dir), 'verify:core', t), [], 'the fallback is taken once');
  } finally { f.done(); }
});
