// The pure parts of the campaign live view (hooks/mod/live/model/campaign.ts),
// run under `node --experimental-strip-types --test`. The wrapper
// tests/unit/mod/live-campaign-mod.test.mjs spawns this file; run-all.mjs never
// runs it directly (no `.test.mjs` suffix).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildCampaignModel, childFieldOf, designSettledOf, fieldOf, listFieldOf, packetOf } from '../../../hooks/mod/live/model/campaign.ts';

const LIVENESS = { state: 'none', lastLineAt: null, limitMs: 0, lastLine: null, beats: [] };

const fact = (key, state, rest = {}) => ({ key, slug: `s-${key}`, title: key, form: 'intake', state, order: 0, packetUxImpact: 'none', indexText: null, craftText: null, ...rest });

test('the list index: its type, and its packets as a block list or in flow', () => {
  const block = '---\nschema: sdlc/v1\ntype: list\nslug: camp\npackets:\n  - p1\n  - "p2"\nslugs:\n  - a\nlist-branch: packets/camp\n---\n# List\n';
  assert.equal(fieldOf(block, 'type'), 'list');
  assert.equal(fieldOf(block, 'list-branch'), 'packets/camp');
  assert.deepEqual(listFieldOf(block, 'packets'), ['p1', 'p2']);
  assert.deepEqual(listFieldOf('---\ntype: list\npackets: []\n---\n', 'packets'), []);
  assert.deepEqual(listFieldOf('---\npackets: [p1, p2]\n---\n', 'packets'), ['p1', 'p2']);
  assert.deepEqual(listFieldOf('no frontmatter', 'packets'), []);
});

test('a quoted field keeps its #, a plain one ends at its comment, and a child field is read under its parent only', () => {
  const text = '---\ntitle: "Fix #12: the clock"\nstate: open # set by start\nprogress:\n  design: skipped\ndesign: other\n---\n';
  assert.equal(fieldOf(text, 'title'), 'Fix #12: the clock');
  assert.equal(fieldOf(text, 'state'), 'open');
  assert.equal(childFieldOf(text, 'progress', 'design'), 'skipped');
  assert.equal(childFieldOf(text, 'stack', 'design'), null);
});

test('design is settled by a skip with a reason or by a confirmed contract; a reopened design is not', () => {
  const skipped = '---\nprogress:\n  design: skipped\ndesign-skip-reason: ux-impact none\n---\n';
  const bare = '---\nprogress:\n  design: skipped\n---\n';
  const reopened = '---\nprogress:\n  design: in-progress\n---\n';
  const contract = '---\nimage-gate: skipped: no screens\ndirection-confirmed-by: jayte\n---\n';
  assert.equal(designSettledOf(skipped, null), true);
  assert.equal(designSettledOf(bare, null), false);
  assert.equal(designSettledOf('---\nux-impact: visual\n---\n', contract), true);
  assert.equal(designSettledOf(reopened, contract), false);
  assert.equal(designSettledOf('---\n---\n', '---\nimage-gate: pass\n---\n'), false);
});

test('a build packet needs design once its workflow names a ux-impact other than none and has not settled it', () => {
  const visual = '---\nux-impact: visual\n---\n';
  assert.equal(packetOf(fact('a', 'open', { indexText: visual })).designNeeded, true);
  assert.equal(packetOf(fact('a', 'open', { indexText: '---\nux-impact: none\n---\n' })).designNeeded, false);
  // Not opened yet: no workflow to design. The row still shows the packet file's ux-impact.
  const written = packetOf(fact('a', 'written', { packetUxImpact: 'flow' }));
  assert.equal(written.designNeeded, false);
  assert.equal(written.uxImpact, 'flow');
  assert.equal(packetOf(fact('a', 'done', { indexText: visual })).designNeeded, false);
  assert.equal(packetOf(fact('a', 'open', { indexText: visual, form: 'investigate' })).designNeeded, false);
});

test('the model keeps the list order, names the first unfinished packet, and puts unlisted packets last by their order', () => {
  const model = buildCampaignModel({
    slug: 'camp',
    order: ['b', 'a'],
    packets: [fact('z', 'written', { order: 9 }), fact('a', 'open'), fact('b', 'dropped'), fact('y', 'written', { order: 1 })],
    liveness: LIVENESS,
    dismissed: [],
  });
  assert.deepEqual(model.packets.map((packet) => packet.key), ['b', 'a', 'y', 'z']);
  assert.equal(model.current, 'a');
  assert.deepEqual(model.needs, []);
});
