// The triage loop of ideate: the triage check of lib/ideate.mjs and the
// schema keys of the loop (triage, links between ideas, rounds), plus the procedure
// files that the loop needs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { STEER_WORDS, TRIAGE_STATES, triageProblems } from '../../lib/ideate.mjs';
import { validateFrontmatter } from '../../lib/schema-validator.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(pluginRoot, rel), 'utf8');

function fm(over = {}) {
  return {
    schema: 'sdlc/v1', type: 'ideation', slug: 'ideate-all-20261026', focus: 'all', 'created-at': '2026-10-26T10:00:00Z',
    ideas: [
      { id: 'IDEA-001', title: 'Add retry logic to the Stripe client', triage: 'take', 'triage-at': '2026-10-26T10:05:00Z' },
      { id: 'IDEA-002', title: 'Split the payments module', triage: 'later' },
      { id: 'IDEA-003', title: 'Cache the price list', triage: 'drop', 'triage-reason': 'the price list changes every minute' },
      { id: 'IDEA-004', title: 'Rethink checkout', triage: 'brainstorm', 'routed-to': 'brainstorm-rethink-checkout-20261026' },
      { id: 'IDEA-005', title: 'Retry the refund client too', triage: 'open', round: 2, parent: 'IDEA-001' },
      { id: 'IDEA-006', title: 'Retry webhooks', 'merged-into': 'IDEA-005', round: 2, parent: 'IDEA-001' },
      {
        id: 'IDEA-007', title: 'Rescued: unpaginated orders endpoint', triage: 'open', rescued: true, 'culled-reason': 'needs-verification: is the list unbounded',
        discussed: true, notes: [{ at: '2026-10-26T10:20:00Z', text: 'Effort went from m to s: only one endpoint is affected.' }],
      },
    ],
    culled: [
      { id: 'IDEA-008', title: 'Rewrite in Rust', reason: 'effort xl for low impact' },
      { id: 'IDEA-009', title: 'Add a dark theme', reason: 'not now: no designer', source: 'person', 'dropped-at': '2026-10-26T10:10:00Z', round: 2 },
    ],
    rounds: [
      { n: 1, kind: 'initial', lenses: ['quality', 'performance'], raw: 12, culled: 5, survivors: 7, at: '2026-10-26T10:00:00Z' },
      { n: 2, kind: 'deeper', target: 'IDEA-001', lenses: ['quality', 'architecture'], raw: 4, culled: 1, survivors: 3, at: '2026-10-26T10:15:00Z' },
    ],
    ...over,
  };
}

test('9.3: a valid record with every triage state, a merge, a rescue, notes, and two rounds passes', () => {
  assert.deepEqual(triageProblems(fm()), []);
  const v = validateFrontmatter(fm());
  assert.equal(v.valid, true, JSON.stringify(v.errors));
});

test('9.3: a record from before the loop (no triage, no rounds) passes', () => {
  const legacy = fm({ ideas: [{ id: 'IDEA-001', title: 'A' }], culled: [{ id: 'IDEA-002', title: 'B', reason: 'vague' }], rounds: undefined });
  delete legacy.rounds;
  assert.deepEqual(triageProblems(legacy), []);
  assert.equal(validateFrontmatter(legacy).valid, true);
});

test('9.3: each problem is found and named', () => {
  const cases = [
    [{ id: 'IDEA-010', title: 'x', triage: 'drop' }, /IDEA-010: a drop needs triage-reason/],
    [{ id: 'IDEA-010', title: 'x', triage: 'brainstorm' }, /IDEA-010: triage brainstorm needs routed-to/],
    [{ id: 'IDEA-010', title: 'x', parent: 'IDEA-099' }, /IDEA-010: parent IDEA-099 is not in ideas or culled/],
    [{ id: 'IDEA-010', title: 'x', 'merged-into': 'IDEA-008' }, /IDEA-010: merged-into IDEA-008 is not in ideas/],
    [{ id: 'IDEA-010', title: 'x', round: 3 }, /IDEA-010: round 3 is not in rounds/],
  ];
  for (const [idea, re] of cases) {
    const f = fm();
    f.ideas.push(idea);
    assert.match(triageProblems(f).join('\n'), re);
  }
  const loop = fm();
  loop.ideas.push({ id: 'IDEA-010', title: 'a', 'merged-into': 'IDEA-011' }, { id: 'IDEA-011', title: 'b', 'merged-into': 'IDEA-010' });
  assert.match(triageProblems(loop).join('\n'), /the merged-into chain loops/);
  const drop = fm();
  drop.culled.push({ id: 'IDEA-012', title: 'c', source: 'person' });
  assert.match(triageProblems(drop).join('\n'), /culled IDEA-012: a person's drop needs reason/);
  const target = fm();
  target.rounds.push({ n: 3, kind: 'similar', target: 'IDEA-099' });
  assert.match(triageProblems(target).join('\n'), /round 3: target IDEA-099/);
});

test('9.1: the schema refuses a wrong triage state, a drop with no reason, and a wrong round kind', () => {
  const bad = fm();
  bad.ideas[0].triage = 'maybe';
  assert.equal(validateFrontmatter(bad).valid, false);
  const drop = fm();
  delete drop.ideas[2]['triage-reason'];
  assert.equal(validateFrontmatter(drop).valid, false);
  const kind = fm();
  kind.rounds[1].kind = 'sideways';
  assert.equal(validateFrontmatter(kind).valid, false);
  assert.deepEqual([...TRIAGE_STATES], ['open', 'take', 'later', 'drop', 'brainstorm']);
  assert.deepEqual([...STEER_WORDS], ['deeper', 'similar', 'lens', 'direction', 'surprise']);
});

test('11: the loop and rounds procedures exist, and ideate.md, the artifact, and brainstorm point at them', () => {
  for (const rel of ['skills/wf/reference/intake/ideate/_loop.md', 'skills/wf/reference/intake/ideate/_rounds.md']) {
    assert.ok(existsSync(path.join(pluginRoot, rel)), `${rel} exists`);
  }
  const ideate = read('skills/wf/reference/intake/ideate.md');
  assert.match(ideate, /ideate\/_loop\.md/);
  assert.match(ideate, /ideate\/_rounds\.md/);
  assert.match(ideate, /# Step 7/);
  const loop = read('skills/wf/reference/intake/ideate/_loop.md');
  for (const word of ['discuss', 'back', 'check', 'merge', 'split', 'culled', 'rescue', 'list', 'pause', 'done']) assert.match(loop, new RegExp('`' + word));
  const rounds = read('skills/wf/reference/intake/ideate/_rounds.md');
  for (const word of STEER_WORDS) assert.match(rounds, new RegExp('`' + word));
  assert.match(read('skills/wf/reference/intake/ideate/_artifact.md'), /triage:/);
  assert.match(read('skills/wf/reference/intake/brainstorm.md'), /from <ideate-slug>/);
});
