// A relaunched run reads what earlier runs built from the status rows, and repeats no finished
// work: a plan is checked only against code newer than it, a done implement still hands its last
// commit to verify, a slice review reads the commits of the slice, and an investigated issue is
// placed, not investigated again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { extractFn } from '../../helpers/extract-fn.mjs';
import { driverSource } from '../../helpers/driver-source.mjs';
import { writeDoc } from '../../../lib/records.mjs';
import { sliceRows } from '../../../lib/wf-status.mjs';

const src = driverSource('yolo.js');
const { newestBuild, planOlderThanBuild, sliceRange } = new Function(
  "const WF_CMD = 'wf.mjs';\n" +
  [extractFn(src, 'newestBuild'), extractFn(src, 'planOlderThanBuild'), extractFn(src, 'sliceRange')].join('\n') +
  '\nreturn { newestBuild, planOlderThanBuild, sliceRange };',
)();

const built = (slice, at) => ({ slice, implementAt: at, stages: { implement: 'done' } });

test('relaunch: the newest build is the slice whose implement was written last', () => {
  assert.equal(newestBuild([]), null);
  assert.equal(newestBuild([{ slice: 'a', stages: { implement: 'todo' } }]), null);
  assert.deepEqual(newestBuild([built('a', '2026-11-20T00:00:00Z'), built('b', '2026-11-25T00:00:00Z')]), { slice: 'b', at: '2026-11-25T00:00:00Z', unknown: false });
  assert.equal(newestBuild([built('a', null)]).unknown, true, 'a build with no time is unknown, so the plans are checked');
});

test('relaunch: a plan is checked only when a build of another slice is newer than it', () => {
  const b = { slice: 'a', at: '2026-11-25T00:00:00Z', unknown: false };
  assert.equal(planOlderThanBuild({ slice: 'c', planAt: '2026-11-26T00:00:00Z' }, b), false);
  assert.equal(planOlderThanBuild({ slice: 'c', planAt: '2026-11-24T00:00:00Z' }, b), true);
  assert.equal(planOlderThanBuild({ slice: 'a', planAt: '2026-11-24T00:00:00Z' }, b), false, 'its own build is not code it misses');
  assert.equal(planOlderThanBuild({ slice: 'c' }, b), true, 'a plan with no time is checked');
  assert.equal(planOlderThanBuild({ slice: 'c' }, null), false);
});

test('relaunch: a slice review reads the commits of the slice, not HEAD alone', () => {
  const idx = { slices: [{ slice: 'a', firstStepSha: 'abc1234' }, { slice: 'b' }] };
  assert.equal(sliceRange('a', idx), 'abc1234^..HEAD');
  assert.match(sliceRange('b', idx), /first step commit that wf\.mjs step where names for 'b'/);
});

test('relaunch: the driver uses the build facts and the investigation records', () => {
  assert.match(src, /if \(!implHead && done\.implement === 'done' && entry\) implHead = shaOf\(entry\.lastStepSha\)/);
  assert.match(src, /\(idx\.issueRecords \|\| \[\]\)\.includes\(issueKeyOf\(i\.id\)\)/);
  assert.match(src, /const answered = held && ANSWERED\.some/);
  assert.match(src, /if \(idx\.slugReview === 'done' && codeMoved === 0\)/);
  assert.match(src, /openHere\.every\(d => d\.clearingProbeHit === false\)/);
  assert.match(src, /if \(Number\.isNaN\(plan\) \|\| Date\.parse\(s\.carriedAt\) > plan\) CARRIED_ISSUES\.add\(s\.slice\)/);
});

test('status rows: the build of each slice comes from its newest run of steps', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-relaunch-'));
  try {
    const dir = path.join(root, 'demo');
    mkdirSync(dir, { recursive: true });
    writeDoc(dir, '03-slice.md', { frontmatter: { schema: 'sdlc/v1', type: 'slice-index', slug: 'demo', slices: [{ slug: 'a', status: 'complete' }, { slug: 'b', status: 'in-progress' }] } });
    const rows = [
      { event: 'start', slice: 'a', step: 1, at: '2026-11-20T00:00:00Z' },
      { event: 'done', slice: 'a', step: 1, sha: 'aaa1111', at: '2026-11-20T01:00:00Z' },
      { event: 'done', slice: 'a', step: 2, sha: 'aaa2222', at: '2026-11-20T02:00:00Z' },
      { event: 'complete', slice: 'a', sha: 'aaa2222', at: '2026-11-20T03:00:00Z' },
      { event: 'start', slice: 'b', step: 1, at: '2026-11-21T00:00:00Z' },
      { event: 'done', slice: 'b', step: 1, sha: 'bbb1111', at: '2026-11-21T01:00:00Z' },
    ];
    writeFileSync(path.join(dir, 'steps.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    const [a, b] = sliceRows(dir);
    assert.deepEqual([a.firstStepSha, a.lastStepSha, a.implementAt], ['aaa1111', 'aaa2222', '2026-11-20T03:00:00Z']);
    assert.deepEqual([b.firstStepSha, b.lastStepSha, b.implementAt], ['bbb1111', 'bbb1111', '2026-11-21T01:00:00Z']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
