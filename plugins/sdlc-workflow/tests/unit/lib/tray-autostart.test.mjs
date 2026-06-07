// tests/unit/lib/tray-autostart.test.mjs
//
// P5 autostart verbs (lib/tray-autostart.mjs). Round-trips enable/disable/refresh
// against an injected temp `startupDir` (never the real Startup folder) and asserts
// the pure platform dispatch + content builders for all three platforms.

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, before, after } from 'node:test';
import { equal, ok, match } from 'node:assert/strict';

import {
  enableAutostart, disableAutostart, isAutostartEnabled, refreshAutostart,
  autostartLauncherDir, autostartLauncherName, buildLauncherContent, launcherTargetsCurrent,
} from '../../../lib/tray-autostart.mjs';

let dir;
const NODE = process.platform === 'win32' ? 'C:\\Program Files\\nodejs\\node.exe' : '/usr/bin/node';
const BUNDLE = process.platform === 'win32' ? 'C:\\plugin\\dist\\tray.cjs' : '/plugin/dist/tray.cjs';

before(() => { dir = mkdtempSync(join(tmpdir(), 'sdlc-autostart-')); });
after(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });

test('enable writes a launcher carrying both absolute paths; status reflects presence', () => {
  equal(isAutostartEnabled({ startupDir: dir }), false);
  const { path, content } = enableAutostart({ startupDir: dir, nodePath: NODE, trayBundle: BUNDLE });
  ok(existsSync(path));
  ok(content.includes(NODE));
  ok(content.includes(BUNDLE));
  equal(isAutostartEnabled({ startupDir: dir }), true);
});

test('disable removes the launcher (idempotent)', () => {
  enableAutostart({ startupDir: dir, nodePath: NODE, trayBundle: BUNDLE });
  disableAutostart({ startupDir: dir });
  equal(isAutostartEnabled({ startupDir: dir }), false);
  // second disable does not throw
  disableAutostart({ startupDir: dir });
  equal(isAutostartEnabled({ startupDir: dir }), false);
});

test('refreshAutostart: disabled → unchanged → rewritten', () => {
  // disabled when no launcher present
  equal(refreshAutostart({ startupDir: dir, nodePath: NODE, trayBundle: BUNDLE }).action, 'disabled');

  enableAutostart({ startupDir: dir, nodePath: NODE, trayBundle: BUNDLE });
  // unchanged when the embedded target still matches
  equal(refreshAutostart({ startupDir: dir, nodePath: NODE, trayBundle: BUNDLE }).action, 'unchanged');

  // rewritten when the bundle path moved (simulated plugin relocation)
  const moved = BUNDLE.replace('dist', 'dist2');
  const r = refreshAutostart({ startupDir: dir, nodePath: NODE, trayBundle: moved });
  equal(r.action, 'rewritten');
  ok(readFileSync(r.path, 'utf-8').includes(moved));

  disableAutostart({ startupDir: dir });
});

test('platform dispatch: name + dir', () => {
  equal(autostartLauncherName('win32'), 'SDLC Sunflower Tray.vbs');
  equal(autostartLauncherName('darwin'), 'com.sdlc.sunflower-tray.plist');
  equal(autostartLauncherName('linux'), 'sdlc-sunflower-tray.desktop');

  const win = autostartLauncherDir({ platform: 'win32', env: { APPDATA: 'C:\\Users\\me\\AppData\\Roaming' }, home: 'C:\\Users\\me' });
  match(win, /Startup$/);
  const lin = autostartLauncherDir({ platform: 'linux', env: { XDG_CONFIG_HOME: '/cfg' }, home: '/home/me' });
  equal(lin, join('/cfg', 'autostart'));
  const mac = autostartLauncherDir({ platform: 'darwin', env: {}, home: '/Users/me' });
  equal(mac, join('/Users/me', 'Library', 'LaunchAgents'));
});

test('content builders embed both paths + the hidden-launch shape', () => {
  const vbs = buildLauncherContent({ platform: 'win32', nodePath: 'C:\\n.exe', trayBundle: 'C:\\t.cjs' });
  ok(vbs.includes('WScript.Shell'));
  match(vbs, /, 0, False$/m);              // hidden window, no-wait
  ok(launcherTargetsCurrent(vbs, { nodePath: 'C:\\n.exe', trayBundle: 'C:\\t.cjs' }));

  const plist = buildLauncherContent({ platform: 'darwin', nodePath: '/n', trayBundle: '/t.cjs' });
  match(plist, /RunAtLoad/);
  ok(launcherTargetsCurrent(plist, { nodePath: '/n', trayBundle: '/t.cjs' }));

  const desktop = buildLauncherContent({ platform: 'linux', nodePath: '/n', trayBundle: '/t.cjs' });
  match(desktop, /\[Desktop Entry\]/);
  ok(launcherTargetsCurrent(desktop, { nodePath: '/n', trayBundle: '/t.cjs' }));
});
