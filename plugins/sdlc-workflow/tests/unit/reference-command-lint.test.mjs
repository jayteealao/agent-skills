// The references give agents commands, not scripts: no reference tells an agent to change a
// record with an inline script, and no reference tells it to read a run file by its path. The
// commands (record set, record stage-done, board, status --brief, step where, progress show)
// keep the rules that a script or a raw read skips.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const skill = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'skills', 'wf');

function markdown(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) markdown(p, out);
    else if (e.endsWith('.md')) out.push(p);
  }
  return out;
}

const SCRIPT = /\b(?:node -e|node --eval|python3? -c|jq\b[^|`]*-i)\b/;
const RECORD = /00-index|state\.yaml|meta\.yaml|03-slice|04-plan|05-implement|06-verify|07-review|brainstorm-board|decisions\.yaml|findings\.yaml|\.ai\/workflows\//;
const READ = /\b(?:read|Read|cat|tail|head|Get-Content|open)\b[^.\n]{0,40}`?(?:\.ai\/workflows\/<slug>\/)?(progress\.json|steps\.jsonl|\.implement-progress\.jsonl|\.driver-outcome\.json)\b/;

test('no reference changes a record with an inline script, or reads a run file by path', () => {
  const problems = [];
  for (const file of [path.join(skill, 'SKILL.md'), ...markdown(path.join(skill, 'reference'))]) {
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      const where = `${path.relative(skill, file)}:${i + 1}`;
      if (SCRIPT.test(line) && RECORD.test(line)) problems.push(`${where}: an inline script on a record; use record set, record stage-done or board`);
      const m = READ.exec(line);
      if (m) problems.push(`${where}: a read of ${m[1]} by path; use status --brief, step where or progress show`);
    });
  }
  assert.deepEqual(problems, []);
});
