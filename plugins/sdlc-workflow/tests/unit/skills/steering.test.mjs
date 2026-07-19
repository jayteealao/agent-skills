// Drift guard for the standing-steering single source (_steering.md).
// The full contract body may exist ONLY in the canonical file of each tree; every
// stage reference that honors steering cites it by name instead. Same "single
// source or fail CI" pattern as the External Output Boundary guard (W3.1) — added
// with W6 (v9.120.0) so a second 74-copy problem can never start.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const codexRoot = path.resolve(pluginRoot, '..', 'sdlc-workflow-codex');

// The fingerprint sentence of the full contract body. It lives ONLY in the
// canonical file; the compact citation blocks deliberately paraphrase it.
const BODY_FINGERPRINT =
  "Standing steering is the user's durable, asynchronous voice in a workflow";
const CITATION_LINK = /\[_steering\.md\]\(([^)]+)\)/;

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

test('steering canonical file exists in every tree', () => {
  for (const { name, root } of trees) {
    const canonical = path.join(root, 'skills', 'wf', 'reference', '_steering.md');
    assert.ok(existsSync(canonical), `${name}: missing _steering.md`);
    const body = readFileSync(canonical, 'utf8');
    assert.ok(body.includes(BODY_FINGERPRINT), `${name}: canonical file lost the contract body`);
    assert.ok(body.includes('steering-honored'), `${name}: canonical file lost the ack field`);
  }
});

test('full steering body appears nowhere except the canonical file', () => {
  for (const { name, root } of trees) {
    const scanRoots = [path.join(root, 'skills'), path.join(root, 'commands')].filter(existsSync);
    for (const scanRoot of scanRoots) {
      for (const file of walk(scanRoot, ['.md'])) {
        if (path.basename(file) === '_steering.md') continue;
        const src = readFileSync(file, 'utf8');
        assert.ok(
          !src.includes(BODY_FINGERPRINT),
          `${name}: inlined steering body in ${path.relative(root, file)} — cite _steering.md instead`,
        );
      }
    }
  }
});

test('every steering citation link resolves to the canonical file', () => {
  for (const { name, root } of trees) {
    const scanRoots = [path.join(root, 'skills'), path.join(root, 'commands')].filter(existsSync);
    // main has 20 stage entry points; codex has 19 (no yolo).
    const minCitations = name === 'codex' ? 18 : 19;
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
          `${name}: broken _steering.md link in ${path.relative(root, file)} -> ${m[1]}`,
        );
        assert.equal(
          path.basename(target),
          '_steering.md',
          `${name}: citation in ${path.relative(root, file)} points at the wrong file`,
        );
      }
    }
    assert.ok(citations >= minCitations, `${name}: expected >=${minCitations} citation blocks, found ${citations}`);
  }
});
