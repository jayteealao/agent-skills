// One owner per shared site (WF-LIVE-VIEWS-PLAN.md 14.4, K1–K3, test T17).
// The mod draws the status line, the band, the spinner word and the mode
// label from one module, `hooks/mod/register.ts`. The live views hand it
// their facts through `$.state`; they never call `$.ui.status` and never
// hook those components themselves, or two writers would fight over a site.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOD = path.resolve(HERE, '..', '..', 'hooks', 'mod');
const OWNER = path.join(MOD, 'register.ts');

/** Every module source under hooks/mod, tests excluded. */
function sources(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== 'tests' && name !== 'node_modules') out.push(...sources(full));
    } else if (/\.(ts|tsx)$/u.test(name)) out.push(full);
  }
  return out;
}

const SHARED = [
  ['$.ui.status', /\$\.ui\.status\(/u],
  ['the AbovePrompt hook', /component:\s*'AbovePrompt'/u],
  ['the Spinner hook', /component:\s*'Spinner'/u],
  ['the SessionMode hook', /component:\s*'SessionMode'/u],
];

test('only register.ts calls $.ui.status and hooks AbovePrompt, Spinner and SessionMode', () => {
  const files = sources(MOD);
  assert.ok(files.includes(OWNER), 'register.ts is under hooks/mod');
  for (const [name, pattern] of SHARED) {
    const owners = files.filter(file => pattern.test(readFileSync(file, 'utf8'))).map(file => path.relative(MOD, file).replace(/\\/gu, '/'));
    assert.deepEqual(owners, ['register.ts'], `${name} has one owner`);
  }
});
