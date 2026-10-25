// scripts/smoke-hosts.mjs: the command line of each host, the fixture repo, and the verdict.
// A fake exec stands in for the host CLIs; the intake run writes a 00-index.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { commandOf, promptOf, smokeHost, smokeLine } from '../../scripts/smoke-hosts.mjs';

test('each host gets its skill spelling and its headless command line', () => {
  assert.equal(promptOf('claude', 'status'), '/wf status');
  assert.equal(promptOf('codex', 'status'), '$wf status');
  assert.equal(promptOf('pi', 'status'), '/skill:wf status');
  assert.deepEqual(commandOf('codex', '$wf status', { cwd: '/f' }), ['codex', ['exec', '--skip-git-repo-check', '-s', 'workspace-write', '-C', '/f', '$wf status']]);
  const [cmd, args] = commandOf('pi', 'p', { pluginRoot: '/plug' });
  assert.equal(cmd, 'pi');
  assert.deepEqual(args.slice(0, 5), ['-p', '--no-session', '--no-extensions', '-e', path.join('/plug', 'pi')]);
  assert.equal(commandOf('claude', 'p')[1][0], '-p');
});

test('a host passes when status prints and the intake writes an index; a missing CLI is skipped', () => {
  const fake = (writeIndex) => (cmd, args, opts) => {
    const prompt = args[args.length - 1];
    if (/intake/.test(prompt) && writeIndex) {
      mkdirSync(path.join(opts.cwd, '.ai', 'workflows', 'add-negative'), { recursive: true });
      writeFileSync(path.join(opts.cwd, '.ai', 'workflows', 'add-negative', '00-index.md'), '---\n---\n');
    }
    return { status: 0, stdout: 'no workflows yet\n', stderr: '' };
  };
  const ok = smokeHost('codex', { exec: fake(true), has: () => true });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.slugs, ['add-negative']);
  assert.equal(smokeLine(ok), 'codex: status ok, intake ok (add-negative)');
  const bad = smokeHost('pi', { exec: fake(false), has: () => true });
  assert.equal(bad.ok, false);
  assert.match(smokeLine(bad), /^pi: status ok, intake FAIL/);
  assert.deepEqual(smokeHost('claude', { has: () => false }), { host: 'claude', skipped: true });
});
