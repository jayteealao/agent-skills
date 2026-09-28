// tests/unit/renderers/four-part-page.test.mjs
//
// The four-part human page (ARTIFACT-SPLIT-PLAN W5/W6): the explainer slot at
// the top, "Waiting for you", the contract table, collapsed evidence and
// history — and the D5 fallback (no explainer → today's page).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, utimesSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  waitingForYou, nextRoutes, contractTable, evidenceDirFor, stageKeyFor,
  composeStagePage, evidenceAndHistory, storyLink,
} from '../../../renderers/_page.mjs';
import { splitSections } from '../../../renderers/_story.mjs';
import { storageRoute, isEvidencePath, resolveViewPath, classifyFragmentName, explainerPath } from '../../../renderers/_paths.mjs';

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = join(PLUGIN_ROOT, 'scripts', 'render-sunflower.mjs');

/* ─────────────────────────────── unit: part 2 ─────────────────────────────── */

test('part 2 says "Nothing waits for you." when no question, gate or awaiting status is open', () => {
  const html = waitingForYou({ status: 'complete', 'image-gate': 'passed' });
  assert.match(html, /Nothing waits for you\./);
  assert.match(html, /<h2 class="sdlc-h2">Waiting for you<\/h2>/);
});

test('part 2 lists open questions, an awaiting status and an open gate', () => {
  const html = waitingForYou({
    status: 'awaiting-input',
    'open-questions': ['Which region ships first?'],
    'image-gate': 'pending',
    'readiness-verdict': 'ready-with-caveats',
  });
  assert.doesNotMatch(html, /Nothing waits for you/);
  assert.match(html, /Which region ships first\?/);
  assert.match(html, /awaiting-input/);
  assert.match(html, /image-gate/);
  assert.match(html, /ready-with-caveats/);
});

/* ─────────────────────── unit: recommended-routes (S3) ─────────────────────── */

test('nextRoutes prefers recommended-routes over next-invocation and the old body section', () => {
  const fm = {
    'next-invocation': '/wf verify demo auth',
    'recommended-routes': [
      { invocation: '/wf review demo', reason: 'slice passed' },
      { invocation: '/wf verify demo auth', reason: 'default path', default: true },
    ],
  };
  const sections = splitSections('## Recommended Next Stage\n- /wf old demo\n');
  const routes = nextRoutes(fm, sections);
  assert.equal(routes.length, 2);
  assert.equal(routes.find((r) => r.default).invocation, '/wf verify demo auth');
  const html = waitingForYou(fm, sections);
  assert.match(html, /\/wf verify demo auth/);
  assert.match(html, /\/wf review demo/);
  assert.doesNotMatch(html, /\/wf old demo/);
});

test('nextRoutes falls back to next-invocation, then recommended-next-*, then the old section', () => {
  assert.equal(nextRoutes({ 'next-invocation': '/wf plan x' })[0].invocation, '/wf plan x');
  assert.equal(nextRoutes({ 'recommended-next-invocation': '/wf ship x' })[0].invocation, '/wf ship x');
  const legacy = nextRoutes({}, splitSections('## Recommended Next Stage\n- **Option A:** /wf handoff x\n'));
  assert.equal(legacy.length, 1);
  assert.match(legacy[0].markdown, /Option A/);
  // The old workflow-index shape { primary, alternates } still reads.
  const old = nextRoutes({ 'recommended-routes': { primary: '/wf fix x', alternates: ['/wf probe x'] } });
  assert.deepEqual(old.map((r) => r.invocation), ['/wf fix x', '/wf probe x']);
});

/* ─────────────────────────────── unit: part 3 ─────────────────────────────── */

test('part 3 shows the stage contract rows and leaves out the "does not show" sections', () => {
  const body = [
    '## Ambiguity Inventory', 'AMB-1 secret inventory',
    '## Acceptance Criteria', '- AC1 totals update',
    '## Non-Functional Requirements', '- p95 < 200 ms',
    '## Edge Cases / Failure Modes', '- empty cart',
    '## Out of Scope', '- refunds',
    '## Freshness Research', 'research notes',
  ].join('\n');
  const html = contractTable('shape', { fm: {}, sections: splitSections(body) });
  for (const want of ['Acceptance criteria', 'AC1 totals update', 'p95 &lt; 200 ms', 'empty cart', 'refunds']) {
    assert.ok(html.includes(want), `missing ${want}`);
  }
  assert.doesNotMatch(html, /secret inventory|research notes/);
});

test('part 3 for review groups open findings by severity from the sibling YAML', () => {
  const sy = {
    verdict: 'changes-requested',
    findings: [
      { id: 'F1', severity: 'high', title: 'SQL injection', status: 'open' },
      { id: 'F2', severity: 'low', title: 'naming', status: 'fixed' },
      { id: 'F3', severity: 'blocker', title: 'data loss', status: 'open' },
    ],
  };
  const html = contractTable('review', { fm: {}, sy, sections: [] });
  assert.match(html, /changes-requested/);
  assert.ok(html.indexOf('blocker') < html.indexOf('high'), 'blocker first');
  assert.match(html, /SQL injection/);
  assert.doesNotMatch(html, /naming/, 'fixed findings are not open');
});

/* ─────────────────────────────── unit: part 4 ─────────────────────────────── */

test('part 4 is collapsed and links evidence files, related records and revisions', () => {
  const html = evidenceAndHistory({
    evidence: [{ label: 'verify-evidence/auth/report.md', href: '../../verify-evidence/auth/report.md' }],
    related: [{ label: 'Security review', href: '../security/INDEX.html' }],
    history: [{ rev: 2, snapshotFrontmatter: { 'updated-at': '2026-09-20' } }],
    recordHtml: '<p>RECORD</p>',
  });
  assert.match(html, /^<details class="page-part part-evidence/);
  assert.doesNotMatch(html, /<details[^>]*\bopen\b/);
  assert.match(html, /href="\.\.\/\.\.\/verify-evidence\/auth\/report\.md"/);
  assert.match(html, /href="\.\.\/security\/INDEX\.html"/);
  assert.match(html, /href="history\/2\/INDEX\.html"/);
  assert.match(html, /<details class="full-record">[\s\S]*RECORD/);
});

test('evidenceDirFor reads evidence-dir, else derives the verify / probe folder', () => {
  assert.equal(evidenceDirFor({ stage: 'verify', frontmatter: { 'evidence-dir': '.ai/workflows/demo/verify-evidence/auth/' } }), 'verify-evidence/auth');
  assert.equal(evidenceDirFor({ stage: 'verify', frontmatter: {}, path: '06-verify-billing.md' }), 'verify-evidence/billing');
  assert.equal(evidenceDirFor({ stage: 'probe', frontmatter: {}, path: '03-slice-probe-login.md' }), 'probe-evidence/login');
  assert.equal(evidenceDirFor({ stage: 'plan', frontmatter: {} }), null);
});

test('stageKeyFor: brainstorm keeps its page; probe and task slices get their own recipes', () => {
  assert.equal(stageKeyFor({ type: 'brainstorm' }), null);
  assert.equal(stageKeyFor({ type: 'slice', frontmatter: { 'slice-type': 'probe' } }), 'probe');
  assert.equal(stageKeyFor({ type: 'intake', path: '01-task.md' }), 'task');
  assert.equal(stageKeyFor({ type: 'ship-run' }), 'ship');
  assert.equal(stageKeyFor({ type: 'close-record' }), 'close');
  assert.equal(stageKeyFor({ type: 'review-command' }), null);
});

test('composeStagePage puts the four parts in order; recap is the story page', () => {
  const html = composeStagePage({
    stage: 'verify', frontmatter: { result: 'pass' }, body: '## Acceptance Criteria Status\n- AC1 pass',
    explainerHtml: '<p>SUMMARY</p>', recordHtml: '<p>RECORD</p>',
  });
  const order = ['part-explainer', 'part-waiting', 'part-contract', 'part-evidence'].map((c) => html.indexOf(c));
  assert.ok(order.every((i) => i >= 0), 'all four parts render');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'parts are in order');
  const recap = composeStagePage({ stage: 'recap', frontmatter: {}, body: '', explainerHtml: '<p>X</p>', recordHtml: '<p>RECAP BODY</p>' });
  assert.match(recap, /part-explainer[\s\S]*RECAP BODY/);
  assert.doesNotMatch(recap, /part-waiting|<details class="page-part/);
});

test('storyLink links the recap page from the overview', () => {
  const all = { recap: [{ storageRel: '90-recap.md', viewRel: 'recap/INDEX.html', frontmatter: { title: 'The story' } }] };
  assert.match(storyLink(all), /href="recap\/INDEX\.html"[\s\S]*The story/);
  assert.equal(storyLink({}), '');
});

/* ─────────────────────────────── unit: routes ─────────────────────────────── */

test('_paths routes every new file name (explainer, evidence, history jsonl)', () => {
  assert.deepEqual(storageRoute('06-verify-auth.explainer.html.fragment'), { route: 'explainer', parent: '06-verify-auth.md' });
  assert.deepEqual(storageRoute('04-plan-auth.html.fragment'), { route: 'typed-fragment', parent: '04-plan-auth.md' });
  assert.deepEqual(storageRoute('04-plan-auth.01-flow.html.fragment'), { route: 'free-fragment', parent: '04-plan-auth.md' });
  assert.deepEqual(storageRoute('04-plan-auth.yaml'), { route: 'sibling-yaml', parent: '04-plan-auth.md' });
  assert.equal(storageRoute('verify-evidence/auth/report.md').route, 'evidence');
  assert.equal(storageRoute('probe-evidence/login/shot.png').route, 'evidence');
  assert.equal(storageRoute('index-history.jsonl').route, 'ignored');
  assert.equal(storageRoute('.read-ledger.jsonl').route, 'ignored');
  assert.equal(storageRoute('06-verify-auth.md').route, 'page');
  assert.equal(storageRoute('history/06-verify-auth-2.md').route, 'history');
  assert.ok(isEvidencePath('verify-evidence/auth-run-2/log.txt'));
  assert.equal(resolveViewPath('verify-evidence/auth/report.md'), null);
  assert.deepEqual(classifyFragmentName('06-verify-auth.explainer.html.fragment', '06-verify-auth'),
    { tier: 'free', label: 'explainer', explainer: true });
  assert.equal(explainerPath('06-verify-auth.md'), '06-verify-auth.explainer.html.fragment');
});

/* ──────────────────────── integration: the orchestrator ──────────────────────── */

function write(abs, text) {
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text, 'utf-8');
}

function render(tmp) {
  const child = spawnSync(process.execPath, [SCRIPT, '--plugin-root', PLUGIN_ROOT, '--clean', '--no-shared-output'],
    { cwd: tmp, encoding: 'utf-8' });
  assert.equal(child.status, 0, `renderer exited ${child.status}: ${child.stderr}`);
  return child;
}

test('render: explainer at the top, four parts, evidence linked and not rendered; old artifacts keep today\'s page', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'sdlc-fourpart-'));
  const slug = join(tmp, '.ai', 'workflows', 'feat-x');
  try {
    write(join(slug, '00-index.md'), '---\nschema: sdlc/v1\ntype: index\nslug: feat-x\ntitle: Feat X\nstatus: active\ncurrent-stage: verify\n---\n');
    write(join(slug, '06-verify-auth.md'), [
      '---', 'schema: sdlc/v1', 'type: verify', 'slice-slug: auth', 'status: complete', 'result: pass', '---',
      '## Acceptance Criteria Status', '- AC1 pass (rung: observed)',
      '## Gaps / Unverified Areas', 'None.',
      '## Automated Checks Run', 'RAW-CHECK-OUTPUT',
    ].join('\n'));
    write(join(slug, '06-verify-auth.explainer.html.fragment'),
      '<p>XPL-SUMMARY: the slice passed.</p>\n<p>The loop shows the fix rounds.</p>\n<!-- @include explainer/cycle {"states":[{"label":"Run"},{"label":"Fix"}]} -->\n<p>Recap: ready for review.</p>');
    write(join(slug, 'verify-evidence', 'auth', 'report.md'), 'raw check output, no frontmatter\n');
    write(join(slug, '04-plan-auth.md'), '---\nschema: sdlc/v1\ntype: plan\nslice-slug: auth\nstatus: complete\n---\n## The Plan\nPLAN-STORY\n\n## Current State\nnothing yet\n');
    write(join(slug, '90-recap.md'), '---\nschema: sdlc/v1\ntype: recap\ntitle: The story so far\nstatus: complete\n---\n## Where it stands now\nverified\n');
    render(tmp);
    const view = join(tmp, '.ai', '_view', 'feat-x');

    const verify = readFileSync(join(view, 'verify', 'auth', 'INDEX.html'), 'utf-8');
    const pos = ['XPL-SUMMARY', 'part-waiting', 'part-contract', 'part-evidence'].map((m) => verify.indexOf(m));
    assert.ok(pos.every((p) => p > 0), `all parts present: ${pos}`);
    assert.deepEqual([...pos].sort((a, b) => a - b), pos, 'explainer, waiting, contract, evidence in order');
    assert.match(verify, /Nothing waits for you\./);
    assert.match(verify, /xpl-cycle/, 'the explainer @include expanded');
    assert.doesNotMatch(verify, /class="narrative-fragments"/, 'the explainer is not a foot fragment');
    const contract = verify.slice(verify.indexOf('part-contract'), verify.indexOf('part-evidence'));
    assert.match(contract, /AC1 pass/);
    assert.doesNotMatch(contract, /RAW-CHECK-OUTPUT/, 'check output stays out of part 3');
    assert.match(verify, /href="[^"]*verify-evidence\/auth\/report\.md"/, 'part 4 links the evidence file');
    assert.ok(!existsSync(join(view, 'verify-evidence')), 'no page is rendered for an evidence folder');

    // D5: no explainer → today's page (story lifted, full body, no parts).
    const plan = readFileSync(join(view, 'plan', 'auth', 'INDEX.html'), 'utf-8');
    assert.match(plan, /<section class="story">[\s\S]*PLAN-STORY/);
    assert.doesNotMatch(plan, /part-waiting|part-explainer/);
    assert.match(plan, /nothing yet/);

    // Recap is the slug's story page: the overview links it.
    const overview = readFileSync(join(view, 'INDEX.html'), 'utf-8');
    assert.match(overview, /class="story-link"[\s\S]*href="recap\/INDEX\.html"/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('render: the typed fragment is generated from a newer .yaml; an authored fragment as new as the .yaml wins', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'sdlc-fraggen-'));
  const slug = join(tmp, '.ai', 'workflows', 'feat-y');
  try {
    write(join(slug, '00-index.md'), '---\nschema: sdlc/v1\ntype: index\nslug: feat-y\ntitle: Feat Y\nstatus: active\n---\n');
    // 1. .yaml with no fragment → generated.
    write(join(slug, '07-review.md'), '---\nschema: sdlc/v1\ntype: review\nstatus: complete\nverdict: changes-requested\n---\nbody\n');
    write(join(slug, '07-review.yaml'), 'verdict: changes-requested\nfindings:\n  - id: F1\n    severity: high\n    title: GEN-FINDING\n    status: open\n');
    // 2. authored fragment NEWER than its .yaml → the authored one renders.
    write(join(slug, '04-plan-a.md'), '---\nschema: sdlc/v1\ntype: plan\nslice-slug: a\nstatus: complete\n---\nbody\n');
    write(join(slug, '04-plan-a.yaml'), 'files:\n  - path: src/a.ts\n    status: new\n');
    write(join(slug, '04-plan-a.html.fragment'), '<section class="fragment-plan">AUTHORED-FRAG</section>');
    // 3. authored fragment OLDER than its .yaml → generated.
    write(join(slug, '04-plan-b.md'), '---\nschema: sdlc/v1\ntype: plan\nslice-slug: b\nstatus: complete\n---\nbody\n');
    write(join(slug, '04-plan-b.html.fragment'), '<section class="fragment-plan">STALE-FRAG</section>');
    write(join(slug, '04-plan-b.yaml'), 'files:\n  - path: src/b.ts\n    status: modified\n');
    const old = new Date('2026-01-01T00:00:00Z');
    const now = new Date('2026-06-01T00:00:00Z');
    utimesSync(join(slug, '04-plan-a.yaml'), old, old);
    utimesSync(join(slug, '04-plan-a.html.fragment'), now, now);
    utimesSync(join(slug, '04-plan-b.html.fragment'), old, old);
    utimesSync(join(slug, '04-plan-b.yaml'), now, now);
    render(tmp);
    const view = join(tmp, '.ai', '_view', 'feat-y');

    const review = readFileSync(join(view, 'review', 'INDEX.html'), 'utf-8');
    assert.match(review, /<section class="fragment-review" data-generated="yaml">/);
    assert.match(review, /GEN-FINDING/);

    const planA = readFileSync(join(view, 'plan', 'a', 'INDEX.html'), 'utf-8');
    assert.match(planA, /AUTHORED-FRAG/);
    assert.doesNotMatch(planA, /data-generated="yaml"/);

    const planB = readFileSync(join(view, 'plan', 'b', 'INDEX.html'), 'utf-8');
    assert.doesNotMatch(planB, /STALE-FRAG/);
    assert.match(planB, /data-generated="yaml"/);
    assert.match(planB, /src\/b\.ts/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
