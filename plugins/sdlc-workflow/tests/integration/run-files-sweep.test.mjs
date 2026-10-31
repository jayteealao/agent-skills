// A records commit of a workflow folder first moves the run files and the files over the cap
// out of the clone, to the run and evidence folders of the project, so the clone holds only
// files that git commits and `git status` in it is honest. The record lists the evidence.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { INDEX_NAME } from '../../lib/records.mjs';
import { evidenceDir, runDir, workflowDir } from '../../lib/records-root.mjs';
import { commitWorkflow, linkProject, pushRecords } from '../../lib/records-sync.mjs';
import { EVIDENCE_LOG } from '../../lib/run-files.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

test('a records commit moves the run files and a file over the cap out of the clone and commits the evidence line', () => {
  const top = mkdtempSync(join(tmpdir(), 'run-files-sweep-'));
  const saved = { ...process.env };
  try {
    Object.assign(process.env, { SDLC_RECORDS_PUSH: 'off', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' });
    const bare = join(top, 'records.git');
    git(top, 'init', '-q', '--bare', '-b', 'main', bare);
    const home = join(top, 'home');
    mkdirSync(home, { recursive: true });
    writeFileSync(join(home, 'config.json'), JSON.stringify({ records: { machine: 'alpha', 'max-file-mb': 0.001 } }));
    git(top, 'clone', '-q', bare, join(home, 'records'));
    process.env.SDLC_HOME = home;
    const root = join(top, 'project');
    const local = join(root, '.ai', 'workflows', 'w1');
    mkdirSync(local, { recursive: true });
    writeFileSync(join(local, INDEX_NAME), '---\nschema: sdlc/v1\ntype: index\nslug: w1\nstatus: active\ncurrent-stage: plan\n---\n');
    linkProject(root, 'notes');
    pushRecords();

    const dir = workflowDir(root, 'w1');
    assert.ok(dir.startsWith(join(home, 'records')), 'the workflow folder is in the clone');
    mkdirSync(join(dir, 'verify-evidence'), { recursive: true });
    writeFileSync(join(dir, '.control.json'), '{"action":"stop"}\n');
    writeFileSync(join(dir, '.watch-state.json'), '{"version":1}\n');
    writeFileSync(join(dir, 'verify-evidence', 'trace.zip'), 'z'.repeat(4096));
    writeFileSync(join(dir, 'steps.jsonl'), '{}\n');

    const r = commitWorkflow(root, 'w1', 'w1: files');
    assert.ok(r.commit);
    assert.ok(existsSync(join(runDir(root, 'w1'), '.control.json')));
    assert.ok(existsSync(join(runDir(root, 'w1'), '.watch-state.json')));
    assert.ok(existsSync(join(evidenceDir(root, 'w1'), 'verify-evidence', 'trace.zip')));
    for (const f of ['.control.json', '.watch-state.json', join('verify-evidence', 'trace.zip')]) assert.ok(!existsSync(join(dir, f)), `${f} left the clone`);
    const files = git(join(home, 'records'), 'ls-tree', '-r', '--name-only', 'HEAD');
    assert.match(files, /notes\/w1\/steps\.jsonl/);
    assert.match(files, new RegExp(`notes/w1/${EVIDENCE_LOG.replace('.', '\\.')}`));
    assert.doesNotMatch(files, /\.control\.json|\.watch-state\.json|trace\.zip/);
    const line = JSON.parse(git(join(home, 'records'), 'show', `HEAD:notes/w1/${EVIDENCE_LOG}`));
    assert.equal(line.path, '.ai/evidence/w1/verify-evidence/trace.zip');
    assert.equal(line.bytes, 4096);
    assert.equal(line.machine, 'alpha');
    assert.equal(readFileSync(join(evidenceDir(root, 'w1'), 'verify-evidence', 'trace.zip'), 'utf8').length, 4096);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
    rmSync(top, { recursive: true, force: true });
  }
});
