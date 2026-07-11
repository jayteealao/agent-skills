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
