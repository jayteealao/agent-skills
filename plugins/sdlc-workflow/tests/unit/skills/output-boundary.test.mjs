// Drift guard for the External Output Boundary single source (_output-boundary.md).
// The full rule body may exist ONLY in the canonical file of each tree; every other
// skill/command file must cite it. This is the same "single source or fail CI" pattern
// that ended the doc-site drift.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const codexRoot = path.resolve(pluginRoot, '..', 'sdlc-workflow-codex');

// The fingerprint sentence of the full rule body. The compressed sub-agent restatement
// in workflows/yolo.js deliberately words it differently and is the sanctioned exception.
const BODY_FINGERPRINT =
  'Workflow artifacts and command internals are private implementation context.';
const CITATION_LINK = /\[_output-boundary\.md\]\(([^)]+)\)/;

function* walk(dir, exts) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p, exts);
    else if (exts.some((e) => p.endsWith(e))) yield p;
  }
}

const trees = [
  { name: 'main', root: pluginRoot },
  { name: 'codex', root: codexRoot },
].filter((t) => existsSync(path.join(t.root, 'skills')));

test('EOB canonical file exists in every tree', () => {
  for (const { name, root } of trees) {
    const canonical = path.join(root, 'skills', 'wf', 'reference', '_output-boundary.md');
    assert.ok(existsSync(canonical), `${name}: missing _output-boundary.md`);
    const body = readFileSync(canonical, 'utf8');
    assert.ok(body.includes(BODY_FINGERPRINT), `${name}: canonical file lost the rule body`);
    assert.ok(body.includes('.ai/**'), `${name}: canonical file lost the path predicate`);
  }
});

test('full EOB body appears nowhere except the canonical file', () => {
  for (const { name, root } of trees) {
    const scanRoots = [path.join(root, 'skills'), path.join(root, 'commands')].filter(existsSync);
    for (const scanRoot of scanRoots) {
      for (const file of walk(scanRoot, ['.md'])) {
        if (path.basename(file) === '_output-boundary.md') continue;
        const src = readFileSync(file, 'utf8');
        assert.ok(
          !src.includes(BODY_FINGERPRINT),
          `${name}: inlined EOB body in ${path.relative(root, file)} — cite _output-boundary.md instead`,
        );
      }
    }
  }
});

test('every EOB citation link resolves to the canonical file', () => {
  for (const { name, root } of trees) {
    const scanRoots = [path.join(root, 'skills'), path.join(root, 'commands')].filter(existsSync);
    let citations = 0;
    for (const scanRoot of scanRoots) {
      for (const file of walk(scanRoot, ['.md'])) {
        const src = readFileSync(file, 'utf8');
        const m = src.match(CITATION_LINK);
        if (!m) continue;
        citations++;
        const target = path.resolve(path.dirname(file), m[1]);
        assert.ok(
          existsSync(target),
          `${name}: broken _output-boundary.md link in ${path.relative(root, file)} -> ${m[1]}`,
        );
        assert.equal(
          path.basename(target),
          '_output-boundary.md',
          `${name}: citation in ${path.relative(root, file)} points at the wrong file`,
        );
      }
    }
    assert.ok(citations >= 60, `${name}: expected >=60 citation blocks, found ${citations}`);
  }
});
