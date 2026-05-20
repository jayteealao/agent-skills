// tests/sunflower.test.mjs — unit + integration tests for the sunflower renderer
// Run with: node --test plugins/sdlc-workflow/tests/sunflower.test.mjs

import { test } from 'node:test';
import { strictEqual, ok, deepStrictEqual, match } from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);

import { resolveViewPath, siblingPaths, breadcrumbFromView } from '../renderers/_paths.mjs';
import { splitFrontmatter, mergeFrontmatter } from '../renderers/_yaml.mjs';
import { md2html, mdInline } from '../renderers/_markdown.mjs';
import { renderShell, statusBadge, stageBadge, metricRow } from '../renderers/_shell.mjs';
import { validateFrontmatter } from '../renderers/_validator.mjs';
import { buildPathMap, relativeBetween } from '../renderers/_link-graph.mjs';
import { isDirty, workSetFilter, maxMtime } from '../renderers/_mtime.mjs';
import { severityChip, verdictBlock } from '../renderers/_icons.mjs';
import { figureCanvas, evenX } from '../renderers/_figure.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..');
const SCHEMA_PATH = resolve(PLUGIN_ROOT, 'tests', 'frontmatter.schema.json');

/* ── _paths ────────────────────────────────────────────────────────── */

test('resolveViewPath: slug overview', () => {
  const r = resolveViewPath('00-index.md');
  deepStrictEqual(r, { viewRel: 'INDEX.html', kind: '00-index' });
});

test('resolveViewPath: phase files', () => {
  strictEqual(resolveViewPath('01-intake.md').viewRel, 'intake/INDEX.html');
  strictEqual(resolveViewPath('02-shape.md').viewRel, 'shape/INDEX.html');
  strictEqual(resolveViewPath('02b-design.md').viewRel, 'design/INDEX.html');
  strictEqual(resolveViewPath('07-review.md').viewRel, 'review/INDEX.html');
  strictEqual(resolveViewPath('10-retro.md').viewRel, 'retro/INDEX.html');
});

test('resolveViewPath: slice sub-paths', () => {
  strictEqual(
    resolveViewPath('slices/auth-cache/04-plan.md').viewRel,
    'plan/auth-cache/INDEX.html',
  );
  strictEqual(
    resolveViewPath('slices/auth-cache/05-implement.md').viewRel,
    'implement/auth-cache/INDEX.html',
  );
});

test('resolveViewPath: review-command + ship-run + augmentation', () => {
  strictEqual(resolveViewPath('07-review/security.md').viewRel, 'review/security/INDEX.html');
  strictEqual(resolveViewPath('ship/20260519T1430Z/09-ship-run.md').viewRel, 'ship/20260519T1430Z/INDEX.html');
  strictEqual(resolveViewPath('augmentations/INC-0512.md').viewRel, 'augmentations/INC-0512/INDEX.html');
});

test('resolveViewPath: history snapshot embeds rev', () => {
  // History of a slug-root artifact (shape) — top-level history/<basename>-<rev>.md
  const r1 = resolveViewPath('history/02-shape-2.md');
  ok(r1, 'history snapshot of shape should resolve');
  match(r1.viewRel, /history\/2\/INDEX\.html$/);
  // History of a per-slice artifact — slices/<slug>/history/<basename>-<rev>.md
  const r2 = resolveViewPath('slices/auth/history/04-plan-3.md');
  ok(r2, 'history snapshot of slice plan should resolve');
  match(r2.viewRel, /history\/3\/INDEX\.html$/);
});

test('siblingPaths: derives .yaml and .html.fragment names', () => {
  deepStrictEqual(siblingPaths('07-review.md'), {
    yaml:     '07-review.yaml',
    fragment: '07-review.html.fragment',
  });
});

test('breadcrumbFromView: builds correct chain depth', () => {
  const crumbs = breadcrumbFromView('plan/auth-cache/INDEX.html', 'feat-checkout-v2');
  ok(crumbs.length >= 4);
  strictEqual(crumbs[0].label, 'sdlc');
  strictEqual(crumbs[1].label, 'feat-checkout-v2');
});

/* ── _yaml ─────────────────────────────────────────────────────────── */

test('splitFrontmatter: parses YAML + body', () => {
  const text = '---\nschema: sdlc/v1\ntype: intake\n---\n# Hello\nbody\n';
  const r = splitFrontmatter(text);
  strictEqual(r.frontmatter.schema, 'sdlc/v1');
  strictEqual(r.frontmatter.type, 'intake');
  match(r.body, /# Hello/);
});

test('splitFrontmatter: returns body-as-text when no frontmatter', () => {
  const r = splitFrontmatter('just markdown\n');
  strictEqual(r.frontmatter, null);
  strictEqual(r.body, 'just markdown\n');
});

test('mergeFrontmatter: sibling wins on conflict', () => {
  const md = { title: 'from md', verdict: 'ship' };
  const sib = { verdict: 'caveats', counts: { high: 2 } };
  const merged = mergeFrontmatter(md, sib);
  strictEqual(merged.verdict, 'caveats');
  strictEqual(merged.title, 'from md');
  deepStrictEqual(merged.counts, { high: 2 });
});

/* ── _markdown ─────────────────────────────────────────────────────── */

test('md2html: renders headings with anchors', () => {
  const html = md2html('## Hello world\n\nparagraph.');
  match(html, /<h2[^>]*id="hello-world"/);
  match(html, /<p>paragraph/);
});

test('mdInline: no <p> wrapper', () => {
  const html = mdInline('hello **bold**');
  strictEqual(html.startsWith('<p>'), false);
  match(html, /<strong>bold<\/strong>/);
});

/* ── _shell ────────────────────────────────────────────────────────── */

test('statusBadge: tone maps correctly', () => {
  match(statusBadge('active'),    /is-ok/);
  match(statusBadge('blocked'),   /is-bad/);
  match(statusBadge('skipped'),   /is-skip/);
});

test('metricRow: renders each metric with severity class when present', () => {
  const html = metricRow([
    { label: 'blocker', value: 0, sev: 'blocker' },
    { label: 'high',    value: 2, sev: 'high' },
  ]);
  match(html, /severity-blocker/);
  match(html, /metric-value">2/);
});

test('renderShell: wraps content with breadcrumbs and asset links', () => {
  const html = renderShell({
    title: 'Test', type: 'index', slug: 'demo', status: 'active',
    breadcrumbs: [{ label: 'sdlc', href: '../' }, { label: 'demo', href: './' }],
    assetBase: '/sdlc/_assets',
    headerHtml: '<h1>X</h1>', bodyHtml: '<p>body</p>',
  });
  match(html, /<title>Test — sdlc/);
  match(html, /sdlc\.css\?v=9\.20\.0/);
  match(html, /data-artifact-type="index"/);
});

/* ── _validator ────────────────────────────────────────────────────── */

test('validateFrontmatter: runs without throwing on plausible intake', () => {
  const fm = {
    schema: 'sdlc/v1', type: 'intake', slug: 'demo',
    title: 'demo', status: 'complete', 'stage-number': 1,
    'created-at': '2026-05-19T10:00:00Z',
    'updated-at': '2026-05-19T11:00:00Z',
  };
  // Some schemas may require additional fields; we don't assert valid here,
  // just that validation runs without throwing.
  const r = validateFrontmatter(fm, SCHEMA_PATH);
  ok(typeof r.valid === 'boolean');
});

test('validateFrontmatter: rejects missing type', () => {
  const r = validateFrontmatter({ schema: 'sdlc/v1' }, SCHEMA_PATH);
  strictEqual(r.valid, false);
});

/* ── _link-graph ───────────────────────────────────────────────────── */

test('buildPathMap: maps storage → view per slug', () => {
  const m = buildPathMap([
    { path: '00-index.md' },
    { path: 'slices/auth/04-plan.md' },
  ]);
  strictEqual(m.get('00-index.md'), 'INDEX.html');
  strictEqual(m.get('slices/auth/04-plan.md'), 'plan/auth/INDEX.html');
});

test('relativeBetween: computes correct up/down hops', () => {
  const r = relativeBetween('plan/auth/INDEX.html', 'review/INDEX.html');
  strictEqual(r, '../../review/INDEX.html');
});

/* ── _mtime ────────────────────────────────────────────────────────── */

test('workSetFilter: clean mode marks everything dirty', () => {
  const f = workSetFilter({ mode: 'clean' });
  strictEqual(f({ storagePath: 'x', storageInputs: [], viewOutput: __filename }), true);
});

test('isDirty: missing view → dirty', () => {
  const r = isDirty({ storageInputs: [__filename], viewOutput: '/nonexistent/path.html' });
  strictEqual(r, true);
});

/* ── _icons ────────────────────────────────────────────────────────── */

test('severityChip: pairs glyph with class', () => {
  const html = severityChip('high', 'High');
  match(html, /severity-high/);
  match(html, /▲/);
});

test('verdictBlock: renders verdict with glyph', () => {
  match(verdictBlock('caveats', 'caveats — 2 high', 'mostly ok'), /verdict-caveats/);
  match(verdictBlock('ship',    'ship it',           ''),         /verdict-ship/);
  match(verdictBlock('no',      'no — fix first',    ''),         /verdict-no/);
});

/* ── _figure ───────────────────────────────────────────────────────── */

test('figureCanvas: wraps SVG with figcaption', () => {
  const html = figureCanvas({
    figureNumber: 1, title: 'demo',
    svgInner: '<svg viewBox="0 0 10 10"/>',
    legend: [{ swatch: '#000', label: 'x' }],
  });
  match(html, /Figure 1/);
  match(html, /figure-canvas/);
  match(html, /<svg/);
});

test('evenX: spaces n items evenly across width', () => {
  const xs = evenX(100, 10, 3);
  deepStrictEqual(xs, [10, 50, 90]);
});

/* ── End-to-end: render fixtures via orchestrator ──────────────────── */

test('orchestrator renders fixture slug end-to-end', () => {
  const fix = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'tests', 'sunflower-fixtures.json'), 'utf-8'));
  const tmp = mkdtempSync(join(tmpdir(), 'sunflower-test-'));
  try {
    const storageRoot = join(tmp, '.ai', 'workflows');
    mkdirSync(storageRoot, { recursive: true });

    for (const [slug, slugData] of Object.entries(fix.slugs)) {
      const slugDir = join(storageRoot, slug);
      mkdirSync(slugDir, { recursive: true });
      for (const [fname, file] of Object.entries(slugData.files)) {
        const fm = yaml.dump(file.frontmatter, { lineWidth: 100 });
        const content = `---\n${fm}---\n${file.body}`;
        writeFileSync(join(slugDir, fname), content, 'utf-8');
      }
    }

    const script = join(PLUGIN_ROOT, 'scripts', 'render-sunflower.mjs');
    const child = spawnSync(process.execPath, [script, '--plugin-root', PLUGIN_ROOT], {
      cwd: tmp,
      encoding: 'utf-8',
    });

    strictEqual(child.status, 0, `renderer exited with ${child.status}: ${child.stderr}`);

    // Assert the expected files landed
    const indexHtml = join(tmp, '.ai', '_view', 'feat-checkout-v2', 'INDEX.html');
    ok(existsSync(indexHtml), 'slug INDEX.html should exist');
    const text = readFileSync(indexHtml, 'utf-8');
    match(text, /data-artifact-type="index"/);
    match(text, /Checkout v2 redesign/);
    match(text, /figure-canvas/);

    const reviewHtml = join(tmp, '.ai', '_view', 'feat-checkout-v2', 'review', 'INDEX.html');
    ok(existsSync(reviewHtml), 'review INDEX.html should exist');

    const dashHtml = join(tmp, '.ai', '_view', 'INDEX.html');
    ok(existsSync(dashHtml), 'dashboard INDEX.html should exist');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
