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
  } finally { w.done(); }
});
