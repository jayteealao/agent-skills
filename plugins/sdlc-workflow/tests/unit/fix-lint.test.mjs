// Every failure that a script prints names its repair. The lint reads the source: each
// `ok: false` result of a script carries a `fix`, and a script throws no error without one
// (a `refuse(...)` names it). A throw that marks a defect of the plugin says so with `/* defect */`:
// its fix is the generic report of a defect. A failed value that no script prints as it is (the
// result of a git call, read by its caller) says so with `/* internal */`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// The scripts that agents run from the skill prose, and the libs whose failures they print as they are.
const SCRIPTS = [
  'scripts/campaign.mjs', 'scripts/optimize.mjs', 'scripts/goal.mjs', 'scripts/ideate-sources.mjs',
  'scripts/release.mjs', 'scripts/yolo-watch.mjs', 'scripts/stage-yolo-driver.mjs', 'scripts/wf.mjs',
];

/** The text of the object literal around `at`: from its `{` to the matching `}`. */
function literalAround(src, at) {
  let depth = 0;
  let start = at;
  for (; start >= 0; start -= 1) {
    const c = src[start];
    if (c === '}') depth += 1;
    else if (c === '{') { if (depth === 0) break; depth -= 1; }
  }
  depth = 0;
  for (let end = start; end < src.length; end += 1) {
    const c = src[end];
    if (c === '{') depth += 1;
    else if (c === '}') { depth -= 1; if (depth === 0) return src.slice(start, end + 1); }
  }
  return src.slice(start);
}

const lineOf = (src, at) => src.slice(0, at).split('\n').length;

/** The `ok: false` results of a source that carry no fix: [line]. */
export function unfixedResults(src) {
  const out = [];
  for (const m of src.matchAll(/\bok: false\b/g)) {
    // A value that no script prints (the result of a git call, say) says so on its line.
    const line = src.slice(src.lastIndexOf('\n', m.index) + 1, src.indexOf('\n', m.index));
    if (/\/\* internal \*\//.test(line)) continue;
    const lit = literalAround(src, m.index);
    if (!/\bfix\s*[:,}\n]|\bfix\s*$|Fix\(/m.test(lit)) out.push(lineOf(src, m.index));
  }
  return out;
}

/** The plain throws of a source that name no fix and are not marked a defect: [line]. */
export function unfixedThrows(src) {
  const out = [];
  const lines = src.split('\n');
  lines.forEach((l, i) => {
    if (/throw new Error\(/.test(l) && !/\/\* defect \*\//.test(l)) out.push(i + 1);
  });
  return out;
}

test('the lint finds a result with no fix, and a plain throw', () => {
  assert.deepEqual(unfixedResults('const a = { ok: false, error: "x" };\nconst b = { ok: false, error: "y", fix: f };'), [1]);
  assert.deepEqual(unfixedResults('return {\n  ok: false,\n  error: e,\n  fix: agentFix("x"),\n};'), []);
  assert.deepEqual(unfixedThrows('throw new Error("x");\nthrow new Error("y"); /* defect */\nthrow refuse("z", f);'), [1]);
});

for (const rel of SCRIPTS) {
  test(`${rel}: every ok: false result names its fix, and no throw goes without one`, () => {
    const src = readFileSync(path.join(pluginRoot, rel), 'utf8');
    assert.deepEqual(unfixedResults(src), [], `${rel}: the ok: false results at these lines carry no fix`);
    assert.deepEqual(unfixedThrows(src), [], `${rel}: the throws at these lines name no fix (refuse(message, fix), or /* defect */ for a defect)`);
  });
}
