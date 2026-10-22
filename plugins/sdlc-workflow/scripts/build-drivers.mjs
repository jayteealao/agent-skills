#!/usr/bin/env node
/**
 * scripts/build-drivers.mjs — write skills/wf/workflows/_shared.js into the BEGIN SHARED
 * block of each driver that shares it (WF-SYSTEM-REVIEW-2026-10-21 E1).
 *
 * A Workflow script cannot import, so yolo.js and campaign-wave.js each carry a copy of
 * the shared helpers. The copy is generated: edit _shared.js, then run `npm run build`
 * (scripts/build.mjs calls this). The drivers on disk stay complete, so the staged copy
 * and the tests read the same script.
 *
 *   node scripts/build-drivers.mjs           write the blocks
 *   node scripts/build-drivers.mjs --check   exit 1 when a block differs from _shared.js
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const WORKFLOWS = path.join(PLUGIN_ROOT, 'skills', 'wf', 'workflows');
export const SHARED_DRIVERS = Object.freeze(['yolo.js', 'campaign-wave.js']);
const BEGIN = '// ---- BEGIN SHARED: generated from _shared.js by scripts/build-drivers.mjs. Edit _shared.js, then run npm run build. ----';
const END = '// ---- END SHARED ----';

/** The body of _shared.js without its header comment: the text of each block. */
export function sharedBody(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length && (lines[i].startsWith('//') || !lines[i].trim())) i++;
  return `${lines.slice(i).join('\n').replace(/\n+$/, '')}\n`;
}

/** A driver's text with its block set to `body`. Throws when the driver has no block. */
export function withBlock(driver, body) {
  const src = String(driver).replace(/\r\n/g, '\n');
  const a = src.indexOf(BEGIN);
  const b = src.indexOf(END, a);
  if (a < 0 || b < 0) throw new Error('build-drivers: the driver has no BEGIN SHARED … END SHARED block');
  return `${src.slice(0, a)}${BEGIN}\n${body}${src.slice(b)}`;
}

export function buildDrivers({ check = false, dir = WORKFLOWS } = {}) {
  const body = sharedBody(readFileSync(path.join(dir, '_shared.js'), 'utf8'));
  const stale = [];
  for (const f of SHARED_DRIVERS) {
    const file = path.join(dir, f);
    const before = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    const after = withBlock(before, body);
    if (after === before) continue;
    stale.push(f);
    if (!check) writeFileSync(file, after);
  }
  return { stale };
}

const invoked = process.argv[1] && /build-drivers\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (invoked) {
  const check = process.argv.includes('--check');
  const { stale } = buildDrivers({ check });
  if (check && stale.length) {
    console.error(`build-drivers: ${stale.join(', ')} differ from _shared.js. Run npm run build.`);
    process.exitCode = 1;
  } else {
    console.log(`[build] drivers: ${stale.length ? `wrote the shared block of ${stale.join(', ')}` : 'shared blocks current'}`);
  }
}
