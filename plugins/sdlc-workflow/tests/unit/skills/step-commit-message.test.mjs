// A step commit is a conventional commit about the product. It names no slug, slice or step
// number, because those are internal work names that must not reach the public history.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (...p) => readFileSync(path.join(pluginRoot, ...p), 'utf8');

test('the step commit rule asks for a conventional commit in product words', () => {
  const steps = read('skills', 'wf', 'reference', 'implement', '_steps.md');
  assert.match(steps, /`<type>: <what the step does>`/);
  assert.match(steps, /Name no slug, no slice, no step number and no finding id/);
  assert.doesNotMatch(steps, /wip\(/);
  const yolo = read('skills', 'wf', 'workflows', 'yolo.js');
  assert.match(yolo, /conventional commit about the product, \\`<type>: <what the step does>\\`/);
  assert.doesNotMatch(yolo, /wip\(/);
});

test('the review fix steps follow the same commit rule', () => {
  const stage = read('skills', 'wf', 'reference', 'review', '_stage.md');
  assert.match(stage, /`<type>: <what the fix does>`/);
  assert.doesNotMatch(stage, /review-time fixes/);
});
