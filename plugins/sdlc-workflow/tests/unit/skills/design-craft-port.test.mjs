// DESIGN-CRAFT-PORT-PLAN guard tests: the motion rules are platform-neutral, the old
// conflicting rules stay gone, the platform map covers its four platforms, and a move
// on a confirmed design runs a pass instead of the whole stage.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { deepEqual, doesNotMatch, match, ok } from 'node:assert/strict';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (rel) => readFileSync(join(PLUGIN_ROOT, rel), 'utf8');
const DESIGN = 'skills/wf/reference/design';

/** The text outside fenced code blocks. */
const prose = (text) => text.replace(/```[\s\S]*?```/g, '');

/** The backticked platform forms in the platform columns of every table in _platforms.md. */
function platformTokens() {
  const tokens = new Set();
  for (const line of read(`${DESIGN}/_platforms.md`).split(/\r?\n/)) {
    if (!line.startsWith('|') || /^\|[-\s|]+\|$/.test(line)) continue;
    const cells = line.split('|').slice(1, -1);
    if (cells.length < 5) continue;
    for (const cell of cells.slice(1)) for (const m of cell.matchAll(/`([^`]+)`/g)) tokens.add(m[1].trim());
  }
  return tokens;
}

test('the platform map has the four platform columns and every rule term', () => {
  const map = read(`${DESIGN}/_platforms.md`);
  match(map, /\| Term \| Web \| iOS \| Android \(Compose\) \| Desktop \|/);
  for (const term of ['cheap property', 'paint property', 'layout property', 'render thread', 'app thread', 'layer hint',
    'retargetable animation', 'restarting animation', 'curve token', 'spring', 'trigger origin', 'entry without a mount flag',
    'per-frame value', 'reduced-motion setting', 'hover pointer', 'press feedback', 'system back', 'insets and system bars',
    'largest text size']) {
    match(map, new RegExp(`\\*\\*${term.replace(/[-()]/g, '\\$&')}\\*\\*`), `the map defines "${term}"`);
  }
  ok(platformTokens().size > 40, 'the map holds the platform forms');
});

test('motion rules name no platform API outside code examples', () => {
  const tokens = platformTokens();
  const sources = {
    'animate.md': prose(read(`${DESIGN}/animate.md`)),
    '_motion-recipes.md (rules part)': prose(read(`${DESIGN}/_motion-recipes.md`).split('## Web snippets')[0]),
    'review/interface-craft.md (motion)': read('skills/wf/reference/review/interface-craft.md').split('### motion')[1].split('# Severity calibration')[0],
  };
  for (const [name, text] of Object.entries(sources)) {
    const leaks = [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim()).filter((t) => tokens.has(t));
    deepEqual(leaks, [], `${name} names platform APIs; use the generic term and _platforms.md`);
  }
});

test('the six old motion conflicts stay fixed everywhere in the references', () => {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.md')) files.push(p);
    }
  };
  walk(join(PLUGIN_ROOT, 'skills', 'wf', 'reference'));
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const rel = relative(PLUGIN_ROOT, file);
    doesNotMatch(text, /`?ease-in`? for (exits|leaving)/i, `${rel}: ease-in on an exit`);
    doesNotMatch(text, /0\.01ms/, `${rel}: a global zero-duration reduced-motion rule`);
    doesNotMatch(text, /motion[- ]first/i, `${rel}: the old motion-first stance`);
  }
  const animate = read(`${DESIGN}/animate.md`);
  match(animate, /30–80 ms per item/, 'stagger 30–80 ms');
  match(animate, /fewer and gentler, not zero/, 'reduced motion is gentler, not zero');
  match(animate, /Exit on the entry path/, 'exits follow the entry path');
  match(animate, /Hover motion only for a hover pointer/, 'hover is gated');
  match(animate, /Product UI motion stays under 300 ms/, 'the 300 ms cap');
});

test('animate carries the gates, the sweep with rejected candidates, and the source commit', () => {
  const animate = read(`${DESIGN}/animate.md`);
  for (const heading of ['## Gate 1 — Frequency', '## Gate 2 — Purpose and function', '## The opportunity sweep',
    '## The tool ladder', '## Performance', '## Never ship', '## Gestures']) {
    ok(animate.includes(heading), `animate.md has ${heading}`);
  }
  match(animate, /rejected candidates/i);
  match(animate, /commit `2d22863`/);
  match(read(`${DESIGN}/critique.md`), /rejected candidates/);
});

test('the review rubrics carry the motion triggers and the motion performance rules', () => {
  const craft = read('skills/wf/reference/review/interface-craft.md');
  match(craft, /Motion with no named purpose on a surface seen tens of times a day or more is HIGH/);
  match(craft, /App-thread motion that plays during navigation, loading or start-up is HIGH/);
  match(craft, /Remedy in this order: delete the animation, reduce it, fix the easing/);
  doesNotMatch(craft, /shorthands run on the main thread/, 'W0: Motion x/y/scale are hardware-accelerated');
  const perf = read('skills/wf/reference/review/performance.md');
  match(perf, /A per-frame value routed through component state/);
  match(perf, /app-thread motion during navigation, loading or hydration, is HIGH/);
});

test('a move on a confirmed design runs the move pass, not the stage', () => {
  const stage = read(`${DESIGN}/stage.md`);
  match(stage, /the invocation names a move → run the \*\*Move pass\*\* below\. Do not run Step 1\./);
  match(stage, /^## Move pass$/m);
  match(stage, /It draws nothing and freezes nothing\./);
  match(stage, /^## Step 3b — Directions/m);
  match(stage, /<surface>--worst/);
  match(read(`${DESIGN}/_output.md`), /\*\*Move-pass note\*\*/);
});

test('the contract schema accepts directions on a design contract', () => {
  const schema = JSON.parse(read('tests/frontmatter.schema.json'));
  const text = JSON.stringify(schema);
  ok(text.includes('"directions":{"$ref":"#/$defs/stringArray"'), 'design-contract has an optional directions list');
});

test('harden carries the worst-case catalog and adapt the native-feel checklists', () => {
  const harden = read(`${DESIGN}/harden.md`);
  match(harden, /^### 11\. Worst-case content$/m);
  for (const group of ['People and names', 'Emails, URLs and identifiers', 'Numbers and money', 'Collections', 'Time', 'Environment']) {
    ok(harden.includes(`**${group}**`), `harden.md lists ${group}`);
  }
  const adapt = read(`${DESIGN}/adapt.md`);
  match(adapt, /^## Feel native on the target platform$/m);
  for (const target of ['A web app on a phone.', 'iOS.', 'Android (Compose).', 'Desktop.']) {
    ok(adapt.includes(`**${target}**`), `adapt.md has the ${target} checklist`);
  }
});
