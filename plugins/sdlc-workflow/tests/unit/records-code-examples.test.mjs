// Every code example of skills/wf/reference/_records.md runs in code mode (lib/ops/code-host.mjs)
// on the fixture of the code-mode eval, so an example that the library no longer accepts fails here.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PLUGIN_ROOT, SLUG, makeFixture } from '../evals/code-mode/fixture.mjs';
import { frontmatterOfDoc } from '../../lib/records.mjs';
import { permissionFlag, runCode } from '../../lib/ops/code-host.mjs';

const text = readFileSync(path.join(PLUGIN_ROOT, 'skills', 'wf', 'reference', '_records.md'), 'utf8');
const examples = [...text.matchAll(/\(`(wf_query|wf_run)`\):\n\n```js\n([\s\S]*?)```/g)].map((m) => ({ tool: m[1], code: m[2] }));

test('the code examples of _records.md run and give their result', { skip: permissionFlag() ? false : 'no permission model in this Node' }, async () => {
  assert.equal(examples.length, 3);
  const top = mkdtempSync(path.join(tmpdir(), 'records-examples-'));
  const saved = { ...process.env };
  Object.assign(process.env, { SDLC_HOME: path.join(top, 'home'), WF_ACTOR: 'agent' });
  try {
    const f = makeFixture(path.join(top, 'repo'));
    const out = [];
    for (const e of examples) {
      const r = await runCode(f.root, { slug: SLUG, code: e.code, mode: e.tool === 'wf_run' ? 'run' : 'query' });
      assert.equal(r.ok, true, `${e.tool}: ${r.error}`);
      out.push(r.value);
    }
    assert.deepEqual(out[0], [], 'the one slice with a plan has a verify record');
    assert.deepEqual(out[1], ['s1', 's4']);
    assert.deepEqual(frontmatterOfDoc(f.dir, '03-slice.md').slices.filter((s) => s.complexity).map((s) => [s.slug, s.complexity]), [['s1', 's'], ['s4', 'm']]);
    assert.deepEqual(out[2], []);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
    rmSync(top, { recursive: true, force: true });
  }
});
