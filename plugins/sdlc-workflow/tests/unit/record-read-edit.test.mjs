// The record forms that read or change one part of a record: `record get --section`,
// `--field` and `--outline`, the outline of a big record, `record edit`, the kept draft of
// `record put`, and the record names that leave out `.md`, the number or the slice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { INDEX_NAME, readDoc, replaceSection, sectionText, writeDoc } from '../../lib/records.mjs';
import { getPath } from '../../lib/record-path.mjs';
import { openWorkflow } from '../../lib/wf-api.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const wf = path.join(pluginRoot, 'scripts', 'wf.mjs');
const home = path.join(tmpdir(), 'sdlc-read-edit-home');
const run = (args) => spawnSync(process.execPath, [wf, ...args], { encoding: 'utf8', env: { ...process.env, SDLC_HOME: home } });

const BODY = '# Plan\n\nIntro.\n\n## Steps\n\n1. One.\n2. Two.\n\n```md\n## Not a heading\n```\n\n## Risks\n\n- none\n';

/** A workflow with the index, a roster, and the plan and implement records of `api`, put from stamped drafts. */
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-read-edit-'));
  const dir = path.join(root, '.ai', 'workflows', 'demo');
  mkdirSync(path.join(dir, '.draft'), { recursive: true });
  writeDoc(dir, INDEX_NAME, { frontmatter: { schema: 'sdlc/v1', type: 'index', slug: 'demo', status: 'active', 'current-stage': 'plan', 'workflow-files': ['00-index.md'] } });
  writeDoc(dir, '03-slice.md', { frontmatter: { schema: 'sdlc/v1', type: 'slice-index', slug: 'demo', status: 'complete', slices: [{ slug: 'api', status: 'defined' }, { slug: 'ui', status: 'defined' }] } });
  const draft = (name, stage, body) => {
    const stamp = run(['stamp', stage, '--slug', 'demo', '--slice', 'api']).stdout.trim();
    writeFileSync(path.join(dir, '.draft', name), `${stamp}\n${body}`);
  };
  draft('04-plan-api.md', 'plan', BODY);
  draft('05-implement-api.md', 'implement', '# Implement\n\n## Done\n\n- [ ] AC-1\n- [ ] AC-2\n');
  const put = run(['record', 'put', root, 'demo']);
  assert.equal(put.status, 0, put.stdout + put.stderr);
  return { root, dir, done: () => rmSync(root, { recursive: true, force: true }) };
}

test('the section helpers skip a heading in a code fence and keep the heading on a replace', () => {
  assert.equal(sectionText(BODY, 'steps'), '1. One.\n2. Two.\n\n```md\n## Not a heading\n```\n');
  assert.equal(sectionText(BODY, '## Ri'), '- none\n');
  assert.throws(() => sectionText(BODY, 'Nope'), /no section "Nope"; the ## headings are: Steps \| Risks/);
  assert.equal(replaceSection(BODY, 'Steps', '1. Only.\n'), '# Plan\n\nIntro.\n\n## Steps\n\n1. Only.\n\n## Risks\n\n- none\n');
  assert.equal(replaceSection(BODY, 'Risks', 'one risk'), '# Plan\n\nIntro.\n\n## Steps\n\n1. One.\n2. Two.\n\n```md\n## Not a heading\n```\n\n## Risks\n\none risk\n');
  assert.throws(() => sectionText('## A\n\nx\n\n## A\n\ny\n', 'A'), /appears 2 times/);
  const fm = { slices: [{ slug: 'api', status: 'defined' }], progress: { plan: 'complete' } };
  assert.equal(getPath(fm, 'slices[api].status'), 'defined');
  assert.equal(getPath(fm, 'progress.plan'), 'complete');
  assert.throws(() => getPath(fm, 'progres.plan'), /no field progres; the fields there are: slices, progress/);
  assert.throws(() => getPath(fm, 'slices[zz].status'), /record get: slices has no item zz; its items are: api/);
});

test('record get reads one section, one field or the outline', () => {
  const f = fixture();
  try {
    const sec = run(['record', 'get', f.root, 'demo', '04-plan-api', '--section', 'Steps']);
    assert.equal(sec.status, 0, sec.stderr);
    assert.equal(sec.stdout, '1. One.\n2. Two.\n\n```md\n## Not a heading\n```\n');
    assert.equal(run(['record', 'get', f.root, 'demo', '03-slice', '--field', 'slices[ui].status']).stdout, 'defined\n');
    assert.match(run(['record', 'get', f.root, 'demo', '03-slice', '--field', 'slices[api]']).stdout, /^slug: api\nstatus: defined\n$/);
    assert.deepEqual(JSON.parse(run(['record', 'get', f.root, 'demo', '03-slice', '--field', 'slices[api].status', '--json']).stdout), 'defined');
    const bad = run(['record', 'get', f.root, 'demo', '03-slice', '--field', 'nope']);
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /no field nope; the fields there are: .*slices/);
    const outline = run(['record', 'get', f.root, 'demo', '04-plan-api', '--outline']);
    assert.equal(outline.status, 0, outline.stderr);
    assert.match(outline.stdout, /^04-plan-api\.md: \d+(\.\d)? (B|KB)\nfields:\n {2}schema {2}\d+ B\n/);
    assert.match(outline.stdout, /sections:\n {2}\(before the first ##\) {2}\d+ B\n {2}## Steps {2}\d+ B\n {2}## Risks {2}\d+ B\n$/);
    const json = JSON.parse(run(['record', 'get', f.root, 'demo', '04-plan-api', '--outline', '--json']).stdout);
    assert.deepEqual(json.sections.map((s) => s.heading), ['Steps', 'Risks']);
    assert.ok(json.fields.some((x) => x.name === 'tags' && x.items === 0));
    // --fields and --json keep working.
    assert.match(run(['record', 'get', f.root, 'demo', '04-plan-api', '--fields', 'status']).stdout, /^status: complete\n$/);
  } finally { f.done(); }
});

test('a record over 20 KB prints its outline and the read forms, and --full prints all of it', () => {
  const f = fixture();
  try {
    const big = `## Log\n\n${'x'.repeat(200).concat('\n').repeat(120)}\n## End\n\ndone\n`;
    const doc = readDoc(f.dir, '04-plan-api.md');
    writeDoc(f.dir, '04-plan-api.md', { frontmatter: doc.frontmatter, body: big });
    const plain = run(['record', 'get', f.root, 'demo', '04-plan-api']);
    assert.equal(plain.status, 0, plain.stderr);
    assert.match(plain.stdout, /^04-plan-api\.md: 2\d\.\d KB\n/);
    assert.match(plain.stdout, /## Log {2}2\d\.\d KB/);
    assert.match(plain.stdout, /is over 20 KB, so this is its outline\. Read one part with --section <heading> or --field <path>, or all of it with --full\.\n$/);
    assert.doesNotMatch(plain.stdout, /x{200}/);
    const full = run(['record', 'get', f.root, 'demo', '04-plan-api', '--full']);
    assert.match(full.stdout, /^---\n[\s\S]*x{200}[\s\S]*## End\n\ndone\n$/);
    assert.match(JSON.parse(run(['record', 'get', f.root, 'demo', '04-plan-api', '--json']).stdout).body, /x{200}/);
    assert.equal(run(['record', 'get', f.root, 'demo', '04-plan-api', '--section', 'End']).stdout, 'done\n');
  } finally { f.done(); }
});

test('record edit replaces one section or one exact text, with the checks of put and no draft', () => {
  const f = fixture();
  try {
    const file = path.join(f.root, 'steps.md');
    writeFileSync(file, '1. Only one.\n');
    const sec = run(['record', 'edit', f.root, 'demo', '04-plan-api', '--section', 'Steps', '--from', file]);
    assert.equal(sec.status, 0, sec.stdout + sec.stderr);
    assert.match(sec.stdout, /^edit 04-plan-api\.md → slice-api\.yaml#plan\n$/);
    const body = readDoc(f.dir, '04-plan-api.md').body;
    assert.match(body, /## Steps\n\n1\. Only one\.\n\n## Risks\n\n- none\n$/);
    assert.ok(!existsSync(path.join(f.dir, '.draft', '04-plan-api.md')), 'no draft is written');

    const once = run(['record', 'edit', f.root, 'demo', 'implement-api', '--replace', '- [ ] AC-2', '--with', '- [x] AC-2']);
    assert.equal(once.status, 0, once.stdout + once.stderr);
    assert.match(readDoc(f.dir, '05-implement-api.md').body, /- \[ \] AC-1\n- \[x\] AC-2\n/);
    const many = run(['record', 'edit', f.root, 'demo', '05-implement-api', '--replace', 'AC-', '--with', 'X-']);
    assert.equal(many.status, 1);
    assert.match(many.stderr, /matches 2 times in the body; give more of the text/);
    const none = run(['record', 'edit', f.root, 'demo', '05-implement-api', '--replace', 'AC-9', '--with', 'x']);
    assert.equal(none.status, 1);
    assert.match(none.stderr, /matches nothing in the body/);
    const nohead = run(['record', 'edit', f.root, 'demo', '04-plan-api', '--section', 'Nope', '--from', file]);
    assert.equal(nohead.status, 1);
    assert.match(nohead.stderr, /no section "Nope"; the ## headings are: Steps \| Risks/);
    const usage = run(['record', 'edit', f.root, 'demo', '04-plan-api', '--section', 'Steps']);
    assert.equal(usage.status, 1);
    assert.match(usage.stderr, /one of --section <heading> --from <file> or --replace <old> --with <new>/);

    // The schema check runs: a record whose frontmatter breaks the schema is refused, and stays.
    const doc = readDoc(f.dir, '05-implement-api.md');
    writeDoc(f.dir, '05-implement-api.md', { frontmatter: { ...doc.frontmatter, status: 'bogus' }, body: doc.body });
    const refused = run(['record', 'edit', f.root, 'demo', '05-implement-api', '--replace', 'AC-1', '--with', 'AC-one']);
    assert.equal(refused.status, 1);
    assert.match(refused.stdout, /^refused 05-implement-api\.md: /);
    assert.match(readDoc(f.dir, '05-implement-api.md').body, /AC-1/);
  } finally { f.done(); }
});

test('record put keeps the draft in .draft/.put/ for a second edit, and record stage-done clears it', () => {
  const f = fixture();
  try {
    const kept = path.join(f.dir, '.draft', '.put', '04-plan-api.md');
    assert.ok(existsSync(kept), 'the put draft is kept');
    assert.ok(!existsSync(path.join(f.dir, '.draft', '04-plan-api.md')));
    writeFileSync(kept, readFileSync(kept, 'utf8').replace('2. Two.', '2. Two, again.'));
    const again = run(['record', 'put', f.root, 'demo', '04-plan-api.md']);
    assert.equal(again.status, 0, again.stdout + again.stderr);
    assert.match(readDoc(f.dir, '04-plan-api.md').body, /2\. Two, again\./);
    assert.ok(existsSync(kept), 'the kept draft stays after its own put');
    // A bare put does not put the kept drafts again.
    assert.equal(run(['record', 'put', f.root, 'demo']).status, 1);
    assert.equal(run(['record', 'stage-done', f.root, 'demo', 'plan', 'api']).status, 0);
    assert.ok(!existsSync(path.join(f.dir, '.draft', '.put')), 'stage-done clears the kept drafts');
  } finally { f.done(); }
});

test('get, set, edit and draft take a name without the number, the slice or .md, and list the matches of an unclear name', () => {
  const f = fixture();
  try {
    assert.match(run(['record', 'get', f.root, 'demo', 'implement']).stdout, /type: implement/);
    assert.match(run(['record', 'get', f.root, 'demo', '05-implement']).stdout, /type: implement/);
    assert.match(run(['record', 'get', f.root, 'demo', 'plan-api.md']).stdout, /type: plan/);
    assert.equal(run(['record', 'set', f.root, 'demo', 'slice', 'slices[api].status=in-progress']).stdout, 'set slices[api].status in 03-slice.md\n');
    const d = run(['record', 'draft', f.root, 'demo', 'plan']);
    assert.equal(d.status, 0, d.stderr);
    assert.match(d.stdout, /^draft 04-plan-api\.md → /);
    // Two records fit: the command lists them and exits 1.
    writeDoc(f.dir, '05-implement-ui.md', { frontmatter: { ...readDoc(f.dir, '05-implement-api.md').frontmatter, 'slice-slug': 'ui' }, body: '# UI\n' });
    for (const verb of [['get'], ['draft'], ['set', 'status=complete'], ['edit', '--replace', 'a', '--with', 'b']]) {
      const r = run(['record', verb[0], f.root, 'demo', 'implement', ...verb.slice(1)]);
      assert.equal(r.status, 1, verb[0]);
      assert.match(r.stderr, new RegExp(`record ${verb[0]}: implement fits 2 records: 05-implement-api\\.md, 05-implement-ui\\.md; name one of them`));
    }
    const miss = run(['record', 'get', f.root, 'demo', 'retro']);
    assert.equal(miss.status, 1);
    assert.match(miss.stderr, /no record retro in demo; its records are: /);
  } finally { f.done(); }
});

test('the library reads one section, one field and the outline, and edits in place', () => {
  const f = fixture();
  try {
    const w = openWorkflow(f.root, 'demo');
    assert.equal(w.records.section('plan-api', 'Risks'), '- none\n');
    assert.equal(w.records.field('03-slice', 'slices[api].status'), 'defined');
    assert.deepEqual(w.records.outline('04-plan-api').sections.map((s) => s.heading), ['Steps', 'Risks']);
    w.records.edit('implement', { replace: '- [ ] AC-1', with: '- [x] AC-1' });
    assert.match(w.records.get('05-implement-api').body, /- \[x\] AC-1/);
    assert.throws(() => w.records.edit('implement', { section: 'Nope', text: 'x' }), /no section "Nope"/);
  } finally { f.done(); }
});

test('clearKept with a slice keeps the kept drafts of other slices', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, readdirSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { clearKept } = await import('../../lib/records.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'kept-'));
  const kept = join(dir, '.draft', '.put');
  mkdirSync(kept, { recursive: true });
  for (const n of ['05-implement-a.md', '05-implement-b.md', '04-plan-a.md']) writeFileSync(join(kept, n), 'x');
  assert.equal(clearKept(dir, { slice: 'a' }), 2);
  assert.deepEqual(readdirSync(kept), ['05-implement-b.md']);
  assert.equal(clearKept(dir), 1);
});
