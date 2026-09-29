// tests/unit/renderers/explainer-check.test.mjs — verify-fragment's light
// explainer check (W5): warnings only, unless the file does not parse.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  checkExplainer, parseFragmentTree, countSentences, countWords, SUMMARY_MAX_WORDS,
} from '../../../scripts/verify-fragment.mjs';

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

/* ── quality rules (summary length, comparison shape, include JSON) ── */

const wrap = (summary, visual = '') => [
  `<p>${summary}</p>`,
  ...(visual ? ['<p>The bars compare the options.</p>', visual] : []),
  '<p>Recap: done.</p>',
].join('\n');

test('a summary of more than five sentences or about 90 words is a warning', () => {
  const five = 'One. Two. Three. Four. Five.';
  assert.deepEqual(checkExplainer(wrap(five)).warns, []);
  const six = checkExplainer(wrap(`${five} Six.`)).warns;
  assert.ok(six.some((w) => /summary <p> has 6 sentences/.test(w)), six.join('\n'));
  const long = Array.from({ length: SUMMARY_MAX_WORDS + 1 }, (_, i) => `w${i}`).join(' ');
  const words = checkExplainer(wrap(`${long}.`)).warns;
  assert.ok(words.some((w) => new RegExp(`has ${SUMMARY_MAX_WORDS + 1} words`).test(w)), words.join('\n'));
  // Markup inside the summary counts as its text: 91 words split across tags.
  const tagged = `${long.split(' ').slice(0, 45).join(' ')} <code>${long.split(' ').slice(45).join(' ')}</code>.`;
  assert.ok(checkExplainer(wrap(tagged)).warns.some((w) => /words/.test(w)));
  assert.equal(countWords('The x slot'), 3);
  assert.equal(countSentences('It is 1.5 times faster. Done.'), 2);
});

test('a comparison with equal bars or fewer than two bars is a warning', () => {
  const cmp = (bars) => `<!-- @include explainer/comparison ${JSON.stringify({ bars })} -->`;
  assert.deepEqual(checkExplainer(wrap('A summary.', cmp([{ label: 'a', value: 3 }, { label: 'b', value: 5 }]))).warns, []);
  const equal = checkExplainer(wrap('A summary.', cmp([{ label: 'a', value: 1 }, { label: 'b', value: 1 }, { label: 'c', value: 1 }]))).warns;
  assert.ok(equal.some((w) => /bars all have the value 1; that is a list/.test(w)), equal.join('\n'));
  const one = checkExplainer(wrap('A summary.', cmp([{ label: 'a', value: 1 }]))).warns;
  assert.ok(one.some((w) => /has 1 bar; a comparison needs at least two/.test(w)), one.join('\n'));
  const none = checkExplainer(wrap('A summary.', '<!-- @include explainer/comparison {} -->')).warns;
  assert.ok(none.some((w) => /has 0 bars/.test(w)), none.join('\n'));
});

test('an @include whose JSON does not parse is a warning, not an error', () => {
  const { errs, warns } = checkExplainer(wrap('A summary.', '<!-- @include explainer/sequence {"steps":[{label:"a"}]} -->'));
  assert.deepEqual(errs, []);
  assert.ok(warns.some((w) => /@include explainer\/sequence JSON does not parse/.test(w)), warns.join('\n'));
});

test('verify-fragment CLI checks explainer paths given as arguments, with or without an agent file', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'sdlc-vf-arg-'));
  const dir = join(tmp, '.ai', 'workflows', 'feat-y');
  mkdirSync(dir, { recursive: true });
  const script = join(PLUGIN_ROOT, 'scripts', 'verify-fragment.mjs');
  const run = (...targets) => spawnSync(process.execPath, [script, ...targets], { cwd: tmp, encoding: 'utf-8' });
  try {
    // No 02-shape.md beside it: still an explainer, never a typed-contract failure.
    const file = join(dir, '02-shape.explainer.html.fragment');
    writeFileSync(file, '<p>One. Two. Three. Four. Five. Six.</p><p>Recap.</p>', 'utf-8');
    let r = run(file);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /summary <p> has 6 sentences/);
    assert.match(r.stdout, /1 fragment OK/);
    // A directory argument is walked.
    r = run(dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /02-shape\.explainer\.html\.fragment/);
    // Unparseable is the one failure.
    writeFileSync(file, '<p>a</p><div>', 'utf-8');
    r = run(file);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /does not parse/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});