// tests/unit/renderers/explainer-snippets.test.mjs — the explainer @include set
// (W5): sequence, comparison, cycle, dependency.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expand } from '../../../components/_components.mjs';

const COMPONENTS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'components');
const run = (html) => expand(html, { componentsRoot: COMPONENTS });

const CASES = {
  sequence: '{"title":"Login","steps":[{"label":"Submit","lane":"browser","text":"POST /login"},"Check password"]}',
  comparison: '{"title":"p95","unit":"ms","bars":[{"label":"Before","value":200,"tone":"bad"},{"label":"After","value":50,"tone":"ok","note":"cached"}]}',
  cycle: '{"title":"Fix loop","states":[{"label":"Run checks"},{"label":"Fix","note":"max three rounds"},{"label":"Run again","tone":"ok"}]}',
  dependency: '{"title":"Calls","nodes":[{"id":"ui","label":"UI"},{"id":"api","label":"API","note":"new"},{"id":"db","label":"DB"}],"edges":[{"from":"ui","to":"api","label":"POST"},["api","db"],["db","ui"]]}',
  layout: '{"title":"Match screen","cols":4,"rows":3,"regions":[{"label":"Score bar","col":1,"row":1,"w":4},{"label":"Pitch","col":1,"row":2,"w":3,"h":2,"tone":"ok","note":"live positions"},{"label":"Events","col":4,"row":2,"h":2,"tone":"muted"}],"caption":"The pitch keeps most of the width."}',
  trend: '{"title":"Build time","unit":"min","x":["W1","W2","W3","W4"],"series":[{"label":"Before","values":[14,15,15,16],"tone":"bad"},{"label":"After","values":[14,9,null,8],"tone":"ok"}]}',
  states: '{"title":"Order life","states":[{"id":"cart","label":"In cart"},{"id":"paid","label":"Paid","tone":"ok"},{"id":"held","label":"On hold","tone":"warn","note":"fraud check"}],"transitions":[{"from":"cart","to":"paid","label":"pay"},{"from":"paid","to":"held","label":"flag"},{"from":"held","to":"paid","label":"clear"},{"from":"cart","to":"cart","label":"edit"}]}',
  steps: '{"title":"On save","steps":[{"label":"Validate","text":"Check each field."},{"label":"Write","text":"One transaction.","tone":"ok"},"Notify"]}',
};

// Every label an author passes must reach the page (labels on every mark).
const LABELS = {
  layout: ['Match screen', 'Score bar', 'Pitch', 'live positions', 'Events', 'The pitch keeps most of the width.'],
  trend: ['Build time', 'Before', 'After', 'W1', 'W4', 'min'],
  states: ['Order life', 'In cart', 'Paid', 'On hold', 'pay', 'flag', 'clear', 'edit', 'fraud check'],
  steps: ['On save', 'Validate', 'Check each field.', 'Write', 'One transaction.', 'Notify'],
};

for (const [name, json] of Object.entries(CASES)) {
  test(`explainer/${name}: expands to theme-token HTML with no script and no doc comment`, () => {
    const out = run(`<!-- @include explainer/${name} ${json} -->`);
    assert.match(out, new RegExp(`class="xpl xpl-${name}"`));
    assert.doesNotMatch(out, /<script/i, 'no script');
    assert.doesNotMatch(out, /@include|\{\{/, 'fully expanded; the doc comment is stripped');
    assert.match(out, /var\(--/, 'uses view theme tokens');
    assert.doesNotMatch(out, /#[0-9a-f]{3,6}\b/i, 'no literal colours');
    assert.equal(run(`<!-- @include explainer/${name} ${json} -->`), out, 'deterministic');
  });
}

test('explainer/comparison: widths are percentages of the largest value', () => {
  const out = run(`<!-- @include explainer/comparison ${CASES.comparison} -->`);
  assert.match(out, /width:100%;background:var\(--high\)/);
  assert.match(out, /width:25%;background:var\(--low\)/);
  assert.match(out, /200 ms/);
});

test('explainer/cycle: one arrow per state closes the loop', () => {
  const out = run(`<!-- @include explainer/cycle ${CASES.cycle} -->`);
  assert.equal((out.match(/<path d="M /g) ?? []).length, 3);
  assert.match(out, /<li value="2"><b>Fix<\/b>: max three rounds<\/li>/);
});

test('explainer/dependency: a back-edge is dashed; nodes sit in longest-path columns', () => {
  const out = run(`<!-- @include explainer/dependency ${CASES.dependency} -->`);
  assert.equal((out.match(/stroke-dasharray:5 4/g) ?? []).length, 1);
  assert.match(out, /<rect x="20" [^>]*>[\s\S]*?UI/);
  assert.match(out, /<rect x="440" [^>]*>[\s\S]*?DB/);
  assert.match(out, /<b>API<\/b>: new/);
});

test('a folder name cannot climb out of components/', () => {
  const src = '<!-- @include explainer/../callout {"kind":"info"} -->';
  assert.equal(run(src), src, 'a name with ".." is not an include');
});

for (const [name, labels] of Object.entries(LABELS)) {
  test(`explainer/${name}: every label reaches the page; only theme tokens colour it`, () => {
    const out = run(`<!-- @include explainer/${name} ${CASES[name]} -->`);
    for (const l of labels) assert.ok(out.includes(l), `label "${l}" present`);
    assert.doesNotMatch(out, /rgba?\(|hsla?\(|\b(?:fill|stroke|color|background)\s*[:=]\s*"?(?!var\(|none\b|url\()[a-z]+\b/i,
      'no named or functional colours');
    for (const svg of out.match(/<svg[\s\S]*?<\/svg>/g) ?? []) {
      assert.match(svg, /<title[^>]*>[^<]+<\/title>/, 'every SVG has a <title>');
    }
  });
}

test('explainer/layout: a region spans its grid lines; bad numbers clamp into the grid', () => {
  const out = run(`<!-- @include explainer/layout ${CASES.layout} -->`);
  assert.match(out, /repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(out, /grid-area:2 \/ 1 \/ span 2 \/ span 3;[^"]*border:1.5px solid var\(--low\)[^"]*background:var\(--low-bg\)/);
  const bad = run('<!-- @include explainer/layout {"cols":2,"regions":[{"label":"Wide","col":9,"row":-3,"w":40}]} -->');
  assert.match(bad, /grid-area:1 \/ 2 \/ span 1 \/ span 1/);
  const auto = run('<!-- @include explainer/layout {"regions":[{"label":"A","col":2,"row":3,"w":2}]} -->');
  assert.match(auto, /repeat\(3,minmax\(0,1fr\)\);grid-template-rows:repeat\(3,/, 'cols and rows default to the extent');
});

test('explainer/trend: axes from the data, a gap for a missing value, a legend for two series', () => {
  const out = run(`<!-- @include explainer/trend ${CASES.trend} -->`);
  // Data 8..16 → ticks 8, 10, 12, 14, 16.
  for (const t of ['8', '10', '12', '14', '16']) assert.match(out, new RegExp(`text-anchor="end"[^>]*>${t}</text>`));
  // The "After" line restarts after the null value (a second M).
  const after = out.match(/<path d="([^"]+)" style="fill:none;stroke:var\(--low\)/)[1];
  assert.equal((after.match(/M /g) ?? []).length, 2);
  assert.match(out, /border-top:3px solid var\(--high\)/, 'legend swatch, first series solid');
  assert.match(out, /border-top:3px dashed var\(--low\)/, 'second series dashed');
  assert.match(out, /<title>After: W2 = 9 min<\/title>/, 'each point names itself');
  assert.match(out, /<desc [^>]*>Before: 14 min at W1 to 16 min at W4; After: 14 min at W1 to 8 min at W4<\/desc>/);
  const one = run('<!-- @include explainer/trend {"x":["a","b"],"series":[{"label":"Only","values":[1,2]}]} -->');
  assert.doesNotMatch(one, /border-top:3px/, 'no legend for one series');
  const fixed = run('<!-- @include explainer/trend {"x":["a","b"],"series":[{"label":"S","values":[3,4]}],"min":0,"max":10} -->');
  assert.match(fixed, />0<\/text>/);
  assert.match(fixed, />10<\/text>/);
  const flat = run('<!-- @include explainer/trend {"x":["a"],"series":[{"label":"S","values":[5]}]} -->');
  assert.match(flat, /<circle /, 'a single point still draws');
  assert.doesNotMatch(flat, /NaN|Infinity/);
});

test('explainer/states: forward moves point right, a back move curves below, a self move loops above', () => {
  const out = run(`<!-- @include explainer/states ${CASES.states} -->`);
  assert.equal((out.match(/<path d="M /g) ?? []).length, 4, 'one path per transition');
  assert.match(out, /<rect x="20" y="46" [^>]*stroke-width:2.6/, 'the first state is the start (thicker border)');
  assert.match(out, /<li><b>On hold<\/b>: fraud check<\/li>/);
  assert.match(out, /<desc [^>]*>In cart to Paid on pay; Paid to On hold on flag; On hold to Paid on clear; In cart to In cart on edit<\/desc>/);
  const unknown = run('<!-- @include explainer/states {"states":["a","b"],"transitions":[["a","zzz"],["a","b"]]} -->');
  assert.equal((unknown.match(/<path d="M /g) ?? []).length, 1, 'a transition to an unknown state is dropped');
});

test('explainer/steps: emits the data-ex-steps contract; every step shows without the runtime', () => {
  const out = run(`<!-- @include explainer/steps ${CASES.steps} -->`);
  assert.match(out, /<ol data-ex-steps aria-label="On save"/);
  assert.equal((out.match(/<li data-ex-step /g) ?? []).length, 3);
  assert.doesNotMatch(out, /\shidden[\s=>]/, 'no step is hidden in the markup');
  assert.match(out, /border-left:3px solid var\(--low\)/, 'tone colours the step');
});

test('a new explainer snippet with invalid JSON throws a named error', () => {
  for (const name of ['layout', 'trend', 'states', 'steps']) {
    assert.throws(() => run(`<!-- @include explainer/${name} {"title": } -->`), new RegExp(`@include explainer/${name}: invalid JSON`));
  }
});

test('the new snippets survive empty or odd payloads', () => {
  for (const name of ['layout', 'trend', 'states', 'steps']) {
    for (const payload of ['{}', '{"regions":"x","series":3,"states":null,"steps":{}}']) {
      const out = run(`<!-- @include explainer/${name} ${payload} -->`);
      assert.match(out, new RegExp(`class="xpl xpl-${name}"`));
      assert.doesNotMatch(out, /NaN|undefined|Infinity/);
    }
  }
});

test('text in a payload is escaped', () => {
  const out = run('<!-- @include explainer/sequence {"steps":[{"label":"<b>x</b>"}]} -->');
  assert.match(out, /&lt;b&gt;x&lt;\/b&gt;/);
});
