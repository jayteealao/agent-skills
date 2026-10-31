// A change-mode run that escalates closes its slug and restarts as a full intake. The restart
// must carry `from <slug>`, so the successor consumes the planning evidence of the closed run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const intakeDir = path.join(pluginRoot, 'skills', 'wf', 'reference', 'intake');

const changeModeCards = readdirSync(intakeDir)
  .filter((f) => f.endsWith('.md'))
  .map((f) => ({ name: f, text: readFileSync(path.join(intakeDir, f), 'utf8') }))
  .filter((c) => c.name === '_change-mode-tail.md' || c.text.includes('_change-mode-tail.md'));

test('each escalate route of a change-mode card carries from <slug>', () => {
  assert.ok(changeModeCards.length >= 4, 'the change-mode cards are found');
  const misses = [];
  for (const { name, text } of changeModeCards) {
    text.split('\n').forEach((line, i) => {
      if (!/escalat/i.test(line)) return;
      for (const cmd of line.match(/`[^`]*\/wf intake [^`]*`/g) || []) {
        if (!cmd.includes('<description>')) continue;
        if (!/ from <slug>/.test(cmd)) misses.push(`${name}:${i + 1} ${cmd}`);
      }
    });
  }
  assert.deepEqual(misses, []);
});

test('the fix hand-off prints the successor invocation of the tail', () => {
  const fix = readFileSync(path.join(intakeDir, 'fix.md'), 'utf8');
  assert.match(fix, /If escalated, `Next:` is the successor invocation that the tail printed/);
  assert.doesNotMatch(fix, /Restart bigger/);
});
