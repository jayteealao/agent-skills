// The end of an implement and of a verify against a real repo: a check is met by an exit code
// that wf saw, and a verify passes only on the code that its checks ran on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { addDecision } from '../../lib/decisions.mjs';
import { verifyGate } from '../../lib/stage-gates.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const wf = path.join(pluginRoot, 'scripts', 'wf.mjs');
const PLAN = '## Step-by-Step Plan\n\n1. **Add the key** — files: `src/a.js`. Done when: it parses.\n\n## Slice Checks\n\n- the tests of the slice: `node check.js`\n';

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-gates-'));
  const git = (...args) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 'T');
  const dir = path.join(root, '.ai', 'workflows', 'demo');
  mkdirSync(path.join(root, 'src'), { recursive: true });
  mkdirSync(dir, { recursive: true });
  const doc = (name, fm, body = '') => writeFileSync(path.join(dir, name), `---\n${fm}\n---\n${body}`);
  doc('00-index.md', 'schema: sdlc/v1\ntype: index\nslug: demo\nstatus: active\ncurrent-stage: implement\nbranch-strategy: none');
  doc('03-slice.md', 'schema: sdlc/v1\ntype: slice-index\nslug: demo\nslices:\n  - slug: api\n    status: in-progress');
  doc('03-slice-api.md', 'schema: sdlc/v1\ntype: slice\nslug: demo\nslice-slug: api');
  doc('04-plan-api.md', 'schema: sdlc/v1\ntype: plan\nslug: demo\nslice-slug: api', PLAN);
  const commit = (file, text, msg) => { writeFileSync(path.join(root, file), text); git('add', '-A'); git('commit', '-q', '-m', msg); return git('rev-parse', 'HEAD').stdout.trim(); };
  const first = commit('src/a.js', 'export const a = 1;\n', 'first');
  const cli = (...args) => spawnSync(process.execPath, [wf, ...args], { encoding: 'utf8', timeout: 90_000 });
  const verify = (fm) => doc('06-verify-api.md', `schema: sdlc/v1\ntype: verify\nslug: demo\nslice-slug: api\n${fm}`);
  return { root, dir, git, commit, cli, first, verify, gate: () => verifyGate(dir, 'api', { checkout: root, planBody: PLAN }), done: () => rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) };
}
const check = (f, ...args) => f.cli('step', 'check', f.root, 'demo', 'api', ...args);

test('step check: wf runs the command and takes the result from its exit code', () => {
  const f = fixture();
  try {
    let r = check(f, '--name', 'tests', '--result', 'met', '--sha', 'HEAD');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /a check is met by its exit code, not by your word/);
    r = check(f, '--name', 'tests', '--run', `"${process.execPath}" -e "console.log('2 red');process.exit(3)"`);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^tests: not-met at [0-9a-f]{8} \(run by wf, exit 3\)\noutput: .*check-tests-\d+\.log/);
    assert.equal(check(f).status, 0, 'a check that is not met does not block the end of an implement');
    r = check(f, '--name', 'tests', '--run', `"${process.execPath}" -e "process.exit(0)"`);
    assert.match(r.stdout, /^tests: met at [0-9a-f]{8} \(run by wf, exit 0\)/);
    // Code after the check makes it stale.
    f.commit('src/a.js', 'export const a = 2;\n', 'more');
    r = check(f);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /blocks the end of the stage: the check "tests" ran on [0-9a-f]{8}, and code changed after it/);
  } finally { f.done(); }
});

test('a verify passes only on the code that its checks ran on', () => {
  const f = fixture();
  try {
    const run0 = () => check(f, '--name', 'tests', '--run', `"${process.execPath}" -e "process.exit(0)"`);
    f.verify('result: pass');
    assert.deepEqual(f.gate().blocking.slice(0, 1), ['the record says pass and names no verified-head']);
    f.verify(`result: pass\nverified-head: ${f.first}`);
    assert.deepEqual(f.gate().blocking, ['the plan has slice checks, and no result of a check is recorded']);
    run0();
    assert.deepEqual(f.gate().blocking, []);
    // A check that failed: the result is not pass.
    check(f, '--name', 'tests', '--run', `"${process.execPath}" -e "process.exit(1)"`);
    assert.deepEqual(f.gate().blocking, ['the check "tests" is not met']);
    run0();
    // A fix commit after the checks: the pass is of older code.
    f.commit('src/a.js', 'export const a = 3;\n', 'fix');
    const b = f.gate().blocking;
    assert.match(b[0], /^code changed after verified-head [0-9a-f]{8} \(src\/a\.js\)$/);
    assert.match(b[1], /the check "tests" ran on [0-9a-f]{8}, and code changed after it/);
    // A commit of prose changes nothing.
    const head = f.git('rev-parse', 'HEAD').stdout.trim();
    f.verify(`result: pass\nverified-head: ${head}`);
    run0();
    f.commit('README.md', 'notes\n', 'docs');
    assert.deepEqual(f.gate().blocking, []);
    f.verify('result: pass\nverified-head: 0123456789abcdef0123456789abcdef01234567');
    assert.match(f.gate().blocking[0], /is not a commit of this branch/);
    // The command refuses the end of the stage.
    const r = f.cli('record', 'stage-done', f.root, 'demo', 'verify', 'api');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /the verify of api cannot end as it is: verified-head 01234567 is not a commit of this branch/);
  } finally { f.done(); }
});

test('an accept of failing items is in the decision store, under the name that the record gives', () => {
  const f = fixture();
  try {
    f.verify('result: partial\naccepted-items:\n  - AC3 fails');
    assert.deepEqual(f.gate().blocking, ['the record lists accepted items and does not say who accepted them']);
    f.verify('result: partial\naccepted-by: person\naccepted-items:\n  - AC3 fails');
    assert.match(f.gate().blocking[0], /the person accepted failing items, and the decision store holds no such accept for api/);
    addDecision(f.dir, { kind: 'answer', key: 'verify-accept:api:ac3', answer: 'accept, carried to the review', by: 'delegate', scope: { slice: 'api' } });
    assert.equal(f.gate().blocking.length, 1, 'an accept of a delegate is not an accept of the person');
    f.verify('result: partial\naccepted-by: delegate\naccepted-items:\n  - AC3 fails');
    assert.deepEqual(f.gate().blocking, []);
    f.verify('result: partial\naccepted-by: D-099\naccepted-items:\n  - AC3 fails');
    assert.equal(f.gate().blocking.length, 1, 'an id that the store does not hold');
    f.verify('result: partial\naccepted-by: person\naccepted-items:\n  - AC3 fails');
    addDecision(f.dir, { kind: 'answer', key: 'ac3', question: 'AC3 fails. Accept it?', answer: 'accept it', scope: { slice: 'api' } });
    assert.deepEqual(f.gate().blocking, []);
  } finally { f.done(); }
});
