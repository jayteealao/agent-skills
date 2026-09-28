// tests/unit/renderers/fragment-gen.test.mjs — the typed-fragment generator (R7).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RICH_TIER_TYPES, shouldGenerateFragment, generateTypedFragment, fragmentNameFor,
} from '../../../renderers/_fragment-gen.mjs';

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

test('RICH_TIER_TYPES matches the hook list in hooks/post-write-verify.mjs', () => {
  const src = readFileSync(join(PLUGIN_ROOT, 'hooks', 'post-write-verify.mjs'), 'utf-8');
  const block = src.match(/const RICH_TIER_TYPES = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(block, 'hook list found');
  const hookTypes = [...block[1].replace(/\/\/.*$/gm, '').matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
  assert.deepEqual([...hookTypes].sort(), [...RICH_TIER_TYPES].sort());
});

test('freshness rule: generate when the .yaml exists and the fragment is absent or older', () => {
  assert.equal(shouldGenerateFragment({ type: 'plan', yamlMtimeMs: 100, fragmentMtimeMs: null }), true);
  assert.equal(shouldGenerateFragment({ type: 'plan', yamlMtimeMs: 100, fragmentMtimeMs: 50 }), true);
  assert.equal(shouldGenerateFragment({ type: 'plan', yamlMtimeMs: 100, fragmentMtimeMs: 100 }), false, 'as new as the yaml: authored wins');
  assert.equal(shouldGenerateFragment({ type: 'plan', yamlMtimeMs: 100, fragmentMtimeMs: 150 }), false);
  assert.equal(shouldGenerateFragment({ type: 'plan', yamlMtimeMs: null, fragmentMtimeMs: null }), false, 'no yaml, nothing to build from');
  assert.equal(shouldGenerateFragment({ type: 'intake', yamlMtimeMs: 100, fragmentMtimeMs: null }), false, 'not a rich-tier type');
});

test('the generated fragment has the typed envelope verify-fragment expects', () => {
  for (const type of RICH_TIER_TYPES) {
    const html = generateTypedFragment({ type, siblingYaml: { summary: 'x', items: [{ a: 1 }] }, artifact: 'demo' });
    const sections = html.match(/<section class="fragment-/g) ?? [];
    assert.equal(sections.length, 1, `${type}: one section`);
    assert.match(html, new RegExp(`<section class="fragment-${fragmentNameFor(type)}" data-generated="yaml">`));
    assert.match(html, /sdlc:fragment-ready/);
    assert.doesNotMatch(html, /<html|<head|<body|<iframe|<link|<script[^>]*\bsrc=/i);
  }
  assert.equal(fragmentNameFor('review-command'), 'review-dimension');
});

test('the generated fragment is deterministic and projects the YAML', () => {
  const sy = {
    verdict: 'changes-requested',
    findings: [
      { id: 'F2', severity: 'low', title: 'naming', status: 'fixed' },
      { id: 'F1', severity: 'high', title: 'SQL <injection>', status: 'open', file: 'src/db.ts', line: 12 },
    ],
    counts: { high: 1, low: 1 },
  };
  const a = generateTypedFragment({ type: 'review', siblingYaml: sy, artifact: '07-review' });
  const b = generateTypedFragment({ type: 'review', siblingYaml: structuredClone(sy), artifact: '07-review' });
  assert.equal(a, b);
  assert.match(a, /Findings · 1 open of 2/);
  assert.ok(a.indexOf('F1') < a.indexOf('F2'), 'open findings first');
  assert.match(a, /SQL &lt;injection&gt;/, 'text is escaped');
  assert.match(a, /<details class="gen-data">/);
  assert.match(a, /<th>severity<\/th>/, 'arrays of objects become tables');
});
