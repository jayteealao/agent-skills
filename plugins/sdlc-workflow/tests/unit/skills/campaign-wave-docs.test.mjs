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
  for (const name of ['Park', 'Resume actions', 'Derived needs', 'Cross-unit reconcile', 'Wait agent', 'Unit end', 'Boundary setup']) want.add(name);
  for (const name of want) assert.ok(have.has(name), `_drive.md has no section "${name}"`);
});

test('every _boundary.md section that a wave driver prompt cites is a heading of _boundary.md', () => {
  const have = headings(read('reference/campaign/_boundary.md'));
  const want = cited('BOUNDARY_PROC');
  // common(step) names the step at run time: the boundary steps of the driver.
  for (const step of [...driver.matchAll(/common\('([^']+)'\)/g)].map((m) => m[1])) want.add(step);
  want.add('Wave review');
  for (const name of want) assert.ok(have.has(name), `_boundary.md has no section "${name}"`);
});

test('_drive.md has a resume part for each park kind of the driver', () => {
  const text = read('reference/campaign/_drive.md');
  const block = /const PARK_TEXT = \{([\s\S]*?)\n\}/.exec(driver)[1];
  const kinds = [...block.matchAll(/^\s+'?([a-z-]+)'?: \(/gm)].map((m) => m[1]);
  assert.ok(kinds.length >= 10, kinds.join(','));
  for (const kind of [...kinds, 'wave-review']) assert.match(text, new RegExp(`^### ${kind}$`, 'm'), `no resume part for ${kind}`);
});

test('the away mode of campaign.md answers in the run: no relaunch of a drive, and no yolo drive in a wave', () => {
  const text = read('reference/campaign.md');
  const away = /^## Away mode$([\s\S]*?)(?=^## )/m.exec(text);
  assert.ok(away, 'campaign.md has a section "Away mode"');
  assert.doesNotMatch(away[1], /relaunch the drive/i);
  assert.doesNotMatch(text, /campaign-boundary\.js|contextPath|campaignControlPath/);
  assert.doesNotMatch(read('reference/campaign/_waves.md'), /--driver campaign-boundary|campaign-boundary\.js/);
});
