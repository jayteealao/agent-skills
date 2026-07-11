// tests/unit/lib/tray-protocol.test.mjs
//
// The stdio driver for the native systray helper (lib/tray-protocol.mjs), with
// the child process faked via the injectable `spawn` seam so nothing spawns a
// real binary. The focus is the restart() path: it must swap the helper WITHOUT
// firing the driver-level exit handlers (which call process.exit), while a
// genuine helper death still propagates.

import { test } from 'node:test';
import { equal, ok } from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';

import { Tray } from '../../../lib/tray-protocol.mjs';

// A fake child process: EventEmitter for error/exit, PassThrough stdout the
// readline consumes, a stdin that records every written line, and a kill flag.
function makeFakeProc() {
  const proc = new EventEmitter();
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.writes = [];
  proc.stdin = { writable: true, write: (s) => { proc.writes.push(s); return true; }, end: () => {} };
  proc.killed = false;
  proc.kill = () => { proc.killed = true; };
  return proc;
}

// Hand out queued fake procs across successive spawns (start, then each restart).
function spawnFactory(procs) {
  let i = 0;
  return () => procs[i++];
}

const ready = (p) => p.stdout.write('{"type":"ready"}\n');
const lastWrite = (p) => (p.writes.length ? JSON.parse(p.writes[p.writes.length - 1]) : null);

test('start(): sends the initial menu as a bare object once the helper reports ready', async () => {
  const p = makeFakeProc();
  const tray = new Tray({ binPath: 'x', menu: { items: [{ title: 'A' }] }, spawn: () => p });
  const started = tray.start();
  ready(p);
  await started;
  const sent = JSON.parse(p.writes[0]);
  ok(Array.isArray(sent.items));
  equal(sent.items[0].title, 'A');
  ok(!('type' in sent));   // initial menu is bare, not an update-menu envelope
});

test('restart(): swaps the helper, renders the new menu, and does NOT fire the driver exit handler', async () => {
  const p1 = makeFakeProc();
  const p2 = makeFakeProc();
  let exits = 0;
  const tray = new Tray({ binPath: 'x', menu: { items: [{ title: 'down' }] }, spawn: spawnFactory([p1, p2]) });
  tray.onExit(() => { exits++; });

  const started = tray.start();
  ready(p1);
  await started;

  const restarted = tray.restart({ items: [{ title: 'up-a' }, { title: 'up-b' }] });
  // The old helper's stdin gets an exit message before teardown…
  equal(lastWrite(p1).type, 'exit');
  equal(p1._replacing, true);
  // …and its exit event, fired as we replace it, must be swallowed.
  p1.emit('exit', 0);
  ready(p2);
  await restarted;

  equal(exits, 0);                       // driver survived the swap
  const sentOnNew = JSON.parse(p2.writes[0]);
  equal(sentOnNew.items.length, 2);      // fresh menu rendered on the new helper
  equal(sentOnNew.items[1].title, 'up-b');
});

test('restart() while a spawn is pending piggybacks: ONE helper, both promises settle, freshest menu wins', async () => {
  const p1 = makeFakeProc();
  const p2 = makeFakeProc();
  const p3 = makeFakeProc();   // must never be consumed
  let spawns = 0;
  const spawn = (bin) => { spawns++; return [p1, p2, p3][spawns - 1]; };
  const tray = new Tray({ binPath: 'x', menu: { items: [{ title: 'v1' }] }, spawn });
  const started = tray.start();
  ready(p1);
  await started;

  const r1 = tray.restart({ items: [{ title: 'v2' }] });          // spawns p2, pending
  const r2 = tray.restart({ items: [{ title: 'v3-final' }] });    // piggybacks — NO third spawn
  ready(p2);
  await Promise.all([r1, r2]);                                    // neither promise is abandoned
  equal(spawns, 2);

  // Ready renders this.menu at send time, so the initial bare menu already
  // carries the menu set LAST; the piggyback chase is then a no-op diff.
  equal(p2.writes.length, 1);
  const sent = JSON.parse(p2.writes[0]);
  ok(!('type' in sent));
  equal(sent.items[0].title, 'v3-final');
});

test('update() while a spawn is pending defers — no update-menu before the initial bare menu', async () => {
  const p1 = makeFakeProc();
  const p2 = makeFakeProc();
  const tray = new Tray({ binPath: 'x', menu: { items: [{ title: 'a' }] }, spawn: spawnFactory([p1, p2]) });
  const started = tray.start();
  ready(p1);
  await started;

  const restarted = tray.restart({ items: [{ title: 'b' }] });
  tray.update({ items: [{ title: 'c' }] });      // pending spawn → must not write yet
  equal(p2.writes.length, 0);                    // nothing hit the not-yet-ready helper
  ready(p2);
  await restarted;
  await new Promise((r) => setImmediate(r));     // let the deferred update flush

  const first = JSON.parse(p2.writes[0]);
  ok(!('type' in first));                        // FIRST write is the bare initial menu…
  equal(first.items[0].title, 'c');              // …already carrying the deferred menu
  equal(p2.writes.length, 1);                    // …so the deferred chase no-op diffs
});

test('update(): content-only change → per-item update-item with seq_id -1 (the helper has no full re-render)', async () => {
  const p = makeFakeProc();
  const tray = new Tray({
    binPath: 'x',
    menu: { tooltip: 't', items: [{ title: 'status: A', enabled: false }, { title: 'Open' }] },
    spawn: () => p,
  });
  const started = tray.start();
  ready(p);
  await started;

  const handled = tray.update({ tooltip: 't', items: [{ title: 'status: B', enabled: false }, { title: 'Open' }] });
  equal(handled, true);
  equal(p.writes.length, 2);                     // bare menu + exactly one item update
  const msg = JSON.parse(p.writes[1]);
  equal(msg.type, 'update-item');
  equal(msg.seq_id, -1);                         // helper resolves the target from __id
  equal(msg.item.__id, 1);
  equal(msg.item.title, 'status: B');
});

test('update(): tray-chrome change rides the FIRST item update as update-item-and-menu', async () => {
  const p = makeFakeProc();
  const tray = new Tray({
    binPath: 'x', menu: { tooltip: 'up 1m', icon: 'AAA', items: [{ title: 'a' }, { title: 'b' }] }, spawn: () => p,
  });
  const started = tray.start();
  ready(p);
  await started;

  // tooltip + both item titles change → first change carries the chrome
  equal(tray.update({ tooltip: 'up 2m', icon: 'AAA', items: [{ title: 'a2' }, { title: 'b2' }] }), true);
  const first = JSON.parse(p.writes[1]);
  equal(first.type, 'update-item-and-menu');
  equal(first.menu.tooltip, 'up 2m');
  equal(first.item.title, 'a2');
  const second = JSON.parse(p.writes[2]);
  equal(second.type, 'update-item');
  equal(second.item.title, 'b2');
});

test('update(): chrome-only change uses an unchanged carrier item (updateItem is idempotent)', async () => {
  const p = makeFakeProc();
  const tray = new Tray({ binPath: 'x', menu: { tooltip: 'v1', items: [{ title: 'a' }] }, spawn: () => p });
  const started = tray.start();
  ready(p);
  await started;

  equal(tray.update({ tooltip: 'v2', items: [{ title: 'a' }] }), true);
  equal(p.writes.length, 2);
  const msg = JSON.parse(p.writes[1]);
  equal(msg.type, 'update-item-and-menu');
  equal(msg.menu.tooltip, 'v2');
  equal(msg.item.title, 'a');                    // carrier is the (unchanged) first real item
});

test('update(): submenu row change targets the row by its own __id', async () => {
  const p = makeFakeProc();
  const menu = (uptime) => ({
    tooltip: 't',
    items: [{ title: 'Health', items: [{ title: `Uptime: ${uptime}`, enabled: false }] }],
  });
  const tray = new Tray({ binPath: 'x', menu: menu('1s'), spawn: () => p });
  const started = tray.start();
  ready(p);
  await started;

  equal(tray.update(menu('2s')), true);
  equal(p.writes.length, 2);
  const msg = JSON.parse(p.writes[1]);
  equal(msg.type, 'update-item');
  equal(msg.item.__id, 2);                       // depth-first: Health=1, its row=2
  equal(msg.item.title, 'Uptime: 2s');
});

test('update(): SHAPE change returns false and writes nothing — caller must respawn', async () => {
  const p = makeFakeProc();
  const tray = new Tray({ binPath: 'x', menu: { tooltip: 't', items: [{ title: 'a' }] }, spawn: () => p });
  const started = tray.start();
  ready(p);
  await started;

  const before = p.writes.length;
  equal(tray.update({ tooltip: 't', items: [{ title: 'a' }, { title: 'NEW ROW' }] }), false);
  equal(p.writes.length, before);                // nothing was sent to the helper
});

test('update(): no visible change → handled, zero writes', async () => {
  const p = makeFakeProc();
  const tray = new Tray({ binPath: 'x', menu: { tooltip: 't', items: [{ title: 'a' }] }, spawn: () => p });
  const started = tray.start();
  ready(p);
  await started;
  equal(tray.update({ tooltip: 't', items: [{ title: 'a' }] }), true);
  equal(p.writes.length, 1);                     // just the initial bare menu
});

test('a click after an in-place update routes to the NEW handler', async () => {
  const p = makeFakeProc();
  let hits = '';
  const menu = (tag) => ({ items: [{ title: tag, onClick: () => { hits += tag; } }] });
  const tray = new Tray({ binPath: 'x', menu: menu('old'), spawn: () => p });
  const started = tray.start();
  ready(p);
  await started;

  tray.update(menu('new'));
  p.stdout.write('{"type":"clicked","__id":1}\n');
  await new Promise((r) => setImmediate(r));
  equal(hits, 'new');
});

test('a genuine helper exit (not a swap) still fires the driver exit handler', async () => {
  const p = makeFakeProc();
  let exits = 0;
  const tray = new Tray({ binPath: 'x', menu: { items: [] }, spawn: () => p });
  tray.onExit((code) => { exits += 1; equal(code, 1); });
  const started = tray.start();
  ready(p);
  await started;
  p.emit('exit', 1);
  equal(exits, 1);
});

test('a click on the current helper routes back to its onClick handler', async () => {
  const p = makeFakeProc();
  let clicked = 0;
  const tray = new Tray({ binPath: 'x', menu: { items: [{ title: 'Go', onClick: () => { clicked++; } }] }, spawn: () => p });
  const started = tray.start();
  ready(p);
  await started;
  // item __id is depth-first 1-based → the single item is __id 1
  p.stdout.write('{"type":"clicked","__id":1}\n');
  // give the readline 'line' event a tick to fire
  await new Promise((r) => setImmediate(r));
  equal(clicked, 1);
});
