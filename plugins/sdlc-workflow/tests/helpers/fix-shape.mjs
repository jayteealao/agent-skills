// The checks of a printed fix: its shape, and that its command names a real sub-command of a
// real script, so that a fix can never point at a command that does not exist.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isFix } from '../../lib/fix.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// The programs other than the plugin's scripts that a fix may name, each with the sub-commands
// that change nothing the person owns.
const OTHER = { git: new Set(['commit', 'status', 'fetch']), gh: new Set(['auth']) };
// The scripts of one form.
const SINGLE_FORM = new Set(['stage-yolo-driver.mjs']);

/** The words of a command line, with its quotes taken off. */
export function words(line) {
  const out = [];
  for (const m of String(line).matchAll(/"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g)) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

/** The sub-commands of each script, from the script's own list. */
export async function commandsOf(script) {
  switch (script) {
    case 'wf.mjs': {
      const wf = await import('../../scripts/wf.mjs');
      return { has: (cmd) => wf.helpText(cmd) !== null, verbs: (cmd) => wf.formsOf(cmd) };
    }
    default: {
      const mod = await import(`../../scripts/${script}`);
      assert.ok(Array.isArray(mod.COMMANDS), `${script} exports its COMMANDS`);
      return { has: (cmd) => mod.COMMANDS.includes(cmd), verbs: () => null };
    }
  }
}

/** Assert that each part of a command line names a real script and a real sub-command of it. */
export async function assertRealCommand(line) {
  const parts = String(line).split(/\s*(?:&&|;)\s*/).filter(Boolean);
  let named = 0;
  for (const part of parts) {
    const w = words(part);
    let at = w[0] === 'node' ? 1 : 0;
    const script = path.basename(w[at] ?? '');
    if (!script.endsWith('.mjs')) {
      const allowed = OTHER[w[0]];
      assert.ok(allowed && allowed.has(w[1]), `the fix runs ${w[0]} ${w[1]}, which is not a command that a fix may name: ${line}`);
      continue;
    }
    named += 1;
    const file = w[at];
    if (w[0] === 'node') {
      assert.ok(/[\\/]scripts[\\/][a-z-]+\.mjs$/.test(file), `the fix names the script by its path: ${file}`);
      assert.ok(path.resolve(file).startsWith(pluginRoot), `the script is a script of the plugin: ${file}`);
      assert.ok(existsSync(file), `the script exists: ${file}`);
    }
    at += 1;
    const sub = w[at];
    // A script of one form takes no sub-command: its first word is the project root.
    if (SINGLE_FORM.has(script)) { assert.ok(sub, `the fix gives ${script} its argument: ${line}`); continue; }
    const cmds = await commandsOf(script);
    assert.ok(sub && !sub.startsWith('<') && cmds.has(sub), `${script} has no command ${sub}: ${line}`);
    const verbs = cmds.verbs(sub);
    if (verbs) assert.ok(verbs.has(w[at + 1]), `${script} ${sub} has no form ${w[at + 1]}: ${line}`);
  }
  return named;
}

/** Assert the shape of a fix, its `who` when given, and that its command is real. */
export async function assertFix(fix, { who = null, command = null } = {}) {
  assert.ok(isFix(fix), `a fix of the printed shape: ${JSON.stringify(fix)}`);
  if (who) assert.equal(fix.who, who, `fix.who of ${JSON.stringify(fix)}`);
  if (command === true) assert.ok(fix.command, `the fix names a command: ${JSON.stringify(fix)}`);
  if (command === false) assert.equal(fix.command, undefined, `the fix names no command: ${JSON.stringify(fix)}`);
  if (fix.command) await assertRealCommand(fix.command);
  if (fix.then) await assertRealCommand(fix.then);
  return fix;
}

/** The fix lines that a text script prints on stderr, read back into a fix. */
export function fixFromLines(text) {
  const lines = String(text).split(/\r?\n/);
  const get = (k) => lines.find((l) => l.startsWith(`${k}: `))?.slice(k.length + 2) ?? null;
  const who = get('fix.who');
  if (!who) return null;
  const fix = { who, do: get('fix.do') };
  const command = get('fix');
  const then = get('fix.then');
  if (command) fix.command = command;
  if (then) fix.then = then;
  return fix;
}
