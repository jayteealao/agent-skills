// tests/helpers/extract-fn.mjs — the source of one top-level function of a Workflow script.
//
// yolo.js is a Workflow script, not a module, so a test takes a function by its braces and
// runs it with stub globals. Not a test.
import assert from 'node:assert/strict';

/**
 * The source of function `name` in `src`, from `function` (or `async function`) to its closing
 * brace. The parameter list is skipped first: a default such as `opts = {}` holds braces too.
 */
export function extractFn(src, name) {
  const m = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(src);
  assert.ok(m, `could not locate function ${name}`);
  let paren = 0;
  let bodyAt = m.index + m[0].length - 1;
  for (; bodyAt < src.length; bodyAt++) {
    if (src[bodyAt] === '(') paren++;
    else if (src[bodyAt] === ')' && --paren === 0) break;
  }
  let depth = 0;
  for (let j = src.indexOf('{', bodyAt); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(m.index, j + 1);
  }
  throw new Error(`unbalanced braces extracting ${name}`);
}
