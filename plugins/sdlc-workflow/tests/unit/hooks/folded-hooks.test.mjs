// W11.6 — one hook process per tool event (WIDE-VIEW-REPAIR-PLAN §14.2.6).
//
// (1) hooks.json wires exactly one command per tool event at the folded entries
// (2) pre-tool-use-all: a Write of an invalid artifact blocks with the validator's reason
// (3) pre-tool-use-all: a shell payload reaches leak-guard-bash (enforce → exit 2;
//     the dispatch sentinel silences the whole process)
// (4) pre-tool-use-all: an advisory finding is ONE JSON systemMessage line
// (5) post-tool-use-all: a verify block exits 2 AND the render request is still queued
// (6) post-tool-use-all: a non-artifact write is silent and queues nothing
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { equal, match, ok } from 'node:assert/strict';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PRE = join(PLUGIN_ROOT, 'hooks', 'pre-tool-use-all.mjs');
const POST = join(PLUGIN_ROOT, 'hooks', 'post-tool-use-all.mjs');

const tempDir = () => mkdtempSync(join(tmpdir(), 'sdlc-folded-'));
const writeFile = (path, content) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content, 'utf-8'); };
const quietEnv = (tmp) => ({ SDLC_DISABLE_ENSURE_HUB: '1', SDLC_DISABLE_TRAY_HEAL: '1', SDLC_HOME: join(tmp, '.sdlc-home') });

function runHook(script, input, cwd, extraEnv = {}) {
  return spawnSync(process.execPath, [script], {
    cwd, input: JSON.stringify(input), encoding: 'utf-8',
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT, ...quietEnv(cwd), ...extraEnv },
  });
}

function queueRecords(repoRoot) {
  const qdir = join(repoRoot, '.ai', '_view', '.render-queue');
  if (!existsSync(qdir)) return [];
  return readdirSync(qdir).filter((n) => n.endsWith('.json') && n !== '.status.json');
}

test('hooks.json wires one command per tool event at the folded entries', () => {
  const wiring = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'hooks', 'hooks.json'), 'utf-8')).hooks;
  equal(wiring.PreToolUse.length, 1, 'one PreToolUse group');
  equal(wiring.PreToolUse[0].matcher, 'Write|Edit|MultiEdit|Bash');
  equal(wiring.PreToolUse[0].hooks.length, 1);
  match(wiring.PreToolUse[0].hooks[0].command, /dist\/pre-tool-use-all\.mjs/);
  equal(wiring.PostToolUse.length, 1, 'one PostToolUse group');
  equal(wiring.PostToolUse[0].matcher, 'Write|Edit|MultiEdit|NotebookEdit');
  equal(wiring.PostToolUse[0].hooks.length, 1);
  match(wiring.PostToolUse[0].hooks[0].command, /dist\/post-tool-use-all\.mjs/);
  ok(existsSync(PRE) && existsSync(POST), 'both folded entries exist in hooks/');
});

test('pre-tool-use-all: a Write of an invalid artifact blocks with the validator reason', () => {
  const tmp = tempDir();
  try {
    const r = runHook(PRE, {
      cwd: tmp, tool_name: 'Write',
      tool_input: { file_path: '.ai/workflows/demo/bad name.md', content: 'no frontmatter\n' },
    }, tmp);
    equal(r.status, 2, r.stderr);
    match(r.stderr, /wf-validate: blocked write to bad name\.md/);
    equal(r.stdout, '', 'a block carries no systemMessage');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('pre-tool-use-all: a shell payload reaches leak-guard-bash; the dispatch sentinel silences the process', () => {
  const tmp = tempDir();
  try {
    writeFile(join(tmp, '.ai', 'sdlc-config.json'), JSON.stringify({ semantic: { enabled: true, mode: 'enforce' } }));
    const input = { cwd: tmp, tool_name: 'Bash', tool_input: { command: 'gh release create v1.2.3 --notes "shipped via /wf ship demo"' } };
    const denied = runHook(PRE, input, tmp);
    equal(denied.status, 2, denied.stderr);
    match(denied.stderr, /External Output Boundary/);
    const dispatched = runHook(PRE, input, tmp, { SDLC_DISPATCH_ACTIVE: '1' });
    equal(dispatched.status, 0, dispatched.stderr);
    equal(dispatched.stdout, '');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('pre-tool-use-all: an advisory finding is one JSON systemMessage line', () => {
  const tmp = tempDir();
  try {
    writeFile(join(tmp, '.ai', 'sdlc-config.json'), JSON.stringify({ semantic: { enabled: true, mode: 'advisory' } }));
    const r = runHook(PRE, {
      cwd: tmp, tool_name: 'Write',
      tool_input: { file_path: 'README.md', content: '# Demo\n\nRun /wf ship demo to publish the slice.\n' },
    }, tmp);
    equal(r.status, 0, r.stderr);
    const lines = r.stdout.trim().split('\n');
    equal(lines.length, 1, `one stdout line: ${r.stdout}`);
    match(JSON.parse(lines[0]).systemMessage, /External Output Boundary/);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('post-tool-use-all: a verify block exits 2 and the render request is still queued', () => {
  const tmp = tempDir();
  try {
    const rel = '.ai/workflows/demo/04-plan-core.md';
    writeFile(join(tmp, rel), 'no frontmatter at all\n');
    const r = runHook(POST, { cwd: tmp, tool_name: 'Write', tool_input: { file_path: rel, content: 'no frontmatter at all\n' } }, tmp);
    equal(r.status, 2, r.stderr);
    match(r.stderr, /wf-postwrite-verify: frontmatter validation FAILED/);
    equal(queueRecords(tmp).length, 1, 'the render request was queued after the block');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('post-tool-use-all: a non-artifact write is silent and queues nothing', () => {
  const tmp = tempDir();
  try {
    mkdirSync(join(tmp, '.ai', 'workflows'), { recursive: true });
    writeFile(join(tmp, 'src', 'app.js'), 'export const x = 1;\n');
    const r = runHook(POST, { cwd: tmp, tool_name: 'Write', tool_input: { file_path: 'src/app.js', content: 'export const x = 1;\n' } }, tmp);
    equal(r.status, 0, r.stderr);
    equal(r.stdout, '');
    equal(queueRecords(tmp).length, 0);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
