// Review 2026-09-08 (second pass) — a hub removes hub.pid on shutdown only when
// the record is its own. A reaped hub's late `server.close` callback used to
// delete the record the NEXT hub had already written, so `hub:stop` and the tray
// lost the pid until the next supervisor run adopted the hub by identity probe.
import { test } from 'node:test';
import { equal } from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readPidFile, removeOwnPidFile, removeOwnPidFileSync, writePidFile } from '../../../lib/pid-file.mjs';

function home() { return mkdtempSync(join(tmpdir(), 'sdlc-pid-own-')); }

test('removeOwnPidFile leaves a record that names another pid, removes its own', async () => {
  const dir = home();
  const p = join(dir, 'hub.pid');
  try {
    await writePidFile(p, { pid: 424242, port: 1 });
    equal(await removeOwnPidFile(p, 1), false, 'another pid: not removed');
    equal((await readPidFile(p)).pid, 424242, 'the record is intact');
    equal(await removeOwnPidFile(p, 424242), true, 'own pid: removed');
    equal(existsSync(p), false);
    equal(await removeOwnPidFile(p, 424242), true, 'no record: nothing to keep, reports removed');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('removeOwnPidFileSync behaves the same (the exit handler cannot await)', async () => {
  const dir = home();
  const p = join(dir, 'hub.pid');
  try {
    await writePidFile(p, { pid: 424242, port: 1 });
    equal(removeOwnPidFileSync(p, 1), false);
    equal(existsSync(p), true);
    equal(removeOwnPidFileSync(p, 424242), true);
    equal(existsSync(p), false);
    equal(removeOwnPidFileSync(p, 424242), true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
