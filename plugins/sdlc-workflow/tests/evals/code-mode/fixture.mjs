// The fixture of the code-mode eval: a git repo with one workflow of six slices. Three slices
// have a verify record, slice s3 stopped at a question in step 3 of its plan, five questions
// are open, and the brainstorm board has a thread of four items. Every record carries the
// required fields of the schema, so the CLI and the library accept a change of it.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stampOf } from '../../../scripts/wf.mjs';
import { writeDriverOutcome } from '../../../lib/progress.mjs';
import { INDEX_NAME, writeDoc } from '../../../lib/records.mjs';
import { appendStep } from '../../../lib/steps.mjs';
import { parse } from '../../../lib/yaml.mjs';

export const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const SLUG = 'codemode';
export const SLICES = ['s1', 's2', 's3', 's4', 's5', 's6'];
/** The verify result and the convergence of each slice that has a verify record. */
export const VERIFY = { s1: ['pass', 'converged'], s2: ['fail', 'escalated'], s3: ['partial', 'not-needed'] };
export const QUESTIONS = [
  ['q1', 'Which database?', 'postgres'],
  ['q2', 'Which queue?', 'sqs'],
  ['q3', 'Which auth?', 'oauth'],
  ['q4', 'Keep the old endpoint?', 'no'],
  ['q5', 'Which region?', 'eu-west-1'],
];
export const BOARD_ITEMS = ['i1', 'i2', 'i3', 'i4'];
const AT = '2026-10-25T10:00:00Z';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** The stamp of a record type with every required field, merged with `over`. */
const record = (type, over = {}, slice = null) => ({
  ...parse(stampOf(type, { slug: SLUG, slice, now: AT }).replace(/^---\n/, '').replace(/\n---$/, '')),
  ...over,
});

/** Make the fixture in the empty folder `root`. Returns the paths that the checks read. */
export function makeFixture(root) {
  mkdirSync(root, { recursive: true });
  git(root, 'init', '-q', '-b', 'main');
  for (const [k, v] of [['user.name', 'eval'], ['user.email', 'eval@example.com'], ['commit.gpgsign', 'false']]) git(root, 'config', k, v);
  writeFileSync(join(root, 'README.md'), '# codemode fixture\n');
  writeFileSync(join(root, '.gitignore'), '.ai/\n.scratch/\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');

  const dir = join(root, '.ai', 'workflows', SLUG);
  mkdirSync(dir, { recursive: true });
  writeDoc(dir, INDEX_NAME, { frontmatter: record('index', {
    title: 'Code mode fixture', status: 'active', 'current-stage': 'implement', 'selected-slice': 's3',
    'open-questions': QUESTIONS.map(([key, question]) => ({ key, question })),
    'workflow-files': ['00-index.md', '03-slice.md'],
    'next-command': 'wf-implement', 'next-invocation': `/wf implement ${SLUG} s3`,
  }) });
  const status = { s1: 'complete', s2: 'complete', s3: 'in-progress' };
  writeDoc(dir, '03-slice.md', { frontmatter: record('slice-index', {
    'total-slices': SLICES.length, 'best-first-slice': 's1',
    slices: SLICES.map((s) => ({ slug: s, title: `Slice ${s}`, status: status[s] ?? 'defined' })),
  }) });
  for (const [s, [result, convergence]] of Object.entries(VERIFY)) {
    writeDoc(dir, `06-verify-${s}.md`, { frontmatter: record('verify', { result, convergence }, s), body: `# Verify ${s}\n` });
  }
  writeDoc(dir, '04-plan-s3.md', {
    frontmatter: record('plan', {}, 's3'),
    body: '# Plan s3\n\n## Step-by-Step Plan\n\n### Step 1: Route\n\nAdd the route.\n\n### Step 2: Store\n\nAdd the store.\n\n### Step 3: Retry\n\nAdd the retry.\n\n### Step 4: Docs\n\nWrite the docs.\n',
  });
  const head = git(root, 'rev-parse', 'HEAD');
  appendStep(dir, { slice: 's3', event: 'start', step: 1, title: 'Route', head, branch: 'main' }, { now: AT });
  appendStep(dir, { slice: 's3', event: 'done', step: 1, noChange: true, head, branch: 'main' }, { now: AT });
  appendStep(dir, { slice: 's3', event: 'start', step: 2, title: 'Store', head, branch: 'main' }, { now: AT });
  appendStep(dir, { slice: 's3', event: 'done', step: 2, noChange: true, head, branch: 'main' }, { now: AT });
  appendStep(dir, { slice: 's3', event: 'start', step: 3, title: 'Retry', head, branch: 'main' }, { now: AT });
  writeDriverOutcome(dir, { run: 'run-7', driver: 'yolo', status: 'stopped', stoppedAt: 'implement s3 step 3', reason: 'a question to the person: the retry limit', resume: `/wf yolo ${SLUG} s3` }, { now: AT });

  const art = readFileSync(join(PLUGIN_ROOT, 'skills', 'wf', 'reference', 'intake', 'brainstorm', '_artifact.md'), 'utf8');
  const board = JSON.parse(/```json\n([\s\S]*?)\n```/.exec(art)[1]);
  const thread = board.threads[0].key;
  board.items = [...board.items, ...BOARD_ITEMS.map((key, n) => ({ ...board.items[0], key, thread, text: `Board item ${n + 1}.` }))];
  Object.assign(board, { slug: SLUG, 'updated-at': AT });
  writeFileSync(join(dir, 'brainstorm-board.json'), `${JSON.stringify(board, null, 2)}\n`);

  // The step that the control task records as done: a commit of the code.
  writeFileSync(join(root, 'retry.js'), 'export const retry = (n) => n;\n');
  git(root, 'add', 'retry.js');
  git(root, 'commit', '-q', '-m', 'feat: add the retry');
  return { root, dir, head: git(root, 'rev-parse', 'HEAD') };
}
