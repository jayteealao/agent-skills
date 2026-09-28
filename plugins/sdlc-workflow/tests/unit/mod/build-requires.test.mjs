// scripts/build-requires.mjs: the `## Requires` tables of the stage references
// (ARTIFACT-SPLIT-PLAN.md S1) become hooks/mod/requires.ts, the data the mod's
// read check reads (S6). Fixture reference trees live in temp dirs; the last
// test is the guard that the committed module matches the references.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { collectRequires, main, parseRequires, renderRequires, stageKeyOf } from '../../../scripts/build-requires.mjs';

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = path.join(PLUGIN_ROOT, 'scripts', 'build-requires.mjs');

const PLAN_MD = `# Plan

| Field | Value |
|---|---|
| Requires | See [## Requires](#requires). |

## Requires

Read every row before you write the stage artifact. [_requires.md](_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| \`00-index.md\` | artifact | always | |
| \`02-shape.md\` | artifact | always | Acceptance Criteria; Non-Functional Requirements; Edge Cases; Out of Scope |
| \`po-answers.md\` | artifact | if-present | |
| repository signals | artifact | always | |
| \`plan/_artifact.md\` | procedure | always | |
| \`04-plan-<slice>.md\` | writes | | |

## Step 0

Text.
`;

const FENCED_MD = `# Requires rules

\`\`\`markdown
## Requires

| Input | Kind | When | Sections |
|---|---|---|---|
| \`x.md\` | artifact | always | |
\`\`\`
`;

function tree(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'build-requires-'));
  for (const [rel, text] of Object.entries(files)) {
    const abs = path.join(dir, 'reference', rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, text);
  }
  return dir;
}

const quiet = () => {};

test('stageKeyOf derives the stage key from the reference path', () => {
  assert.equal(stageKeyOf('plan.md'), 'plan');
  assert.equal(stageKeyOf('intake/fix.md'), 'intake:fix');
  assert.equal(stageKeyOf('augment/benchmark.md'), 'augment:benchmark');
  assert.equal(stageKeyOf('review.md'), 'review');
});

test('parseRequires reads the table, splits sections, and marks free-text inputs', () => {
  const { rows, errors } = parseRequires(PLAN_MD);
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 6);
  assert.deepEqual(rows[1], { input: '02-shape.md', kind: 'artifact', when: 'always', sections: ['Acceptance Criteria', 'Non-Functional Requirements', 'Edge Cases', 'Out of Scope'], file: true });
  assert.equal(rows[3].file, false);
  assert.deepEqual(rows[5], { input: '04-plan-<slice>.md', kind: 'writes', when: '', sections: [], file: true });
});

test('parseRequires ignores a table inside fenced code and a text with no section', () => {
  assert.equal(parseRequires(FENCED_MD).rows, null);
  assert.equal(parseRequires('# Nothing\n').rows, null);
});

test('parseRequires reports an unknown kind and a bad header', () => {
  const bad = PLAN_MD.replace('| procedure |', '| recipe |');
  assert.match(parseRequires(bad).errors[0], /unknown Kind "recipe"/);
  const header = PLAN_MD.replace('| Input | Kind | When | Sections |', '| Input | Kind | When |');
  assert.match(parseRequires(header).errors[0], /header/);
});

test('collectRequires tolerates zero tables, skips sub-procedures, sorts, and drops free text', () => {
  const empty = tree({ 'plan.md': '# Plan\n', '_rules.md': FENCED_MD });
  try {
    assert.deepEqual(collectRequires(path.join(empty, 'reference')), { entries: [], errors: [] });
    assert.match(renderRequires([]), /export const REQUIRES: readonly RequiresEntry\[\] = \[\]/);
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
  const full = tree({ 'plan.md': PLAN_MD, 'intake/fix.md': PLAN_MD, 'intake/_change-mode-tail.md': PLAN_MD });
  try {
    const { entries, errors } = collectRequires(path.join(full, 'reference'));
    assert.deepEqual(errors, []);
    assert.deepEqual(entries.map((entry) => [entry.reference, entry.stage]), [['intake/fix.md', 'intake:fix'], ['plan.md', 'plan']]);
    assert.equal(entries[1].rows.length, 5);
    assert.ok(entries[1].rows.every((row) => !('file' in row)));
  } finally {
    rmSync(full, { recursive: true, force: true });
  }
});

test('main writes the module, --check passes on it and fails after a table changes', () => {
  const dir = tree({ 'plan.md': PLAN_MD });
  const out = path.join(dir, 'requires.ts');
  const args = ['--reference', path.join(dir, 'reference'), '--out', out];
  try {
    assert.equal(main(['--check', ...args], quiet, quiet), 1);
    assert.equal(main(args, quiet, quiet), 0);
    const text = readFileSync(out, 'utf8');
    assert.match(text, /"stage": "plan"/);
    assert.match(text, /import type \{ RequiresEntry \} from '\.\/readledger\.ts'/);
    assert.equal(main(['--check', ...args], quiet, quiet), 0);
    // CRLF on disk (a Windows checkout) still counts as up to date.
    writeFileSync(out, text.replace(/\n/g, '\r\n'));
    assert.equal(main(['--check', ...args], quiet, quiet), 0);
    writeFileSync(path.join(dir, 'reference', 'plan.md'), PLAN_MD.replace('| `po-answers.md` | artifact | if-present | |\n', ''));
    assert.equal(main(['--check', ...args], quiet, quiet), 1);
    writeFileSync(path.join(dir, 'reference', 'plan.md'), PLAN_MD.replace('| procedure |', '| recipe |'));
    assert.equal(main(args, quiet, quiet), 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('hooks/mod/requires.ts is up to date with the stage references', () => {
  const result = spawnSync(process.execPath, [SCRIPT, '--check'], { encoding: 'utf8', cwd: PLUGIN_ROOT });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}\nRun: node scripts/build-requires.mjs`);
});
