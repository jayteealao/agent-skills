// The sources of ideate, red first. The argument kinds, the coverage guarantee, the issue
// copy that keeps no text, the packets an ideate pick writes from ideate-work.json, a
// campaign on an ideate slug, the renderer's new columns, and the memory of earlier runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyArgs, focusSlug, issueQuery, redactIssue, sourceItemProblems, splitArgs } from '../../lib/ideate.mjs';
import { checkList, renderPacket, IDEATE_FILES } from '../../lib/packets.mjs';
import { validateBrainstormBoard, validateFrontmatter } from '../../lib/schema-validator.mjs';
import { safeParseFrontmatter } from '../../lib/frontmatter.mjs';
import { shownIssues } from '../../scripts/ideate-sources.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCES = path.join(pluginRoot, 'scripts', 'ideate-sources.mjs');
const CAMPAIGN = path.join(pluginRoot, 'scripts', 'campaign.mjs');
const SLUG = 'ideate-sources-20261018';
const read = (rel) => readFileSync(path.join(pluginRoot, rel), 'utf8');

const kinds = (text, opts) => classifyArgs(text, opts).kinds.map((k) => `${k.token}=${k.kind}`);

test('section 3: each argument shape gets its kind, the first rule wins', () => {
  const isFile = (t) => t === 'docs/notes.md';
  assert.deepEqual(kinds('https://github.com/o/r/issues/42 https://github.com/o/r/issues?q=is%3Aopen https://example.com/changelog docs/notes.md react@19.0.0 @scope/pkg@2.1.0 issues issues:label:bug research 5 security dx faster builds', { isFile }), [
    'https://github.com/o/r/issues/42=issues', 'https://github.com/o/r/issues?q=is%3Aopen=issues', 'https://example.com/changelog=web',
    'docs/notes.md=document', 'react@19.0.0=dependency', '@scope/pkg@2.1.0=dependency', 'issues=issues', 'issues:label:bug=issues',
    'research=research', '5=count', 'security=lens', 'dx=lens', 'faster=topic', 'builds=topic',
  ]);
});

test('section 3: reserved words are quoted to be a topic; an existing ideate slug resumes, picks, or refreshes', () => {
  assert.deepEqual(kinds('"issues" "research" better'), ['issues=topic', 'research=topic', 'better=topic']);
  assert.deepEqual(splitArgs(`a "b c" 'd'`), [{ token: 'a', quoted: false }, { token: 'b c', quoted: true }, { token: 'd', quoted: true }]);
  const isIdeateSlug = (t) => t === SLUG;
  assert.equal(classifyArgs(`${SLUG} refresh`, { isIdeateSlug }).mode, 'refresh');
  const pick = classifyArgs(`${SLUG} IDEA-001 IDEA-003 because faster`, { isIdeateSlug });
  assert.equal(pick.mode, 'pick');
  assert.deepEqual(pick.rest, ['IDEA-001', 'IDEA-003', 'because', 'faster']);
  assert.equal(classifyArgs(SLUG, { isIdeateSlug }).mode, 'resume');
  assert.equal(classifyArgs(`"${SLUG}"`, { isIdeateSlug }).mode, 'new', 'a quoted slug is a topic');
});

test('triage: a steer word after the slug runs a round; a quoted title stays a pick', () => {
  const isIdeateSlug = (t) => t === SLUG;
  const deeper = classifyArgs(`${SLUG} deeper "retry logic for the Stripe client"`, { isIdeateSlug });
  assert.equal(deeper.mode, 'steer');
  assert.equal(deeper.steer, 'deeper');
  assert.equal(deeper.target, 'retry logic for the Stripe client');
  const dir = classifyArgs(`${SLUG} direction payments and refunds`, { isIdeateSlug });
  assert.equal(dir.mode, 'steer');
  assert.equal(dir.target, 'payments and refunds');
  assert.equal(classifyArgs(`${SLUG} surprise me`, { isIdeateSlug }).steer, 'surprise');
  assert.equal(classifyArgs(`${SLUG} Lens security`, { isIdeateSlug }).steer, 'lens');
  assert.equal(classifyArgs(`${SLUG} "deeper caching"`, { isIdeateSlug }).mode, 'pick', 'a quoted title is a pick');
  assert.equal(classifyArgs(`${SLUG} refresh`, { isIdeateSlug }).steer, null);
  assert.equal(classifyArgs(SLUG, { isIdeateSlug }).mode, 'resume', 'a slug alone enters the loop');
});

test('the focus slug: lens, topic, sources, all', () => {
  assert.equal(focusSlug(classifyArgs('security dx')), 'security-dx');
  assert.equal(focusSlug(classifyArgs('Faster CI builds')), 'faster-ci-builds');
  assert.equal(focusSlug(classifyArgs('https://example.com/x react@1.0.0')), 'sources');
  assert.equal(focusSlug(classifyArgs('research')), 'sources');
  assert.equal(focusSlug(classifyArgs('')), 'all');
});

function fm(over = {}) {
  return {
    schema: 'sdlc/v1', type: 'ideation', slug: SLUG, focus: 'sources', 'created-at': '2026-10-18T10:00:00Z',
    ideas: [{ id: 'IDEA-001', title: 'Use the new cache API', confidence: 'high', 'source-items': ['S01-I01'] }],
    sources: [{ id: 'S01', kind: 'web', origin: 'https://example.com/changelog', reference: 'references/web/S01-changelog.md', state: 'read', items: 3 }, { id: 'S02', kind: 'issues', origin: 'issues', state: 'unavailable', reason: 'gh is not signed in' }],
    'source-items': [
      { id: 'S01-I01', title: 'A cache API', result: 'applies', idea: 'IDEA-001' },
      { id: 'S01-I02', title: 'A new flag', result: 'blocked-by-version', installed: '1.2.0', 'ships-in': '2.0.0' },
      { id: 'S01-I03', title: 'A removed helper', result: 'already-used', evidence: ['src/a.ts:4'] },
    ],
    ...over,
  };
}

test('section 4.2: every item has exactly one result, and the schema asks for the key that the result needs', () => {
  assert.deepEqual(sourceItemProblems(fm()), []);
  const v = validateFrontmatter(fm());
  assert.equal(v.valid, true, JSON.stringify(v.errors));
  const missing = fm();
  delete missing['source-items'][1].result;
  assert.match(sourceItemProblems(missing).join(), /source item S01-I02: has no result/);
  assert.equal(validateFrontmatter(missing).valid, false);
  const noKey = fm();
  delete noKey['source-items'][1]['ships-in'];
  assert.equal(validateFrontmatter(noKey).valid, false, 'blocked-by-version needs installed and ships-in');
  const issueOnly = fm();
  issueOnly['source-items'][2] = { id: 'S01-I03', title: 'x', result: 'already-fixed', evidence: ['abc123'] };
  assert.match(sourceItemProblems(issueOnly).join(), /already-fixed is for issue items only/);
  const dangling = fm();
  dangling['source-items'][0].idea = 'IDEA-009';
  assert.match(sourceItemProblems(dangling).join(), /names idea IDEA-009/);
  const count = fm({ sources: [{ ...fm().sources[0], items: 4 }] });
  assert.match(sourceItemProblems(count).join(), /items is 4, but the roster holds 3/);
});

test('the check refuses an item whose result lacks the key that the result needs', () => {
  const noIdea = fm();
  delete noIdea['source-items'][0].idea;
  assert.match(sourceItemProblems(noIdea).join(), /source item S01-I01: applies needs idea/);
  const noEvidence = fm();
  noEvidence['source-items'][2].evidence = [];
  assert.match(sourceItemProblems(noEvidence).join(), /source item S01-I03: already-used needs evidence/);
  const issues = fm({ sources: [{ id: 'S01', kind: 'issues', origin: 'issues', state: 'read', items: 3 }] });
  issues['source-items'][1] = { id: 'S01-I02', title: 'x', result: 'duplicate-of' };
  assert.match(sourceItemProblems(issues).join(), /source item S01-I02: duplicate-of needs duplicate-of/);
  const withdrawn = fm();
  withdrawn['source-items'][1] = { id: 'S01-I02', title: 'x', result: 'withdrawn' };
  assert.deepEqual(sourceItemProblems(withdrawn), [], 'withdrawn needs no key');
});

test('the issues that the agent reads are cut to a fixed length, and each cut issue says so', () => {
  const long = { number: 1, title: 'long', body: 'b'.repeat(5000), comments: [{ body: 'c'.repeat(1500) }] };
  const many = { number: 2, title: 'many', body: 'short', comments: Array.from({ length: 25 }, () => ({ body: 'x' })) };
  const short = { number: 3, title: 'short', body: 'fine', comments: [{ body: 'ok' }] };
  const out = shownIssues([long, many, short]);
  assert.equal(out.truncated, 2);
  assert.deepEqual([out.issues[0].body.length, out.issues[0].comments[0].length, out.issues[0].truncated], [4000, 1000, true]);
  assert.deepEqual([out.issues[1].comments.length, out.issues[1].truncated], [20, true]);
  assert.deepEqual([out.issues[2].body, out.issues[2].truncated], ['fine', undefined]);
});

test('section 5.3: an issue copy holds none of author, body, or comments', () => {
  const issue = { number: 42, title: 'Crash on save', body: 'my email is a@b.c and here is the log', author: { login: 'someone' }, comments: [{ body: 'same here', author: { login: 'x' } }], labels: [{ name: 'bug' }], state: 'OPEN', url: 'https://github.com/o/r/issues/42', createdAt: '2026-10-01', updatedAt: '2026-10-02', reactionGroups: [{ content: 'THUMBS_UP', users: { totalCount: 3 } }] };
  const copy = redactIssue(issue);
  assert.deepEqual(Object.keys(copy).sort(), ['comments', 'created-at', 'labels', 'number', 'reactions', 'state', 'summary', 'title', 'updated-at', 'url']);
  assert.equal(copy.comments, 1);
  assert.equal(copy.reactions, 3);
  assert.deepEqual(copy.labels, ['bug']);
  assert.doesNotMatch(JSON.stringify(copy), /a@b\.c|someone|same here|log/);
  assert.deepEqual(issueQuery('https://github.com/o/r/issues/42'), { kind: 'view', repo: 'o/r', number: 42 });
  assert.deepEqual(issueQuery('issues:label:bug'), { kind: 'list', repo: null, search: 'label:bug' });
  assert.equal(issueQuery('https://example.com'), null);
});

function workflow() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'ideate sources '));
  const dir = path.join(root, '.ai', 'workflows', SLUG);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, '00-index.md'), `---\nschema: sdlc/v1\ntype: workflow-index\nslug: ${SLUG}\nworkflow-type: ideate\nstatus: ready\n---\n`);
  return { root, dir };
}
function cli(script, args) {
  try { return JSON.parse(execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })); } catch (e) { return JSON.parse(e.stdout); }
}

test('the sources script: args reads the disk for slugs and files; reference adds the index row; check refuses an issue copy with text', () => {
  const { root, dir } = workflow();
  try {
    writeFileSync(path.join(root, 'NOTES.md'), 'a note\n');
    const a = cli(SOURCES, ['args', root, `NOTES.md react@19.0.0 "issues" security 4`]);
    assert.deepEqual(a.kinds.map((k) => k.kind), ['document', 'dependency', 'topic', 'lens', 'count']);
    assert.equal(a.focusSlug, 'security');
    assert.equal(cli(SOURCES, ['args', root, `${SLUG} refresh`]).mode, 'refresh');

    mkdirSync(path.join(dir, 'references', 'web'), { recursive: true });
    writeFileSync(path.join(dir, 'references', 'web', 'S01-changelog.md'), '# 2.0.0\n- A cache API\n');
    const r = cli(SOURCES, ['reference', root, SLUG, 'S01', 'references/web/S01-changelog.md', '--origin', 'https://example.com/changelog']);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.match(readFileSync(path.join(dir, 'references', 'index.md'), 'utf8'), /\| S01 \| references\/web\/S01-changelog\.md \| https:\/\/example\.com\/changelog \| \d{4}-\d{2}-\d{2} \| [0-9a-f]{64} \| \d+ \| yes \|/);

    writeFileSync(path.join(dir, '01-ideate.md'), `---\n${JSON.stringify(fm())}\n---\n\n# Ideation\n`);
    assert.equal(cli(SOURCES, ['check', root, SLUG]).ok, true);
    mkdirSync(path.join(dir, 'references', 'issues'), { recursive: true });
    writeFileSync(path.join(dir, 'references', 'issues', 'S02-issues.json'), JSON.stringify({ issues: [{ number: 1, title: 't', body: 'leaked', summary: 'One. Two. Three.' }] }));
    const c = cli(SOURCES, ['check', root, SLUG]);
    assert.equal(c.ok, false);
    assert.match(c.problems.join(), /holds body/);
    assert.match(c.problems.join(), /longer than two sentences/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the sources script reads the index and the ideate record of the record layout', async () => {
  const { writeDoc } = await import('../../lib/records.mjs');
  const { root, dir } = workflow();
  try {
    rmSync(path.join(dir, '00-index.md'));
    writeDoc(dir, '00-index.md', { frontmatter: { schema: 'sdlc/v1', type: 'workflow-index', slug: SLUG, 'workflow-type': 'ideate', status: 'ready' } });
    assert.equal(cli(SOURCES, ['args', root, `${SLUG} refresh`]).mode, 'refresh', 'the ideate slug is found in state.yaml and meta.yaml');
    writeDoc(dir, '01-ideate.md', { frontmatter: fm(), body: '# Ideation\n' });
    assert.equal(cli(SOURCES, ['check', root, SLUG]).ok, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

function ideateBoard() {
  return {
    schema: 'sdlc/v1', artifact: 'brainstorm-board', slug: SLUG, topic: 'sources', areas: [],
    stack: { platforms: ['web'], languages: ['ts'], 'user-confirmed': true },
    threads: [{ key: 'idea-001', name: 'Use the new cache API', state: 'live' }, { key: 'idea-003', name: 'Fix the crash on save', state: 'live' }],
    items: [
      { key: 'idea-001-evidence', kind: 'finding', thread: 'idea-001', text: 'The fetch layer refetches on every render.', source: 'code', evidence: 'src/fetch.ts:12' },
      { key: 'idea-001-pick', kind: 'decision', thread: 'idea-001', text: 'Start with the cache; it removes the most load.', source: 'person', scope: 'keep' },
      { key: 'idea-003-evidence', kind: 'finding', thread: 'idea-003', text: 'Issue 42 reports a crash on save.', source: 'research', evidence: 'references/issues/S02-issues.json' },
      { key: 'idea-003-pick', kind: 'decision', thread: 'idea-003', text: 'Find the cause of the crash first.', source: 'person', scope: 'keep' },
    ],
    work: [
      { key: 'use-cache-api', slug: 'use-cache-api', title: 'Use the new cache API', shape: 'intake', entry: `/wf intake use-cache-api from ${SLUG}`, order: 1, 'design-form': 'none', items: ['idea-001-evidence', 'idea-001-pick'], threads: ['idea-001'], state: 'proposed',
        goal: 'Fetch through the new cache API.', 'acceptance-criteria': ['A render does not refetch.'], 'ux-impact': 'none', 'ux-impact-confirmed': true, 'try-out': 'no', 'estimated-slices': 6 },
      { key: 'crash-on-save', slug: 'crash-on-save', title: 'Find why save crashes', shape: 'rca', entry: '/wf intake rca crash on save', order: 2, 'why-here': 'the cache work touches the save path first', 'design-form': 'none', items: ['idea-003-evidence', 'idea-003-pick'], threads: ['idea-003'], state: 'proposed' },
    ],
  };
}

test('section 8.1: ideate-work.json is a board, its packets link the ideate board, and the order rules hold', () => {
  const b = ideateBoard();
  const v = validateBrainstormBoard(b);
  assert.equal(v.valid, true, JSON.stringify(v.errors));
  assert.deepEqual(checkList(b).errors, []);
  const text = renderPacket(b, b.work[0], { files: IDEATE_FILES });
  assert.match(text, /\[ideate-work\.json\]\(\.\.\/ideate-work\.json\)/);
  assert.match(text, /\[01-ideate\.md\]\(\.\.\/01-ideate\.md\)/);
  assert.doesNotMatch(text, /brainstorm-board\.json/);
  const gap = ideateBoard();
  gap.work[1].order = 3;
  assert.match(checkList(gap).errors.join(), /no packet with order 2/);
  const noWhy = ideateBoard();
  delete noWhy.work[1]['why-here'];
  assert.match(checkList(noWhy).errors.join(), /no why-here/);
  assert.ok(!b.work.some((w) => 'depends-on' in w), 'no ideate packet carries depends-on');
});

test('section 8.1: campaign.mjs write reads a board by path, and a campaign on the ideate slug orients', () => {
  const { root, dir } = workflow();
  try {
    execFileSync('git', ['-C', root, 'init', '-q', '-b', 'main']);
    execFileSync('git', ['-C', root, 'config', 'user.email', 'i@test']);
    execFileSync('git', ['-C', root, 'config', 'user.name', 'i']);
    writeFileSync(path.join(dir, 'ideate-work.json'), JSON.stringify(ideateBoard(), null, 2));
    const out = JSON.parse(execFileSync(process.execPath, [CAMPAIGN, 'write', path.join(dir, 'ideate-work.json')], { encoding: 'utf8' }));
    assert.equal(out.revision, 1, JSON.stringify(out));
    const files = readdirSync(path.join(dir, 'work')).sort();
    assert.deepEqual(files.filter((f) => f.endsWith('.md')), ['changes.md', 'crash-on-save.md', 'index.md', 'use-cache-api.md']);
    const packet = readFileSync(path.join(dir, 'work', 'crash-on-save.md'), 'utf8');
    assert.equal(safeParseFrontmatter(packet).data.form, 'rca');
    assert.match(packet, /\.\.\/ideate-work\.json/);
    assert.match(readFileSync(path.join(dir, 'work', 'index.md'), 'utf8'), /\.\.\/ideate-work\.json/);
    writeFileSync(path.join(root, 'README.md'), 'x\n');
    execFileSync('git', ['-C', root, 'add', '.']);
    execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'base']);
    const st = cli(CAMPAIGN, ['status', root, SLUG]);
    assert.equal(st.ok, true, JSON.stringify(st));
    assert.equal(st.branch, `packets/${SLUG}`);
    assert.equal(st.current?.key, 'use-cache-api', JSON.stringify(st));
    assert.equal(st.current?.step, 'open', JSON.stringify(st));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------- the pick command

const PICK_LEAD = {
  schema: 'sdlc/v1', type: 'ideation', slug: SLUG, focus: 'sources',
  ideas: [
    { id: 'IDEA-001', title: 'Use the new cache API', evidence: ['src/fetch.ts:12'], entry: '/wf intake use-cache-api', triage: 'take' },
    { id: 'IDEA-002', title: 'Find why save crashes', evidence: ['references/issues/S02-issues.json'], entry: '/wf intake rca crash on save', triage: 'take' },
    { id: 'IDEA-003', title: 'Retry the payment client', evidence: ['src/client.ts:40', 'src/client.ts:88'], entry: '/wf intake retry-client', triage: 'take', 'depends-on': ['/wf intake update-deps'] },
    { id: 'IDEA-004', title: 'Send cache headers', evidence: ['src/server.ts:5'], entry: '/wf intake cache-headers', triage: 'take' },
  ],
};
const STACK = { platforms: ['web'], languages: ['ts'], 'user-confirmed': true };
const PICK = { reason: 'The cache removes the most load.', at: '2026-11-10T09:00:00Z' };
const writeUp = (over = {}) => ({ goal: 'Do it.', 'acceptance-criteria': ['It works.'], 'ux-impact': 'none', 'try-out': 'no', 'estimated-slices': 8, ...over });

test('the pick builds the board of one idea, and the board passes the schema and the list check', async () => {
  const { buildPickBoard } = await import('../../lib/ideate.mjs');
  const r = buildPickBoard({ slug: SLUG, lead: PICK_LEAD, input: { stack: STACK, pick: PICK, packets: [{ ideas: ['IDEA-001'], ...writeUp({ 'in-scope': ['The fetch layer.'] }) }] } });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  const v = validateBrainstormBoard(r.board);
  assert.equal(v.valid, true, JSON.stringify(v.errors));
  assert.deepEqual(checkList(r.board).errors, []);
  assert.deepEqual(r.board.threads.map((t) => t.key), ['idea-001', 'pick']);
  const [w] = r.board.work;
  assert.deepEqual([w.key, w.slug, w.shape, w.order, w.entry, w['design-form'], w.state, w['ux-impact-confirmed']], ['use-cache-api', 'use-cache-api', 'intake', 1, `/wf campaign ${SLUG}`, 'none', 'proposed', true]);
  assert.deepEqual(w.items, ['idea-001-evidence-1', 'pick-1'], 'the first packet carries the pick decision');
  const pick = r.board.items.find((i) => i.key === 'pick-1');
  assert.deepEqual([pick.kind, pick.thread, pick.text, pick.scope, pick.source, pick.session, pick['decided-at']], ['decision', 'pick', PICK.reason, 'keep', 'person', 1, PICK.at]);
  assert.deepEqual(r.board.items.find((i) => i.key === 'idea-001-evidence-1').evidence, 'src/fetch.ts:12');
  assert.deepEqual(r.invocations, [`/wf campaign ${SLUG}`]);
});

test('the pick keeps the order of three ideas, routes a packet of another form, and prints update-deps first', async () => {
  const { buildPickBoard } = await import('../../lib/ideate.mjs');
  const r = buildPickBoard({ slug: SLUG, lead: PICK_LEAD, input: { stack: STACK, pick: PICK, packets: [
    { ideas: ['IDEA-003'], ...writeUp() },
    { ideas: ['IDEA-002'], 'why-here': 'the retry touches the save path first' },
    { ideas: ['IDEA-001'], 'why-here': 'less urgent than the packets before it', ...writeUp() },
  ] } });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(checkList(r.board).errors, []);
  assert.deepEqual(r.packets.map((p) => [p.slug, p.form, p.order]), [['retry-client', 'intake', 1], ['find-why-save-crashes', 'rca', 2], ['use-cache-api', 'intake', 3]]);
  const rca = r.board.work[1];
  assert.equal(rca.entry, '/wf intake rca find-why-save-crashes');
  assert.equal(rca.goal, undefined, 'a packet of another form carries no write-up');
  assert.equal(r.board.items.find((i) => i.key === 'idea-002-evidence-1').source, 'research');
  assert.deepEqual(r.board.work[0].items, ['idea-003-evidence-1', 'idea-003-evidence-2', 'pick-1']);
  assert.ok(!r.board.work.slice(1).some((w) => w.items.includes('pick-1')), 'the pick decision is carried once');
  assert.deepEqual(r.invocations, ['/wf intake update-deps', `/wf campaign ${SLUG}`, '/wf intake rca find-why-save-crashes']);
});

test('the pick puts two grouped ideas into one packet', async () => {
  const { buildPickBoard } = await import('../../lib/ideate.mjs');
  const r = buildPickBoard({ slug: SLUG, lead: PICK_LEAD, input: { stack: STACK, pick: PICK, packets: [{ ideas: ['IDEA-001', 'IDEA-004'], title: 'Cache the reads', slug: 'cache-reads', ...writeUp() }] } });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(checkList(r.board).errors, []);
  assert.equal(r.board.work.length, 1);
  const [w] = r.board.work;
  assert.deepEqual([w.slug, w.title, w.threads], ['cache-reads', 'Cache the reads', ['idea-001', 'idea-004']]);
  assert.deepEqual(w.items, ['idea-001-evidence-1', 'idea-004-evidence-1', 'pick-1']);
});

test('a later pick appends after the last packet, with its own pick decision', async () => {
  const { buildPickBoard } = await import('../../lib/ideate.mjs');
  const first = buildPickBoard({ slug: SLUG, lead: PICK_LEAD, input: { stack: STACK, pick: PICK, packets: [{ ideas: ['IDEA-001'], ...writeUp() }] } });
  const later = { pick: { reason: 'Now the headers.', at: '2026-11-11T09:00:00Z' }, packets: [{ ideas: ['IDEA-004'], 'why-here': 'the cache came first', ...writeUp() }] };
  const r = buildPickBoard({ slug: SLUG, lead: PICK_LEAD, input: later, existing: first.board });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.appended, true);
  assert.deepEqual(checkList(r.board).errors, [], 'the stack of the first pick stays');
  assert.deepEqual(r.board.work.map((w) => [w.key, w.order]), [['use-cache-api', 1], ['cache-headers', 2]]);
  assert.deepEqual(r.board.work[1].items, ['idea-004-evidence-1', 'pick-2']);
  assert.equal(r.board.items.find((i) => i.key === 'pick-2').session, 2);
  assert.equal(r.board.threads.filter((t) => t.key === 'pick').length, 1);
  const noWhy = buildPickBoard({ slug: SLUG, lead: PICK_LEAD, input: { ...later, packets: [{ ideas: ['IDEA-004'], ...writeUp() }] }, existing: first.board });
  assert.match(noWhy.errors.join(), /order 2\): no why-here/, 'an appended packet comes after order 1');
  const again = buildPickBoard({ slug: SLUG, lead: PICK_LEAD, input: { ...later, packets: [{ ideas: ['IDEA-001'], 'why-here': 'x', ...writeUp() }] }, existing: first.board });
  assert.match(again.errors.join(), /IDEA-001 is already in the list/);
});

test('the pick refuses bad input: an unknown idea, no why-here, no acceptance criteria, an unconfirmed stack', async () => {
  const { buildPickBoard } = await import('../../lib/ideate.mjs');
  const build = (input) => buildPickBoard({ slug: SLUG, lead: PICK_LEAD, input: { stack: STACK, pick: PICK, ...input } });
  assert.match(build({ packets: [{ ideas: ['IDEA-009'], ...writeUp() }] }).errors.join(), /unknown idea id IDEA-009/);
  assert.match(build({ packets: [{ ideas: ['IDEA-001'], ...writeUp() }, { ideas: ['IDEA-004'], ...writeUp() }] }).errors.join(), /packet 2 \(order 2\): no why-here/);
  assert.match(build({ packets: [{ ideas: ['IDEA-001'], ...writeUp({ 'acceptance-criteria': [] }) }] }).errors.join(), /no acceptance criteria/);
  assert.match(build({ stack: { platforms: ['web'] }, packets: [{ ideas: ['IDEA-001'], ...writeUp() }] }).errors.join(), /the stack is not confirmed/);
  assert.match(buildPickBoard({ slug: SLUG, lead: PICK_LEAD, input: { pick: PICK, packets: [{ ideas: ['IDEA-001'], ...writeUp() }] } }).errors.join(), /no confirmed stack/);
  assert.match(build({ pick: {}, packets: [{ ideas: ['IDEA-001'], ...writeUp() }] }).errors.join(), /pick\.reason is missing/);
  assert.match(build({ packets: [{ ideas: ['IDEA-001'], ...writeUp() }, { ideas: ['IDEA-001'], 'why-here': 'x', ...writeUp() }] }).errors.join(), /IDEA-001 is in two packets/);
  const ok = build({ packets: [{ ideas: ['IDEA-002'] }] });
  assert.equal(ok.ok, true, 'a routed packet needs no write-up and no stack');
});

test('the pick command writes ideate-work.json and the list, and writes nothing on a refusal', async () => {
  const { writeDoc } = await import('../../lib/records.mjs');
  const { root, dir } = workflow();
  try {
    execFileSync('git', ['-C', root, 'init', '-q', '-b', 'main']);
    writeDoc(dir, '01-ideate.md', { frontmatter: PICK_LEAD, body: '# Ideation\n' });
    const input = path.join(root, 'pick.json');
    writeFileSync(input, JSON.stringify({ stack: STACK, pick: PICK, packets: [{ ideas: ['IDEA-009'], ...writeUp() }] }));
    const bad = cli(SOURCES, ['pick', root, SLUG, input]);
    assert.equal(bad.ok, false);
    assert.match(bad.error, /unknown idea id IDEA-009/);
    assert.ok(!readdirSync(dir).includes('ideate-work.json'), 'a refusal writes no board');
    writeFileSync(input, JSON.stringify({ stack: STACK, pick: PICK, packets: [{ ideas: ['IDEA-001'], ...writeUp() }, { ideas: ['IDEA-002'], 'why-here': 'the cache touches save' }] }));
    const out = cli(SOURCES, ['pick', root, SLUG, input]);
    assert.equal(out.ok, true, JSON.stringify(out));
    assert.deepEqual(out.packets.map((p) => [p.key, p.form, p.order]), [['use-cache-api', 'intake', 1], ['find-why-save-crashes', 'rca', 2]]);
    assert.deepEqual(out.invocations, [`/wf campaign ${SLUG}`, '/wf intake rca find-why-save-crashes']);
    assert.equal(out.list.revision, 1);
    const board = JSON.parse(readFileSync(path.join(dir, 'ideate-work.json'), 'utf8'));
    assert.equal(validateBrainstormBoard(board).valid, true);
    assert.deepEqual(readdirSync(path.join(dir, 'work')).filter((f) => f.endsWith('.md')).sort(), ['changes.md', 'find-why-save-crashes.md', 'index.md', 'use-cache-api.md']);
    assert.match(readFileSync(path.join(dir, 'work', 'use-cache-api.md'), 'utf8'), /The cache removes the most load\./, 'the pick reason reaches the first packet word for word');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
