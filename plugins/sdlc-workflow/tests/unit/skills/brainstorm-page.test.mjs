// WF-DESIGN-PLAN A7: the brainstorm page. lib/brainstorm-page.mjs renders
// brainstorm-page.html from brainstorm-board.json and 01-brainstorm.md;
// scripts/brainstorm-page.mjs writes it beside the board.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { doesNotMatch, equal, match, ok } from 'node:assert/strict';

import { PAGE_FILE, documentSections, renderBrainstormPage } from '../../../lib/brainstorm-page.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..', '..', '..');
const SCRIPT = join(PLUGIN_ROOT, 'scripts', 'brainstorm-page.mjs');
const SLUG = 'brainstorm-lantern-20261020';

function board() {
  return {
    schema: 'sdlc/v1', artifact: 'brainstorm-board', slug: SLUG, topic: 'the lantern app', sessions: 2, focus: 'design',
    stories: [
      { session: 1, text: 'We set out to see the home screen.' },
      { session: 2, text: 'We chose a quiet home with one action.' },
    ],
    areas: [{ key: 'home', name: 'The home screen', side: 'solution', state: 'explored', brief: 'One action, quiet.', scope: 'keep' }],
    threads: [{ key: 'home-shape', name: 'How home looks', area: 'home', state: 'live' }],
    items: [
      { key: 'one-action', kind: 'decision', thread: 'home-shape', text: 'Home shows one action.', why: 'People come for one thing.', source: 'person', scope: 'keep', core: true },
      { key: 'quiet-colour', kind: 'decision', thread: 'home-shape', text: 'Home uses one quiet colour.', source: 'person', scope: 'keep', 'accepted-risk': 'Home can look empty.', 'top-risk': true },
      { key: 'two-actions', kind: 'decision', thread: 'home-shape', text: 'Home shows two actions.', source: 'person', 'replaced-by': 'one-action' },
      { key: 'dark-first', kind: 'idea', thread: 'home-shape', text: 'Draw dark mode first.', source: 'agent' },
      { key: 'cut-idea', kind: 'idea', thread: 'home-shape', text: 'A splash screen <b>.', source: 'agent', scope: 'cut' },
      { key: 'home-loads-fast', kind: 'finding', thread: 'home-shape', text: 'Home loads in 300 ms.', source: 'code', evidence: 'src/home.ts:12', check: 'verified' },
      { key: 'empty-vs-quiet', kind: 'tension', thread: 'home-shape', text: 'Quiet pulls against empty.', between: ['quiet-colour'], source: 'agent', state: 'open' },
    ],
    sketches: [
      { key: 'home-hero', thread: 'home-shape', caption: 'The home hero.', state: 'carried', path: 'design/sketches/home.png', canvas: { link: 'https://claude.ai/a/1', sha256: 'a'.repeat(64) } },
      { key: 'home-list', thread: 'home-shape', caption: 'The list.', state: 'carried', path: `.ai/workflows/${SLUG}/design/sketches/screens.html#list`, link: 'https://claude.ai/a/2' },
      { key: 'outside', thread: 'home-shape', caption: 'A reference.', state: 'reference', path: null, link: 'https://claude.ai/a/3' },
    ],
    work: [
      { key: 'home-screen', order: 2, 'why-here': 'home reads the direction', title: 'Build the home screen', shape: 'intake', slug: 'home-screen', entry: 'x', state: 'proposed', stale: true, 'stale-because': 'the colour changed', sketches: ['home-hero', 'home-list'] },
      { key: 'direction', order: 1, title: 'Settle the direction', shape: 'write-now', entry: 'x', state: 'written', 'written-files': [{ path: '.ai/design/direction.md' }] },
    ],
    log: [],
  };
}

const DOC = `---
schema: sdlc/v1
type: brainstorm
slug: ${SLUG}
---
# Brainstorm: the lantern app

## The Brainstorm
<!-- STORY SECTION -->
We started from a busy home. We now believe **one action** is enough.

## Map
### The home screen
`;

test('documentSections: the ## sections, without comments and frontmatter', () => {
  const s = documentSections(DOC);
  equal(s.get('The Brainstorm'), 'We started from a busy home. We now believe **one action** is enough.');
  ok(s.has('Map'));
  equal(s.has('schema: sdlc/v1'), false);
});

test('the page shows the summary, sessions, areas, decisions, ideas, findings, risks, sketches and packets, with no key', () => {
  const html = renderBrainstormPage(board(), DOC, { generatedAt: '2026-10-22T10:00:00Z' });
  match(html, /<title>Brainstorm · the lantern app<\/title>/);
  match(html, /We now believe <b>one action<\/b> is enough\./);
  ok(html.indexOf('Session 2') < html.indexOf('Session 1'), 'the newest session first');
  match(html, /<b>The home screen<\/b> <span class="why">solution side · explored · scope: keep<\/span><br>One action, quiet\./);
  ok(html.indexOf('Home shows one action.') < html.indexOf('Home uses one quiet colour.'), 'core first');
  match(html, /This replaced: Home shows two actions\./);
  match(html, /Draw dark mode first\./);
  doesNotMatch(html, /splash screen/, 'a cut idea is not open');
  match(html, /Source: <code>src\/home\.ts:12<\/code>/);
  match(html, /Quiet pulls against empty\.<span class="tag">open tension<\/span>/);
  match(html, /Home can look empty\.<span class="tag">top risk<\/span>/);
  // Sketches: an image, an anchored file in this folder, and a reference with no file.
  match(html, /<img src="design\/sketches\/home\.png" alt="The home hero\."/);
  match(html, /<a href="https:\/\/claude\.ai\/a\/1">canvas<\/a>/, 'the canvas record link wins');
  match(html, /Open <a href="design\/sketches\/screens\.html#list">/);
  match(html, /<figure id="outside"><div class="none">No file\.<\/div><figcaption><b>A reference\.<\/b><span>reference · <a href="https:\/\/claude\.ai\/a\/3">canvas<\/a>/);
  // Packets in order, the stale one marked.
  ok(html.indexOf('Settle the direction') < html.indexOf('Build the home screen'));
  match(html, /class="stale"><b><a href="work\/home-screen\.md">Build the home screen<\/a><\/b>/);
  match(html, /Stale because the colour changed/);
  match(html, /Files: <code>\.ai\/design\/direction\.md<\/code>/);
  // No key is shown as text; keys are only anchors.
  const text = html.replace(/<[^>]+>/g, ' ');
  for (const key of ['one-action', 'quiet-colour', 'home-loads-fast', 'empty-vs-quiet', 'home-hero']) doesNotMatch(text, new RegExp(`\\b${key}\\b`));
  match(html, /id="one-action"/);
});

test('an empty board renders, and a missing document gives a plain note', () => {
  const html = renderBrainstormPage({ schema: 'sdlc/v1', artifact: 'brainstorm-board', slug: 'x', areas: [], threads: [], items: [] }, '');
  match(html, /No summary yet\./);
  match(html, /No session story yet\./);
  doesNotMatch(html, /<h2>Sketches<\/h2>/, 'a general board with no sketch has no sketch section');
});

test('the script writes brainstorm-page.html beside the board', () => {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-bpage-'));
  try {
    const dir = join(root, '.ai', 'workflows', SLUG);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'brainstorm-board.json'), JSON.stringify(board()));
    writeFileSync(join(dir, '01-brainstorm.md'), DOC);
    const r = spawnSync(process.execPath, [SCRIPT, root, SLUG], { encoding: 'utf8' });
    equal(r.status, 0, r.stdout + r.stderr);
    const out = JSON.parse(r.stdout);
    equal(out.page, `.ai/workflows/${SLUG}/${PAGE_FILE}`);
    equal(out.sketches, 3);
    ok(existsSync(join(dir, PAGE_FILE)));
    match(readFileSync(join(dir, PAGE_FILE), 'utf8'), /one action/);
    const missing = spawnSync(process.execPath, [SCRIPT, root, 'nope'], { encoding: 'utf8' });
    equal(missing.status, 1);
    match(JSON.parse(missing.stdout).error, /no brainstorm board/);
    ok(existsSync(join(PLUGIN_ROOT, 'skills/wf/scripts/brainstorm-page.mjs')), 'the skill wrapper runs the bundle');
    match(readFileSync(join(PLUGIN_ROOT, 'scripts/build.mjs'), 'utf8'), /'brainstorm-page',/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
