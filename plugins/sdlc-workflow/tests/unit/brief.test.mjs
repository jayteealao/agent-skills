// lib/brief.mjs and `wf.mjs brief`: the brief of a stage agent, built from the records.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { SECTION_CAP, absoluteLinks, buildBrief, sectionOf } from '../../lib/brief.mjs';
import { addDecision } from '../../lib/decisions.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('sectionOf takes one ## section, keeps ### headings, and skips a heading inside a fence', () => {
  const text = [
    '---', 'type: plan', '---', '# Plan: x', '',
    '## Handover', '', 'files: a.js', '### Detail', 'more', '',
    '```', '## Not a heading', '```', 'after fence', '',
    '## Risks', 'none',
  ].join('\n');
  assert.equal(sectionOf(text, 'Handover'), 'files: a.js\n### Detail\nmore\n\n```\n## Not a heading\n```\nafter fence');
  assert.equal(sectionOf(text, 'risks'), 'none');
  assert.equal(sectionOf(text, 'Absent'), null);
  assert.equal(sectionOf('## `Card`\nrule\n', 'Card'), 'rule');
});

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-brief-'));
  const ref = path.join(root, 'reference');
  const dir = path.join(root, '.ai', 'workflows', 'demo');
  mkdirSync(ref, { recursive: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(ref, 'implement.md'), '# Implement\n\n## Card\n\n- Red before green.\n- One commit per step.\n\n## Requires\n\n| x |\n');
  writeFileSync(path.join(ref, 'plan.md'), '# Plan\n\n## Requires\n');
  writeFileSync(path.join(dir, '03-slice-api.md'), '---\ntype: slice\n---\n# Slice: API\n\n## Goal\n\nServe the list.\n\n## Why This Slice Exists\n\nskip me\n\n## Scope\n\nIn: GET.\n\n## Acceptance Criteria\n\n- Given a list When GET Then 200\n');
  writeFileSync(path.join(dir, '04-plan-api.md'), '---\ntype: plan\n---\n# Plan: API\n\n## Current State\n\nskip\n\n## Step-by-Step Plan\n\n1. **Route** — files: `api.js`. Done when: `npm test` passes.\n\n## Handover\n\n`api.js` → `list()`\n');
  writeFileSync(path.join(dir, '02-shape.md'), '---\ntype: shape\n---\n## Acceptance Criteria\n\n- The list shows.\n');
  writeFileSync(path.join(root, '.ai', 'sdlc-config.json'), JSON.stringify({ testProfile: {
    fast: { command: 'npm test', estimateSeconds: 30, measuredSeconds: 120 },
    affected: { command: 'npm test -- {files}', estimateSeconds: 60 },
    full: { command: 'npm run test:all', estimateSeconds: 900 },
  } }));
  return { root, ref, dir, done: () => rmSync(root, { recursive: true, force: true }) };
}

test('buildBrief: card, slice sections, the plan sections of the stage, and the decisions of the slice only', () => {
  const f = fixture();
  try {
    addDecision(f.dir, { key: 'db', question: 'Which store?', answer: 'sqlite' });
    addDecision(f.dir, { key: 'cache', answer: 'none', scope: { slice: 'ui' } });
    addDecision(f.dir, { key: 'page', answer: '50 rows', scope: { slice: 'api' } });
    const b = buildBrief({ projectRoot: f.root, referenceRoot: f.ref, slug: 'demo', stage: 'implement', slice: 'api' });
    assert.deepEqual(b.missing, []);
    assert.equal(b.parts.card, '- Red before green.\n- One commit per step.');
    assert.match(b.parts.slice, /### Goal\n\nServe the list\./);
    assert.match(b.parts.slice, /### Acceptance Criteria\n\n- Given a list/);
    assert.doesNotMatch(b.parts.slice, /skip me/);
    assert.match(b.parts.plan, /### Step-by-Step Plan\n\n1\. \*\*Route\*\*/);
    assert.match(b.parts.plan, /### Handover/);
    assert.doesNotMatch(b.parts.plan, /Current State/);
    assert.deepEqual(b.parts.decisions.split('\n').map((l) => l.slice(2, 7)), ['D-001', 'D-003']);
    assert.equal(b.parts.tests, '- fast: `npm test` (120s measured)\n- affected: `npm test -- {files}` (60s estimated)\n\nTime box: 10 minutes.');
    assert.match(b.text, /^# Brief: implement demo api\n\n## Card\n/);
  } finally { f.done(); }
});

test('buildBrief: a stage with no plan sections, no slice, and the missing parts', () => {
  const f = fixture();
  try {
    const b = buildBrief({ projectRoot: f.root, referenceRoot: f.ref, slug: 'demo', stage: 'plan' });
    assert.equal(b.parts.plan, null);
    assert.doesNotMatch(b.text, /## Plan\n/);
    assert.doesNotMatch(b.text, /## Tests\n/, 'plan runs no suite');
    const r = buildBrief({ projectRoot: f.root, referenceRoot: f.ref, slug: 'demo', stage: 'review' });
    assert.match(r.parts.tests, /^- full: `npm run test:all` \(900s estimated\)\n\nTime box: 45 minutes\.$/);
    assert.ok(r.missing.includes('the ## Card section of reference/review.md'));
    assert.match(b.parts.slice, /Acceptance Criteria \(02-shape\.md\)\n\n- The list shows\./);
    assert.deepEqual(b.missing, ['the ## Card section of reference/plan.md']);
    assert.match(b.text, /No live decisions in this scope\./);
    const v = buildBrief({ projectRoot: f.root, referenceRoot: f.ref, slug: 'demo', stage: 'verify', slice: 'gone' });
    assert.deepEqual(v.missing, ['the ## Card section of reference/verify.md', '.ai/workflows/demo/slice-gone.yaml#slice', '.ai/workflows/demo/slice-gone.yaml#plan']);
    assert.throws(() => buildBrief({ projectRoot: f.root, referenceRoot: f.ref, slug: 'nope', stage: 'plan' }), /no workflow folder/);
  } finally { f.done(); }
});

test('buildBrief: a long section is cut and names its file', () => {
  const f = fixture();
  try {
    writeFileSync(path.join(f.dir, '04-plan-api.md'), `## Handover\n\n${'x'.repeat(SECTION_CAP + 10)}\n`);
    const b = buildBrief({ projectRoot: f.root, referenceRoot: f.ref, slug: 'demo', stage: 'implement', slice: 'api' });
    assert.match(b.parts.plan, /cut at 12000 characters: read \.ai\/workflows\/demo\/04-plan-api\.md for the rest/);
  } finally { f.done(); }
});

test('absoluteLinks makes a relative link absolute and leaves a URL, an anchor and an absolute path', () => {
  assert.equal(absoluteLinks('see [a](_a.md), [b](./verify/_b.md#x), [c](https://e.com), [d](#top), [e](/abs.md)', 'C:\\p\\reference\\'),
    'see [a](C:/p/reference/_a.md), [b](C:/p/reference/verify/_b.md#x), [c](https://e.com), [d](#top), [e](/abs.md)');
});

test('wf.mjs brief prints the brief of a real stage reference', () => {
  const f = fixture();
  try {
    const r = spawnSync(process.execPath, [path.join(pluginRoot, 'scripts', 'wf.mjs'), 'brief', f.root, 'demo', 'implement', 'api', '--json'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const b = JSON.parse(r.stdout);
    assert.match(b.text, /^# Brief: implement demo api\n\nThe decision commands are `node "[^"]+\/skills\/wf\/scripts\/wf\.mjs" decide <verb> /);
    assert.ok(b.parts.slice.includes('Serve the list.'));
  } finally { f.done(); }
});
