// A script of `wf.mjs run` in a linked project: one commit for each workflow that it changed,
// none for a workflow that it only read, and none at all when it throws.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { INDEX_NAME, frontmatterOfDoc } from '../../lib/records.mjs';
import { workflowDir } from '../../lib/records-root.mjs';
import { linkProject } from '../../lib/records-sync.mjs';
import { runScript } from '../../lib/wf-api.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

test('one commit for each changed workflow, none for a read, none for a script that throws', async () => {
  const top = mkdtempSync(join(tmpdir(), 'wf-api-run-'));
  const saved = { ...process.env };
  try {
    const bare = join(top, 'records.git');
    git(top, 'init', '-q', '--bare', '-b', 'main', bare);
    const home = join(top, 'home');
    mkdirSync(home, { recursive: true });
    writeFileSync(join(home, 'config.json'), JSON.stringify({ records: { machine: 'alpha' } }));
    git(top, 'clone', '-q', bare, join(home, 'records'));
    Object.assign(process.env, { SDLC_HOME: home, SDLC_RECORDS_FOREGROUND: '1', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' });
    const root = join(top, 'project');
    for (const slug of ['w1', 'w2', 'w3']) {
      const dir = join(root, '.ai', 'workflows', slug);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, INDEX_NAME), `---\nschema: sdlc/v1\ntype: index\nslug: ${slug}\nstatus: active\ncurrent-stage: plan\nopen-questions: [db]\n---\n`);
    }
    assert.equal(linkProject(root, 'notes').ok, true);
    const clone = join(home, 'records');
    const count = (slug) => Number(git(clone, 'rev-list', '--count', 'HEAD', '--', `notes/${slug}`));
    const before = ['w1', 'w2', 'w3'].map(count);

    const r = await runScript(root, async ({ open }) => {
      const w1 = open('w1');
      w1.records.set('index', 'current-stage', 'implement');
      w1.records.set('index', 'tags+', 'api');
      w1.decisions.add({ kind: 'answer', key: 'db', question: 'Which database?', answer: 'postgres', by: 'person' });
      open('w2').records.set('index', 'current-stage', 'verify');
      return open('w3').records.get('index').frontmatter.status;
    }, { script: 'many.mjs' });
    assert.equal(r.ok, true, r.error?.message);
    assert.deepEqual([r.value, r.changed.sort()], ['active', ['w1', 'w2']]);
    assert.deepEqual(['w1', 'w2', 'w3'].map(count), [before[0] + 1, before[1] + 1, before[2]]);
    assert.match(git(clone, 'log', '-1', '--format=%s', 'HEAD', '--', 'notes/w1'), /w1: wf run many\.mjs/);
    assert.equal(git(bare, 'rev-parse', 'main'), git(clone, 'rev-parse', 'HEAD'), 'the push went out');

    const after = ['w1', 'w2'].map(count);
    const bad = await runScript(root, async ({ open }) => {
      open('w1').records.set('index', 'current-stage', 'review');
      throw new Error('stop');
    }, { script: 'bad.mjs' });
    assert.equal(bad.ok, false);
    assert.deepEqual(['w1', 'w2'].map(count), after);
    assert.equal(frontmatterOfDoc(workflowDir(root, 'w1'), INDEX_NAME)['current-stage'], 'implement', 'the folder is as its commit has it');
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
    rmSync(top, { recursive: true, force: true });
  }
});
