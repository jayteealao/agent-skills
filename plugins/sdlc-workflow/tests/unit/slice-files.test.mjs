// The planned files of slices: what two slices share, and the order of a roster against its files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { orderReport, pairOf, samePlace, sectionFiles, sliceFiles } from '../../lib/slice-files.mjs';

function workflow() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'wf-slice-files-'));
  const slice = (name, files) => writeFileSync(path.join(dir, `03-slice-${name}.md`),
    `---\ntype: slice\nslice-slug: ${name}\n---\n# Slice: ${name}\n\n## Goal\n\nx\n\n## Likely Files / Areas to Touch\n\n${files}\n\n## Acceptance Criteria\n\n- x\n`);
  writeFileSync(path.join(dir, '03-slice.md'), [
    '---', 'type: slice', 'slices:',
    '  - slug: api', '    status: defined', '    depends-on: []',
    '  - slug: web', '    status: defined', '    depends-on: [api]',
    '  - slug: docs', '    status: defined', '    depends-on: [api]',
    '  - slug: cli', '    status: defined', '    depends-on: []',
    '---', '',
  ].join('\n'));
  slice('api', '- `src/api/routes.js`: the new route\n- src/store: the table');
  slice('web', '- `src/web/page.js`: the page\n- `src/api/routes.js`: the client of the route');
  slice('docs', '- `README.md`: the guide');
  slice('cli', 'Unknown — plan research locates the files');
  return { dir, done: () => rmSync(dir, { recursive: true, force: true }) };
}

test('the files section gives one path per entry, and no entry for prose', () => {
  const body = '## Likely Files / Areas to Touch\n\n- `a/b.js`: why\n- c/d: why\n* e.rs — why\n\nSome prose here.\n\n## Next\n\n- `z.js`: no\n';
  assert.deepEqual(sectionFiles(body), ['a/b.js', 'c/d', 'e.rs']);
  assert.deepEqual(sectionFiles('## Likely Files / Areas to Touch\n\nUnknown — plan research locates the files\n'), []);
});

test('a folder and a file inside it are the same place', () => {
  assert.equal(samePlace('src/store', 'src/store/table.js'), true);
  assert.equal(samePlace('src/sto', 'src/store/table.js'), false);
  assert.equal(samePlace('a.js', 'a.js'), true);
});

test('the plan files of a slice win over its slice record', () => {
  const w = workflow();
  try {
    assert.deepEqual(sliceFiles(w.dir, 'api'), { files: ['src/api/routes.js', 'src/store'], source: 'slice' });
    writeFileSync(path.join(w.dir, '04-plan-api.md'), '---\ntype: plan\nfiles: [src/api/routes.js, src/api/auth.js]\n---\n# Plan\n');
    assert.deepEqual(sliceFiles(w.dir, 'api'), { files: ['src/api/routes.js', 'src/api/auth.js'], source: 'plan' });
  } finally { w.done(); }
});

test('a pair names its shared files, and is not known when one slice has no list', () => {
  const w = workflow();
  try {
    assert.deepEqual(pairOf(w.dir, 'api', 'web'), { a: 'api', b: 'web', known: true, shared: ['src/api/routes.js'] });
    assert.deepEqual(pairOf(w.dir, 'api', 'docs').shared, []);
    assert.equal(pairOf(w.dir, 'api', 'cli').known, false);
  } finally { w.done(); }
});

test('the order report names the sharing pairs and the edges with no shared file', () => {
  const w = workflow();
  try {
    const r = orderReport(w.dir);
    assert.deepEqual(r.sharing, [{ a: 'api', b: 'web', shared: ['src/api/routes.js'], ordered: true }]);
    assert.deepEqual(r.unexplained, [{ slice: 'docs', after: 'api' }]);
    assert.deepEqual(r.noList, ['cli']);
  } finally { w.done(); }
});
