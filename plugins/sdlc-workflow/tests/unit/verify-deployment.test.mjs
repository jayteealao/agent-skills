// The Codex deployment doctor names the installed snapshot by its full version, a prerelease
// included, and picks the newest one in semver order. The doctor runs with an empty PATH and a
// temp CODEX_HOME, so it reads no machine state and starts no CLI.

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { match } from 'node:assert/strict';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function doctor(folders) {
  const home = mkdtempSync(join(tmpdir(), 'sdlc-codex-home-'));
  for (const f of folders) mkdirSync(join(home, 'plugins', 'cache', 'agent-skills-marketplace', 'sdlc-workflow', f), { recursive: true });
  const env = { CODEX_HOME: home, PATH: home, SYSTEMROOT: process.env.SYSTEMROOT, ComSpec: process.env.ComSpec, LOCALAPPDATA: home };
  return spawnSync(process.execPath, [join(ROOT, 'scripts', 'verify-deployment.mjs')], { env, encoding: 'utf8', timeout: 60_000 }).stdout;
}

test('the installed snapshot keeps its prerelease, and next.10 is newer than next.9', () => {
  match(doctor(['9.0.0-next.9', '9.0.0-next.10', 'not-a-version']), /installed snapshot 9\.0\.0-next\.10 /);
});

test('a release is newer than its prereleases', () => {
  match(doctor(['9.0.0-next.10', '9.0.0', '8.9.9']), /installed snapshot 9\.0\.0 /);
});
