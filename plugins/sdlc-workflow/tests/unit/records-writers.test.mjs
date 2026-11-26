// Every write of a records file goes through writeFileAtomic or appendRecord (lib/atomic-write.mjs),
// so a sync or a reader never sees half a file. A raw writeFileSync or appendFileSync stays only
// where this test names why: a temp file that a rename puts in place, a lock, or a file outside
// the records (the plugin's own files, this machine's state and logs, a git checkout).
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = join(import.meta.dirname, '..', '..');

// Files whose raw writes are all outside the records, with the reason.
const OUTSIDE = {
  'lib/atomic-write.mjs': 'the writers themselves',
  'hooks/shell-wf-note.mjs': 'a count of shell calls in the state folder, one line for each call',
  'scripts/release.mjs': 'the files of the plugin',
  'scripts/stamp-version.mjs': 'the files of the plugin',
  'scripts/generate.mjs': 'the files of the plugin',
  'scripts/migrate-design-types.mjs': 'the files of the plugin',
  'scripts/measure-artifacts.mjs': 'a report file the person names',
  'scripts/doctor.mjs': 'a report file the person names',
  'scripts/smoke-hosts.mjs': 'a throwaway project in a temp folder',
  'scripts/stage-yolo-driver.mjs': 'the run folder of this machine',
  'scripts/prototype.mjs': 'a temp file and the scratch folder of a worktree',
  'lib/memory-seed.mjs': 'AGENTS.md and CLAUDE.md of the product',
  'lib/setup.mjs': 'the .gitignore and config of the product',
  'lib/scratch-worktree.mjs': 'the git exclude file',
  'lib/machine-cleanup.mjs': 'the home of this machine',
  'lib/home.mjs': 'the log of this machine',
  'lib/closing.mjs': 'a cache of this machine',
  'lib/drive.mjs': 'the run folder of this machine: streamed output',
  'lib/drive-detach.mjs': 'the run folder of this machine',
  'lib/github-layer.mjs': 'the outbox of this machine',
  'lib/records-sync.mjs': 'the state, log and config of this machine',
  'lib/answers.mjs': 'the ignore file of the answers folder',
  'lib/run-files.mjs': 'the ignore file of the run folder',
  'lib/wf-ops.mjs': 'a temp folder that record put checks',
  'lib/wf-api.mjs': 'a temp folder that record put checks',
  'scripts/optimize.mjs': 'the files of the product in its worktree',
  'hooks/_adapter.mjs': 'the debug log and ledger of the plugin',
  'hooks/permission-request.mjs': 'the log of the plugin',
};

const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.mjs') ? [join(dir, e.name)] : []));

test('no raw write of a records file: each one left names why it is not one', () => {
  const raw = [];
  for (const dir of ['lib', 'scripts', 'hooks']) {
    for (const f of files(join(ROOT, dir))) {
      const rel = relative(ROOT, f).replaceAll('\\', '/');
      if (OUTSIDE[rel]) continue;
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (!/\b(writeFileSync|appendFileSync)\(/.test(line) || /^\s*(\/\/|\*)/.test(line)) return;
        // A temp file that a rename puts in place, or a lock made with the wx flag.
        if (/(writeFileSync|appendFileSync)\(\s*(`\$\{[^}]+\}\.tmp`|tmp\b)/.test(line) || /flag: 'wx'/.test(line)) return;
        raw.push(`${rel}:${i + 1}: ${line.trim().slice(0, 100)}`);
      });
    }
  }
  assert.deepEqual(raw, [], 'use writeFileAtomic or appendRecord, or name the file in OUTSIDE with its reason');
});

test('every file named as outside still has a raw write, so the list does not go stale', () => {
  for (const rel of Object.keys(OUTSIDE)) {
    if (rel === 'lib/atomic-write.mjs') continue;
    assert.match(readFileSync(join(ROOT, rel), 'utf8'), /\b(writeFileSync|appendFileSync)\(/, rel);
  }
});
