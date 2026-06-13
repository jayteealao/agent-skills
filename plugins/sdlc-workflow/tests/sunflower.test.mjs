// tests/sunflower.test.mjs — unit + integration tests for the sunflower renderer
// Run with: node --test plugins/sdlc-workflow/tests/sunflower.test.mjs

import { test } from 'node:test';
import { strictEqual, ok, deepStrictEqual, match, doesNotMatch } from 'node:assert/strict';
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
import { renderShell, PLUGIN_VERSION, statusBadge, stageBadge, metricRow } from '../renderers/_shell.mjs';
import { validateFrontmatter } from '../renderers/_validator.mjs';
import { buildPathMap, relativeBetween, rewriteBodyLinks } from '../renderers/_link-graph.mjs';
import { render as renderSlugIndex } from '../renderers/index.mjs';
import { render as renderSliceIndexPage } from '../renderers/slice-index.mjs';
import { render as renderImplementIndexPage } from '../renderers/implement-index.mjs';
import { isDirty, workSetFilter, maxMtime } from '../renderers/_mtime.mjs';
import { severityChip, verdictBlock, findingListItem } from '../renderers/_icons.mjs';
import { figureCanvas, evenX } from '../renderers/_figure.mjs';
import { expand as expandSnippets, clearCache as clearSnippetCache } from '../components/_components.mjs';

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

test('resolveViewPath: quick-workflow lead artifacts (rca/fix/probe/investigate)', () => {
  // Previously unmapped → returned null → silently skipped (never rendered).
  strictEqual(resolveViewPath('01-rca.md').viewRel, 'rca/INDEX.html');
  strictEqual(resolveViewPath('01-fix.md').viewRel, 'fix/INDEX.html');
  strictEqual(resolveViewPath('01-probe.md').viewRel, 'probe/INDEX.html');
  strictEqual(resolveViewPath('01-investigate.md').viewRel, 'investigate/INDEX.html');
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
  match(html, /sdlc\.css\?v=9\.\d+\.\d+/);
  match(html, /data-artifact-type="index"/);
});

/* ── mobile nav surface (appbar / tabbar / disclosure sheet) ───────── */

// Returns true|false if the named tab carries `is-active`, or null if absent.
// The tempered `(?:(?!</a>).)*?` keeps the match inside ONE anchor so it can't
// bridge from an earlier (inactive) tab to a later tab's label.
function mTabActive(html, label) {
  const re = new RegExp(`<a class="m-tab( is-active)?"(?:(?!</a>).)*?<span>${label}</span></a>`, 's');
  const m = html.match(re);
  return m ? Boolean(m[1]) : null;
}
function shellAt(breadcrumbs) {
  return renderShell({
    title: 'T', type: 'index', slug: 'demo', status: 'active',
    breadcrumbs, assetBase: '/sdlc/_assets', headerHtml: '', bodyHtml: '',
  });
}

test('mobile tabbar: repo root lights Home, has no Overview tab', () => {
  const html = shellAt([{ label: 'sdlc', href: './' }]);
  strictEqual(mTabActive(html, 'Home'), true);
  strictEqual(mTabActive(html, 'Overview'), null);
});

test('mobile tabbar: section root lights Overview, not Home', () => {
  const html = shellAt([{ label: 'sdlc', href: '../' }, { label: 'demo', href: './' }]);
  strictEqual(mTabActive(html, 'Home'), false);
  strictEqual(mTabActive(html, 'Overview'), true);
});

test('mobile tabbar: deep page still lights exactly one tab (Overview)', () => {
  // depth 4 — the bug was that no tab was active below depth 2.
  const html = shellAt([
    { label: 'sdlc',    href: '../../../' },
    { label: 'demo',    href: '../../' },
    { label: 'handoff', href: '../' },
    { label: '1',       href: './' },
  ]);
  strictEqual(mTabActive(html, 'Home'), false);
  strictEqual(mTabActive(html, 'Overview'), true);
});

test('mobile sheet: honest disclosure, not a faux modal dialog', () => {
  const html = shellAt([{ label: 'sdlc', href: '../' }, { label: 'demo', href: './' }]);
  match(html, /<aside class="m-sheet" aria-label="Navigation">/);
  doesNotMatch(html, /role="dialog"/);
});

test('PLUGIN_VERSION is exported and stamps the page', () => {
  ok(/^\d+\.\d+\.\d+$/.test(PLUGIN_VERSION));
  const stamp = new RegExp(`data-sdlc-version="${PLUGIN_VERSION.replace(/\./g, '\\.')}"`);
  match(shellAt([{ label: 'sdlc', href: './' }]), stamp);
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

test('rewriteBodyLinks: sibling .md prose links resolve to rendered pages, others untouched', () => {
  const pathMap = new Map([
    ['04-plan.md', 'plan/INDEX.html'],
    ['04-plan-behaviors.md', 'plan/behaviors/INDEX.html'],
  ]);
  const html = '<a href="04-plan-behaviors.md#x">b</a> <a href="https://e/a.md">x</a> <a href="04-plan-gone.md">g</a>';
  const out = rewriteBodyLinks(html, { pathMap, fromStorageRel: '04-plan.md', fromViewRel: 'plan/INDEX.html' });
  match(out, /href="behaviors\/INDEX\.html#x"/);     // rewritten to rendered page, hash preserved
  match(out, /href="https:\/\/e\/a\.md"/);            // external left alone
  match(out, /href="04-plan-gone\.md"/);              // unknown target → not broken further
});

test('slug overview: surfaces per-slice plans inline at parity with slices', () => {
  const ctx = { slug: 'demo', allArtifacts: { plan: [
    { frontmatter: { type: 'plan', 'slice-slug': 'behaviors', title: 'Behaviors plan', status: 'active' } },
    { frontmatter: { type: 'plan', 'slice-slug': 'tokens', title: 'Tokens plan', status: 'complete' } },
  ] } };
  const { bodyHtml } = renderSlugIndex({ frontmatter: { slug: 'demo', 'current-stage': 'plan' }, body: '' }, ctx);
  match(bodyHtml, /slice plans · 2/);
  match(bodyHtml, /href="plan\/behaviors\/INDEX\.html"/);
  match(bodyHtml, /href="plan\/tokens\/INDEX\.html"/);
});

/* ── slug-overview + slice-index counts: read roll-ups, not slice leaves ──
 * Regression for the osce-system-prompts drift: the slice-stage leaf files carry
 * only their slicing status (`status: defined`) and the slice-INDEX is itself a
 * `slice-index` artifact. Counting leaves+index gave +1 slices (14/17), counting
 * leaf statuses gave 1/N implemented + 0 complete, and `progress` (a stage→status
 * map) was read as a {done,total} counter → 0/0. All must come from the roll-ups. */
function osceShapedArtifacts() {
  const STAGES = ['intake', 'shape', 'slice', 'plan', 'implement', 'verify', 'review', 'handoff', 'ship', 'retro'];
  const slugs = Array.from({ length: 16 }, (_, i) => `slice-${i}`);
  const roster = slugs.map((slug) => ({ slug, status: 'complete' }));
  const allArtifacts = {
    'slice-index': [{ frontmatter: { type: 'slice-index', status: 'complete', 'total-slices': 16, slices: roster } }],
    // Leaves carry the slicing status `defined` (one stray `complete`) — the exact
    // shape that produced "1/16 slices" and "complete 0".
    slice: slugs.map((slug, i) => ({ frontmatter: { type: 'slice', 'slice-slug': slug, status: i === 5 ? 'complete' : 'defined' } })),
    'implement-index': [{ frontmatter: { type: 'implement-index', 'slices-implemented': 16, 'slices-total': 16, 'metric-total-lines-added': 25848, 'metric-total-lines-removed': 347 } }],
    implement: slugs.map((slug) => ({ frontmatter: { type: 'implement', 'slice-slug': slug, status: 'complete' } })),
    // 7 review DIMENSIONS + the review INDEX roll-up: REVIEWS must count 7, not 8.
    'review-command': Array.from({ length: 7 }, (_, i) => ({ frontmatter: { type: 'review-command', dimension: `d${i}` } })),
    review: [{ frontmatter: { type: 'review', status: 'complete' } }],
    // verify leaves carry the always-current verification metrics.
    verify: slugs.map((slug) => ({ frontmatter: { type: 'verify', 'slice-slug': slug, status: 'complete', 'metric-checks-passed': 11, 'has-blockers': false, 'adversarial-tests-run': 0 } })),
  };
  const indexFm = {
    slug: 'osce', title: 'OSCE', 'current-stage': 'retro', status: 'complete',
    progress: Object.fromEntries(STAGES.map((s) => [s, 'complete'])),
    'review-scope': 'slug-wide', 'selected-slice': slugs[15],
  };
  return { allArtifacts, indexFm, roster };
}

test('slug overview: counts/progress/LOC come from index roll-ups, not slice leaves', () => {
  const { allArtifacts, indexFm } = osceShapedArtifacts();
  const { headerHtml, bodyHtml } = renderSlugIndex({ frontmatter: indexFm, body: '' }, { slug: 'osce', allArtifacts });
  const html = headerHtml + bodyHtml;
  match(html, /16 slices/);          // slice station counts slices, not slices + the slice-index
  doesNotMatch(html, /17 slices/);   // the +1 is gone
  match(html, /16\/16 slices/);      // implement reads implement-index slices-implemented/total
  match(html, /10\/10/);             // `progress` read as the stage→status map, not {done,total}
  match(html, /26\.2k/);             // LOC from implement metric-total-lines (added + removed)

  // The callout band: every value derived from artifacts, never stale "—".
  const bandVal = (s, label) => (s.match(new RegExp(`>${label}</text><text[^>]*>([^<]+)</text>`)) || [])[1];
  strictEqual(bandVal(html, 'SLICES'), '16');
  strictEqual(bandVal(html, 'REVIEWS'), '7');       // review-command dimensions, not incl. the review index
  strictEqual(bandVal(html, 'BLOCKERS'), '0');      // no blocked slices / has-blockers flags
  strictEqual(bandVal(html, 'CHECKS'), '176');      // Σ verify metric-checks-passed (16 × 11)
  strictEqual(bandVal(html, 'LOC TOUCHED'), '26.2k');
});

test('slice index: per-slice status comes from the roster, not the leaf "defined" status', () => {
  const { allArtifacts, roster } = osceShapedArtifacts();
  const { headerHtml } = renderSliceIndexPage(
    { frontmatter: { type: 'slice-index', title: 'Slice index', status: 'complete', 'total-slices': 16, slices: roster }, path: '03-slice.md', body: '' },
    { slug: 'osce', allArtifacts },
  );
  const flat = headerHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  match(flat, /complete 16/);    // 16 roster slices complete (leaves are all "defined")
  match(flat, /in progress 0/);
  match(flat, /blocked 0/);
});

/* ── wf-meta extend: slice counts track the roster, not stale stage roll-ups ──
 * After `extend` the slice roster (03-slice.md: total-slices / slices[]) grows
 * and new slice leaves appear, but the implement-index roll-up (slices-total)
 * and any {done,total} progress counter are NOT re-bumped. Every slice-number
 * surface must therefore read the roster — never the stranded roll-up. */
function extendedShapedArtifacts() {
  // 16 original slices (complete, implemented) + 2 net-new from extend (defined,
  // no implement log yet). Roster knows about all 18; the roll-ups still say 16.
  const orig = Array.from({ length: 16 }, (_, i) => `slice-${i}`);
  const added = ['extra-a', 'extra-b'];
  const roster = [
    ...orig.map((slug) => ({ slug, status: 'complete' })),
    ...added.map((slug) => ({ slug, status: 'defined', source: 'extension', 'extension-round': 1 })),
  ];
  const allArtifacts = {
    'slice-index': [{ frontmatter: { type: 'slice-index', status: 'in-progress', 'total-slices': 18, slices: roster } }],
    slice: [...orig, ...added].map((slug) => ({ frontmatter: { type: 'slice', 'slice-slug': slug, status: 'defined' } })),
    // STALE on purpose — extend never re-bumps the implement roll-up.
    'implement-index': [{ frontmatter: { type: 'implement-index', title: 'Implementation', status: 'in-progress', 'slices-implemented': 16, 'slices-total': 16 } }],
    implement: orig.map((slug) => ({ frontmatter: { type: 'implement', 'slice-slug': slug, status: 'complete' } })),
  };
  const indexFm = {
    slug: 'osce', title: 'OSCE', 'current-stage': 'implement', status: 'in-progress',
    progress: { done: 14, total: 14 }, // STALE {done,total} counter (distinct from 16 so it isolates Fix #4).
  };
  return { allArtifacts, indexFm, roster };
}

test('extend: slug-overview slice/implement/progress counts follow the roster, not the stale roll-up', () => {
  const { allArtifacts, indexFm } = extendedShapedArtifacts();
  const { headerHtml, bodyHtml } = renderSlugIndex({ frontmatter: indexFm, body: '' }, { slug: 'osce', allArtifacts });
  const html = headerHtml + bodyHtml;
  match(html, /18 slices/);            // slice station = live leaf count (16 + 2)
  match(html, /16\/18 slices/);        // implement denominator = roster 18, not roll-up 16
  doesNotMatch(html, /16\/16 slices/); // the stranded roll-up denominator is gone
  match(html, /14\/18/);               // progress counter reconciled UP to the live roster (14/14 → 14/18)
  doesNotMatch(html, /14\/14/);        // the stale counter denominator is gone
  const bandVal = (s, label) => (s.match(new RegExp(`>${label}</text><text[^>]*>([^<]+)</text>`)) || [])[1];
  strictEqual(bandVal(html, 'SLICES'), '18'); // callout band = roster total
});

test('extend: implement-index page shows implemented/total against the current roster', () => {
  const { allArtifacts } = extendedShapedArtifacts();
  const { headerHtml } = renderImplementIndexPage(allArtifacts['implement-index'][0], { slug: 'osce', allArtifacts });
  const flat = headerHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  match(flat, /16\/18 slices implemented/); // 16 logs against the roster's 18
  match(flat, /complete 16/);               // 16 implement leaves complete
  doesNotMatch(flat, /16 slices implemented/); // no bare count that hides the 2 new slices
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

test('findingListItem: composes chip + ref + action + msg + fix into the shared <li>', () => {
  const html = findingListItem({
    chip:     '<span class="sev severity-high">high</span>',
    file:     'src/auth.ts',
    line:     42,
    action:   'accept',
    msg:      'JWT lifetime too long',
    fix:      'shorten to 15m',
    id:       'sec-1',
    dataAttr: { name: 'severity', value: 'high' },
  });
  match(html, /^<li class="finding" data-severity="high" id="sec-1">/);
  match(html, /finding-head[\s\S]*severity-high[\s\S]*src\/auth\.ts:42[\s\S]*finding-action is-accept/);
  match(html, /<p class="finding-msg">JWT lifetime too long<\/p>/);
  match(html, /callout-info[\s\S]*suggested fix[\s\S]*shorten to 15m/);
});

test('findingListItem: variant adds extra class; dataAttr uses given name', () => {
  const html = findingListItem({
    chip:     '<span class="finding-cat is-reuse">reuse</span>',
    msg:      'duplicate util',
    id:       'SR-1',
    variant:  'finding-compact',
    dataAttr: { name: 'category', value: 'reuse' },
  });
  match(html, /^<li class="finding finding-compact" data-category="reuse" id="SR-1">/);
});

test('findingListItem: missing optional fields render minimally', () => {
  const html = findingListItem({ chip: 'CHIP', msg: 'just a message' });
  match(html, /^<li class="finding" id="">/);
  // No data-attr emitted when caller omits dataAttr
  ok(!/data-(severity|category)/.test(html));
  // No fix callout when fix is absent
  ok(!/callout-info/.test(html));
  // No ref when file is absent
  ok(!/finding-ref/.test(html));
  // No action chip when action is absent
  ok(!/finding-action/.test(html));
});

test('findingListItem: escapes user-provided strings to prevent injection', () => {
  const html = findingListItem({
    chip: 'C',
    file: '<script>x</script>',
    msg:  'a < b & c > d',
    fix:  '"quoted" text',
    id:   '<svg>',
  });
  ok(!/<script>x<\/script>/.test(html), 'file path must be escaped');
  ok(!/<svg>/.test(html), 'id must be escaped');
  match(html, /a &lt; b &amp; c &gt; d/);
  match(html, /&quot;quoted&quot;/);
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

/* ── _components (v9.20.1 expander) ────────────────────────────────── */

const COMPONENTS_ROOT = resolve(PLUGIN_ROOT, 'components');

test('expand: empty input returns empty', () => {
  strictEqual(expandSnippets('', { componentsRoot: COMPONENTS_ROOT }), '');
});

test('expand: passes through HTML without @include tokens unchanged', () => {
  const html = '<section class="fragment-x"><p>hello</p></section>';
  strictEqual(expandSnippets(html, { componentsRoot: COMPONENTS_ROOT }), html);
});

test('expand: replaces a callout @include with rendered snippet', () => {
  clearSnippetCache();
  const html = '<div><!-- @include callout { "kind": "warn", "title": "T", "body": "<em>B</em>" } --></div>';
  const out = expandSnippets(html, { componentsRoot: COMPONENTS_ROOT });
  match(out, /<aside class="callout callout-warn">/);
  match(out, /callout-hd">T</);
  // {{{body}}} should NOT be HTML-escaped (raw substitution)
  match(out, /<em>B<\/em>/);
});

test('expand: HTML-escapes {{token}} substitutions', () => {
  clearSnippetCache();
  // verdict uses {{label}} (escaped), passing < and & should appear escaped
  const html = '<div><!-- @include verdict { "kind": "no", "glyph": "✗", "label": "A < B & C", "summary": "" } --></div>';
  const out = expandSnippets(html, { componentsRoot: COMPONENTS_ROOT });
  match(out, /A &lt; B &amp; C/);
});

test('expand: throws on missing snippet', () => {
  clearSnippetCache();
  try {
    expandSnippets('<!-- @include does-not-exist { "x": 1 } -->', { componentsRoot: COMPONENTS_ROOT });
    ok(false, 'should have thrown');
  } catch (err) {
    match(err.message, /snippet not found/);
  }
});

test('expand: throws on invalid JSON payload', () => {
  clearSnippetCache();
  try {
    expandSnippets('<!-- @include callout { not valid json } -->', { componentsRoot: COMPONENTS_ROOT });
    ok(false, 'should have thrown');
  } catch (err) {
    match(err.message, /invalid JSON/);
  }
});

test('expand: metric-row renders multiple cells via {{#each}}', () => {
  clearSnippetCache();
  const payload = JSON.stringify({ metrics: [
    { label: 'A', value: 1 },
    { label: 'B', value: 2 },
    { label: 'C', value: 3 },
  ] });
  const html = `<!-- @include metric-row ${payload} -->`;
  const out = expandSnippets(html, { componentsRoot: COMPONENTS_ROOT });
  match(out, /metric-value">1</);
  match(out, /metric-value">2</);
  match(out, /metric-value">3</);
});

test('expand: respects maxDepth bound', () => {
  // Setting maxDepth=0 on an input containing an include token must throw.
  clearSnippetCache();
  const html = '<!-- @include callout { "kind": "warn", "title": "X", "body": "y" } -->';
  try {
    expandSnippets(html, { componentsRoot: COMPONENTS_ROOT, maxDepth: 0 });
    ok(false, 'should have thrown at maxDepth=0');
  } catch (err) {
    match(err.message, /maxDepth/);
  }
});

/* ── Phase 2 (v9.21.0) — review-command per-dimension ─────────────── */

import { render as renderReviewCommand } from '../renderers/review-command.mjs';
import { render as renderPlan } from '../renderers/plan.mjs';
import { render as renderAugmentation } from '../renderers/augmentation.mjs';
import { render as renderSimplifyRun } from '../renderers/simplify-run.mjs';
import { render as renderProfile } from '../renderers/profile.mjs';
import { render as renderDesign } from '../renderers/design.mjs';
import { render as renderShipRun } from '../renderers/ship-run.mjs';
import { render as renderIndex } from '../renderers/index.mjs';
import { render as renderSlice } from '../renderers/slice.mjs';
import { render as renderDashboard } from '../renderers/dashboard.mjs';
import { render as renderWorkflowIndex } from '../renderers/workflow-index.mjs';

test('review-command: sibling YAML drives focused verdict + filtered findings', () => {
  const artifact = {
    type: 'review-command',
    path: '07-review/security.md',
    frontmatter: { type: 'review-command', status: 'complete', dimension: 'security' },
    body: 'fallback body',
    siblingYaml: {
      artifact: 'review-dimension', dimension: 'security', parent: '07-review.md', rev: 1,
      verdict: 'caveats', summary: 'one high finding to triage',
      counts: { blocker: 0, high: 1, med: 0, low: 0, nit: 0 },
      findings: [
        { id: 'sec-1', severity: 'high', dimension: 'security', file: 'src/auth.ts', line: 42, msg: 'JWT lifetime too long', fix: 'shorten to 15m' },
        { id: 'cor-1', severity: 'low',  dimension: 'correctness', msg: 'unrelated' },
      ],
    },
    history: [], fragment: null,
  };
  const out = renderReviewCommand(artifact, {});
  match(out.headerHtml, /Review · <code>security/);
  match(out.bodyHtml, /verdict-caveats/);
  match(out.bodyHtml, /finding-list/);
  match(out.bodyHtml, /JWT lifetime too long/);
  // correctness finding from other dimension must be filtered out
  ok(!/unrelated/.test(out.bodyHtml), 'cross-dimension finding must be filtered out');
  match(out.bodyHtml, /metric-row/);
});

test('review-command: missing siblingYaml falls back to simple renderer', () => {
  const artifact = {
    type: 'review-command',
    path: '07-review/security.md',
    frontmatter: { type: 'review-command', status: 'complete', dimension: 'security' },
    body: '# Security review\n\nNo siblings yet.',
    siblingYaml: null, history: [], fragment: null,
  };
  const out = renderReviewCommand(artifact, {});
  // Simple renderer emits a frontmatter-card; rich renderer never does
  match(out.bodyHtml, /frontmatter-card|prose/);
  ok(!/verdict-/.test(out.bodyHtml), 'fallback must not emit a verdict block');
});

/* ── Phase 2 — plan data-flow lane variant ────────────────────────── */

test('plan: lanes block triggers data-flow projection', () => {
  const artifact = {
    type: 'plan',
    path: 'slices/checkout/04-plan.md',
    frontmatter: { type: 'plan', 'slice-slug': 'checkout', status: 'complete' },
    body: '',
    siblingYaml: {
      artifact: 'plan', slice: 'checkout', parent: '03-slices/checkout.md', rev: 1,
      modules: ['service-a', 'service-b'],
      lanes: [
        { service: 'service-a', files: ['service-a/api.ts'] },
        { service: 'service-b', files: ['service-b/worker.ts'] },
      ],
      files: [
        { path: 'service-a/api.ts',     role: 'modified' },
        { path: 'service-b/worker.ts',  role: 'new' },
      ],
      edges: [{ from: 'service-a/api.ts', to: 'service-b/worker.ts', kind: 'crosses-service' }],
      risks: [],
    },
    history: [], fragment: null,
  };
  const out = renderPlan(artifact, {});
  match(out.bodyHtml, /Data-flow lanes/);
  match(out.bodyHtml, /plan-lanes-legend/);
  // crosses-service label is drawn on the edge
  match(out.bodyHtml, /crosses-service/);
  // SERVICE lane labels are uppercased
  match(out.bodyHtml, /SERVICE-A/);
});

test('plan: crosses-service edge alone triggers inferred lanes', () => {
  const artifact = {
    type: 'plan',
    path: 'slices/checkout/04-plan.md',
    frontmatter: { type: 'plan', 'slice-slug': 'checkout' },
    body: '',
    siblingYaml: {
      artifact: 'plan', slice: 'checkout', parent: 'p', rev: 1,
      modules: ['service-a', 'service-b'],
      files: [
        { path: 'service-a/api.ts',    role: 'modified' },
        { path: 'service-b/worker.ts', role: 'new' },
      ],
      edges: [{ from: 'service-a/api.ts', to: 'service-b/worker.ts', kind: 'crosses-service' }],
      risks: [],
    },
    history: [], fragment: null,
  };
  const out = renderPlan(artifact, {});
  match(out.bodyHtml, /Data-flow lanes/);
});

test('plan: no lanes + plain edges stays on file-topology figure', () => {
  const artifact = {
    type: 'plan',
    path: 'slices/checkout/04-plan.md',
    frontmatter: { type: 'plan', 'slice-slug': 'checkout' },
    body: '',
    siblingYaml: {
      artifact: 'plan', slice: 'checkout', parent: 'p', rev: 1,
      modules: ['core'],
      files: [{ path: 'core/index.ts', role: 'modified' }],
      edges: [],
      risks: [],
    },
    history: [], fragment: null,
  };
  const out = renderPlan(artifact, {});
  match(out.bodyHtml, /File-change topology/);
  ok(!/Data-flow lanes/.test(out.bodyHtml));
});

/* ── Phase 2 — RCA 5-whys drill panel ─────────────────────────────── */

test('rca: five_whys array renders collapsible details with root marker', () => {
  const artifact = {
    type: 'augmentation',
    path: 'augmentations/INC-0512.md',
    frontmatter: { type: 'augmentation', 'augmentation-type': 'rca', status: 'complete' },
    body: '',
    siblingYaml: {
      artifact: 'rca', incident: 'INC-0512', title: 'Checkout outage',
      started_at: '2026-05-12T10:00:00Z', resolved_at: '2026-05-12T11:30:00Z',
      metrics: { duration: '1h30m' },
      timeline: [
        { id: 'a', at: '10:00', kind: 'alert', title: 'Pager fires' },
        { id: 'b', at: '11:30', kind: 'resolution', title: 'Restored' },
      ],
      chain: [
        { step: 'TRIGGER',     body: 'Burst of traffic' },
        { step: 'CHANGE',      body: 'New cache config' },
        { step: 'CASCADE',     body: 'Cascading timeouts' },
        { step: 'ROOT_CAUSE',  body: 'Connection pool too small' },
      ],
      heatmap: { buckets: [], systems: {} },
      five_whys: [
        { question: 'Why did checkout time out?', answer: 'DB connection pool exhausted.' },
        { question: 'Why was the pool exhausted?', answer: 'Pool size was 10.' },
        { question: 'Why was it 10?', answer: 'Default never tuned.' },
        { question: 'Why never tuned?', answer: 'Capacity review skipped.', root: true },
      ],
    },
    history: [], fragment: null,
  };
  const out = renderAugmentation(artifact, {});
  match(out.bodyHtml, /<details class="rca-five-whys is-root">/);
  match(out.bodyHtml, /5 whys/);
  match(out.bodyHtml, /Capacity review skipped/);
  // Root entry tagged
  match(out.bodyHtml, /li class="is-root"/);
});

test('rca: missing five_whys omits the panel entirely', () => {
  const artifact = {
    type: 'augmentation',
    path: 'augmentations/INC-0512.md',
    frontmatter: { type: 'augmentation', 'augmentation-type': 'rca', status: 'complete' },
    body: '',
    siblingYaml: {
      artifact: 'rca', incident: 'INC-0512', title: 'x',
      started_at: '2026-05-12T10:00:00Z', resolved_at: '2026-05-12T11:00:00Z',
      metrics: {},
      timeline: [{ id: 'a', at: '10', kind: 'alert', title: 't' }, { id: 'b', at: '11', kind: 'resolution', title: 'r' }],
      chain: [
        { step: 'TRIGGER', body: 'a' }, { step: 'CHANGE', body: 'b' },
        { step: 'CASCADE', body: 'c' }, { step: 'ROOT_CAUSE', body: 'd' },
      ],
      heatmap: { buckets: [], systems: {} },
    },
    history: [], fragment: null,
  };
  const out = renderAugmentation(artifact, {});
  ok(!/rca-five-whys/.test(out.bodyHtml), '5-whys panel must be omitted when field is absent');
});

test('rca: ROOT: prefix on last answer infers root marker', () => {
  const artifact = {
    type: 'augmentation',
    path: 'augmentations/x.md',
    frontmatter: { type: 'augmentation', 'augmentation-type': 'rca' },
    body: '',
    siblingYaml: {
      artifact: 'rca', incident: 'x', title: 'x',
      started_at: '2026-05-12T10:00:00Z', resolved_at: '2026-05-12T11:00:00Z',
      metrics: {},
      timeline: [{ id: 'a', at: '10', kind: 'alert', title: 't' }, { id: 'b', at: '11', kind: 'resolution', title: 'r' }],
      chain: [
        { step: 'TRIGGER', body: 'a' }, { step: 'CHANGE', body: 'b' },
        { step: 'CASCADE', body: 'c' }, { step: 'ROOT_CAUSE', body: 'd' },
      ],
      heatmap: { buckets: [], systems: {} },
      five_whys: [
        { question: 'q1', answer: 'a1' },
        { question: 'q2', answer: 'ROOT: implicit root' },
      ],
    },
    history: [], fragment: null,
  };
  const out = renderAugmentation(artifact, {});
  match(out.bodyHtml, /rca-five-whys is-root/);
  // ROOT: prefix stripped from rendered text
  ok(!/ROOT: implicit root/.test(out.bodyHtml));
  match(out.bodyHtml, /implicit root/);
});

/* ── Phase 3 — simplify-run finding table ─────────────────────────── */

test('simplify-run: sibling YAML drives finding table + counts + deltas', () => {
  const artifact = {
    type: 'simplify-run',
    path: 'simplify/2026-05-22.md',
    frontmatter: { type: 'simplify-run', status: 'complete', 'run-id': 'sr-2026-05-22' },
    body: 'fallback body',
    siblingYaml: {
      artifact: 'simplify-run', run_id: 'sr-2026-05-22', scope: 'branch', target: 'master',
      counts: { reuse: 2, quality: 1, efficiency: 1, accepted: 3, skipped: 0, deferred: 1 },
      summary: 'four findings, three accepted',
      findings: [
        { id: 'SR-1', category: 'reuse', action: 'accept', file: 'src/a.ts', line: 12, msg: 'dup of b.ts', fix: 'extract' },
        { id: 'SR-2', category: 'quality', action: 'defer', msg: 'naming' },
      ],
      deltas: [
        { file: 'src/a.ts', add: 0, rem: 24, summary: 'extract to util' },
      ],
    },
    history: [], fragment: null,
  };
  const out = renderSimplifyRun(artifact, {});
  match(out.headerHtml, /Simplify · <code>sr-2026-05-22/);
  match(out.bodyHtml, /metric-row/);
  match(out.bodyHtml, /simplify-findings/);
  match(out.bodyHtml, /finding-list-compact/);
  match(out.bodyHtml, /finding-cat is-reuse/);
  match(out.bodyHtml, /finding-cat is-quality/);
  match(out.bodyHtml, /simplify-deltas/);
  match(out.bodyHtml, /dup of b\.ts/);
});

test('simplify-run: missing siblingYaml falls back to simple renderer', () => {
  const artifact = {
    type: 'simplify-run',
    path: 'simplify/x.md',
    frontmatter: { type: 'simplify-run', 'run-id': 'sr-x' },
    body: '# nothing here yet',
    siblingYaml: null, history: [], fragment: null,
  };
  const out = renderSimplifyRun(artifact, {});
  ok(!/simplify-findings/.test(out.bodyHtml), 'rich finding table must not render without sibling YAML');
  match(out.bodyHtml, /frontmatter-card|prose/);
});

/* ── Phase 3 — profile benchmark comparison ───────────────────────── */

test('profile: sibling YAML drives hotspots + before/after figure + candidates', () => {
  const artifact = {
    type: 'profile',
    path: 'profile/run-1.md',
    frontmatter: { type: 'profile', status: 'complete', 'run-id': 'prof-1' },
    body: '',
    siblingYaml: {
      artifact: 'profile', run_id: 'prof-1', target: 'api-handler', method: 'dynamic-cpu', confidence: 'high',
      hotspots: [
        { id: 'H1', function: 'handleRequest', file: 'src/api.ts', line: 24, cost_pct: 32.4, candidate: true },
        { id: 'H2', function: 'parseHeaders',  cost_pct: 11.0 },
      ],
      optimization_candidates: [
        { id: 'OC1', hotspot: 'H1', intent: 'memoize validators', estimated_gain_pct: 18.0, confidence: 'high' },
      ],
      comparisons: [
        { metric: 'p50_ms', before: 124, after: 92, unit: 'ms', direction: 'lower-is-better' },
      ],
    },
    history: [], fragment: null,
  };
  const out = renderProfile(artifact, {});
  match(out.headerHtml, /Profile · <code>prof-1/);
  match(out.bodyHtml, /profile-hotspots/);
  match(out.bodyHtml, /handleRequest/);
  match(out.bodyHtml, /Before \/ after/);
  match(out.bodyHtml, /profile-candidates/);
  match(out.bodyHtml, /est\. 18\.0%/);
});

test('profile: no comparisons block omits the figure but keeps hotspots', () => {
  const artifact = {
    type: 'profile',
    path: 'profile/run-2.md',
    frontmatter: { type: 'profile', 'run-id': 'prof-2' },
    body: '',
    siblingYaml: {
      artifact: 'profile', run_id: 'prof-2', method: 'static',
      hotspots: [{ id: 'H1', function: 'fn', cost_pct: 5.0 }],
    },
    history: [], fragment: null,
  };
  const out = renderProfile(artifact, {});
  match(out.bodyHtml, /profile-hotspots/);
  ok(!/Before \/ after/.test(out.bodyHtml), 'comparison figure must not render without comparisons block');
});

test('profile: missing siblingYaml falls back to simple renderer', () => {
  const artifact = {
    type: 'profile',
    path: 'profile/x.md',
    frontmatter: { type: 'profile', 'run-id': 'p-x' },
    body: '# todo',
    siblingYaml: null, history: [], fragment: null,
  };
  const out = renderProfile(artifact, {});
  ok(!/profile-hotspots/.test(out.bodyHtml));
});

/* ── Phase 3 — augmentation structured-result branches ────────────── */

test('augmentation/benchmark: emits metric comparison table with improvement tone', () => {
  const artifact = {
    type: 'augmentation',
    path: 'augmentations/bench-1.md',
    frontmatter: { type: 'augmentation', 'augmentation-type': 'benchmark', status: 'complete' },
    body: '',
    siblingYaml: {
      artifact: 'benchmark', target: 'cache-lookup', framework: 'criterion', mode: 'compare',
      metrics: [
        { name: 'latency_p50_ms', before: 12.4, after: 8.1, unit: 'ms', direction: 'lower-is-better' },
        { name: 'qps',            before: 8100, after: 11500, unit: 'qps', direction: 'higher-is-better' },
      ],
      improvements: ['latency_p50_ms', 'qps'],
      notes: 'warm cache, 5 runs',
    },
    history: [], fragment: null,
  };
  const out = renderAugmentation(artifact, {});
  match(out.headerHtml, /Benchmark · <code>cache-lookup/);
  match(out.bodyHtml, /aug-benchmark/);
  match(out.bodyHtml, /benchmark-table/);
  match(out.bodyHtml, /latency_p50_ms/);
  // improvements get is-ok tone
  match(out.bodyHtml, /delta-cell is-ok/);
  match(out.bodyHtml, /warm cache/);
});

test('augmentation/benchmark: regression on lower-is-better metric tones is-bad', () => {
  const artifact = {
    type: 'augmentation',
    path: 'augmentations/bench-2.md',
    frontmatter: { type: 'augmentation', 'augmentation-type': 'benchmark' },
    body: '',
    siblingYaml: {
      artifact: 'benchmark', target: 'cold-start',
      metrics: [
        { name: 'cold_start_ms', before: 100, after: 140, unit: 'ms', direction: 'lower-is-better' },
      ],
      regressions: ['cold_start_ms'],
    },
    history: [], fragment: null,
  };
  const out = renderAugmentation(artifact, {});
  match(out.bodyHtml, /delta-cell is-bad/);
});

test('augmentation/experiment: emits arm-allocation figure + guardrail table', () => {
  const artifact = {
    type: 'augmentation',
    path: 'augmentations/exp-1.md',
    frontmatter: { type: 'augmentation', 'augmentation-type': 'experiment', status: 'complete' },
    body: '',
    siblingYaml: {
      artifact: 'experiment', experiment_type: 'feature-flag', flag: 'new-prompt-cache',
      hypothesis: 'prompt-cache cuts p50 by >15%',
      arms: [
        { id: 'control',  description: 'current behavior', allocated_pct: 50 },
        { id: 'treatment', description: 'cache on',         allocated_pct: 50 },
      ],
      guardrails: [
        { name: 'p99_latency_ms', threshold: 800, direction: 'lower-is-better', unit: 'ms' },
      ],
      status: 'ready',
    },
    history: [], fragment: null,
  };
  const out = renderAugmentation(artifact, {});
  match(out.headerHtml, /Experiment · <code>new-prompt-cache/);
  match(out.bodyHtml, /Arm allocation/);
  match(out.bodyHtml, /exp-arms/);
  match(out.bodyHtml, /guardrail-table/);
  match(out.bodyHtml, /p99_latency_ms/);
  match(out.bodyHtml, /prompt-cache cuts p50/);
});

test('augmentation/instrument: emits signal table + dark-paths callouts', () => {
  const artifact = {
    type: 'augmentation',
    path: 'augmentations/inst-1.md',
    frontmatter: { type: 'augmentation', 'augmentation-type': 'instrument', status: 'complete' },
    body: '',
    siblingYaml: {
      artifact: 'instrument', framework: 'opentelemetry',
      signals: [
        { name: 'dispatch_q_depth',    kind: 'gauge',     pii: false, path: 'server/queue/enqueue.ts:48' },
        { name: 'session_start_latency', kind: 'histogram', pii: false, path: 'server/sm/dispatch.ts:90' },
      ],
      dark_paths: [
        { path: 'src/DispatchPanel.tsx:120', reason: 'no close-event telemetry' },
      ],
      pii_warnings: 0,
    },
    history: [], fragment: null,
  };
  const out = renderAugmentation(artifact, {});
  match(out.headerHtml, /Instrument · <code>opentelemetry/);
  match(out.bodyHtml, /signal-table/);
  match(out.bodyHtml, /signal-kind is-gauge/);
  match(out.bodyHtml, /signal-kind is-histogram/);
  match(out.bodyHtml, /aug-instrument-dark/);
  match(out.bodyHtml, /no close-event telemetry/);
});

test('augmentation: unknown subtype with sibling YAML falls back to simple renderer', () => {
  const artifact = {
    type: 'augmentation',
    path: 'augmentations/x.md',
    frontmatter: { type: 'augmentation', 'augmentation-type': 'unknown' },
    body: '# unknown',
    siblingYaml: { artifact: 'unknown' }, history: [], fragment: null,
  };
  const out = renderAugmentation(artifact, {});
  ok(!/aug-benchmark|aug-experiment|aug-instrument/.test(out.bodyHtml));
});

/* ── Phase 4 — design + ship-run sibling-YAML branches (S1.2) ─────── */

test('design: sibling YAML drives tokens table grouped by category + sizes + chip rows', () => {
  const artifact = {
    type: 'design',
    path: 'design/button.md',
    frontmatter: { type: 'design', status: 'complete', title: 'Button' },
    body: 'narrative body',
    siblingYaml: {
      artifact: 'design', component: 'Button',
      themes: ['light', 'dark'],
      states: ['default', 'hover', 'focus', 'disabled'],
      sizes: [
        { id: 'sm', height: 32, padx: 12, font: 13, radius: 6 },
        { id: 'md', height: 40, padx: 16, font: 14, radius: 8 },
      ],
      tokens: [
        { name: '--btn-fg', category: 'color',   value: '#1f1b16', note: 'ink' },
        { name: '--btn-bg', category: 'color',   value: '#fbfaf6' },
        { name: '--btn-r',  category: 'radius',  value: '8px' },
        { name: '--btn-px', category: 'spacing', value: '16px' },
      ],
      specs: { reference: 'figma://Button-v3', annotate: ['min target 44x44', 'aria-pressed when toggle'] },
    },
    history: [], fragment: null,
  };
  const out = renderDesign(artifact, {});
  match(out.headerHtml, /Design · <code>Button/);
  match(out.bodyHtml, /design-themes/);
  match(out.bodyHtml, /design-states/);
  match(out.bodyHtml, /design-sizes/);
  match(out.bodyHtml, /design-tokens-color/);
  match(out.bodyHtml, /design-tokens-radius/);
  match(out.bodyHtml, /token-swatch/);
  match(out.bodyHtml, /design-specs/);
  match(out.bodyHtml, /figma:\/\/Button-v3/);
});

test('design: missing siblingYaml falls back to simple renderer', () => {
  const artifact = {
    type: 'design',
    path: 'design/x.md',
    frontmatter: { type: 'design', title: 'x' },
    body: '# x',
    siblingYaml: null, history: [], fragment: null,
  };
  const out = renderDesign(artifact, {});
  ok(!/design-tokens-group/.test(out.bodyHtml), 'rich tokens block must not render without sibling YAML');
});

test('ship-run: sibling YAML drives stages timeline + checks table + rollback panel', () => {
  const artifact = {
    type: 'ship-run',
    path: 'ship/20260522T1430Z.md',
    frontmatter: { type: 'ship-run', status: 'shipped' },
    body: '',
    siblingYaml: {
      artifact: 'ship-run', release: 'v1.42.0', run_at: '2026-05-22T14:30:00Z',
      stages: [
        { name: 'build',  status: 'ok' },
        { name: 'test',   status: 'flake' },
        { name: 'stage',  status: 'ok' },
        { name: 'canary', status: 'ok' },
        { name: 'prod',   status: 'pending' },
      ],
      checks: [
        { name: 'auth-flow', kind: 'e2e', results: { stage: { status: 'pass', duration_s: 12 }, prod: { status: 'pending' } } },
        { name: 'cart-perf', kind: 'perf', results: { stage: { status: 'flake', duration_s: 8 } } },
      ],
      rollback: { window_minutes: 30, target_release: 'v1.41.2', approvers: ['oncall@example.com'] },
    },
    history: [], fragment: null,
  };
  const out = renderShipRun(artifact, {});
  match(out.headerHtml, /Ship run · <code>v1\.42\.0/);
  match(out.bodyHtml, /ship-stages/);
  match(out.bodyHtml, /ship-timeline/);
  match(out.bodyHtml, /ship-checks/);
  match(out.bodyHtml, /check-status is-ok/);
  match(out.bodyHtml, /check-status is-warn/);
  match(out.bodyHtml, /ship-rollback/);
  match(out.bodyHtml, /v1\.41\.2/);
});

test('ship-run: missing siblingYaml falls back to simple renderer', () => {
  const artifact = {
    type: 'ship-run',
    path: 'ship/x.md',
    frontmatter: { type: 'ship-run', release: 'v1.0.0' },
    body: '# todo',
    siblingYaml: null, history: [], fragment: null,
  };
  const out = renderShipRun(artifact, {});
  ok(!/ship-timeline/.test(out.bodyHtml), 'timeline must not render without sibling YAML');
});

/* ── S2.2 — off-pipeline path resolution + link-graph kind threading ── */

test('resolveViewPath: simplify kind maps run-id to /simplify/<run-id>/', () => {
  const r = resolveViewPath('20260520T1430Z.md', { kind: 'simplify' });
  deepStrictEqual(r, { viewRel: 'simplify/20260520T1430Z/INDEX.html', kind: 'simplify' });
});

test('resolveViewPath: profile kind preserves nested run-id/file path', () => {
  const r = resolveViewPath('prof-run-1/01-profile.md', { kind: 'profile' });
  deepStrictEqual(r, { viewRel: 'profiles/prof-run-1/01-profile/INDEX.html', kind: 'profile' });
});

test('resolveViewPath: workflow kind (default) still returns slug-relative path', () => {
  // Backwards-compat: omitting opts should behave exactly as v9.22.x.
  const r = resolveViewPath('00-index.md');
  deepStrictEqual(r, { viewRel: 'INDEX.html', kind: '00-index' });
});

test('buildPathMap: threads kind so off-pipeline artifacts land in the map', () => {
  const map = buildPathMap([
    { path: '00-index.md', kind: 'workflow' },
    { path: '20260520T1430Z.md', kind: 'simplify' },
    { path: 'prof-1/01-profile.md', kind: 'profile' },
  ]);
  strictEqual(map.get('00-index.md'), 'INDEX.html');
  strictEqual(map.get('20260520T1430Z.md'), 'simplify/20260520T1430Z/INDEX.html');
  strictEqual(map.get('prof-1/01-profile.md'), 'profiles/prof-1/01-profile/INDEX.html');
});

/* ── S2.3 — hotspot candidate chip uses is-yes / is-no modifier ────── */

test('profile hotspot chip uses is-yes for candidates and is-no otherwise', () => {
  const artifact = {
    type: 'profile',
    path: 'profile/run-3.md',
    frontmatter: { type: 'profile', 'run-id': 'prof-3' },
    body: '',
    siblingYaml: {
      artifact: 'profile', run_id: 'prof-3', method: 'static',
      hotspots: [
        { id: 'H1', function: 'fn1', cost_pct: 30, candidate: true },
        { id: 'H2', function: 'fn2', cost_pct: 10 },
      ],
    },
    history: [], fragment: null,
  };
  const out = renderProfile(artifact, {});
  match(out.bodyHtml, /hotspot-cand is-yes/);
  match(out.bodyHtml, /hotspot-cand is-no/);
  // The tautological `is-cand` modifier must no longer appear in output.
  ok(!/is-cand(?![a-z])/.test(out.bodyHtml), 'is-cand modifier should be retired');
});

/* ── S2.4 — slug-overview navigation (stages grid + slices + activity) ─ */

function buildSlugAllArtifacts() {
  // Minimal shape consumed by renderers/index.mjs — keyed by frontmatter.type.
  return {
    intake: [{ frontmatter: { type: 'intake', 'updated-at': '2026-05-20T10:00:00Z' }, storageRel: '01-intake.md', viewRel: 'intake/INDEX.html' }],
    shape:  [{ frontmatter: { type: 'shape',  'updated-at': '2026-05-20T11:00:00Z' }, storageRel: '02-shape.md',  viewRel: 'shape/INDEX.html' }],
    slice:  [
      { frontmatter: { type: 'slice', 'slice-slug': 'auth-cache', title: 'Auth cache', status: 'active', 'updated-at': '2026-05-21T09:00:00Z' }, storageRel: 'slices/auth-cache/03-slice.md', viewRel: 'slice/auth-cache/INDEX.html' },
      { frontmatter: { type: 'slice', 'slice-slug': 'rate-limit', title: 'Rate limit', status: 'complete', 'updated-at': '2026-05-21T10:00:00Z' }, storageRel: 'slices/rate-limit/03-slice.md', viewRel: 'slice/rate-limit/INDEX.html' },
    ],
    plan: [{ frontmatter: { type: 'plan', 'slice-slug': 'auth-cache', 'updated-at': '2026-05-22T09:00:00Z' }, storageRel: 'slices/auth-cache/04-plan.md', viewRel: 'plan/auth-cache/INDEX.html' }],
    // implement, verify, review, handoff, ship, retro intentionally empty (test "not started" cards)
  };
}

test('index (slug overview): stages grid emits clickable cards for populated stages', () => {
  const artifact = {
    type: 'index',
    path: '00-index.md',
    frontmatter: { type: 'workflow-index', slug: 'demo-slug', title: 'Demo', 'current-stage': 'plan', status: 'active' },
    body: '',
    history: [], fragment: null,
  };
  const out = renderIndex(artifact, { allArtifacts: buildSlugAllArtifacts() });
  match(out.bodyHtml, /class="slug-stages"/);
  // Populated stages link to the canonical sub-dir.
  match(out.bodyHtml, /<a class="slice-card[^"]*" href="intake\/INDEX\.html"/);
  match(out.bodyHtml, /<a class="slice-card[^"]*" href="shape\/INDEX\.html"/);
  match(out.bodyHtml, /<a class="slice-card[^"]*" href="slice\/INDEX\.html"/);
  match(out.bodyHtml, /<a class="slice-card[^"]*" href="plan\/INDEX\.html"/);
  // The current stage gets the is-current modifier.
  match(out.bodyHtml, /slice-card is-current[^"]*"\s+href="plan\/INDEX\.html/);
});

test('index (slug overview): empty stages render as non-clickable is-missing cards', () => {
  const artifact = {
    type: 'index',
    path: '00-index.md',
    frontmatter: { type: 'workflow-index', slug: 'demo-slug', 'current-stage': 'plan' },
    body: '',
    history: [], fragment: null,
  };
  const out = renderIndex(artifact, { allArtifacts: buildSlugAllArtifacts() });
  // implement is empty in the fixture → is-missing, no anchor
  match(out.bodyHtml, /<div class="slice-card[^"]*is-missing[^"]*">\s*<span class="slice-slug"><code>implement<\/code><\/span>/);
  match(out.bodyHtml, /not started/);
});

test('index (slug overview): slices preview surfaces each slice with status tone', () => {
  const artifact = {
    type: 'index',
    path: '00-index.md',
    frontmatter: { type: 'workflow-index', slug: 'demo-slug' },
    body: '',
    history: [], fragment: null,
  };
  const out = renderIndex(artifact, { allArtifacts: buildSlugAllArtifacts() });
  match(out.bodyHtml, /class="slug-slices"/);
  // Each slice card links into slice/<slice-slug>/ and carries the status badge.
  match(out.bodyHtml, /<a class="slice-card[^"]*" href="slice\/auth-cache\/INDEX\.html"/);
  match(out.bodyHtml, /<a class="slice-card[^"]*" href="slice\/rate-limit\/INDEX\.html"/);
  match(out.bodyHtml, /is-current/);   // active → is-current tone
  match(out.bodyHtml, /is-ok/);        // complete → is-ok tone
});

test('index (slug overview): recent-activity entries wrap content in clickable links', () => {
  const artifact = {
    type: 'index',
    path: '00-index.md',
    frontmatter: { type: 'workflow-index', slug: 'demo-slug' },
    body: '',
    history: [], fragment: null,
  };
  const out = renderIndex(artifact, { allArtifacts: buildSlugAllArtifacts() });
  match(out.bodyHtml, /class="activity-list"/);
  match(out.bodyHtml, /class="activity-link" href="plan\/auth-cache\/INDEX\.html"/);
});

/* ── S2.4 — slice page navigation (stage grid + missing cards + reviews) ─ */

test('slice page: stage nav grid links plan / implement / verify under the same slice', () => {
  const artifact = {
    type: 'slice',
    path: 'slices/auth-cache/03-slice.md',
    frontmatter: { type: 'slice', 'slice-slug': 'auth-cache', title: 'Auth cache', status: 'active' },
    body: '',
    history: [], fragment: null,
  };
  const ctx = {
    allArtifacts: {
      plan:      [{ frontmatter: { 'slice-slug': 'auth-cache', status: 'complete' } }],
      implement: [{ frontmatter: { 'slice-slug': 'auth-cache', status: 'active'   } }],
      verify:    [],  // intentionally absent — should render as is-missing
    },
  };
  const out = renderSlice(artifact, ctx);
  match(out.bodyHtml, /class="slice-stages"/);
  match(out.bodyHtml, /<a class="slice-card" href="\.\.\/\.\.\/plan\/auth-cache\/INDEX\.html"/);
  match(out.bodyHtml, /<a class="slice-card" href="\.\.\/\.\.\/implement\/auth-cache\/INDEX\.html"/);
  // verify is missing → div, not anchor
  match(out.bodyHtml, /<div class="slice-card is-missing">[\s\S]*?verify[\s\S]*?not started/);
});

test('slice page: per-dimension review cards link to review/<dimension>/', () => {
  const artifact = {
    type: 'slice',
    path: 'slices/auth-cache/03-slice.md',
    frontmatter: { type: 'slice', 'slice-slug': 'auth-cache' },
    body: '',
    history: [], fragment: null,
  };
  const ctx = {
    allArtifacts: {
      'review-command': [
        { frontmatter: { 'slice-slug': 'auth-cache', dimension: 'security',    status: 'caveats' } },
        { frontmatter: { slices: ['auth-cache'],     dimension: 'performance', status: 'ship'    } },
        { frontmatter: { 'slice-slug': 'other',      dimension: 'a11y',        status: 'no'      } },
      ],
    },
  };
  const out = renderSlice(artifact, ctx);
  match(out.bodyHtml, /class="slice-reviews"/);
  match(out.bodyHtml, /href="\.\.\/\.\.\/review\/security\/INDEX\.html"/);
  match(out.bodyHtml, /href="\.\.\/\.\.\/review\/performance\/INDEX\.html"/);
  // The 'a11y' review on a different slice must be filtered out.
  ok(!/review\/a11y\//.test(out.bodyHtml), 'review for other slice must not appear');
});

/* ── Dashboard: reachability of every workflow shape ───────────────── */

function dashboardSummary() {
  return {
    __summary__: [
      { slug: 'full-active',   frontmatter: { type: 'index', title: 'Full active',   status: 'active',   'current-stage': 'plan' } },
      { slug: 'full-ready',    frontmatter: { type: 'index', title: 'Full ready',    status: 'ready',    'current-stage': 'shape' } },
      { slug: 'full-done',     frontmatter: { type: 'index', title: 'Full done',     status: 'complete', 'current-stage': 'ship' } },
      { slug: 'full-closed',   frontmatter: { type: 'index', title: 'Full closed',   status: 'closed',   'current-stage': 'retro' } },
      { slug: 'rca-thing',     frontmatter: { type: 'workflow-index', 'workflow-type': 'rca', title: 'RCA thing', status: 'ready', 'current-stage': 'fix-routing' } },
      { slug: 'probe-thing',   frontmatter: { type: 'workflow-index', 'workflow-type': 'probe', title: 'Probe thing', status: 'ready', 'current-stage': 'routing' } },
    ],
    __project__: [],
  };
}

test('dashboard: workflow-index (quick) slugs are reachable, not just type:index', () => {
  const out = renderDashboard({ type: 'dashboard', frontmatter: {}, body: '' }, { allArtifacts: dashboardSummary() });
  // Every slug — pipeline AND quick — must have an inbound link.
  for (const slug of ['full-active', 'full-ready', 'full-done', 'full-closed', 'rca-thing', 'probe-thing']) {
    match(out.bodyHtml, new RegExp(`href="${slug}/INDEX\\.html"`), `${slug} should be linked from dashboard`);
  }
  // Quick workflows get their own section + workflow-type pill.
  match(out.bodyHtml, /Quick &amp; investigative/);
  match(out.bodyHtml, /<span class="stage-pill">rca<\/span>/);
  match(out.bodyHtml, /<span class="stage-pill">probe<\/span>/);
});

test('dashboard: status bucketing is exhaustive — a non-canonical status still shows', () => {
  const out = renderDashboard({ type: 'dashboard', frontmatter: {}, body: '' }, { allArtifacts: dashboardSummary() });
  // `ready` is neither complete nor closed → must land in Active, not vanish.
  match(out.bodyHtml, /href="full-ready\/INDEX\.html"/);
  // Section counts: Active has full-active + full-ready (2), Complete 1, Closed 1.
  match(out.bodyHtml, /Active <span class="meta">\(2\)<\/span>/);
  match(out.bodyHtml, /Recently shipped <span class="meta">\(1\)<\/span>/);
  match(out.bodyHtml, /Closed <span class="meta">\(1\)<\/span>/);
});

test('dashboard: swimlanes exclude off-pipeline quick workflows', () => {
  const out = renderDashboard({ type: 'dashboard', frontmatter: {}, body: '' }, { allArtifacts: dashboardSummary() });
  const svg = out.bodyHtml.slice(out.bodyHtml.indexOf('<svg'), out.bodyHtml.indexOf('</svg>'));
  // Pipeline slug labels appear in the swimlane SVG; quick ones do not.
  match(svg, /full-active/);
  ok(!svg.includes('rca-thing'), 'quick workflow rca-thing should not appear as a swimlane row');
  ok(!svg.includes('probe-thing'), 'quick workflow probe-thing should not appear as a swimlane row');
});

/* ── workflow-index renderer (quick / investigative overview) ──────── */

test('workflow-index: surfaces routes, progress, and links every sibling artifact', () => {
  const artifact = {
    type: 'workflow-index',
    path: '00-index.md',
    frontmatter: {
      type: 'workflow-index', slug: 'rca-signin', 'workflow-type': 'rca',
      title: 'Sign-in RCA', status: 'ready', 'current-stage': 'fix-routing',
      'recommended-routes': { primary: 'human-triage', alternates: ['/wf-quick fix rca-signin'] },
      progress: { rca: 'complete', 'shape-synthesized': 'complete' },
      tags: ['auth', 'firebase'],
    },
    body: '# RCA\nRoot cause writeup.',
    history: [], fragment: null,
  };
  const ctx = {
    allArtifacts: {
      'workflow-index': [{ frontmatter: { type: 'workflow-index' }, viewRel: 'INDEX.html', storageRel: '00-index.md' }],
      rca:   [{ frontmatter: { type: 'rca', title: 'Root cause' }, viewRel: 'rca/INDEX.html', storageRel: '01-rca.md' }],
      shape: [{ frontmatter: { type: 'shape', title: 'Shape' }, viewRel: 'shape/INDEX.html', storageRel: '02-shape.md' }],
    },
  };
  const out = renderWorkflowIndex(artifact, ctx);
  // Recommended next route + alternate.
  match(out.bodyHtml, /recommended next/);
  match(out.bodyHtml, /human-triage/);
  match(out.bodyHtml, /\/wf-quick fix rca-signin/);
  // Sibling artifacts are linked; the index page itself is not listed.
  match(out.bodyHtml, /href="rca\/INDEX\.html"/);
  match(out.bodyHtml, /href="shape\/INDEX\.html"/);
  ok(!/href="INDEX\.html"/.test(out.bodyHtml), 'should not link to itself');
  // Progress map + tags.
  match(out.bodyHtml, /progress/);
  match(out.bodyHtml, /shape-synthesized/);
  match(out.bodyHtml, /firebase/);
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
