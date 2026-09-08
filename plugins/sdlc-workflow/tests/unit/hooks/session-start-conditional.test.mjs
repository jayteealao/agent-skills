// Review 2026-09-08 — the Codex SessionStart adapter applies the W11.3 policy
// (WIDE-VIEW-REPAIR-PLAN §14.2.3) on its own side: a root with no `.ai/workflows`,
// or outside any git checkout, gets no hub-ensure spawn and no activation record.
// Before this the adapter ran `hub-ensure --bootstrap` in every directory, and
// hub-ensure created `.ai/_view` plus a queue record there.
import { test } from 'node:test';
import { equal, match } from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const HOOK = join(PLUGIN_ROOT, 'hooks', 'session-start.mjs');

/** Run the adapter against a fake plugin root whose hub-ensure records its argv. */
function runHook({ workflows, git, nested = false, env = {} }) {
  const fakeRoot = mkdtempSync(join(tmpdir(), 'sdlc-cond-root-'));
  const pluginData = mkdtempSync(join(tmpdir(), 'sdlc-cond-data-'));
  const repo = mkdtempSync(join(tmpdir(), 'sdlc-cond-repo-'));
  const marker = join(fakeRoot, 'hub-ensure.invoked');
  try {
    mkdirSync(join(fakeRoot, 'dist'), { recursive: true });
    writeFileSync(
      join(fakeRoot, 'dist', 'hub-ensure.mjs'),
      `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(marker)}, process.argv.slice(2).join(' '));\nprocess.exit(0);\n`,
      'utf-8',
    );
    // `nested`: `.git` at the top, `.ai/workflows` two levels down (a monorepo
    // sub-project) — the layout that needs the climb in insideGitCheckout.
    const root = nested ? join(repo, 'packages', 'app') : repo;
    if (workflows) mkdirSync(join(root, '.ai', 'workflows'), { recursive: true });
    if (git) mkdirSync(join(repo, '.git'), { recursive: true });
    const event = { cwd: root, hook_event_name: 'SessionStart', source: 'startup', session_id: 's1' };
    const res = spawnSync(process.execPath, [HOOK, '--plugin-root', fakeRoot, '--plugin-data', pluginData], {
      input: JSON.stringify(event), cwd: root, encoding: 'utf-8', windowsHide: true,
      env: { ...process.env, SDLC_DISABLE_MEMORY_SEED: '1', ...env },
    });
    return {
      status: res.status,
      stderr: res.stderr,
      invoked: existsSync(marker),
      argv: existsSync(marker) ? readFileSync(marker, 'utf-8') : '',
      view: existsSync(join(root, '.ai', '_view')),
      activation: existsSync(join(pluginData, 'activation.json')),
    };
  } finally {
    rmSync(fakeRoot, { recursive: true, force: true });
    rmSync(pluginData, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
}

test('a git checkout with no .ai/workflows: exit 0, no hub-ensure, no .ai/_view, no activation', () => {
  const r = runHook({ workflows: false, git: true });
  equal(r.status, 0, r.stderr);
  equal(r.stderr, '', 'silent: no thrown error hides behind the exit(0)');
  equal(r.invoked, false, 'hub-ensure must not run');
  equal(r.view, false);
  equal(r.activation, false);
});

test('a .ai/workflows root outside any git checkout: exit 0, no hub-ensure', () => {
  const r = runHook({ workflows: true, git: false });
  equal(r.status, 0, r.stderr);
  equal(r.stderr, '', 'silent: no thrown error hides behind the exit(0)');
  equal(r.invoked, false, 'hub-ensure must not run');
  equal(r.activation, false);
});

test('a git checkout with .ai/workflows: hub-ensure runs with --confirm --bootstrap --session-start', () => {
  const r = runHook({ workflows: true, git: true });
  equal(r.status, 0, r.stderr);
  equal(r.stderr, '');
  equal(r.invoked, true, 'hub-ensure runs');
  match(r.argv, /--confirm/);
  match(r.argv, /--bootstrap/);
  match(r.argv, /--session-start/);
});

test('a workflow store nested under a checkout (monorepo sub-project): hub-ensure runs', () => {
  // Second review 2026-09-08: insideGitCheckout called dirname without importing
  // it, so every layout that needed the climb threw, and the exit(0) hid it.
  const r = runHook({ workflows: true, git: true, nested: true });
  equal(r.status, 0, r.stderr);
  equal(r.stderr, '');
  equal(r.invoked, true, 'the climb finds .git two levels up');
});

test('either spelling of the kill switch stops the hub confirm', () => {
  for (const key of ['SDLC_DISABLE_HUB_ENSURE', 'SDLC_DISABLE_ENSURE_HUB']) {
    const r = runHook({ workflows: true, git: true, env: { [key]: '1' } });
    equal(r.status, 0, r.stderr);
    equal(r.invoked, false, `${key}=1 → no hub-ensure`);
    equal(r.activation, false, `${key}=1 → no activation record`);
  }
});
