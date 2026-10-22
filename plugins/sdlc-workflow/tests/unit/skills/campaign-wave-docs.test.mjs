// WF-CAMPAIGN-DRIVER-PLAN W6 — the references of the wave driver. Each agent of
// campaign-wave.js follows a section of campaign/_drive.md or campaign/_boundary.md by
// its name, so every name that a prompt cites must be a heading of that file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const skill = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'skills', 'wf');
const read = (rel) => readFileSync(path.join(skill, rel), 'utf8').replace(/\r\n/g, '\n');
const driver = read('workflows/campaign-wave.js');
// A prompt written as `...` + `...` across lines, as one string.
const flat = (src) => src.replace(/`\s*\+\s*\n\s*`/g, '');
const headings = (text) => new Set([...text.matchAll(/^#{2,3} (.+)$/gm)].map((m) => m[1].trim()));

// `${DRIVE_PROC}, "Park"` and `${DRIVE_PROC}, section "Resume actions"`, with the name on the same line or the next.
function cited(constName) {
  const names = new Set();
  const re = new RegExp(`\\$\\{${constName}\\}[^"\`]*?(?:section )?"([^"]+?)(?:"|\` \\+\\n\\s*\`([^"]*)")`, 'g');
  for (const m of driver.matchAll(re)) names.add((m[1] + (m[2] ? m[2] : '')).replace(/, step \d+$/, '').trim());
  // A name with a template expression comes from the caller; common(step) covers it.
  return new Set([...names].filter((n) => !n.includes('${')));
}

test('every _drive.md section that a wave driver prompt cites is a heading of _drive.md', () => {
  const have = headings(read('reference/campaign/_drive.md'));
  const want = cited('DRIVE_PROC');
  // WF-SUBPROCEDURE-AUDIT AQ2: _drive.md keeps only the part that the resolve agent reads.
  want.add('Resume actions');
  for (const name of want) assert.ok(have.has(name), `_drive.md has no section "${name}"`);
});

// WF-CAMPAIGN-SLICE-ORDER-PLAN 4.10: the order sections moved from _drive.md to _order.md.
test('every _order.md section that a wave driver prompt cites is a heading of _order.md', () => {
  const have = headings(read('reference/campaign/_order.md'));
  const want = cited('ORDER_PROC');
  for (const name of ['Pair kinds', 'Cross-unit reconcile', 'Derived needs', 'Merge notes', 'Slice order', 'Sort waits']) want.add(name);
  for (const name of want) assert.ok(have.has(name), `_order.md has no section "${name}"`);
  const drive = headings(read('reference/campaign/_drive.md'));
  for (const name of ['Derived needs', 'Cross-unit reconcile', 'Wait agent']) assert.ok(!drive.has(name), `_drive.md still has "${name}"`);
});

test('the prose budget: _drive.md and _order.md stay at or under 300 lines', () => {
  for (const rel of ['reference/campaign/_drive.md', 'reference/campaign/_order.md']) {
    const lines = read(rel).split('\n').length;
    assert.ok(lines <= 301, `${rel} has ${lines} lines`);
  }
});

test('rule R1 reaches the agents: the pair test sentence, merge by default, and no kind order', () => {
  const text = flat(driver);
  assert.match(text, /The test: would this slice's implement fail, or build the wrong thing, if the other slice's change were absent\?/);
  assert.match(text, /When you are unsure, the kind is 'merge'/);
  assert.doesNotMatch(driver, /kind: \{ enum: \['order', 'contract'\] \}/);
  assert.doesNotMatch(driver, /function directPair/);
  assert.match(read('reference/campaign/_order.md'), /When you are unsure, the pair is `merge`/);
});

test('W8: the plan reconcile of both drivers drops the shared-file overlap', () => {
  for (const src of [driver, read('workflows/yolo.js')]) {
    const text = flat(src);
    assert.doesNotMatch(text, /Two slices OVERLAP when they list the same file/);
    assert.match(text, /A file that both slices list, with none of these, is NO overlap/);
    assert.match(text, /Text in a plan does not order the walk; an orderEdges entry does/);
  }
});
test('every _boundary.md section that a wave driver prompt cites is a heading of _boundary.md', () => {
  const have = headings(read('reference/campaign/_boundary.md'));
  const want = cited('BOUNDARY_PROC');
  // common(step) names the step at run time: the boundary steps of the driver.
  for (const step of [...driver.matchAll(/common\('([^']+)'\)/g)].map((m) => m[1])) want.add(step);
  want.add('Wave review');
  for (const name of want) assert.ok(have.has(name), `_boundary.md has no section "${name}"`);
});

// WF-SUBPROCEDURE-AUDIT F6: one park-kind table, in _waves.md, with a row for each park kind of
// the driver; _drive.md has a resolve part for each kind whose answer a resolve agent reads.
test('_waves.md lists each park kind of the driver once, and _drive.md has a part for each resolve kind', () => {
  const waves = read('reference/campaign/_waves.md');
  const block = /const PARK_TEXT = \{([\s\S]*?)\n\}/.exec(driver)[1];
  const kinds = [...block.matchAll(/^\s+'?([a-z-]+)'?: \(/gm)].map((m) => m[1]);
  assert.ok(kinds.length >= 10, kinds.join(','));
  for (const kind of [...kinds, 'wave-review']) {
    const rows = waves.match(new RegExp(`^\\| \`${kind}\` \\|`, 'gm')) || [];
    assert.equal(rows.length, 1, `_waves.md has ${rows.length} park-kind rows for ${kind}`);
  }
  const drive = read('reference/campaign/_drive.md');
  const resolve = JSON.parse(/const RESOLVE_KINDS = (\[[^\]]*\])/.exec(driver)[1].replace(/'/g, '"'));
  assert.ok(resolve.length >= 4, resolve.join(','));
  for (const kind of resolve) assert.match(drive, new RegExp(`^### ${kind}$`, 'm'), `no resolve part for ${kind}`);
  assert.doesNotMatch(drive, /^\| Kind \| Cause/m, '_drive.md keeps no second park-kind table');
});

test('the away mode of campaign.md answers in the run: no relaunch of a drive, and no yolo drive in a wave', () => {
  const text = read('reference/campaign.md');
  const away = /^## Away mode$([\s\S]*?)(?=^## )/m.exec(text);
  assert.ok(away, 'campaign.md has a section "Away mode"');
  assert.doesNotMatch(away[1], /relaunch the drive/i);
  assert.doesNotMatch(text, /campaign-boundary\.js|contextPath|campaignControlPath/);
  assert.doesNotMatch(read('reference/campaign/_waves.md'), /--driver campaign-boundary|campaign-boundary\.js/);
});
