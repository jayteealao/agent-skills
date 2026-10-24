// WF-PIECES-PLAN 4.1 in the write hooks:
// - research/, references/, work/changes.md, work/migration.md, work/archive/ and
//   history/ snapshots are free-form: no NN- name, no frontmatter, no schema check;
// - work/<piece-slug>.md pieces and work/index.md need no NN- name, and their
//   frontmatter is schema-checked as piece and list;
// - a started piece (open, built, done or dropped) is never rewritten; only its state moves;
// - none of these files queues a render or marks a workflow stale.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { deepEqual, equal, match } from 'node:assert/strict';

import { renderPiece } from '../../../lib/pieces.mjs';
import { listWorkflowArtifactFiles } from '../../../lib/workflow-index.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..', '..', '..');
const HOOKS = {
  preWriteValidate: join(PLUGIN_ROOT, 'hooks', 'pre-write-validate.mjs'),
  postWriteVerify: join(PLUGIN_ROOT, 'hooks', 'post-write-verify.mjs'),
  postWriteRender: join(PLUGIN_ROOT, 'hooks', 'post-write-render.mjs'),
};
const SLUG = 'brainstorm-demo-20261003';
const WF = `.ai/workflows/${SLUG}`;

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'sdlc-work-hooks-'));
}

function runHook(script, input, cwd, extraEnv = {}) {
  return spawnSync(process.execPath, [script], {
    cwd,
    input: JSON.stringify(input),
    encoding: 'utf-8',
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT, SDLC_DISABLE_ENSURE_HUB: '1', SDLC_DISABLE_TRAY_HEAL: '1', ...extraEnv },
  });
}

function writeFile(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf-8');
}

function queueRecords(repoRoot) {
  const qdir = join(repoRoot, '.ai', '_view', '.render-queue');
  if (!existsSync(qdir)) return [];
  return readdirSync(qdir).filter((n) => n.endsWith('.json') && n !== '.status.json');
}

const BOARD = {
  schema: 'sdlc/v1', artifact: 'brainstorm-board', slug: SLUG, topic: 'demo',
  areas: [], threads: [{ key: 't', name: 'T', state: 'live' }],
  items: [{ key: 'd', kind: 'decision', thread: 't', text: 'One decision.', source: 'person', scope: 'keep' }],
  work: [{ key: 'p', order: 1, title: 'Build it', shape: 'intake', slug: 'build-it', items: ['d'], entry: 'x', state: 'proposed' }],
  log: [],
};
const PIECE = renderPiece(BOARD, BOARD.work[0], { revision: 1, generatedAt: '2026-10-03T10:00:00Z' });
const NOTE = '---\nid: R01\nquestion: How fast?\n---\nTen a second.\n';

for (const rel of [
  `${WF}/research/R01-speed.md`,
  `${WF}/research/index.md`,
  `${WF}/references/index.md`,
  `${WF}/references/briefs/brief.md`,
  `${WF}/work/changes.md`,
  `${WF}/work/archive/campaign/ledger.md`,
  `${WF}/work/migration.md`,
  `${WF}/history/engine.s3.md`,
]) {
  test(`pre-write-validate lets ${rel} through as a free-form file`, () => {
    const tmp = tempDir();
    try {
      const result = runHook(HOOKS.preWriteValidate, { cwd: tmp, tool_input: { file_path: rel, content: NOTE } }, tmp);
      equal(result.status, 0, result.stderr);
      equal(result.stderr, '');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test(`post-write-verify runs no schema check on ${rel}`, () => {
    const tmp = tempDir();
    try {
      writeFile(join(tmp, rel), '# no frontmatter\n');
      const result = runHook(HOOKS.postWriteVerify, { cwd: tmp, tool_input: { file_path: rel } }, tmp);
      equal(result.status, 0, result.stderr);
      equal(result.stderr, '');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
}

test('a piece needs no NN- name and passes both write hooks', () => {
  const tmp = tempDir();
  const rel = `${WF}/work/build-it.md`;
  try {
    const pre = runHook(HOOKS.preWriteValidate, { cwd: tmp, tool_input: { file_path: rel, content: PIECE } }, tmp);
    equal(pre.status, 0, pre.stderr);
    writeFile(join(tmp, rel), PIECE);
    const post = runHook(HOOKS.postWriteVerify, { cwd: tmp, tool_input: { file_path: rel } }, tmp);
    equal(post.status, 0, post.stderr);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('a piece with a bad form is blocked by the schema check', () => {
  const tmp = tempDir();
  const rel = `${WF}/work/build-it.md`;
  try {
    writeFile(join(tmp, rel), PIECE.replace('form: intake', 'form: design'));
    const post = runHook(HOOKS.postWriteVerify, { cwd: tmp, tool_input: { file_path: rel } }, tmp);
    equal(post.status, 2);
    match(post.stderr, /form/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('a started piece is never rewritten; the walk may move its state', () => {
  const tmp = tempDir();
  const rel = `${WF}/work/build-it.md`;
  try {
    const open = PIECE.replace('state: written', 'state: open');
    writeFile(join(tmp, rel), open);
    const rewrite = runHook(HOOKS.preWriteValidate, { cwd: tmp, tool_input: { file_path: rel, content: open.replace('One decision.', 'Two decisions.') } }, tmp);
    equal(rewrite.status, 2);
    match(rewrite.stderr, /a started piece is never rewritten/);
    const built = runHook(HOOKS.preWriteValidate, { cwd: tmp, tool_input: { file_path: rel, content: open.replace('state: open', 'state: built') } }, tmp);
    equal(built.status, 0, built.stderr);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('a non-NN .md at the top of a workflow is still blocked', () => {
  const tmp = tempDir();
  try {
    const result = runHook(HOOKS.preWriteValidate, { cwd: tmp, tool_input: { file_path: `${WF}/report.md`, content: NOTE } }, tmp);
    equal(result.status, 2);
    match(result.stderr, /Filename 'report\.md'/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('sources and work files queue no render and never mark a workflow stale', async () => {
  const tmp = tempDir();
  try {
    for (const rel of [`${WF}/research/R01-speed.md`, `${WF}/references/index.md`, `${WF}/work/build-it.md`]) {
      writeFile(join(tmp, rel), NOTE);
      const result = runHook(HOOKS.postWriteRender, { cwd: tmp, tool_input: { file_path: rel } }, tmp, { SDLC_HOME: join(tmp, '.sdlc-home') });
      equal(result.status, 0, result.stderr);
    }
    deepEqual(queueRecords(tmp), []);
    writeFile(join(tmp, WF, '01-brainstorm.md'), '---\nschema: sdlc/v1\n---\n');
    const old = new Date('2026-01-01T00:00:00Z');
    utimesSync(join(tmp, WF, '01-brainstorm.md'), old, old);
    const files = (await listWorkflowArtifactFiles(join(tmp, WF))).map((f) => f.replace(/\\/g, '/'));
    deepEqual(files.filter((f) => /\/(research|references|work)\//.test(f)), []);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
