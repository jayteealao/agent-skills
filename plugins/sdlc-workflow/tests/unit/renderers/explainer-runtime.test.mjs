// tests/unit/renderers/explainer-runtime.test.mjs — assets/explainer.js, the
// declarative data-ex-* runtime (step-through, toggle, slider over frames).
// The browser behaviour is checked by hand; here the pure helpers run in a
// DOM-less vm context, and the source is held to the CSP-safe rules.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import { renderShell } from '../../../renderers/_shell.mjs';

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SRC = readFileSync(join(PLUGIN_ROOT, 'assets', 'explainer.js'), 'utf-8');

function load() {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return sandbox.SdlcExplainer;
}

test('the runtime loads without a DOM and exports its helpers', () => {
  const api = load();
  assert.equal(typeof api.clampStep, 'function');
  assert.equal(typeof api.nearestFrame, 'function');
  assert.equal(typeof api.init, 'function');
});

test('clampStep keeps a step index inside the list', () => {
  const { clampStep } = load();
  assert.equal(clampStep(0, 4), 0);
  assert.equal(clampStep(3, 4), 3);
  assert.equal(clampStep(4, 4), 3, 'past the end → last');
  assert.equal(clampStep(-1, 4), 0, 'before the start → first');
  assert.equal(clampStep(2.7, 4), 2);
  assert.equal(clampStep('x', 4), 0);
  assert.equal(clampStep(2, 0), 0, 'an empty list');
});

test('nearestFrame picks the frame whose value is nearest the slider', () => {
  const { nearestFrame } = load();
  assert.equal(nearestFrame(['1', '2', '3'], '2'), 1);
  assert.equal(nearestFrame(['10', '20', '40'], 29), 1);
  assert.equal(nearestFrame(['10', '20', '40'], 31), 2);
  assert.equal(nearestFrame(['10', '20'], 15), 0, 'a tie goes to the earlier frame');
  assert.equal(nearestFrame(['a', '', '5'], 0), 2, 'non-numbers are skipped');
  assert.equal(nearestFrame([], 3), -1);
  assert.equal(nearestFrame(['-5', '0.5'], -1), 1);
  assert.equal(nearestFrame(['-5', '0.5'], -4), 0);
});

test('valueText joins a unit', () => {
  const { valueText } = load();
  assert.equal(valueText('40', 'ms'), '40 ms');
  assert.equal(valueText('25', '%'), '25%');
  assert.equal(valueText('3', ''), '3');
  assert.equal(valueText('3', null), '3');
});

test('the runtime source stays CSP-safe: no eval, no inline handlers, no HTML injection', () => {
  const code = SRC.replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /\beval\s*\(|new\s+Function\s*\(|setTimeout\s*\(\s*['"`]/);
  assert.doesNotMatch(code, /\.innerHTML|\.outerHTML|insertAdjacentHTML|document\.write/);
  assert.doesNotMatch(code, /setAttribute\(\s*['"]on/i);
  assert.match(code, /prefers-reduced-motion/);
  assert.match(code, /aria-live/);
});

test('every view page loads the runtime from the asset base and declares both colour schemes', () => {
  const html = renderShell({ title: 't', type: 'plan', slug: 's', assetBase: '/__sdlc/assets/abc' });
  assert.match(html, /<script src="\/__sdlc\/assets\/abc\/explainer\.js\?v=[^"]+" defer><\/script>/);
  assert.match(html, /<meta name="color-scheme" content="light dark">/);
});
