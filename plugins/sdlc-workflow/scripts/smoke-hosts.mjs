#!/usr/bin/env node
/**
 * scripts/smoke-hosts.mjs — the smoke flow of each host: the host CLI runs `/wf status`
 * and one intake in a fixture repo. The release runs it after the reinstall.
 *
 *   node scripts/smoke-hosts.mjs [--host claude|codex|pi]... [--keep] [--json]
 *
 * A host passes when the status run exits 0 with output, and the intake run writes a
 * 00-index.md under .ai/workflows/. A host whose CLI is not on PATH is skipped. pi runs
 * with no discovered extensions and this plugin's pi package only (the release passes the
 * installed package folder), so the person's pi settings do not change the result. The exit code is 1 when a host fails.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const HOSTS = Object.freeze(['claude', 'codex', 'pi']);
const TIMEOUT_MS = 15 * 60_000;
const INTAKE = 'intake fix the add function returns a wrong sum when one number is negative';

/** The prompt of one run, in the host's skill spelling. */
export function promptOf(host, words) {
  return host === 'codex' ? `$wf ${words}` : host === 'pi' ? `/skill:wf ${words}` : `/wf ${words}`;
}

/** The command line of one host run. The prompt goes last. */
export function commandOf(host, prompt, { pluginRoot = PLUGIN_ROOT, piDir = path.join(pluginRoot, 'pi'), cwd } = {}) {
  if (host === 'claude') return ['claude', ['-p', prompt, '--permission-mode', 'acceptEdits', '--allowedTools', 'Bash(node:*)', 'Bash(git:*)']];
  if (host === 'codex') return ['codex', ['exec', '--skip-git-repo-check', '-s', 'workspace-write', '-C', cwd, prompt]];
  return ['pi', ['-p', '--no-session', '--no-extensions', '-e', piDir, prompt]];
}

/** A git repo with one small module and one test. */
export function makeFixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'wf-smoke-'));
  mkdirSync(path.join(dir, 'src'));
  mkdirSync(path.join(dir, 'test'));
  writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify({ name: 'smoke', private: true, type: 'module', scripts: { test: 'node --test test/' } }, null, 2)}\n`);
  writeFileSync(path.join(dir, 'src', 'add.mjs'), 'export const add = (a, b) => (a < 0 ? Math.abs(a) + b : a + b);\n');
  writeFileSync(path.join(dir, 'test', 'add.test.mjs'), "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { add } from '../src/add.mjs';\ntest('add', () => assert.equal(add(2, 3), 5));\n");
  const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('-c', 'user.name=smoke', '-c', 'user.email=smoke@example.invalid', 'commit', '-q', '-m', 'init');
  return dir;
}

const onPath = (cmd) => spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' }).status === 0;
const quote = (a) => (process.platform === 'win32' && /[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);

function run(host, prompt, cwd, exec, piDir) {
  const [cmd, args] = commandOf(host, prompt, { cwd, piDir });
  const shell = process.platform === 'win32';
  return exec(cmd, shell ? args.map(quote) : args, { cwd, shell, encoding: 'utf8', timeout: TIMEOUT_MS, windowsHide: true });
}

/** The indexes that the intake wrote. */
function indexesOf(dir) {
  const wf = path.join(dir, '.ai', 'workflows');
  if (!existsSync(wf)) return [];
  return readdirSync(wf, { withFileTypes: true }).filter((e) => e.isDirectory() && existsSync(path.join(wf, e.name, '00-index.md'))).map((e) => e.name);
}

/** The smoke flow of one host. */
export function smokeHost(host, { exec = spawnSync, keep = false, has = onPath, piDir } = {}) {
  if (!has(host)) return { host, skipped: true };
  const dir = makeFixture();
  try {
    const s = run(host, promptOf(host, 'status'), dir, exec, piDir);
    const status = s.status === 0 && String(s.stdout || '').trim().length > 0;
    const i = run(host, promptOf(host, INTAKE), dir, exec, piDir);
    const slugs = indexesOf(dir);
    const intake = slugs.length > 0;
    return { host, status, intake, slugs, ok: status && intake, dir: keep ? dir : undefined, tail: (s.status === 0 ? '' : String(s.stderr || s.stdout || '').slice(-400)) || (intake ? '' : String(i.stderr || i.stdout || '').slice(-400)) };
  } finally {
    if (!keep) rmSync(dir, { recursive: true, force: true });
  }
}

export function smokeLine(r) {
  if (r.skipped) return `${r.host}: skipped (no ${r.host} CLI on PATH)`;
  return `${r.host}: status ${r.status ? 'ok' : 'FAIL'}, intake ${r.intake ? `ok (${r.slugs.join(', ')})` : 'FAIL'}${r.ok ? '' : ` — ${r.tail.trim().split('\n').pop()}`}`;
}

function main() {
  const argv = process.argv.slice(2);
  const hosts = argv.flatMap((a, i) => (a === '--host' ? [argv[i + 1]] : [])).filter(Boolean);
  const list = hosts.length ? hosts : HOSTS;
  for (const h of list) if (!HOSTS.includes(h)) { console.error(`smoke-hosts: the host is one of ${HOSTS.join(', ')}`); process.exit(2); }
  const results = list.map((h) => smokeHost(h, { keep: argv.includes('--keep') }));
  if (argv.includes('--json')) console.log(JSON.stringify(results, null, 2));
  else for (const r of results) console.log(smokeLine(r));
  process.exit(results.some((r) => !r.skipped && !r.ok) ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
