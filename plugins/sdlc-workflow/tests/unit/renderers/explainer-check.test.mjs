// tests/unit/renderers/explainer-check.test.mjs — verify-fragment's light
// explainer check (W5): warnings only, unless the file does not parse.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { checkExplainer, parseFragmentTree } from '../../../scripts/verify-fragment.mjs';

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const GOOD = [
  '<p>The slice passed. One browser was not checked.</p>',
  '<p>The loop shows the fix rounds.</p>',
  '<!-- @include explainer/cycle {"states":[{"label":"Run"},{"label":"Fix"}]} -->',
  '<p>The graph shows what calls what.</p>',
  '<figure><svg viewBox="0 0 10 10"><rect x="1" y="1" width="2" height="2"/></svg><figcaption>Calls</figcaption></figure>',
  '<p>Recap: ready for review.</p>',
].join('\n');

test('a well-formed explainer passes with no warnings', () => {
  assert.deepEqual(checkExplainer(GOOD), { errs: [], warns: [] });
  // A single wrapper element is looked through.
  assert.deepEqual(checkExplainer(`<div class="x">${GOOD}</div>`), { errs: [], warns: [] });
});

test('missing summary, missing lead sentence and missing recap are warnings', () => {
  const { errs, warns } = checkExplainer('<figure><svg></svg></figure>\n<!-- @include explainer/sequence {"steps":[]} -->\n<ul><li>x</li></ul>');
  assert.deepEqual(errs, []);
  assert.ok(warns.some((w) => /summary <p>/.test(w)), 'summary first');
  assert.ok(warns.some((w) => /before <figure>/.test(w)), 'sentence before the figure');
  assert.ok(warns.some((w) => /before @include explainer\/sequence/.test(w)), 'sentence before the include');
  assert.ok(warns.some((w) => /recap/.test(w)), 'recap last');
});

test('document tags and scripts are warnings', () => {
  const { errs, warns } = checkExplainer('<html><body><p>a</p><script>x()</script><p>b</p></body></html>');
  assert.deepEqual(errs, []);
  assert.ok(warns.some((w) => /<html>/.test(w)));
  assert.ok(warns.some((w) => /<body>/.test(w)));
  assert.ok(warns.some((w) => /never runs/.test(w)));
});

test('an explainer that does not parse is the one error', () => {
  assert.match(checkExplainer('<p>a</p><div><p>b</p>').errs[0], /does not parse: unclosed <div>/);
  assert.match(checkExplainer('<p>a</span>').errs[0], /unexpected <\/span>/);
  assert.throws(() => parseFragmentTree('<p>a <!-- no end'), /unclosed comment/);
  // Implied end tags (<p>, <li>) are allowed.
  assert.doesNotThrow(() => parseFragmentTree('<ul><li>a<li>b</ul><p>c'));
});

test('verify-fragment CLI: explainer warnings exit 0, an unparseable explainer exits 1', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'sdlc-vf-xpl-'));
  const root = join(tmp, '.ai', 'workflows', 'feat-x');
  mkdirSync(root, { recursive: true });
  const script = join(PLUGIN_ROOT, 'scripts', 'verify-fragment.mjs');
  const run = () => spawnSync(process.execPath, [script, '--root', join(tmp, '.ai', 'workflows')], { cwd: tmp, encoding: 'utf-8' });
  try {
    writeFileSync(join(root, '06-verify-a.md'), '---\ntype: verify\n---\nx\n', 'utf-8');
    writeFileSync(join(root, '06-verify-a.explainer.html.fragment'), '<figure></figure>', 'utf-8');
    const warnRun = run();
    assert.equal(warnRun.status, 0, warnRun.stderr);
    assert.match(warnRun.stdout, /explainer: open with a plain summary/);
    writeFileSync(join(root, '06-verify-a.explainer.html.fragment'), '<p>a</p><div>', 'utf-8');
    const errRun = run();
    assert.equal(errRun.status, 1);
    assert.match(errRun.stderr, /does not parse/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
