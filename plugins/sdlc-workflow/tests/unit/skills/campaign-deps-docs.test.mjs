// WF-CAMPAIGN-ORDER-PLAN W3, W4, W5 — the procedure of the deps phase and the brainstorm
// sequence. The brainstorm agrees no dependency graph, the campaign sends no graph change
// through the brainstorm, the confirm question has no option that skips it, and each
// section that the procedure cites exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REF = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'skills', 'wf', 'reference');
const read = (rel) => readFileSync(path.join(REF, rel), 'utf8');
const headings = (text) => new Set([...text.matchAll(/^#{2,4} (.+)$/gm)].map((m) => m[1].trim()));

test('brainstorm/_work.md names none of the four graph fields as a thing to agree', () => {
  const work = read('intake/brainstorm/_work.md');
  const table = work.slice(work.indexOf('## What 3.3 agrees for each piece'), work.indexOf('### Forms'));
  for (const f of ['depends-on', 'needs', 'provides', 'expects']) assert.doesNotMatch(table, new RegExp(`^\\| \`${f}\` \\|`, 'm'), `${f} is not a row`);
  assert.match(table, /^\| `order` \|/m);
  assert.match(table, /^\| `why-here` \|/m);
  assert.match(table, /Do not ask for `depends-on`, `needs`, `provides`, or `expects`/);
  assert.doesNotMatch(work, /A piece that another write-now piece depends on runs first/);
  assert.doesNotMatch(read('intake/brainstorm.md'), /their order, dependencies, slugs/);
});

test('the campaign sends no graph change through /wf intake brainstorm', () => {
  for (const rel of ['campaign/_phases.md', 'campaign/_waves.md']) {
    const text = read(rel);
    for (const line of text.split('\n').filter((l) => /\/wf intake brainstorm <brainstorm-slug> add/.test(l))) {
      assert.doesNotMatch(line, /needs|provides|expects|depends-on|derived/, `${rel}: ${line.slice(0, 120)}`);
    }
  }
  const phases = read('campaign/_phases.md');
  assert.match(phases, /`<cmd> deps <key> needs add --by prepare`/);
  assert.match(phases, /`<cmd> deps <key> provides set` or `<cmd> deps <key> expects set`, `--by prepare`/);
  assert.match(read('campaign/_waves.md'), /A derived needs entry stays in the ledger/);
});

test('the confirm question of the deps phase has no option that skips the confirmation (Q2)', () => {
  const phases = read('campaign/_phases.md');
  const deps = phases.slice(phases.indexOf('## Phase 0b — Deps'), phases.indexOf('## Phase 1 — Setup'));
  assert.match(deps, /There is no way to skip the confirmation/);
  assert.match(deps, /- confirm the proposal;\n {3}- change some lines \(free text\)/);
  assert.doesNotMatch(deps, /keep the serial chain\)|skip the deps|- keep the serial chain/i);
  assert.match(read('campaign/_deps.md'), /It always runs, also when the seed comes from the old packet fields/);
});

test('every section that the deps procedure cites exists', () => {
  const phases = headings(read('campaign/_phases.md'));
  for (const name of ['Phase 0 — Orient', 'Phase 0b — Deps', 'Shared paths', 'Phase 1 — Setup', 'Rolling prepare', 'Reopen pick-up']) assert.ok(phases.has(name), `_phases.md has no section "${name}"`);
  const deps = headings(read('campaign/_deps.md'));
  for (const name of ['The rules of the graph', 'Launch the scout', 'What the scout does', 'Return shape', 'Record the proposal']) assert.ok(deps.has(name), `_deps.md has no section "${name}"`);
  assert.ok(headings(read('campaign/_order.md')).has('Cross-unit reconcile'));
  assert.match(read('campaign/_order.md'), /Check first the `expected-shared` pairs that the prompt names/);
  const campaign = read('campaign.md');
  assert.match(campaign, /\| `deps` \| Phase 0b/);
  assert.match(campaign, /A wait comes from the unit's `needs` in the ledger/);
  assert.match(read('intake/_packet.md'), /lists this packet under `units` or `outside`, skip this step/);
});
