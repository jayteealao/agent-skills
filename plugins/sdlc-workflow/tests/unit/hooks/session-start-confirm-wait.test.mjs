// W11.10 item 2 — the Codex SessionStart hub-confirm wait is 5 s, and an
// expired wait returns `started-unconfirmed` with one line on stderr
// (WIDE-VIEW-REPAIR-PLAN §14.2.10).
import { test } from 'node:test';
import { equal, match } from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const HOOK = join(PLUGIN_ROOT, 'hooks', 'session-start.mjs');

test('HUB_CONFIRM_TIMEOUT_MS is 5000', () => {
  match(readFileSync(HOOK, 'utf-8'), /const HUB_CONFIRM_TIMEOUT_MS = 5000;/);
});

test('an expired wait exits 0, keeps stdout silent, prints one started-unconfirmed line, records no activation', () => {
  // A plugin root whose bundled hub-ensure never confirms inside the wait.
  const fakeRoot = mkdtempSync(join(tmpdir(), 'sdlc-confirm-root-'));
  const pluginData = mkdtempSync(join(tmpdir(), 'sdlc-confirm-data-'));
  const repo = mkdtempSync(join(tmpdir(), 'sdlc-confirm-repo-'));
  try {
    mkdirSync(join(fakeRoot, 'dist'), { recursive: true });
    writeFileSync(join(fakeRoot, 'dist', 'hub-ensure.mjs'), 'setTimeout(() => process.exit(0), 4000);\n', 'utf-8');
    mkdirSync(join(repo, '.ai', 'workflows'), { recursive: true });
    mkdirSync(join(repo, '.git'), { recursive: true });   // the adapter's W11.3 gate needs a checkout
    const event = { cwd: repo, hook_event_name: 'SessionStart', source: 'startup', session_id: 's1' };
    const res = spawnSync(process.execPath, [HOOK, '--plugin-root', fakeRoot, '--plugin-data', pluginData], {
      input: JSON.stringify(event), cwd: repo, encoding: 'utf-8', windowsHide: true,
      env: { ...process.env, SDLC_DISABLE_MEMORY_SEED: '1', SDLC_HUB_CONFIRM_TIMEOUT_MS: '300' },
    });
    equal(res.status, 0, `hook exit: ${res.stderr}`);
    equal(res.stdout.trim(), '', 'stdout stays silent');
    match(res.stderr, /started-unconfirmed/);
    match(res.stderr, /300 ms/);
    equal(res.stderr.trim().split(/\r?\n/).length, 1, 'one line');
    equal(existsSync(join(pluginData, 'activation.json')), false, 'no activation without a confirmed hub');
  } finally {
    rmSync(fakeRoot, { recursive: true, force: true });
    rmSync(pluginData, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});
