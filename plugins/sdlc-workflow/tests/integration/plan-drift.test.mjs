// What came after a plan reaches the implement brief, and the sheets of the design system that a
// packet takes up when it starts.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildBrief } from '../../lib/brief.mjs';
import { sheetChanges, takeSheets, takeUpText } from '../../lib/design-taken.mjs';
import { addScreen, initSurface, surfaceDir } from '../../lib/design-surface.mjs';
import { saveApproved } from '../../lib/design-versions.mjs';
import { planDrift } from '../../lib/plan-drift.mjs';

const REFERENCE = fileURLToPath(new URL('../../skills/wf/reference/', import.meta.url));

function project() {
  const top = mkdtempSync(join(tmpdir(), 'plan-drift-'));
  const root = join(top, 'Shop');
  const dir = join(root, '.ai', 'workflows', 'w1');
  mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init', '-q', root]);
  writeFileSync(join(root, '.gitignore'), '.ai/\n');
  writeFileSync(join(dir, '00-index.md'), '---\nschema: sdlc/v1\ntype: index\nslug: w1\nstatus: in-progress\nux-impact: visual\n---\n');
  writeFileSync(join(dir, '03-slice-pay.md'), '---\nschema: sdlc/v1\ntype: slice\nslug: w1\n---\n## Goal\n\nPay.\n');
  writeFileSync(join(dir, '04-plan-pay.md'), '---\nschema: sdlc/v1\ntype: plan\nslug: w1\ncreated-at: "2026-03-01T00:00:00Z"\nupdated-at: "2026-03-01T00:00:00Z"\n---\n## Step-by-Step Plan\n\n1. Build the pay screen.\n');
  const saved = process.env.SDLC_HOME;
  process.env.SDLC_HOME = join(top, 'home');
  initSurface(root);
  return { root, dir, done: () => { if (saved === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = saved; rmSync(top, { recursive: true, force: true }); } };
}

const rules = (root, list) => writeFileSync(join(root, '.ai', 'sdlc-config.json'), JSON.stringify({ rules: list }, null, 2));

test('a design approved again and a rule added after the plan reach the implement brief of the slice', () => {
  const { root, done } = project();
  try {
    assert.equal(planDrift(root, 'w1', 'pay'), null, 'nothing came after the plan');
    rules(root, [{ key: 'old-rule', text: 'An old rule.', at: '2026-02-01T00:00:00Z' }, { key: 'tokens-only', text: 'Use the tokens of the design system.', at: '2026-04-01T00:00:00Z' }]);
    addScreen(root, 'pay', { title: 'Pay', area: 'checkout', workflow: 'w1', slice: 'pay' });
    saveApproved(root, 'w1', ['pay'], { commit: 'a'.repeat(40), now: new Date('2026-05-01T00:00:00Z') });
    const d = planDrift(root, 'w1', 'pay');
    assert.deepEqual(d.rules.map((r) => r.key), ['tokens-only'], 'only a rule added after the plan');
    assert.deepEqual(d.design.versions, ['v1']);
    const brief = buildBrief({ projectRoot: root, referenceRoot: REFERENCE, slug: 'w1', stage: 'implement', slice: 'pay' }).text;
    assert.match(brief, /## Changed since the plan/);
    assert.match(brief, /approved the design again after this plan \(v1\)/);
    assert.match(brief, /tokens-only.*was added after this plan/);
    const verify = buildBrief({ projectRoot: root, referenceRoot: REFERENCE, slug: 'w1', stage: 'verify', slice: 'pay' }).text;
    assert.doesNotMatch(verify, /## Changed since the plan/, 'only the implement takes the plan up');
  } finally { done(); }
});

test('the packet that starts takes up the changed tokens and components, once', () => {
  const { root, done } = project();
  try {
    const s = surfaceDir(root);
    mkdirSync(join(s, 'components'), { recursive: true });
    writeFileSync(join(s, 'components', 'button.html'), '<div data-component="button" class="tl-btn"></div>');
    writeFileSync(join(s, 'tokens.css'), ':root, [data-theme="a"] {\n  --ink: #000;\n  --gap: 4px;\n}\n');
    writeFileSync(join(s, 'components.css'), '.tl-btn { color: var(--ink); }\n.tl-card { padding: var(--gap); }\n');
    assert.deepEqual(sheetChanges(root), { first: true }, 'nothing was taken yet');
    takeSheets(root, 'w1');
    assert.equal(takeUpText(sheetChanges(root)), null, 'no change since it was taken');
    writeFileSync(join(s, 'tokens.css'), ':root, [data-theme="a"] {\n  --ink: #111;\n  --gap: 4px;\n  --rule: #333;\n}\n');
    writeFileSync(join(s, 'components.css'), '/* a note */\n.tl-btn:hover { color: var(--rule); }\n.tl-btn { color: var(--ink); }\n.tl-card { padding: var(--gap); margin: 0; }\n');
    const c = sheetChanges(root);
    assert.deepEqual(c, { tokens: ['--ink', '--rule'], components: ['button'], other: 1 });
    assert.match(takeUpText(c), /tokens: --ink, --rule; components: button; 1 other rule/);
    takeSheets(root, 'w2');
    assert.equal(takeUpText(sheetChanges(root)), null, 'the next packet is told only what changed since');
  } finally { done(); }
});
