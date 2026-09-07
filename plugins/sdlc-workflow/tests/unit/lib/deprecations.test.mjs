// W11.9 step 1 — deprecate the dead paths (WIDE-VIEW-REPAIR-PLAN §14.2.9).
//
// (1) deprecatedConfigWarnings is pure: nothing on the defaults, one warning
//     per deprecated setting, each naming the key, the release, and the fix
// (2) logDeprecatedConfig writes one `deprecated-config` lifecycle line per
//     warning under SDLC_HOME
// (3) LIVE: hub-ensure logs them only with --session-start, so a write-hook
//     spawn never repeats the warning inside one session
import { test } from 'node:test';
import { deepEqual, equal, match, ok } from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEPRECATED_IN, deprecatedConfigWarnings, logDeprecatedConfig } from '../../../lib/deprecations.mjs';
import { LIFECYCLE_EVENTS, readLifecycleLog } from '../../../lib/runtime-log.mjs';
import { HUB_CONFIG_DEFAULTS, readHubConfig, writeHubConfig } from '../../../lib/hub-config.mjs';
import { DEFAULT_SDLC_CONFIG } from '../../../lib/config.mjs';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const tmp = (p) => mkdtempSync(join(tmpdir(), p));

function withHome(fn) {
  const home = tmp('sdlc-deprecations-home-');
  const prev = process.env.SDLC_HOME;
  process.env.SDLC_HOME = home;
  const restore = () => {
    if (prev === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = prev;
    rmSync(home, { recursive: true, force: true });
  };
  return fn(home).then((v) => { restore(); return v; }, (e) => { restore(); throw e; });
}

test('deprecatedConfigWarnings: nothing on the defaults', () => {
  deepEqual(deprecatedConfigWarnings({}), []);
  deepEqual(deprecatedConfigWarnings({ config: DEFAULT_SDLC_CONFIG, hubConfig: HUB_CONFIG_DEFAULTS }), []);
  equal(DEPRECATED_IN, '9.154.0');
});

test('deprecatedConfigWarnings: one warning per dead path, naming key, release, and fix', () => {
  const inline = deprecatedConfigWarnings({ config: { view: { renderDispatch: 'inline' } } });
  equal(inline.length, 1);
  equal(inline[0].key, 'view.renderDispatch');
  match(inline[0].message, /view\.renderDispatch/);
  match(inline[0].message, /9\.154\.0/);
  match(inline[0].message, /next release/);

  const machine = deprecatedConfigWarnings({ hubConfig: { perRepoServe: true, liveReload: false } });
  deepEqual(machine.map((w) => w.key), ['perRepoServe', 'liveReload']);
  match(machine[0].message, /perRepoServe/);
  match(machine[1].message, /liveReload/);

  // A default-valued key is not "set": the hub path and the default live-reload
  // value are the future, not the deprecation.
  deepEqual(deprecatedConfigWarnings({ config: { view: { renderDispatch: 'hub' } }, hubConfig: { perRepoServe: false, liveReload: true } }), []);

  const all = deprecatedConfigWarnings({ config: { view: { renderDispatch: 'inline' } }, hubConfig: { perRepoServe: true, liveReload: false } });
  deepEqual(all.map((w) => w.key), ['view.renderDispatch', 'perRepoServe', 'liveReload']);
});

test('logDeprecatedConfig writes one deprecated-config lifecycle line per warning', async () => {
  ok(LIFECYCLE_EVENTS.includes('deprecated-config'));
  await withHome(async (home) => {
    const lines = [];
    const n = logDeprecatedConfig({ config: { view: { renderDispatch: 'inline' } }, hubConfig: { perRepoServe: true }, log: (l) => lines.push(l) });
    equal(n, 2);
    equal(lines.length, 2);
    const records = readLifecycleLog(home).filter((r) => r.event === 'deprecated-config');
    deepEqual(records.map((r) => r.key), ['view.renderDispatch', 'perRepoServe']);
    match(records[0].reason, /9\.154\.0/);
    equal(logDeprecatedConfig({ config: {}, hubConfig: {}, log: () => {} }), 0, 'nothing set → nothing written');
    equal(readLifecycleLog(home).filter((r) => r.event === 'deprecated-config').length, 2);
  });
});

test('live: hub-ensure logs the warnings once, only with --session-start', async () => {
  await withHome(async (home) => {
    const repo = tmp('sdlc-deprecations-repo-');
    try {
      mkdirSync(join(repo, '.ai'), { recursive: true });
      writeFileSync(join(repo, '.ai', 'sdlc-config.json'), JSON.stringify({ view: { renderDispatch: 'inline' } }), 'utf-8');
      writeHubConfig({ ...readHubConfig(), perRepoServe: true, liveReload: false });
      const run = (extra) => execFileSync(process.execPath, [
        join(PLUGIN_ROOT, 'scripts', 'hub-ensure.mjs'),
        '--no-ensure', ...extra,
        '--plugin-root', PLUGIN_ROOT, '--project-root', repo, '--view', join(repo, '.ai', '_view'),
      ], { env: { ...process.env, SDLC_HOME: home }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      run([]);
      equal(readLifecycleLog(home).filter((r) => r.event === 'deprecated-config').length, 0, 'a write-hook spawn is silent');
      run(['--session-start']);
      const records = readLifecycleLog(home).filter((r) => r.event === 'deprecated-config');
      deepEqual(records.map((r) => r.key), ['view.renderDispatch', 'perRepoServe', 'liveReload']);
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });
});
