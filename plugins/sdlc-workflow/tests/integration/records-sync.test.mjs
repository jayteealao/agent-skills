// Cross-computer work: two machines share one records repo (a local bare repo here). Each
// machine is its own SDLC_HOME with its own clone and its own project checkout.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { claimLease, releaseLease, showLease } from '../../lib/leases.mjs';
import { listMessages, postMessage, readMessage } from '../../lib/messages.mjs';
import { INDEX_NAME, frontmatterOfDoc, setFields } from '../../lib/records.mjs';
import { linkedProject, localWorkflowsRoot, workflowDir, workflowsRoot } from '../../lib/records-root.mjs';
import { commitWorkflow, gitIn, linkProject, pushWorkflow, squashWorkflow, syncRecords } from '../../lib/records-sync.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function world() {
  const top = mkdtempSync(join(tmpdir(), 'records-sync-'));
  const bare = join(top, 'records.git');
  git(top, 'init', '-q', '--bare', '-b', 'main', bare);
  const machine = (name) => {
    const home = join(top, `home-${name}`);
    mkdirSync(home, { recursive: true });
    writeFileSync(join(home, 'config.json'), JSON.stringify({ records: { machine: name } }));
    git(top, 'clone', '-q', bare, join(home, 'records'));
    const root = join(top, `project-${name}`);
    mkdirSync(join(root, '.ai', 'workflows'), { recursive: true });
    return { name, home, root };
  };
  const saved = { ...process.env };
  Object.assign(process.env, { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' });
  const as = (m) => { process.env.SDLC_HOME = m.home; return m; };
  const done = () => {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
    rmSync(top, { recursive: true, force: true });
  };
  return { bare, machine, as, done };
}

function workflow(root, slug) {
  const dir = join(root, '.ai', 'workflows', slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, INDEX_NAME), `---\nschema: sdlc/v1\ntype: index\nslug: ${slug}\nstatus: active\ncurrent-stage: plan\n---\n`);
  mkdirSync(join(dir, '.draft'), { recursive: true });
  writeFileSync(join(dir, '.draft', '04-plan.md'), 'draft');
}

test('link moves the records; another machine pulls them; the close squashes them onto main', () => {
  const w = world();
  try {
    const a = w.as(w.machine('alpha'));
    workflow(a.root, 'w1');
    const l = linkProject(a.root, 'notes');
    assert.deepEqual([l.ok, l.moved], [true, ['w1']]);
    assert.equal(linkedProject(a.root), 'notes');
    assert.equal(workflowsRoot(a.root), join(a.home, 'records', 'notes'));
    assert.equal(frontmatterOfDoc(workflowDir(a.root, 'w1'), INDEX_NAME).status, 'active');
    assert.ok(existsSync(join(localWorkflowsRoot(a.root), 'w1', '.draft', '04-plan.md')), 'the drafts stay local');
    assert.ok(!existsSync(join(localWorkflowsRoot(a.root), 'w1', INDEX_NAME)));
    assert.equal(pushWorkflow(a.root, 'w1').pushed, true);
    assert.match(git(w.bare, 'for-each-ref', '--format=%(refname)'), /refs\/heads\/live\/notes\/w1/);

    const b = w.as(w.machine('beta'));
    assert.equal(linkProject(b.root, 'notes').ok, true);
    const s = syncRecords(b.root);
    assert.deepEqual([s.offline, s.pulled], [false, ['w1']]);
    assert.equal(frontmatterOfDoc(workflowDir(b.root, 'w1'), INDEX_NAME)['current-stage'], 'plan');

    w.as(a);
    setFields(workflowDir(a.root, 'w1'), INDEX_NAME, { status: 'closed' });
    const q = squashWorkflow(a.root, 'w1');
    assert.deepEqual([q.ok, q.pushed], [true, true], JSON.stringify(q));
    assert.doesNotMatch(git(w.bare, 'for-each-ref', '--format=%(refname)'), /live\/notes\/w1/, 'the live branch is gone');
    assert.match(git(w.bare, 'log', '--format=%s', 'main'), /notes\/w1: the records of the closed workflow/);

    w.as(b);
    const s2 = syncRecords(b.root);
    assert.equal(s2.conflicts.length, 0, s2.conflicts.join('; '));
    assert.equal(frontmatterOfDoc(workflowDir(b.root, 'w1'), INDEX_NAME).status, 'closed');
    assert.equal(gitIn(join(b.home, 'records'), ['rev-parse', '--verify', '--quiet', 'refs/heads/live/notes/w1']).status, 1);
  } finally { w.done(); }
});

test('one lease per workflow: held, expired, taken after a yes, released', () => {
  const w = world();
  try {
    const a = w.as(w.machine('alpha'));
    workflow(a.root, 'w1');
    linkProject(a.root, 'notes');
    const now = new Date('2026-10-25T10:00:00Z');
    const c = claimLease(a.root, 'w1', { now, host: 'claude' });
    assert.equal(c.ok, true, c.reason);
    assert.equal(c.lease.expires, '2026-10-25T11:00:00Z', 'no profile: one hour');
    assert.equal(claimLease(a.root, 'w1', { now }).renewed, true);

    const b = w.as(w.machine('beta'));
    linkProject(b.root, 'notes');
    const held = claimLease(b.root, 'w1', { now });
    assert.deepEqual([held.ok, held.held, held.lease.machine], [false, true, 'alpha']);
    const later = new Date('2026-10-25T12:00:00Z');
    assert.equal(claimLease(b.root, 'w1', { now: later }).expired, true, 'an expired lease needs the yes');
    const took = claimLease(b.root, 'w1', { now: later, take: true });
    assert.deepEqual([took.ok, took.took], [true, true]);
    assert.equal(showLease(b.root, 'w1', { now: later }).mine, true);

    w.as(a);
    assert.equal(releaseLease(a.root, 'w1').held, true, 'alpha may not release the lease of beta');
    w.as(b);
    assert.equal(releaseLease(b.root, 'w1').released, true);
    assert.equal(showLease(b.root, 'w1').lease, null);
  } finally { w.done(); }
});

test('two machines write other files of one workflow: the pushes merge; messages are read per machine', () => {
  const w = world();
  try {
    const a = w.as(w.machine('alpha'));
    workflow(a.root, 'w1');
    linkProject(a.root, 'notes');
    pushWorkflow(a.root, 'w1');
    const b = w.as(w.machine('beta'));
    linkProject(b.root, 'notes');
    syncRecords(b.root);

    // beta posts a message; alpha changes the index at the same time.
    const m = postMessage(b.root, 'w1', { kind: 'review-request', text: 'Please look at slice 2.', now: new Date('2026-10-25T10:00:00Z') });
    assert.equal(m.id, '20261025T100000Z-beta-review-request.md');
    w.as(a);
    setFields(workflowDir(a.root, 'w1'), INDEX_NAME, { 'current-stage': 'implement' });
    commitWorkflow(a.root, 'w1', 'w1: stage');
    assert.equal(pushWorkflow(a.root, 'w1').pushed, true);
    w.as(b);
    const pushed = pushWorkflow(b.root, 'w1');
    assert.equal(pushed.pushed, true, pushed.reason);
    assert.equal(frontmatterOfDoc(workflowDir(b.root, 'w1'), INDEX_NAME)['current-stage'], 'implement', 'beta has the merge');

    w.as(a);
    syncRecords(a.root);
    const list = listMessages(a.root, 'w1');
    assert.deepEqual(list.map((x) => [x.kind, x.from, x.read]), [['review-request', 'beta', false]]);
    assert.match(readMessage(a.root, 'w1', list[0].id).text, /slice 2/);
    assert.equal(listMessages(a.root, 'w1')[0].read, true);
    w.as(b);
    assert.equal(listMessages(b.root, 'w1')[0].read, false, 'each machine records its own reads');
    const facts = JSON.parse(readFileSync(join(a.home, 'records', '.machines', 'alpha.json'), 'utf8'));
    assert.deepEqual(facts.reads['notes/w1'], [list[0].id]);
  } finally { w.done(); }
});

test('the pre-write check refuses an agent write to an inbox or to a record in the records home', async () => {
  const w = world();
  try {
    const a = w.as(w.machine('alpha'));
    workflow(a.root, 'w1');
    linkProject(a.root, 'notes');
    const { spawnSync } = await import('node:child_process');
    const hook = join(import.meta.dirname, '..', '..', 'hooks', 'pre-tool-use-all.mjs');
    const write = (file_path) => spawnSync(process.execPath, [hook], { input: JSON.stringify({ cwd: a.root, tool_input: { file_path, content: '---\nkind: note\n---\nx\n' } }), encoding: 'utf8', env: process.env });
    const inbox = write(join(a.home, 'records', 'notes', 'w1', 'inbox', '20261025T100000Z-alpha-note.md'));
    assert.equal(inbox.status, 2);
    assert.match(inbox.stderr, /msg post/);
    const local = write('.ai/workflows/w1/inbox/20261025T100000Z-alpha-note.md');
    assert.equal(local.status, 2);
    const rec = write(join(a.home, 'records', 'notes', 'w1', 'state.yaml'));
    assert.equal(rec.status, 2);
    assert.match(rec.stderr, /Scripts write the record files/);
    // A file of the workflow by its local path: refused, with the real place.
    const evidence = write('.ai/workflows/w1/verify-evidence/s1/checks.md');
    assert.equal(evidence.status, 2);
    assert.ok(evidence.stderr.includes(join(a.home, 'records', 'notes', 'w1', 'verify-evidence', 's1', 'checks.md')), evidence.stderr);
    assert.match(evidence.stderr, /records repo clone/);
    // A draft stays local, and a write in the records home passes.
    assert.doesNotMatch(write('.ai/workflows/w1/.draft/04-plan.md').stderr, /records repo clone/);
    assert.notEqual(write(join(a.home, 'records', 'notes', 'w1', 'verify-evidence', 's1', 'checks.md')).status, 2);
  } finally { w.done(); }
});

test('a linked project: a local path maps to the records home, and a local file moves home at the commit', async () => {
  const w = world();
  try {
    const a = w.as(w.machine('alpha'));
    workflow(a.root, 'w1');
    writeFileSync(join(a.root, '.ai', 'workflows', 'INDEX.md'), '# registry\n');
    linkProject(a.root, 'notes');
    const { recordPathOf, realPathOf } = await import('../../lib/records-root.mjs');
    const { adoptLocal } = await import('../../lib/records-sync.mjs');
    const local = join(localWorkflowsRoot(a.root), 'w1');
    const home = workflowDir(a.root, 'w1');
    // The link moved the registry; the drafts stayed.
    assert.equal(readFileSync(join(a.home, 'records', 'notes', 'INDEX.md'), 'utf8'), '# registry\n');
    assert.equal(existsSync(join(localWorkflowsRoot(a.root), 'INDEX.md')), false);
    assert.equal(existsSync(join(local, '.draft', '04-plan.md')), true);
    // The paths.
    assert.equal(recordPathOf(a.root, join(local, 'verify-evidence', 'checks.md')), join(home, 'verify-evidence', 'checks.md'));
    assert.equal(recordPathOf(a.root, join(local, '.draft', '04-plan.md')), join(local, '.draft', '04-plan.md'));
    assert.equal(recordPathOf(a.root, join(a.root, 'src', 'x.js')), join(a.root, 'src', 'x.js'));
    assert.equal(realPathOf(join(local, '.driver-journal.jsonl')), join(home, '.driver-journal.jsonl'));
    // A test runner writes evidence by the local path; the next commit takes it home.
    mkdirSync(join(local, 'verify-evidence', 's1'), { recursive: true });
    writeFileSync(join(local, 'verify-evidence', 's1', 'checks.md'), 'green\n');
    commitWorkflow(a.root, 'w1', 'w1: verify');
    assert.equal(readFileSync(join(home, 'verify-evidence', 's1', 'checks.md'), 'utf8'), 'green\n');
    assert.equal(existsSync(join(local, 'verify-evidence')), false);
    assert.equal(existsSync(join(local, '.draft', '04-plan.md')), true, 'the drafts stay');
    assert.match(git(join(a.home, 'records'), 'ls-tree', '-r', '--name-only', 'refs/heads/live/notes/w1'), /notes\/w1\/verify-evidence\/s1\/checks\.md/);
    // The same content in both places (line endings aside): the local copy goes.
    writeFileSync(join(local, 'notes.md'), 'same\r\n');
    writeFileSync(join(home, 'notes.md'), 'same\n');
    assert.deepEqual(adoptLocal(a.root, 'w1'), { moved: [], stale: [], conflicts: [] });
    assert.equal(existsSync(join(local, 'notes.md')), false);
    // The clone copy is committed: a local copy with new content is the newer write, whatever its time.
    commitWorkflow(a.root, 'w1', 'w1: notes');
    writeFileSync(join(local, 'notes.md'), 'local, newer\n');
    const { utimesSync } = await import('node:fs');
    utimesSync(join(local, 'notes.md'), new Date(Date.now() - 600_000), new Date(Date.now() - 600_000));
    assert.deepEqual(adoptLocal(a.root, 'w1'), { moved: ['notes.md'], stale: [], conflicts: [] });
    assert.equal(readFileSync(join(home, 'notes.md'), 'utf8'), 'local, newer\n');
    commitWorkflow(a.root, 'w1', 'w1: notes again');
    // A stale copy that a checkout put back, with a new time: it was a version of the file, so it goes.
    writeFileSync(join(local, 'notes.md'), 'same\n');
    utimesSync(join(local, 'notes.md'), new Date(Date.now() + 600_000), new Date(Date.now() + 600_000));
    assert.deepEqual(adoptLocal(a.root, 'w1'), { moved: [], stale: ['notes.md'], conflicts: [] });
    assert.equal(readFileSync(join(home, 'notes.md'), 'utf8'), 'local, newer\n');
    // The clone copy has its own uncommitted change: it stays, and the local copy is kept aside.
    writeFileSync(join(home, 'notes.md'), 'home, uncommitted\n');
    writeFileSync(join(local, 'notes.md'), 'local, other\n');
    assert.deepEqual(adoptLocal(a.root, 'w1'), { moved: [], stale: [], conflicts: ['notes.md'] });
    assert.equal(readFileSync(join(home, 'notes.md'), 'utf8'), 'home, uncommitted\n');
    assert.equal(readFileSync(join(localWorkflowsRoot(a.root), '.conflicts', 'w1', 'notes.md'), 'utf8'), 'local, other\n');
    // The sync takes home the files of a workflow that no command touched.
    writeFileSync(join(local, 'late.md'), 'late\n');
    syncRecords(a.root);
    assert.equal(readFileSync(join(home, 'late.md'), 'utf8'), 'late\n');
  } finally { w.done(); }
});

test('a project that is not linked here is read from git, and a post to it pushes only the message', () => {
  const w = world();
  try {
    const a = w.as(w.machine('alpha'));
    workflow(a.root, 'w1');
    workflow(a.root, 'w2');
    linkProject(a.root, 'notes');
    postMessage(a.root, 'w1', { kind: 'note', text: 'from alpha', now: new Date('2026-10-25T09:00:00Z') });
    pushWorkflow(a.root, 'w1');
    setFields(workflowDir(a.root, 'w2'), INDEX_NAME, { status: 'closed' });
    postMessage(a.root, 'w2', { kind: 'note', text: 'closed one', now: new Date('2026-10-25T09:00:00Z') });
    assert.equal(squashWorkflow(a.root, 'w2').ok, true);

    // beta links another project; notes has no live branch and no folder on beta.
    const b = w.as(w.machine('beta'));
    workflow(b.root, 'b1');
    linkProject(b.root, 'api');
    const list = listMessages(b.root, 'w1', { to: 'notes' });
    assert.deepEqual(list.map((m) => [m.from, m.read]), [['alpha', false]]);
    assert.match(readMessage(b.root, 'w1', list[0].id, { to: 'notes' }).text, /from alpha/);
    assert.equal(listMessages(b.root, 'w1', { to: 'notes' })[0].read, true);
    assert.equal(listMessages(b.root, 'w2', { to: 'notes' })[0].from, 'alpha', 'a closed workflow is read from the main branch');

    const before = git(w.bare, 'rev-parse', 'refs/heads/live/notes/w1');
    const m = postMessage(b.root, 'w1', { kind: 'review-request', text: 'from beta', to: 'notes', now: new Date('2026-10-25T10:00:00Z') });
    assert.deepEqual([m.pushed, m.project], [true, 'notes']);
    assert.equal(git(w.bare, 'rev-parse', 'refs/heads/live/notes/w1^'), before, 'one commit on the remote tip');
    assert.equal(git(w.bare, 'diff', '--name-only', before, 'refs/heads/live/notes/w1'), `notes/w1/inbox/${m.id}`);
    assert.equal(gitIn(join(b.home, 'records'), ['rev-parse', '--verify', '--quiet', 'refs/heads/live/notes/w1']).status, 1, 'no local branch of notes on beta');
    assert.ok(!existsSync(join(b.home, 'records', 'notes', 'w1')), 'no file of notes in the working tree of beta');
    assert.throws(() => postMessage(b.root, 'nope', { kind: 'note', text: 'x', to: 'notes' }), /no workflow notes\/nope/);

    w.as(a);
    syncRecords(a.root);
    assert.deepEqual(listMessages(a.root, 'w1').map((x) => x.from), ['alpha', 'beta']);
  } finally { w.done(); }
});

test('a record file above the size limit moves to the evidence folder of the project and out of every commit', () => {
  const w = world();
  try {
    const a = w.as(w.machine('alpha'));
    writeFileSync(join(a.home, 'config.json'), JSON.stringify({ records: { machine: 'alpha', 'max-file-mb': 0.001 } }));
    workflow(a.root, 'w1');
    const evidence = join(a.root, '.ai', 'workflows', 'w1', 'verify-evidence');
    mkdirSync(evidence, { recursive: true });
    writeFileSync(join(evidence, 'trace.zip'), Buffer.alloc(4096, 1));
    writeFileSync(join(evidence, 'checks.md'), '# Checks\n');
    assert.equal(linkProject(a.root, 'notes').ok, true);
    const clone = join(a.home, 'records');
    const files = gitIn(clone, ['ls-tree', '-r', '--name-only', 'refs/heads/live/notes/w1']).stdout.split('\n');
    assert.ok(files.includes('notes/w1/verify-evidence/checks.md'));
    assert.ok(!files.includes('notes/w1/verify-evidence/trace.zip'), 'the large file is in no commit');
    assert.ok(!existsSync(join(workflowDir(a.root, 'w1'), 'verify-evidence', 'trace.zip')), 'the large file left the clone folder');
    assert.ok(existsSync(join(a.root, '.ai', 'evidence', 'w1', 'verify-evidence', 'trace.zip')), 'the large file is in the evidence folder');
    assert.ok(files.includes('notes/w1/local-evidence.jsonl'), 'the record lists it');
    // A sync makes no commit for it.
    const tip = gitIn(clone, ['rev-parse', 'refs/heads/live/notes/w1']).stdout;
    syncRecords(a.root);
    assert.equal(gitIn(clone, ['rev-parse', 'refs/heads/live/notes/w1']).stdout, tip);
  } finally { w.done(); }
});

test('a record path longer than 260 characters goes into the commit', () => {
  const w = world();
  try {
    const a = w.as(w.machine('alpha'));
    workflow(a.root, 'w1');
    assert.equal(linkProject(a.root, 'notes').ok, true);
    const deep = ['work', 'archive', 'campaign', 'records', 'conflicts', 'a-long-unit-name-of-an-old-campaign-wave', '20261022T171353Z', 'workflows', 'a-long-unit-name-of-an-old-campaign-wave', 'nested-folder-that-makes-the-path-long-enough'];
    const dir = join(workflowDir(a.root, 'w1'), ...deep);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'commentary.md'), '# Long\n');
    assert.ok(join(dir, 'commentary.md').length > 260, 'the path passes the Windows limit');
    assert.ok(commitWorkflow(a.root, 'w1', 'notes/w1: long path').commit);
    const files = gitIn(join(a.home, 'records'), ['ls-tree', '-r', '--name-only', 'refs/heads/live/notes/w1']).stdout.split('\n');
    assert.ok(files.includes(['notes', 'w1', ...deep, 'commentary.md'].join('/')));
  } finally { w.done(); }
});
