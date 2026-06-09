// Unit tests for lib/project-root.mjs — project-root anchoring for render and
// hook entrypoints. The scenarios mirror the bot-backend incident: a session
// cwd parked in a repo subfolder (or inside a workflow slug dir) must never
// anchor `.ai/_view` there.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { equal } from 'node:assert/strict';

import { resolveProjectRoot } from '../../../lib/project-root.mjs';
import { projectRootFromInput } from '../../../lib/hook-utils.mjs';

function tempDir(prefix = 'sdlc-project-root-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

function canon(p) {
  try { return realpathSync.native(p); } catch { return resolve(p); }
}

function gitInit(dir) {
  execFileSync('git', ['init', '-q'], { cwd: dir, windowsHide: true });
}

test('resolveProjectRoot: non-git dir falls back to startDir', () => {
  const dir = tempDir();
  try {
    const sub = join(dir, 'data', 'cases');
    mkdirSync(sub, { recursive: true });
    equal(resolveProjectRoot(sub), canon(sub));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveProjectRoot: subfolder cwd climbs to the git toplevel', () => {
  const repo = tempDir();
  try {
    gitInit(repo);
    mkdirSync(join(repo, '.ai', 'workflows', 'some-slug'), { recursive: true });
    const sub = join(repo, 'extracted_cases');
    mkdirSync(sub, { recursive: true });
    equal(resolveProjectRoot(sub), canon(repo));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('resolveProjectRoot: cwd inside a slug dir with a stray _view still resolves to the repo root', () => {
  const repo = tempDir();
  try {
    gitInit(repo);
    const slugDir = join(repo, '.ai', 'workflows', 'osce-system-prompts');
    // The stray artifact from the incident: a `.ai/_view`-only tree inside the
    // slug dir. It owns no workflow store, so it must NOT anchor the root.
    mkdirSync(join(slugDir, '.ai', '_view'), { recursive: true });
    writeFileSync(join(slugDir, '01-pitch.md'), '---\ntype: pitch\n---\n', 'utf-8');
    equal(resolveProjectRoot(slugDir), canon(repo));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('resolveProjectRoot: git toplevel wins when no .ai/workflows exists yet', () => {
  const repo = tempDir();
  try {
    gitInit(repo);
    const sub = join(repo, 'src', 'deep');
    mkdirSync(sub, { recursive: true });
    equal(resolveProjectRoot(sub), canon(repo));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('resolveProjectRoot: nearest .ai/workflows owner wins inside a monorepo', () => {
  const repo = tempDir();
  try {
    gitInit(repo);
    const subProject = join(repo, 'packages', 'app');
    mkdirSync(join(subProject, '.ai', 'workflows'), { recursive: true });
    const deep = join(subProject, 'src', 'components');
    mkdirSync(deep, { recursive: true });
    equal(resolveProjectRoot(deep), canon(subProject));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('projectRootFromInput: hook input cwd in a subfolder resolves to the repo root', () => {
  const repo = tempDir();
  try {
    gitInit(repo);
    mkdirSync(join(repo, '.ai', 'workflows', 'a-slug'), { recursive: true });
    const sub = join(repo, 'system_prompts');
    mkdirSync(sub, { recursive: true });
    equal(projectRootFromInput({ cwd: sub }), canon(repo));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
