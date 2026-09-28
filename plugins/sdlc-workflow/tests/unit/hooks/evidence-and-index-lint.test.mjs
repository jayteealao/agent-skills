// ARTIFACT-SPLIT-PLAN W3 (S4 + S5) in the write hooks:
// - evidence folders (probe-evidence/, verify-evidence/) are free-form: no NN-
//   name, no frontmatter, no schema check, no sibling check, no render;
// - index-history.jsonl and .read-ledger.jsonl pass every write hook silently;
// - post-write-verify lints 00-index.md (size, YAML comment prose, the
//   current-stage position) and only ever warns.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { deepEqual, equal, match, ok } from 'node:assert/strict';
import {
  INDEX_COMMENT_PROSE_MAX_WORDS,
  INDEX_SIZE_WARN_BYTES,
  INDEX_STAGE_HEAD_CHARS,
  indexLintWarnings,
} from '../../../hooks/post-write-verify.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..', '..', '..');

const HOOKS = {
  preWriteValidate: join(PLUGIN_ROOT, 'hooks', 'pre-write-validate.mjs'),
  postWriteVerify: join(PLUGIN_ROOT, 'hooks', 'post-write-verify.mjs'),
  postWriteRender: join(PLUGIN_ROOT, 'hooks', 'post-write-render.mjs'),
};

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'sdlc-split-hooks-'));
}

function runHook(script, input, cwd, extraEnv = {}) {
  return spawnSync(process.execPath, [script], {
    cwd,
    input: JSON.stringify(input),
    encoding: 'utf-8',
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT, ...extraEnv },
  });
}

function writeFile(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf-8');
}

function renderEnv(tmp) {
  return { SDLC_DISABLE_ENSURE_HUB: '1', SDLC_DISABLE_TRAY_HEAL: '1', SDLC_HOME: join(tmp, '.sdlc-home') };
}

function queueRecords(repoRoot) {
  const qdir = join(repoRoot, '.ai', '_view', '.render-queue');
  if (!existsSync(qdir)) return [];
  return readdirSync(qdir)
    .filter((n) => n.endsWith('.json') && n !== '.status.json')
    .map((n) => JSON.parse(readFileSync(join(qdir, n), 'utf-8')));
}

// A schema-valid index frontmatter block (same keys as hooks.test.mjs minimalIndex).
function indexText({ before = '', after = '', body = 'body\n' } = {}) {
  return [
    '---',
    before,
    'schema: "sdlc/v1"',
    'type: "index"',
    'slug: "demo"',
    'status: "active"',
    'title: "Demo workflow"',
    'current-stage: "implement"',
    'stage-number: 5',
    'branch-strategy: "dedicated"',
    'branch: "feature/demo"',
    'base-branch: "main"',
    'selected-slice: "core"',
    'open-questions: ["confirm rollout"]',
    'progress: {"intake":"complete","implement":"in-progress"}',
    'next-command: "/wf verify demo"',
    'next-invocation: "verify"',
    'created-at: "2026-09-28T12:00:00Z"',
    'updated-at: "2026-09-28T12:05:00Z"',
    'review-scope: "slug-wide"',
    'pr-url: ""',
    'pr-number: null',
    'tags: []',
    'workflow-files: ["00-index.md"]',
    after,
    '---',
    body,
  ].filter((line) => line !== '').join('\n');
}

const REPORT = 'Raw verify output\n\n$ npm test\n42 passing\n';

/* ── evidence folders (S5) ─────────────────────────────────────────────── */

for (const rel of [
  '.ai/workflows/demo/verify-evidence/core/report.md',
  '.ai/workflows/demo/probe-evidence/login/incidental.md',
]) {
  test(`pre-write-validate lets ${rel} through with no NN- name and no frontmatter`, () => {
    const tmp = tempDir();
    try {
      const result = runHook(HOOKS.preWriteValidate, { cwd: tmp, tool_input: { file_path: rel, content: REPORT } }, tmp);
      equal(result.status, 0, result.stderr);
      equal(result.stderr, '');
      equal(result.stdout, '');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test(`post-write-verify runs no schema or sibling check on ${rel}`, () => {
    const tmp = tempDir();
    try {
      // Even a rich-tier type with no sibling .yaml passes: the folder is exempt.
      writeFile(join(tmp, rel), '---\ntype: plan\n---\nnot an artifact\n');
      const result = runHook(HOOKS.postWriteVerify, { cwd: tmp, tool_input: { file_path: rel } }, tmp);
      equal(result.status, 0, result.stderr);
      equal(result.stderr, '');
      equal(result.stdout, '');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test(`post-write-render queues no render for ${rel}`, () => {
    const tmp = tempDir();
    try {
      writeFile(join(tmp, rel), REPORT);
      const result = runHook(HOOKS.postWriteRender, { cwd: tmp, tool_input: { file_path: rel } }, tmp, renderEnv(tmp));
      equal(result.status, 0, result.stderr);
      deepEqual(queueRecords(tmp), []);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
}

test('pre-write-validate still blocks a non-NN .md outside the evidence folders', () => {
  const tmp = tempDir();
  try {
    const result = runHook(HOOKS.preWriteValidate, {
      cwd: tmp,
      tool_input: { file_path: '.ai/workflows/demo/report.md', content: REPORT },
    }, tmp);
    equal(result.status, 2);
    match(result.stderr, /Filename 'report\.md'/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

/* ── .jsonl ledgers (S4, S6) ───────────────────────────────────────────── */

for (const rel of ['.ai/workflows/demo/index-history.jsonl', '.ai/workflows/demo/.read-ledger.jsonl']) {
  test(`write hooks pass ${rel} silently and queue no render`, () => {
    const tmp = tempDir();
    try {
      const content = '{"at":"2026-09-28T00:00:00Z","kind":"note","text":"moved from the index","stage":null}\n';
      writeFile(join(tmp, rel), content);
      for (const script of [HOOKS.preWriteValidate, HOOKS.postWriteVerify]) {
        const result = runHook(script, { cwd: tmp, tool_input: { file_path: rel, content } }, tmp);
        equal(result.status, 0, result.stderr);
        equal(result.stderr, '');
        equal(result.stdout, '');
      }
      const render = runHook(HOOKS.postWriteRender, { cwd: tmp, tool_input: { file_path: rel } }, tmp, renderEnv(tmp));
      equal(render.status, 0, render.stderr);
      deepEqual(queueRecords(tmp), []);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
}

/* ── index lint (S4, D7) ───────────────────────────────────────────────── */

test('indexLintWarnings: a clean index has no warnings', () => {
  deepEqual(indexLintWarnings(indexText()), []);
});

test('indexLintWarnings: constants match the plan', () => {
  equal(INDEX_SIZE_WARN_BYTES, 20480);
  equal(INDEX_STAGE_HEAD_CHARS, 4000);
  equal(INDEX_COMMENT_PROSE_MAX_WORDS, 8);
});

test('indexLintWarnings: warns over 20 KB and names index-history.jsonl', () => {
  const text = indexText({ body: 'x'.repeat(INDEX_SIZE_WARN_BYTES + 10) });
  const warnings = indexLintWarnings(text);
  equal(warnings.length, 1);
  match(warnings[0], /bytes, over the 20480-byte limit/);
  match(warnings[0], /index-history\.jsonl/);
  // exactly at the limit is fine
  deepEqual(indexLintWarnings('a', INDEX_SIZE_WARN_BYTES), []);
});

test('indexLintWarnings: warns on a frontmatter comment of more than 8 words only', () => {
  const short = indexText({ before: '# ---- stage state (8 words max ok) ----' });
  deepEqual(indexLintWarnings(short), []);
  const prose = indexText({ after: '# shape decided to defer the retry work because the queue owner was away' });
  const warnings = indexLintWarnings(prose);
  equal(warnings.length, 1);
  match(warnings[0], /YAML comment line\(s\) of prose/);
  // a body comment is markdown, not YAML, and is not linted
  deepEqual(indexLintWarnings(indexText({ body: '# a heading with a great many words in it for sure yes\n' })), []);
});

test('indexLintWarnings: warns when current-stage is past the first 4000 characters', () => {
  const pad = Array.from({ length: 300 }, (_, i) => `# pad line ${i}`).join('\n');
  const text = indexText().replace('current-stage: "implement"\n', '').replace('\n---\nbody', `\n${pad}\ncurrent-stage: "implement"\n---\nbody`);
  ok(text.indexOf('current-stage:') > INDEX_STAGE_HEAD_CHARS);
  const warnings = indexLintWarnings(text);
  equal(warnings.length, 1);
  match(warnings[0], /first 4000 characters/);
});

test('post-write-verify warns (exit 0) on an oversized index with comment prose', () => {
  const tmp = tempDir();
  try {
    const rel = '.ai/workflows/demo/00-index.md';
    writeFile(join(tmp, rel), indexText({
      after: '# verify ran twice and the second pass found the cache flake again today',
      body: `${'history line\n'.repeat(2000)}`,
    }));
    const result = runHook(HOOKS.postWriteVerify, { cwd: tmp, tool_input: { file_path: rel } }, tmp);
    equal(result.status, 0, result.stderr);
    const out = JSON.parse(result.stdout.trim().split('\n').at(-1));
    match(out.systemMessage, /index lint \(advisory\)/);
    match(out.systemMessage, /over the 20480-byte limit/);
    match(out.systemMessage, /YAML comment line\(s\) of prose/);
    match(out.systemMessage, /hooks\.indexLint: false/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('post-write-verify is silent for a clean index and honours hooks.indexLint: false', () => {
  const tmp = tempDir();
  try {
    const rel = '.ai/workflows/demo/00-index.md';
    writeFile(join(tmp, rel), indexText());
    let result = runHook(HOOKS.postWriteVerify, { cwd: tmp, tool_input: { file_path: rel } }, tmp);
    equal(result.status, 0, result.stderr);
    equal(result.stdout, '');

    writeFile(join(tmp, rel), indexText({ body: 'x'.repeat(INDEX_SIZE_WARN_BYTES + 1) }));
    writeFile(join(tmp, '.ai', 'sdlc-config.json'), JSON.stringify({ hooks: { indexLint: false } }));
    result = runHook(HOOKS.postWriteVerify, { cwd: tmp, tool_input: { file_path: rel } }, tmp);
    equal(result.status, 0, result.stderr);
    equal(result.stdout, '');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
