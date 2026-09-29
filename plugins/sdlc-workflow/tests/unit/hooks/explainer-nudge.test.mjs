// ARTIFACT-SPLIT-PLAN S2 in post-write-verify: a stage agent file written
// without its `<stem>.explainer.html.fragment` gets a nudge, and a write to an
// explainer gets the explainer check as a nudge. Both warn only (exit 0), and
// both honour hooks.remindMissingFragments: false.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { equal, match, ok } from 'node:assert/strict';
import { EXPLAINER_STEM_PATTERNS, explainerStemFor } from '../../../hooks/post-write-verify.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..', '..', '..');
const HOOK = join(PLUGIN_ROOT, 'hooks', 'post-write-verify.mjs');

function runHook(input, cwd) {
  return spawnSync(process.execPath, [HOOK], {
    cwd,
    input: JSON.stringify(input),
    encoding: 'utf-8',
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
  });
}

function writeFile(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf-8');
}

function messages(stdout) {
  return stdout.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).systemMessage).join('\n');
}

// A schema-valid intake (same keys as hooks.test.mjs validIntake).
const INTAKE = [
  '---',
  'schema: "sdlc/v1"',
  'type: "intake"',
  'slug: "demo"',
  'status: "complete"',
  'stage-number: 1',
  'created-at: "2026-05-11T12:00:00Z"',
  'updated-at: "2026-05-11T12:05:00Z"',
  'tags: []',
  'refs: {}',
  'next-command: "/wf shape demo"',
  'next-invocation: "shape"',
  '---',
  'body',
  '',
].join('\n');

// A stage explainer that meets every floor: a short summary, 250+ body
// words, two visuals each led by a sentence, and a recap of ideas.
const BODY = Array.from({ length: 26 }, (_, i) => `Part ${i} of the request is explained in plain words here.`).join(' ');
const GOOD_EXPLAINER = [
  '<p>The request is clear. One risk remains.</p>',
  `<p>${BODY}</p>`,
  '<p>The loop shows the fix rounds.</p>',
  '<!-- @include explainer/cycle {"states":[{"label":"Run"},{"label":"Fix"}]} -->',
  '<p>The picture shows the parts.</p>',
  '<svg viewBox="0 0 10 10"><title>Parts</title><rect width="2" height="2" fill="var(--accent)"/></svg>',
  '<p>Recap: the request is clear and the risk is known.</p>',
  '',
].join('\n');

test('explainerStemFor: stage files that must carry an explainer', () => {
  for (const rel of [
    '.ai/workflows/demo/01-intake.md',
    '.ai/workflows/demo/01-fix.md',
    '.ai/workflows/demo/02-shape.md',
    '.ai/workflows/demo/02c-craft.md',
    '.ai/workflows/demo/03-slice.md',
    '.ai/workflows/demo/03-slice-core.md',
    '.ai/workflows/demo/04-plan-core.md',
    '.ai/workflows/demo/05-implement-core.md',
    '.ai/workflows/demo/06-verify-core.md',
    '.ai/workflows/demo/07-review.md',
    '.ai/workflows/demo/07-review-core.md',
    '.ai/workflows/demo/08-handoff.md',
    '.ai/workflows/demo/09-ship-run-r1.md',
    '.ai/workflows/demo/10-retro.md',
    '.ai/workflows/demo/99-close.md',
    '.ai\\workflows\\demo\\05c-benchmark.md',
  ]) {
    ok(explainerStemFor(rel), rel);
  }
  equal(explainerStemFor('.ai/workflows/demo/04-plan-core.md'), '04-plan-core');
});

test('explainerStemFor: files that carry no explainer', () => {
  for (const rel of [
    '.ai/workflows/demo/00-index.md',
    '.ai/workflows/demo/po-answers.md',
    '.ai/workflows/demo/01-brainstorm.md',
    '.ai/workflows/demo/04-plan.md',
    '.ai/workflows/demo/05-implement.md',
    '.ai/workflows/demo/06-verify.md',
    '.ai/workflows/demo/history/02-shape-1.md',
    '.ai/workflows/demo/verify-evidence/core/report.md',
    'src/02-shape.md',
  ]) {
    equal(explainerStemFor(rel), null, rel);
  }
  // A per-dimension review file is keyed by its type, not its name.
  equal(explainerStemFor('.ai/workflows/demo/07-review-security.md', 'review-command'), null);
  ok(EXPLAINER_STEM_PATTERNS.length > 10);
});

test('post-write-verify nudges (exit 0) when a stage file lands without its explainer', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'sdlc-xpl-nudge-'));
  try {
    const rel = '.ai/workflows/demo/01-intake.md';
    writeFile(join(tmp, rel), INTAKE);
    let r = runHook({ cwd: tmp, tool_input: { file_path: rel } }, tmp);
    equal(r.status, 0, r.stderr);
    match(messages(r.stdout), /Write the explainer 01-intake\.explainer\.html\.fragment per _story-arc\.md before you finish the stage\./);

    // With the explainer present, the write is silent.
    writeFile(join(tmp, '.ai/workflows/demo/01-intake.explainer.html.fragment'), GOOD_EXPLAINER);
    r = runHook({ cwd: tmp, tool_input: { file_path: rel } }, tmp);
    equal(r.status, 0, r.stderr);
    equal(r.stdout, '');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('post-write-verify runs the explainer check on an explainer write and never blocks', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'sdlc-xpl-lint-'));
  try {
    const rel = '.ai/workflows/demo/02-shape.explainer.html.fragment';
    writeFile(join(tmp, rel), GOOD_EXPLAINER);
    let r = runHook({ cwd: tmp, tool_input: { file_path: rel } }, tmp);
    equal(r.status, 0, r.stderr);
    equal(r.stdout, '');

    writeFile(join(tmp, rel), [
      '<p>One. Two. Three. Four. Five. Six.</p>',
      '<p>The bars compare the options.</p>',
      '<!-- @include explainer/comparison {"bars":[{"label":"a","value":1},{"label":"b","value":1}]} -->',
      '<p>Recap.</p>',
    ].join('\n'));
    r = runHook({ cwd: tmp, tool_input: { file_path: rel } }, tmp);
    equal(r.status, 0, r.stderr);
    const msg = messages(r.stdout);
    match(msg, /explainer check \(advisory/);
    match(msg, /summary <p> has 6 sentences/);
    match(msg, /that is a list, not a chart/);

    // An unparseable explainer is reported, still exit 0.
    writeFile(join(tmp, rel), '<p>a</p><div>');
    r = runHook({ cwd: tmp, tool_input: { file_path: rel } }, tmp);
    equal(r.status, 0, r.stderr);
    match(messages(r.stdout), /does not parse/);

    // The hook passes the file name, so the stage floors apply.
    writeFile(join(tmp, rel), '<p>Short. Thin.</p>\n<p>Recap: thin.</p>');
    r = runHook({ cwd: tmp, tool_input: { file_path: rel } }, tmp);
    equal(r.status, 0, r.stderr);
    match(messages(r.stdout), /a stage explainer needs about 250/);
    match(messages(r.stdout), /0 visuals; a stage explainer normally has two or more/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('post-write-verify applies the per-slice floors to a per-slice explainer', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'sdlc-xpl-slice-'));
  try {
    const rel = '.ai/workflows/demo/05-implement-core.explainer.html.fragment';
    writeFile(join(tmp, rel), '<p>The slice moved four parts. The gate matched.</p>\n<p>Recap: parts moved.</p>');
    let r = runHook({ cwd: tmp, tool_input: { file_path: rel } }, tmp);
    equal(r.status, 0, r.stderr);
    const msg = messages(r.stdout);
    match(msg, /a per-slice explainer needs about 150/);
    match(msg, /0 visuals; a per-slice explainer needs at least one/);

    // A per-slice explainer with enough body and one visual is silent.
    const body = Array.from({ length: 16 }, (_, i) => `Step ${i} of the slice is explained in plain words here.`).join(' ');
    writeFile(join(tmp, rel), [
      '<p>The slice moved four parts. The gate matched.</p>',
      `<p>${body}</p>`,
      '<p>The steps show the build order.</p>',
      '<!-- @include explainer/sequence {"steps":[{"label":"Types"},{"label":"Gate"}]} -->',
      '<p>Recap: four parts moved and replays are unchanged.</p>',
    ].join('\n'));
    r = runHook({ cwd: tmp, tool_input: { file_path: rel } }, tmp);
    equal(r.status, 0, r.stderr);
    equal(r.stdout, '');

    // The no-visual escape silences the visual floor.
    writeFile(join(tmp, rel), [
      '<p>The slice renamed one field. Nothing else changed.</p>',
      `<p>${body}</p>`,
      '<!-- no-visual: a rename has no structure to draw -->',
      '<p>Recap: one field has a clearer name.</p>',
    ].join('\n'));
    r = runHook({ cwd: tmp, tool_input: { file_path: rel } }, tmp);
    equal(r.status, 0, r.stderr);
    equal(r.stdout, '');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('hooks.remindMissingFragments: false silences both explainer nudges', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'sdlc-xpl-off-'));
  try {
    writeFile(join(tmp, '.ai', 'sdlc-config.json'), JSON.stringify({ hooks: { remindMissingFragments: false } }));
    const rel = '.ai/workflows/demo/01-intake.md';
    writeFile(join(tmp, rel), INTAKE);
    let r = runHook({ cwd: tmp, tool_input: { file_path: rel } }, tmp);
    equal(r.status, 0, r.stderr);
    equal(r.stdout, '');
    const xpl = '.ai/workflows/demo/01-intake.explainer.html.fragment';
    writeFile(join(tmp, xpl), '<figure></figure>');
    r = runHook({ cwd: tmp, tool_input: { file_path: xpl } }, tmp);
    equal(r.status, 0, r.stderr);
    equal(r.stdout, '');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
