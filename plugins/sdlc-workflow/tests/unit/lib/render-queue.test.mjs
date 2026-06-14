// tests/unit/lib/render-queue.test.mjs
//
// Unit coverage for the durable render queue (RENDER-DISPATCH-PLAN). The queue
// primitives run against real tmp dirs (the durability + Windows-safe temp+rename
// behaviour is the point); the drain controller is driven with an injected fake
// engine (and, in one integration test, a real heal controller with an injected
// spawn) so nothing forks a renderer.

import { EventEmitter } from 'node:events';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { deepEqual, equal, ok } from 'node:assert/strict';

import {
  enqueue, readPending, coalesce, renderArgsForPlan,
  claim, ack, unclaim, fail, reclaimOrphans,
  writeStatus, readStatus, countPending, listFailed,
  queueDir, errorLogPath, createRenderQueueDrainer,
  RENDER_QUEUE_DEFAULTS, QUEUE_VERSION,
} from '../../../lib/render-queue.mjs';
import { createHealController } from '../../../lib/heal-render.mjs';

/* ───────────────────────── helpers ───────────────────────── */

function mkRepo() {
  const repoRoot = mkdtempSync(join(tmpdir(), 'rq-repo-'));
  const viewDir = join(repoRoot, '.ai', '_view');
  mkdirSync(viewDir, { recursive: true });
  return { repoRoot, viewDir, entry: { id: 'local', repoRoot, viewDir } };
}

// A controllable fake bounded engine mirroring heal.submit / heal.isBusy: one
// render per id at a time, manually settled by the test.
function fakeEngine() {
  const busy = new Set();
  const calls = [];
  const settlers = [];
  function submit(entry, { args, label, onSettled }) {
    if (busy.has(entry.id)) return { action: 'pending' };
    busy.add(entry.id);
    calls.push({ entry, args, label });
    settlers.push((code) => { busy.delete(entry.id); onSettled?.(code); });
    return { action: 'enqueued' };
  }
  const isBusy = (id) => busy.has(id);
  // settle the i-th accepted render
  const settle = (i, code) => settlers[i](code);
  return { submit, isBusy, calls, settle, busy };
}

let clockT = 1_700_000_000_000;
const clock = () => clockT;

/* ───────────────────────── enqueue / readPending ───────────────────────── */

test('rq: enqueue writes a durable, well-formed record under .ai/_view/.render-queue', () => {
  const { viewDir, repoRoot } = mkRepo();
  const r = enqueue(viewDir, {
    repoRoot, kind: 'incremental', bucket: 'acct-export',
    paths: ['.ai/workflows/acct-export/04-plan.md'],
  }, { now: clock });
  ok(r.ok, 'enqueue reports ok');
  ok(existsSync(join(queueDir(viewDir), r.file)), 'the record file exists');

  const pending = readPending(viewDir);
  equal(pending.length, 1);
  const rec = pending[0].record;
  equal(rec.v, QUEUE_VERSION);
  equal(rec.kind, 'incremental');
  equal(rec.bucket, 'acct-export');
  equal(rec.repoRoot, repoRoot);
  equal(rec.viewDir, viewDir);
  equal(rec.enqueuedBy.host, 'claude', 'default host provenance');
  deepEqual(rec.paths, ['.ai/workflows/acct-export/04-plan.md']);
});

test('rq: enqueue never throws on a bad viewDir; returns ok:false', () => {
  const r = enqueue('', { kind: 'incremental', bucket: 'x' });
  equal(r.ok, false);
});

test('rq: readPending skips a torn record and returns the rest in chronological order', () => {
  const { viewDir, repoRoot } = mkRepo();
  enqueue(viewDir, { repoRoot, bucket: 'a' }, { now: () => 1000 });
  enqueue(viewDir, { repoRoot, bucket: 'b' }, { now: () => 2000 });
  // a torn file in the queue dir must be ignored, not crash the reader
  writeFileSync(join(queueDir(viewDir), '0000000000999-torn.json'), 'not json {');
  const pending = readPending(viewDir);
  equal(pending.length, 2, 'torn file skipped');
  deepEqual(pending.map((p) => p.record.bucket), ['a', 'b'], 'chronological by epoch-prefixed name');
});

test('rq: the .status.json sidecar is not mistaken for a request record', () => {
  const { viewDir } = mkRepo();
  writeStatus(viewDir, { pendingCount: 0 }, { now: clock });
  equal(countPending(viewDir), 0, '.status.json is excluded from the pending count');
  equal(readPending(viewDir).length, 0);
});

test('rq: enqueue evicts the oldest beyond maxPending and logs the drop', () => {
  const { viewDir, repoRoot } = mkRepo();
  for (let i = 0; i < 5; i++) enqueue(viewDir, { repoRoot, bucket: `b${i}` }, { now: () => 1000 + i });
  // cap at 3 → the 6th enqueue must bring it back to ≤3
  enqueue(viewDir, { repoRoot, bucket: 'b5' }, { now: () => 2000, maxPending: 3 });
  ok(countPending(viewDir) <= 3, 'queue trimmed to the cap');
  ok(existsSync(errorLogPath(viewDir)), 'the eviction is logged to .render-errors.log');
});

/* ───────────────────────── coalesce / args ───────────────────────── */

test('rq: coalesce — one bucket → that bucket; many → bootstrap; bootstrap wins', () => {
  equal(coalesce([]), null);
  deepEqual(coalesce([{ kind: 'incremental', bucket: 'a' }]), { kind: 'incremental', bucket: 'a' });
  deepEqual(coalesce([{ kind: 'offpipeline', bucket: 'simplify' }]), { kind: 'offpipeline', bucket: 'simplify' });
  deepEqual(
    coalesce([{ kind: 'incremental', bucket: 'a' }, { kind: 'incremental', bucket: 'b' }]),
    { kind: 'bootstrap', bucket: '__bootstrap__' },
    'two distinct buckets collapse to a whole-repo pass',
  );
  deepEqual(
    coalesce([{ kind: 'incremental', bucket: 'a' }, { kind: 'bootstrap', bucket: '__bootstrap__' }]),
    { kind: 'bootstrap', bucket: '__bootstrap__' },
    'a bootstrap request supersedes incrementals',
  );
});

test('rq: renderArgsForPlan maps plan → render-sunflower argv', () => {
  deepEqual(
    renderArgsForPlan({ kind: 'incremental', bucket: 'acct' }, { viewDir: '/v', pluginRoot: '/p' }),
    ['--only', 'acct/**', '--view', '/v', '--plugin-root', '/p'],
  );
  deepEqual(
    renderArgsForPlan({ kind: 'bootstrap', bucket: '__bootstrap__' }, { viewDir: '/v', pluginRoot: '/p' }),
    ['--bootstrap', '--view', '/v', '--plugin-root', '/p'],
  );
  deepEqual(
    renderArgsForPlan(null, { viewDir: '/v' }),
    ['--bootstrap', '--view', '/v'],
    'a null plan defaults to a whole-repo bootstrap; --plugin-root omitted when absent',
  );
});

/* ───────────────────────── claim / ack / unclaim / fail / reclaim ───────────────────────── */

test('rq: claim moves records into .processing; ack deletes; unclaim restores', () => {
  const { viewDir, repoRoot } = mkRepo();
  enqueue(viewDir, { repoRoot, bucket: 'a' }, { now: clock });
  const names = readPending(viewDir).map((p) => p.name);
  const claimed = claim(viewDir, names);
  equal(claimed.length, 1);
  equal(readPending(viewDir).length, 0, 'claimed file no longer pending');
  ok(existsSync(join(queueDir(viewDir), '.processing', names[0])), 'lives in .processing');

  unclaim(viewDir, claimed);
  equal(readPending(viewDir).length, 1, 'unclaim returns it to pending');

  const claimed2 = claim(viewDir, readPending(viewDir).map((p) => p.name));
  ack(viewDir, claimed2);
  equal(readPending(viewDir).length, 0, 'ack removes it for good');
  equal(readdirSync(join(queueDir(viewDir), '.processing')).filter((n) => n.endsWith('.json')).length, 0);
});

test('rq: fail increments attempts and re-queues; past the ceiling it moves to .failed', () => {
  const { viewDir, repoRoot } = mkRepo();
  enqueue(viewDir, { repoRoot, bucket: 'a' }, { now: clock });

  // attempt 1 fails (maxAttempts 2) → back to pending with attempts:1
  let claimed = claim(viewDir, readPending(viewDir).map((p) => p.name));
  fail(viewDir, claimed, { maxAttempts: 2, now: clock, error: 'render exited 1' });
  let pending = readPending(viewDir);
  equal(pending.length, 1, 'requeued for retry');
  equal(pending[0].record.attempts, 1);

  // attempt 2 hits the ceiling → .failed, no longer pending
  claimed = claim(viewDir, pending.map((p) => p.name));
  fail(viewDir, claimed, { maxAttempts: 2, now: clock, error: 'render exited 1' });
  equal(readPending(viewDir).length, 0, 'no more retries past the ceiling');
  equal(listFailed(viewDir).length, 1, 'surfaced in .failed/');
});

test('rq: reclaimOrphans returns only STALE .processing files to pending', () => {
  const { viewDir, repoRoot } = mkRepo();
  enqueue(viewDir, { repoRoot, bucket: 'a' }, { now: clock });
  const claimed = claim(viewDir, readPending(viewDir).map((p) => p.name));
  ok(claimed.length === 1);

  // reclaimOrphans ages a claim by its REAL on-disk mtime, so the test clock
  // must be real-time-based (not the fake epoch used for record timestamps).
  // fresh claim (age ≪ ttl) is not reclaimed
  equal(reclaimOrphans(viewDir, { ttlMs: 60000 }), 0, 'fresh claim left alone');
  equal(readPending(viewDir).length, 0);

  // advance now past the TTL relative to the real mtime → reclaimed back to pending
  const reclaimed = reclaimOrphans(viewDir, { ttlMs: 60000, now: () => Date.now() + 120000 });
  equal(reclaimed, 1, 'stale claim reclaimed');
  equal(readPending(viewDir).length, 1, 'available to drain again');
});

test('rq: writeStatus / readStatus roundtrip + stamps updatedAt', () => {
  const { viewDir } = mkRepo();
  writeStatus(viewDir, { pendingCount: 3, lastError: null, hubLastSeenAt: 'X' }, { now: clock });
  const s = readStatus(viewDir);
  equal(s.pendingCount, 3);
  equal(s.hubLastSeenAt, 'X');
  ok(typeof s.updatedAt === 'string');
});

/* ───────────────────────── drain controller ───────────────────────── */

function mkDrainer(engine, over = {}) {
  return createRenderQueueDrainer({
    submit: engine.submit, isBusy: engine.isBusy, pluginRoot: '/plugin', now: clock, ...over,
  });
}

test('rq drain: claims + coalesces a burst into ONE render, acks on success, empties the queue', () => {
  const { viewDir, repoRoot, entry } = mkRepo();
  for (let i = 0; i < 4; i++) {
    enqueue(viewDir, { repoRoot, kind: 'incremental', bucket: 'acct' }, { now: () => clockT + i });
  }
  const engine = fakeEngine();
  const drainer = mkDrainer(engine);

  const res = drainer.drainEntry(entry);
  equal(res.action, 'submitted');
  equal(engine.calls.length, 1, 'a burst of 4 writes to one bucket renders once');
  deepEqual(engine.calls[0].args.slice(0, 2), ['--only', 'acct/**']);
  equal(readPending(viewDir).length, 0, 'all 4 claimed out of pending');

  engine.settle(0, 0);   // render succeeds
  equal(readPending(viewDir).length, 0, 'acked — nothing requeued');
  equal(countPending(viewDir), 0);
});

test('rq drain: a bootstrap request collapses the repo to one whole-repo render', () => {
  const { viewDir, repoRoot, entry } = mkRepo();
  enqueue(viewDir, { repoRoot, kind: 'incremental', bucket: 'a' }, { now: () => clockT });
  enqueue(viewDir, { repoRoot, kind: 'bootstrap', bucket: '__bootstrap__' }, { now: () => clockT + 1 });
  const engine = fakeEngine();
  mkDrainer(engine).drainEntry(entry);
  equal(engine.calls.length, 1);
  deepEqual(engine.calls[0].args.slice(0, 1), ['--bootstrap']);
});

test('rq drain: a busy engine leaves the queue intact for the next tick (no churn)', () => {
  const { viewDir, repoRoot, entry } = mkRepo();
  enqueue(viewDir, { repoRoot, bucket: 'a' }, { now: clock });
  const engine = fakeEngine();
  engine.busy.add('local');   // engine already rendering this repo
  const res = mkDrainer(engine).drainEntry(entry);
  equal(res.action, 'busy');
  equal(engine.calls.length, 0, 'nothing submitted');
  equal(readPending(viewDir).length, 1, 'request still pending — not claimed away');
});

test('rq drain: a failing render requeues for retry, then surfaces .failed at the ceiling', () => {
  const { viewDir, repoRoot, entry } = mkRepo();
  enqueue(viewDir, { repoRoot, bucket: 'a' }, { now: clock });
  const engine = fakeEngine();
  const drainer = mkDrainer(engine, { maxAttempts: 2 });

  drainer.drainEntry(entry);
  engine.settle(0, 1);                       // render fails
  equal(readPending(viewDir).length, 1, 'requeued after the first failure');

  drainer.drainEntry(entry);
  engine.settle(1, 1);                       // fails again → ceiling
  equal(readPending(viewDir).length, 0);
  equal(listFailed(viewDir).length, 1, 'gives up into .failed/ at the ceiling');
});

test('rq drain: catchUp reclaims orphans then drains every entry', () => {
  // distinct ids — the bounded engine is per-id (real hub entries never collide)
  const a = mkRepo(); a.entry.id = 'a';
  const b = mkRepo(); b.entry.id = 'b';
  enqueue(a.viewDir, { repoRoot: a.repoRoot, bucket: 'x' }, { now: clock });
  enqueue(b.viewDir, { repoRoot: b.repoRoot, bucket: 'y' }, { now: clock });
  // strand repo a's request in .processing (a drain that died mid-render)
  const claimed = claim(a.viewDir, readPending(a.viewDir).map((p) => p.name));
  ok(claimed.length === 1);
  const engine = fakeEngine();
  // real-time-based clock so reclaimOrphans ages the orphan past its real mtime
  const drainer = createRenderQueueDrainer({
    submit: engine.submit, isBusy: engine.isBusy, pluginRoot: '/p',
    now: () => Date.now() + 10_000_000, orphanTtlMs: 60000,
  });
  drainer.catchUp([a.entry, b.entry]);
  // a's orphan was reclaimed and (with nothing else pending) drained; b drained.
  equal(engine.calls.length, 2, 'both repos drained at catch-up');
});

test('rq drain: snapshot reports per-repo pending counts and failed items', () => {
  const a = mkRepo();
  enqueue(a.viewDir, { repoRoot: a.repoRoot, bucket: 'x' }, { now: clock });
  enqueue(a.viewDir, { repoRoot: a.repoRoot, bucket: 'y' }, { now: clock });
  const engine = fakeEngine();
  const snap = mkDrainer(engine).snapshot([a.entry]);
  equal(snap.pending.local, 2);
  ok(Array.isArray(snap.failed));
  ok(typeof snap.lastDrainAt === 'string');
});

/* ───────────────── integration: real heal controller as the engine ───────────────── */

test('rq integration: a real heal controller renders a queued bucket and acks it', () => {
  const { viewDir, repoRoot, entry } = mkRepo();
  enqueue(viewDir, { repoRoot, kind: 'incremental', bucket: 'acct' }, { now: clock });

  // inject a manually-driveable child so nothing actually forks
  const children = [];
  const spawnRender = (script, args, opts) => { const c = new EventEmitter(); children.push({ c, args, opts }); return c; };
  const heal = createHealController({
    pluginRoot: '/plugin', pluginVersion: 'V1', healCfg: { heal: true }, spawnRender,
  });
  const drainer = createRenderQueueDrainer({
    submit: (e, s) => heal.submit(e, s), isBusy: (id) => heal.isBusy(id), pluginRoot: '/plugin', now: clock,
  });

  drainer.drainEntry(entry);
  equal(children.length, 1, 'the heal engine spawned the queued render');
  deepEqual(children[0].args.slice(0, 2), ['--only', 'acct/**']);
  equal(children[0].opts.cwd, repoRoot, 'cwd anchors the project');
  ok(heal.isBusy('local'), 'repo busy while rendering');

  children[0].c.emit('exit', 0);             // render completes
  ok(!heal.isBusy('local'), 'no longer busy after exit');
  equal(readPending(viewDir).length, 0, 'queue acked after a successful render');
});

test('rq integration: heal and queue never spawn concurrently for one repo', () => {
  const { viewDir, repoRoot, entry } = mkRepo();
  // make the view drift so heal wants to render
  writeFileSync(join(viewDir, '.last-render'), JSON.stringify({ version: 'OLD' }));
  enqueue(viewDir, { repoRoot, bucket: 'acct' }, { now: clock });

  const children = [];
  const spawnRender = (s, args) => { const c = new EventEmitter(); children.push({ c, args }); return c; };
  const heal = createHealController({ pluginRoot: '/p', pluginVersion: 'V1', healCfg: { heal: true, maxConcurrent: 2 }, spawnRender });
  const drainer = createRenderQueueDrainer({ submit: (e, s) => heal.submit(e, s), isBusy: (id) => heal.isBusy(id), pluginRoot: '/p', now: clock });

  heal.consider(entry);                      // heal claims the repo first
  equal(children.length, 1);
  const res = drainer.drainEntry(entry);     // queue must defer
  equal(res.action, 'busy', 'queue defers while heal renders the same repo');
  equal(children.length, 1, 'no concurrent second render for the repo');
  equal(readPending(viewDir).length, 1, 'the queued request waits');
});

test('rq: RENDER_QUEUE_DEFAULTS are frozen sane values', () => {
  equal(RENDER_QUEUE_DEFAULTS.maxAttempts, 3);
  ok(RENDER_QUEUE_DEFAULTS.maxPending >= 1);
  ok(RENDER_QUEUE_DEFAULTS.orphanTtlMs > 0);
});
