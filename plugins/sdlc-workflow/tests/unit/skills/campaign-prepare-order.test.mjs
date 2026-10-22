// WF-DESIGN-PLAN Part II A4 (DP10): the rolling prepare runs the design lane before slice,
// so that each slice can name its boards. `unit <key> prepared` stays the last step (step 6),
// because "run step 6 of the rolling prepare again" in "Design amend" points to it.
// A3 and A9: the person types each `/wf` key, and a design board gets `/wf design setup` first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REF = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'skills', 'wf', 'reference');
const read = (rel) => readFileSync(path.join(REF, rel), 'utf8');

/** The sub-steps of step 1 of "Rolling prepare", keyed by their number. */
function prepareSteps() {
  const text = read('campaign/_prepare.md');
  const section = text.slice(text.indexOf('## Rolling prepare'), text.indexOf('### Wave slicer'));
  return new Map([...section.matchAll(/^ {3}(\d)\. (.+)$/gm)].map((m) => [Number(m[1]), m[2]]));
}

test('the rolling prepare runs the design lane before slice', () => {
  const steps = prepareSteps();
  const at = (re) => [...steps].find(([, s]) => re.test(s))?.[0];
  const intake = at(/`\/wf intake <packet path>`/);
  const shape = at(/`\/wf shape <slug>`/);
  const design = at(/`\/wf design <slug>`/);
  const slice = at(/`\/wf slice <slug>`/);
  const prepared = at(/`<cmd> unit <key> prepared`/);
  for (const [name, n] of Object.entries({ intake, shape, design, slice, prepared })) assert.ok(n, `the rolling prepare has no ${name} step`);
  assert.ok(intake < shape && shape < design && design < slice && slice < prepared, `order: intake ${intake}, shape ${shape}, design ${design}, slice ${slice}, prepared ${prepared}`);
  assert.equal(prepared, 6, '"run step 6 of the rolling prepare again" still names the prepared step');
  assert.equal(prepared, Math.max(...steps.keys()), '`unit <key> prepared` is the last step');
  assert.match(steps.get(design), /`ux-impact` is not `none`/);
});

test('the prepare steps keep the pinned graph commands, and the person types each key', () => {
  const text = read('campaign/_prepare.md');
  assert.match(text, /`<cmd> deps <key> needs add --by prepare`/);
  assert.match(text, /`<cmd> deps <key> provides set` or `<cmd> deps <key> expects set`, `--by prepare`/);
  assert.match(text, /run step 6 of the rolling prepare again/);
  for (const key of ['intake <packet path>', 'shape <slug>', 'design <slug>', 'slice <slug>']) {
    assert.match(text, new RegExp(`have the person type \`/wf ${key.replace(/[<>]/g, '.')}\``, 'i'), `the person types /wf ${key}`);
  }
  assert.doesNotMatch(text, /Run `\/wf (intake|shape|slice)/, 'the session does not run a /wf key itself');
});

test('campaign.md names the prepare order, the design-setup action, and the next command', () => {
  const text = read('campaign.md');
  assert.match(text, /intake, shape, the design lane when the packet needs one, and slice/);
  assert.match(text, /^\| `design-setup` \|/m);
  assert.match(text, /When `next` has `command`, the person types that command/);
  const phases = read('campaign/_phases.md');
  const setup = phases.slice(phases.indexOf('## Phase 1 — Setup'));
  assert.match(setup, /`focus: design`, and `PRODUCT\.md` or `DESIGN\.md` is missing/);
  assert.match(setup, /Have the person type `\/wf design setup` once/);
});
