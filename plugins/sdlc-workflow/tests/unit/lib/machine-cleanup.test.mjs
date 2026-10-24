// lib/machine-cleanup.mjs — the one-time removal of the old hub and tray. Every
// process call is a fake: no test stops a real process.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { MARKER, runMachineCleanup, trayLauncherPath } from '../../../lib/machine-cleanup.mjs';

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'machine-cleanup-'));
  const home = join(root, 'sdlc');
  const userHome = join(root, 'user');
  mkdirSync(join(home, 'runtime', 'abc'), { recursive: true });
  mkdirSync(join(home, 'cost-cursor'), { recursive: true });
  writeFileSync(join(home, 'hub.pid'), JSON.stringify({ pid: 101 }));
  writeFileSync(join(home, 'tray.heartbeat.json'), JSON.stringify({ pid: 202 }));
  writeFileSync(join(home, 'registry.json'), '{}');
  writeFileSync(join(home, 'errors.log'), 'kept\n');
  writeFileSync(join(home, 'lifecycle.log'), '');
  return { root, home, userHome, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

// A fake process table: pid → command line, answered as `ps` would.
function fakeExec(table) {
  const exec = (cmd, args) => {
    if (cmd === 'ps') {
      const line = table[Number(args[1])];
      return line ? { status: 0, stdout: `${line}\n` } : { status: 1, stdout: '' };
    }
    throw new Error(`unexpected command ${cmd}`);
  };
  return { exec };
}

test('stops only a confirmed hub, removes the old state, keeps the rest, and writes the marker', () => {
  const { home, userHome, cleanup } = setup();
  const realKill = process.kill;
  const stops = [];
  process.kill = (pid, sig) => { stops.push([pid, sig]); return true; };
  try {
    const launcher = trayLauncherPath({ platform: 'linux', env: {}, home: userHome });
    mkdirSync(join(launcher, '..'), { recursive: true });
    writeFileSync(launcher, 'Exec=node tray.mjs\n');
    // 202 is now another program: the tray pid was reused.
    const { exec } = fakeExec({ 101: 'node /home/u/.sdlc/runtime/abc/dist/hub-serve.mjs', 202: 'vim notes.txt' });
    const r = runMachineCleanup({ home, platform: 'linux', env: {}, userHome, exec });
    assert.deepEqual(r.stopped, ['hub 101']);
    assert.deepEqual(stops, [[101, 'SIGTERM']], 'the reused tray pid is never stopped');
    assert.equal(r.done, true);
    for (const gone of ['hub.pid', 'tray.heartbeat.json', 'registry.json', 'runtime']) assert.ok(!existsSync(join(home, gone)), `${gone} removed`);
    assert.ok(!existsSync(launcher), 'the tray launcher is removed');
    assert.equal(readFileSync(join(home, 'errors.log'), 'utf-8'), 'kept\n');
    assert.ok(existsSync(join(home, 'cost-cursor')), 'other state is kept');
    assert.ok(existsSync(join(home, MARKER)));
    assert.match(readFileSync(join(home, 'lifecycle.log'), 'utf-8'), /"event":"v10-cleanup"/);
  } finally {
    process.kill = realKill;
    cleanup();
  }
});

test('the marker makes later calls return at once', () => {
  const { home, userHome, cleanup } = setup();
  try {
    writeFileSync(join(home, MARKER), '{}');
    const exec = () => { throw new Error('no process call after the marker'); };
    assert.deepEqual(runMachineCleanup({ home, platform: 'linux', env: {}, userHome, exec }), { skipped: true });
    assert.ok(existsSync(join(home, 'hub.pid')));
  } finally {
    cleanup();
  }
});

test('a launcher that is not the tray file stays', () => {
  const { home, userHome, cleanup } = setup();
  try {
    const launcher = trayLauncherPath({ platform: 'linux', env: {}, home: userHome });
    mkdirSync(join(launcher, '..'), { recursive: true });
    writeFileSync(launcher, 'Exec=something-else\n');
    const { exec } = fakeExec({});
    runMachineCleanup({ home, platform: 'linux', env: {}, userHome, exec });
    assert.ok(existsSync(launcher));
  } finally {
    cleanup();
  }
});

test('the external-dispatch consent moves to config.json before hub-config.json goes', () => {
  const { home, userHome, cleanup } = setup();
  try {
    writeFileSync(join(home, 'hub-config.json'), JSON.stringify({ version: 1, port: 4173, externalDispatch: { enabled: true } }));
    const { exec } = fakeExec({});
    const r = runMachineCleanup({ home, platform: 'linux', env: {}, userHome, exec });
    assert.equal(r.done, true);
    assert.ok(!existsSync(join(home, 'hub-config.json')));
    assert.deepEqual(JSON.parse(readFileSync(join(home, 'config.json'), 'utf-8')), { externalDispatch: { enabled: true } });
  } finally {
    cleanup();
  }
});

test('a consent already in config.json is kept as it is', () => {
  const { home, userHome, cleanup } = setup();
  try {
    writeFileSync(join(home, 'hub-config.json'), JSON.stringify({ externalDispatch: { enabled: true } }));
    writeFileSync(join(home, 'config.json'), JSON.stringify({ externalDispatch: { enabled: false } }));
    const { exec } = fakeExec({});
    runMachineCleanup({ home, platform: 'linux', env: {}, userHome, exec });
    assert.deepEqual(JSON.parse(readFileSync(join(home, 'config.json'), 'utf-8')), { externalDispatch: { enabled: false } });
  } finally {
    cleanup();
  }
});

test('a stop that fails leaves no marker, so the next session retries', () => {
  const { home, userHome, cleanup } = setup();
  const realKill = process.kill;
  process.kill = () => { throw new Error('EPERM'); };
  try {
    const { exec } = fakeExec({ 101: 'node hub-serve.mjs' });
    const r = runMachineCleanup({ home, platform: 'linux', env: {}, userHome, exec });
    assert.equal(r.done, false);
    assert.deepEqual(r.left, ['hub process 101']);
    assert.ok(!existsSync(join(home, MARKER)));
  } finally {
    process.kill = realKill;
    cleanup();
  }
});
