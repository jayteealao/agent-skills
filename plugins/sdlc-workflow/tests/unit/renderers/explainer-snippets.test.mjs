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

test('text in a payload is escaped', () => {
  const out = run('<!-- @include explainer/sequence {"steps":[{"label":"<b>x</b>"}]} -->');
  assert.match(out, /&lt;b&gt;x&lt;\/b&gt;/);
});
