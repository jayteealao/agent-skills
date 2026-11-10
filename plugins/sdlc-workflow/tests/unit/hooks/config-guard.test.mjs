// An agent write to .ai/sdlc-config.json that lowers `checks` or `semantic.mode` is refused;
// one that keeps or raises each level goes through. Write, Edit, MultiEdit and a new file.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { deepEqual, equal, match } from 'node:assert/strict';

import { guardLowerings } from '../../../lib/config.mjs';
import { textAfterWrite } from '../../../hooks/pre-write-validate.mjs';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PRE = join(PLUGIN_ROOT, 'hooks', 'pre-tool-use-all.mjs');
const CFG = '.ai/sdlc-config.json';

function withProject(prior, fn) {
  const tmp = mkdtempSync(join(tmpdir(), 'sdlc-cfg-guard-'));
  try {
    if (prior !== null) {
      mkdirSync(join(tmp, '.ai'), { recursive: true });
      writeFileSync(join(tmp, CFG), prior, 'utf-8');
    }
    return fn(tmp);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

function hook(tmp, tool_name, tool_input) {
  return spawnSync(process.execPath, [PRE], {
    cwd: tmp, encoding: 'utf-8',
    input: JSON.stringify({ cwd: tmp, tool_name, tool_input: { file_path: CFG, ...tool_input } }),
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT, SDLC_HOME: join(tmp, '.sdlc-home'), SDLC_DISPATCH_ACTIVE: '', CLAUDE_PLUGIN_INSTALL: '' },
  });
}

const json = (v) => JSON.stringify(v, null, 2);

test('guardLowerings: the order of each level, and a missing or broken file as the defaults', () => {
  deepEqual(guardLowerings(json({ checks: 'strict' }), json({ checks: 'warn' })), [{ key: 'checks', from: 'strict', to: 'warn' }]);
  deepEqual(guardLowerings(json({ checks: 'warn' }), json({ checks: 'off' })), [{ key: 'checks', from: 'warn', to: 'off' }]);
  deepEqual(guardLowerings(json({ checks: 'off' }), json({ checks: 'warn' })), [], 'raising passes');
  deepEqual(guardLowerings(json({ checks: 'warn' }), json({ checks: 'warn', memory: { seedRules: false } })), [], 'keeping passes');
  deepEqual(guardLowerings(null, json({ checks: 'off' })), [{ key: 'checks', from: 'strict', to: 'off' }], 'no file reads as strict');
  deepEqual(guardLowerings(null, json({ semantic: { mode: 'advisory' } })), []);
  deepEqual(guardLowerings(json({ semantic: { enabled: true, mode: 'enforce' } }), json({ semantic: { enabled: true, mode: 'advisory' } })),
    [{ key: 'semantic.mode', from: 'enforce', to: 'advisory' }]);
  deepEqual(guardLowerings(json({ semantic: { mode: 'enforce' } }), json({})), [{ key: 'semantic.mode', from: 'enforce', to: 'advisory' }], 'dropping the key lowers it');
  deepEqual(guardLowerings(json({ checks: 'off' }), '{ broken'), [], 'a text the loader cannot parse reads as the defaults: strict');
});

test('textAfterWrite: Write, Edit, replace_all and MultiEdit', () => {
  equal(textAfterWrite('a', { content: 'b' }), 'b');
  equal(textAfterWrite('x "strict" y "strict"', { old_string: '"strict"', new_string: '"$&warn"' }), 'x "$&warn" y "strict"');
  equal(textAfterWrite('x "strict" y "strict"', { old_string: '"strict"', new_string: '"off"', replace_all: true }), 'x "off" y "off"');
  equal(textAfterWrite('ab', { edits: [{ old_string: 'a', new_string: 'c' }, { old_string: 'b', new_string: 'd' }] }), 'cd');
  equal(textAfterWrite('ab', { old_string: 'zz', new_string: 'c' }), null, 'an edit that does not apply');
  equal(textAfterWrite(null, { old_string: '', new_string: '{}' }), '{}');
});

test('pre-write hook: a Write that lowers checks is refused, in warn mode too', () => {
  withProject(json({ checks: 'warn' }), (tmp) => {
    const r = hook(tmp, 'Write', { content: json({ checks: 'off' }) });
    equal(r.status, 2, r.stderr);
    match(r.stderr, /it lowers checks from warn to off/);
    match(r.stderr, /Only the person may lower these settings\. Ask the person/);
  });
});

test('pre-write hook: an Edit and a MultiEdit that lower a level are refused', () => {
  withProject(json({ checks: 'strict', semantic: { enabled: true, mode: 'enforce' } }), (tmp) => {
    const edit = hook(tmp, 'Edit', { old_string: '"enforce"', new_string: '"advisory"' });
    equal(edit.status, 2, edit.stderr);
    match(edit.stderr, /it lowers semantic\.mode from enforce to advisory/);
    const multi = hook(tmp, 'MultiEdit', { edits: [{ old_string: '"strict"', new_string: '"warn"' }] });
    equal(multi.status, 2, multi.stderr);
    match(multi.stderr, /it lowers checks from strict to warn/);
  });
});

test('pre-write hook: a new config file that lowers the default is refused; one that keeps it passes', () => {
  withProject(null, (tmp) => {
    const low = hook(tmp, 'Write', { content: json({ checks: 'warn' }) });
    equal(low.status, 2, low.stderr);
    match(low.stderr, /it lowers checks from strict to warn/);
    const keep = hook(tmp, 'Write', { content: json({ checks: 'strict', semantic: { enabled: true, mode: 'enforce' } }) });
    equal(keep.status, 0, keep.stderr);
  });
});

test('pre-write hook: a write that raises or keeps each level passes', () => {
  withProject(json({ checks: 'off' }), (tmp) => {
    equal(hook(tmp, 'Edit', { old_string: '"off"', new_string: '"strict"' }).status, 0);
    equal(hook(tmp, 'Write', { content: json({ checks: 'off', memory: { seedRules: false } }) }).status, 0);
  });
});
