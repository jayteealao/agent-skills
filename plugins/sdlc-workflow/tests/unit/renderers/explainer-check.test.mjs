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
  explainerKind, isMostlyNumbers, EXPLAINER_SNIPPETS, BODY_MIN_WORDS,
} from '../../../scripts/verify-fragment.mjs';

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const GOOD = [
  '<p>The slice passed. One browser was not checked.</p>',
  '<p>The loop shows the fix rounds.</p>',
  '<!-- @include explainer/cycle {"states":[{"label":"Run"},{"label":"Fix"}]} -->',
  '<p>The graph shows what calls what.</p>',
  '<figure><svg viewBox="0 0 10 10"><title>Calls</title><rect x="1" y="1" width="2" height="2" fill="var(--accent)"/></svg><figcaption>Calls</figcaption></figure>',
  '<p>Recap: ready for review.</p>',
].join('\n');

test('a well-formed explainer passes with no warnings', () => {
  assert.deepEqual(checkExplainer(GOOD), { errs: [], warns: [] });
  // A single wrapper element is looked through.
  assert.deepEqual(checkExplainer(`<div class="x">${GOOD}</div>`), { errs: [], warns: [] });
});

test('missing summary, missing lead sentence and missing recap are warnings', () => {
  const { errs, warns } = checkExplainer('<figure><svg></svg></figure>\n<!-- @include explainer/sequence {"steps":[]} -->\n<div>x</div>');
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
  assert.ok(warns.some((w) => /never run/.test(w)));
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

test('a summary of more than three sentences or about 70 words is a warning', () => {
  const three = 'One. Two. Three.';
  assert.deepEqual(checkExplainer(wrap(three)).warns, []);
  const four = checkExplainer(wrap(`${three} Four.`)).warns;
  assert.ok(four.some((w) => /summary <p> has 4 sentences/.test(w)), four.join('\n'));
  const long = Array.from({ length: SUMMARY_MAX_WORDS + 1 }, (_, i) => `w${i}`).join(' ');
  const words = checkExplainer(wrap(`${long}.`)).warns;
  assert.ok(words.some((w) => new RegExp(`has ${SUMMARY_MAX_WORDS + 1} words`).test(w)), words.join('\n'));
  // Markup inside the summary counts as its text: 71 words split across tags.
  const tagged = `${long.split(' ').slice(0, 35).join(' ')} <code>${long.split(' ').slice(35).join(' ')}</code>.`;
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

/* ── explainer v2 contract (floors, visuals, free SVG, data-ex) ───── */

// `n` words of plain prose, split into short sentences.
const prose = (n) => {
  const words = Array.from({ length: n }, (_, i) => `word${i}`);
  const out = [];
  for (let i = 0; i < words.length; i += 10) out.push(`${words.slice(i, i + 10).join(' ')}.`);
  return out.join(' ');
};
const SVG = '<svg viewBox="0 0 10 10"><title>The parts</title><rect width="2" height="2" fill="var(--accent)"/></svg>';
const INCLUDE = '<!-- @include explainer/cycle {"states":[{"label":"Run"},{"label":"Fix"}]} -->';
// An explainer: a summary, `visuals` each led by a sentence, about `bodyWords` of body, a recap.
const explainer = ({ bodyWords = 300, visuals = [SVG, INCLUDE], extra = '' } = {}) => {
  const leads = visuals.map((v) => `<p>The picture shows the parts.</p>\n${v}`);
  const leadWords = visuals.length * 5 + 3; // lead sentences + "Recap: ideas restated."
  return [
    '<p>The engine runs modules. Each one is swappable.</p>',
    `<p>${prose(Math.max(0, bodyWords - leadWords))}</p>`,
    ...leads,
    extra,
    '<p>Recap: ideas restated.</p>',
  ].filter(Boolean).join('\n');
};

test('explainerKind: per-slice stems vs stage and master stems', () => {
  for (const f of ['03-slice-core', '04-plan-core', '05-implement-a-b', '06-verify-x', '07-review-core']) {
    assert.equal(explainerKind(`.ai/workflows/d/${f}.explainer.html.fragment`), 'slice', f);
  }
  for (const f of ['01-intake', '02-shape', '03-slice', '04-plan', '07-review', '09-ship-run-r1', '10-retro']) {
    assert.equal(explainerKind(`C:\\r\\.ai\\workflows\\d\\${f}.explainer.html.fragment`), 'stage', f);
  }
  assert.equal(explainerKind(null), null);
  assert.equal(explainerKind('02-shape.md'), null);
  assert.equal(EXPLAINER_SNIPPETS.length, 8);
});

test('body floor: 250 words for a stage explainer, 150 for a per-slice one, only with a file name', () => {
  const stage = '02-shape.explainer.html.fragment';
  const slice = '05-implement-core.explainer.html.fragment';
  assert.deepEqual(checkExplainer(explainer({ bodyWords: 260 }), stage).warns, []);
  const thin = checkExplainer(explainer({ bodyWords: 200 }), stage).warns;
  assert.ok(thin.some((w) => /body has 20\d words beyond the summary; a stage explainer needs about 250/.test(w)), thin.join('\n'));
  assert.deepEqual(checkExplainer(explainer({ bodyWords: 160, visuals: [SVG] }), slice).warns, []);
  const thinSlice = checkExplainer(explainer({ bodyWords: 100, visuals: [SVG] }), slice).warns;
  assert.ok(thinSlice.some((w) => /a per-slice explainer needs about 150/.test(w)), thinSlice.join('\n'));
  // No file name: no kind, no floor.
  assert.deepEqual(checkExplainer(explainer({ bodyWords: 20 })).warns, []);
  // Include JSON never counts as body words.
  const steps = Array.from({ length: 80 }, (_, i) => ({ label: `step ${i}`, text: 'many words here' }));
  const json = `<!-- @include explainer/sequence ${JSON.stringify({ steps })} -->`;
  const padded = checkExplainer(explainer({ bodyWords: 100, visuals: [SVG, json] }), stage).warns;
  assert.ok(padded.some((w) => /body has/.test(w)), padded.join('\n'));
  assert.equal(BODY_MIN_WORDS.slice, 150);
});

test('visual floor: two for a stage explainer, one for a per-slice one; no-visual comment escapes', () => {
  const stage = '08-handoff.explainer.html.fragment';
  const slice = '06-verify-core.explainer.html.fragment';
  const one = checkExplainer(explainer({ visuals: [SVG] }), stage).warns;
  assert.ok(one.some((w) => /1 visual; a stage explainer normally has two or more — add a visual for each part with structure/.test(w)), one.join('\n'));
  const none = checkExplainer(explainer({ visuals: [] }), slice).warns;
  assert.ok(none.some((w) => /0 visuals; a per-slice explainer needs at least one/.test(w)), none.join('\n'));
  assert.deepEqual(checkExplainer(explainer({ visuals: [INCLUDE] }), slice).warns, []);
  const escaped = checkExplainer(explainer({ visuals: [], extra: '<!-- no-visual: a single fact, nothing to draw -->' }), slice).warns;
  assert.deepEqual(escaped, []);
  // An empty no-visual comment is not a reason.
  assert.ok(checkExplainer(explainer({ visuals: [], extra: '<!-- no-visual: -->' }), slice).warns.some((w) => /0 visuals/.test(w)));
  // An unknown snippet is not a visual, and is itself a warning.
  const unknown = checkExplainer(explainer({ visuals: [SVG, '<!-- @include explainer/pie {"x":1} -->'] }), stage).warns;
  assert.ok(unknown.some((w) => /explainer\/pie is not a known snippet/.test(w)), unknown.join('\n'));
  assert.ok(unknown.some((w) => /1 visual;/.test(w)), unknown.join('\n'));
  // Every known snippet counts.
  for (const name of EXPLAINER_SNIPPETS) {
    const data = name === 'comparison' ? '{"bars":[{"label":"a","value":1},{"label":"b","value":2}]}' : '{}';
    assert.deepEqual(checkExplainer(explainer({ visuals: [SVG, `<!-- @include explainer/${name} ${data} -->`] }), stage).warns, [], name);
  }
});

test('interactive data-ex blocks count as visuals; frames inside them do not double count', () => {
  const slider = [
    '<div><input type="range" data-ex-slider="dose" min="0" max="2" step="1" value="0"><span data-ex-value="dose"></span>',
    `<div data-ex-frames="dose"><div data-ex-frame="0">${SVG}</div><div data-ex-frame="1">${SVG}</div></div></div>`,
  ].join('');
  const toggle = '<div><button data-ex-toggle="v" data-ex-show="a">A</button><button data-ex-toggle="v" data-ex-show="b">B</button>'
    + '<div data-ex-panel="v" data-ex-key="a">Before</div><div data-ex-panel="v" data-ex-key="b">After</div></div>';
  const steps = '<ol data-ex-steps><li data-ex-step>First</li><li data-ex-step>Second</li></ol>';
  const stage = '02-shape.explainer.html.fragment';
  assert.deepEqual(checkExplainer(explainer({ visuals: [slider, toggle] }), stage).warns, []);
  assert.deepEqual(checkExplainer(explainer({ visuals: [steps, INCLUDE] }), stage).warns, []);
  // A slider with two SVG frames is still one visual.
  const w = checkExplainer(explainer({ visuals: [slider] }), stage).warns;
  assert.ok(w.some((x) => /1 visual;/.test(x)), w.join('\n'));
});

test('toggle panels and slider frames as sibling blocks share the one lead sentence of their group', () => {
  const flat = [
    '<p>Before and after.</p>',
    '<div><button data-ex-toggle="v" data-ex-show="a">A</button><button data-ex-toggle="v" data-ex-show="b">B</button></div>',
    '<div data-ex-panel="v" data-ex-key="a">Before</div>',
    '<div data-ex-panel="v" data-ex-key="b">After</div>',
    '<p>Move the slider.</p>',
    '<label>Depth <input type="range" data-ex-slider="d" min="1" max="2" step="1" value="1"></label>',
    `<div data-ex-frames="d"><div data-ex-frame="1">${SVG}</div><div data-ex-frame="2">${SVG}</div></div>`,
  ].join('\n');
  const warns = checkExplainer(wrap('A summary.', flat)).warns;
  assert.ok(!warns.some((w) => /put one <p> sentence before/.test(w)), warns.join('\n'));
  // A panel with no interactive block before it still needs its own lead sentence.
  const lone = checkExplainer(wrap('A summary.', `<p>Intro.</p>\n${SVG}\n<div data-ex-panel="v" data-ex-key="a">${SVG}</div>`)).warns;
  assert.ok(lone.some((w) => /put one <p> sentence before <div>/.test(w)), lone.join('\n'));
});

test('data-ex markup sanity: slider without frames, toggle without panel, steps under two', () => {
  const bad = [
    '<p>Slide it.</p>', '<div><input type="range" data-ex-slider="g" min="0" max="1"></div>',
    '<p>Toggle it.</p>', '<div><button data-ex-toggle="t" data-ex-show="a">A</button></div>',
    '<p>Step it.</p>', '<div data-ex-steps><div data-ex-step>Only</div></div>',
  ].join('\n');
  const { errs, warns } = checkExplainer(wrap('A summary.', bad));
  assert.deepEqual(errs, []);
  assert.ok(warns.some((w) => /data-ex-slider="g" has no \[data-ex-frames="g"\]/.test(w)), warns.join('\n'));
  assert.ok(warns.some((w) => /data-ex-toggle="t" has no \[data-ex-panel="t"\]/.test(w)), warns.join('\n'));
  assert.ok(warns.some((w) => /\[data-ex-steps\] block has 1 \[data-ex-step\]/.test(w)), warns.join('\n'));
});

test('free SVG: needs a <title> and theme tokens, not hard-coded colours', () => {
  const lead = (v) => wrap('A summary.', v);
  assert.deepEqual(checkExplainer(lead(SVG)).warns, []);
  const untitled = checkExplainer(lead('<svg><rect fill="var(--ok)"/></svg>')).warns;
  assert.ok(untitled.some((w) => /<svg> #1 has no <title>/.test(w)), untitled.join('\n'));
  for (const bad of [
    '<rect fill="#ff0000"/>', '<rect stroke="rgb(1,2,3)"/>', '<rect fill="red"/>',
    '<rect style="fill: steelblue"/>', '<style>.a { stroke: #333; }</style>',
  ]) {
    const w = checkExplainer(lead(`<svg><title>t</title>${bad}</svg>`)).warns;
    assert.ok(w.some((x) => /hard-codes colours .*use theme tokens/.test(x)), `${bad}: ${w.join('\n')}`);
  }
  for (const good of ['fill="none"', 'stroke="currentColor"', 'fill="var(--bad, #c00)"', 'fill="url(#g)"', 'style="stroke: var(--line)"']) {
    assert.deepEqual(checkExplainer(lead(`<svg><title>t</title><rect ${good}/></svg>`)).warns, [], good);
  }
});

test('a <script> is a warning that names the one runtime script', () => {
  const w = checkExplainer(wrap('A summary.', '<script src="x.js"></script>')).warns;
  assert.ok(w.some((x) => /remove the <script>.*assets\/explainer\.js.*data-ex-\*/.test(x)), w.join('\n'));
});

test('recap: the last <p> or list; mostly numbers is a warning', () => {
  const body = '<p>One. Two.</p>\n<p>Middle.</p>\n';
  assert.deepEqual(checkExplainer(`${body}<ul><li>Modules swap cleanly.</li><li>Replays are unchanged.</li></ul>`).warns, []);
  const counts = checkExplainer(`${body}<p>Recap: 22/22, 728 tests, 289 ms, 3.2%.</p>`).warns;
  assert.ok(counts.some((w) => /recap is mostly numbers; restate the ideas, not the counts/.test(w)), counts.join('\n'));
  const listCounts = checkExplainer(`${body}<ul><li>22/22</li><li>728 tests</li><li>3.2%</li></ul>`).warns;
  assert.ok(listCounts.some((w) => /mostly numbers/.test(w)), listCounts.join('\n'));
  assert.deepEqual(checkExplainer(`${body}<p>Recap: 22 fixtures still match, so behaviour is unchanged.</p>`).warns, []);
  assert.equal(isMostlyNumbers('1 2 three'), true);
  assert.equal(isMostlyNumbers('1 two three'), false);
});

test('verify-fragment CLI applies the per-slice floors from the file name', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'sdlc-vf-floor-'));
  const dir = join(tmp, '.ai', 'workflows', 'feat-z');
  mkdirSync(dir, { recursive: true });
  const script = join(PLUGIN_ROOT, 'scripts', 'verify-fragment.mjs');
  try {
    const file = join(dir, '04-plan-core.explainer.html.fragment');
    writeFileSync(file, '<p>The plan is short. It has two steps.</p>\n<p>Recap: two steps.</p>', 'utf-8');
    const r = spawnSync(process.execPath, [script, file], { cwd: tmp, encoding: 'utf-8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /a per-slice explainer needs about 150/);
    assert.match(r.stdout, /0 visuals; a per-slice explainer needs at least one/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});