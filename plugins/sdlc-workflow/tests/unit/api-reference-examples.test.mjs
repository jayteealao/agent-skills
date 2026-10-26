// Every script example of skills/wf/reference/_api.md runs with `wf.mjs run` on the fixture
// of the code-mode eval, so an example that the library no longer accepts fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PLUGIN_ROOT, SLUG, makeFixture } from '../evals/code-mode/fixture.mjs';
import { frontmatterOfDoc } from '../../lib/records.mjs';

const wf = path.join(PLUGIN_ROOT, 'scripts', 'wf.mjs');
const examples = [...readFileSync(path.join(PLUGIN_ROOT, 'skills', 'wf', 'reference', '_api.md'), 'utf8').matchAll(/```js\n([\s\S]*?)```/g)].map((m) => m[1]);
// The arguments that each example reads, in the order of the examples.
const ARGS = [[], ['{"s1":"s","s4":"m"}'], ['retry.js']];

test('the script examples of _api.md run and give their result', () => {
  assert.equal(examples.length, ARGS.length, 'one argument list for each example');
  const top = mkdtempSync(path.join(tmpdir(), 'api-examples-'));
  const home = path.join(top, 'home');
  try {
    const f = makeFixture(path.join(top, 'repo'));
    mkdirSync(path.join(f.root, '.scratch'), { recursive: true });
    const out = examples.map((code, n) => {
      const file = path.join(f.root, '.scratch', `example-${n}.mjs`);
      writeFileSync(file, code);
      const r = spawnSync(process.execPath, [wf, 'run', f.root, file, ...ARGS[n], '--slug', SLUG, '--json'], { encoding: 'utf8', env: { ...process.env, SDLC_HOME: home } });
      assert.equal(r.status, 0, `example ${n + 1}: ${r.stderr}`);
      return JSON.parse(r.stdout).value;
    });
    assert.deepEqual(out[0], [], 'the one slice with a plan has a verify record');
    assert.deepEqual(out[1], ['s1', 's4']);
    assert.deepEqual(frontmatterOfDoc(f.dir, '03-slice.md').slices.filter((s) => s.complexity).map((s) => [s.slug, s.complexity]), [['s1', 's'], ['s4', 'm']]);
    assert.deepEqual(out[2], []);
  } finally { rmSync(top, { recursive: true, force: true }); }
});
