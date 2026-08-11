// Roster drift guards for the WORK-WITHOUT-A-HOME release (/wf task — the 22nd
// key — and /wf intake audit — the fourth read-only terminal intake mode).
// The surfaces that enumerate the roster have no other automated guard: a key
// or mode that exists on disk but is missing from a dispatch table is invisible
// to users, and the misrouting that motivated the plan comes back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const codexRoot = path.resolve(pluginRoot, '..', 'sdlc-workflow-codex');

const trees = [
  { name: 'main', root: pluginRoot, dialect: '/wf' },
  { name: 'codex', root: codexRoot, dialect: '$wf' },
].filter((t) => existsSync(path.join(t.root, 'skills', 'wf', 'reference')));

const read = (root, ...rel) => readFileSync(path.join(root, 'skills', 'wf', ...rel), 'utf8');

test('both references exist in both trees', () => {
  for (const { name, root } of trees) {
    assert.ok(existsSync(path.join(root, 'skills', 'wf', 'reference', 'task.md')),
      `${name}: missing reference/task.md`);
    assert.ok(existsSync(path.join(root, 'skills', 'wf', 'reference', 'intake', 'audit.md')),
      `${name}: missing reference/intake/audit.md`);
  }
});

test('SKILL.md dispatch surface names task everywhere the roster is enumerated', () => {
  for (const { name, root } of trees) {
    const skill = read(root, 'SKILL.md');
    assert.match(skill, /### Minimal lifecycle/,
      `${name}: SKILL.md lost the Minimal lifecycle dispatch section`);
    assert.match(skill, /\| `task`\s+\|/, `${name}: SKILL.md dispatch table lost the task row`);
    // The not-a-known-key error roster — the last-resort discovery surface.
    assert.match(skill, /auto, yolo, task, status|auto, task, status/,
      `${name}: SKILL.md not-a-known-key roster does not name task`);
    // Step 0.5 exclusion — task resolves its own first token.
    assert.match(skill, /`task` — resolves its first token/,
      `${name}: SKILL.md Step 0.5 does-not-apply list lost the task entry`);
  }
});

test('intake.md names audit in the keyword set, behaviour table, and mode→file map', () => {
  for (const { name, root } of trees) {
    const intake = read(root, 'reference', 'intake.md');
    assert.match(intake, /`discover`, `audit`, `hotfix`/,
      `${name}: intake.md mode keyword set lost audit`);
    assert.match(intake, /\| `audit` \| \*\*terminal defect hunt\*\*/,
      `${name}: intake.md per-mode behaviour table lost the audit row`);
    assert.match(intake, /\| `audit` \| `(reference\/)?intake\/audit\.md` \|/,
      `${name}: intake.md mode→file map lost the audit row`);
    // W3.3 — the suggest-and-confirm row, without which audit exists but is
    // never proposed and users keep landing on rca.
    assert.match(intake, /\| \*\*Defect hunt across a named subsystem[^|]*\| `audit` \|/,
      `${name}: intake.md suggest-and-confirm table lost the audit row`);
    assert.match(intake, /`audit` vs `rca`/,
      `${name}: intake.md lost the audit-vs-rca disambiguation bullet`);
  }
});

test('audit.md cites the findings ledger and never cites the fix loop', () => {
  for (const { name, root } of trees) {
    const audit = read(root, 'reference', 'intake', 'audit.md');
    assert.match(audit, /\[_findings-ledger\.md\]\(([^)]+)\)/,
      `${name}: audit.md does not cite _findings-ledger.md`);
    assert.ok(!/\[_fix-loop\.md\]\(/.test(audit),
      `${name}: audit.md cites _fix-loop.md — the tell that the mode drifted into a second review stage`);
    assert.match(audit, /needs-runtime-evidence/,
      `${name}: audit.md lost the runtime decidability boundary`);
  }
});

test('task.md carries the blast-radius gate and the asserted rung rule', () => {
  for (const { name, root } of trees) {
    const task = read(root, 'reference', 'task.md');
    for (const cls of ['repo-local', 'local-env', 'shared-env', 'external-party', 'irreversible']) {
      assert.ok(task.includes(`\`${cls}\``), `${name}: task.md lost blast-radius class ${cls}`);
    }
    assert.match(task, /No auto-proceed, ever/,
      `${name}: task.md weakened the shared-env/external-party stop`);
    assert.match(task, /`asserted`[^]*cannot close/i,
      `${name}: task.md lost the asserted-cannot-close-an-AC rule`);
    assert.match(task, /metric-acceptance-mock-rung/,
      `${name}: task.md no longer routes asserted through the shipped mock gate`);
  }
});

test('the compressed-slice contract enumerates both new ops and the inline-records rule', () => {
  for (const { name, root } of trees) {
    const contract = read(root, 'reference', '_compressed-slice.md');
    assert.match(contract, /`ideate`, `audit`/, `${name}: _compressed-slice.md <op> enum lost audit`);
    assert.match(contract, /or `task`/, `${name}: _compressed-slice.md <op> enum lost task`);
    assert.match(contract, /## Inline records/, `${name}: _compressed-slice.md lost the inline-records rule`);
  }
});

test('drivers refuse both: auto pauses, yolo refuses (main tree only for yolo)', () => {
  for (const { name, root } of trees) {
    const auto = read(root, 'reference', 'auto.md');
    assert.match(auto, /`workflow-type: task`[^]*PAUSE/,
      `${name}: auto.md lost the task pause-and-route arm`);
    assert.match(auto, /`workflow-type: audit`[^]*PAUSE/,
      `${name}: auto.md lost the audit pause-and-route arm`);
  }
  const yolo = read(pluginRoot, 'reference', 'yolo.md');
  assert.match(yolo, /Five classes/, 'main: yolo.md class count did not grow to five');
  assert.match(yolo, /`ideate`, `audit`/, 'main: yolo.md terminal-analysis class lost audit');
  assert.match(yolo, /Task \(minimal lifecycle\) — a second genuine refusal/,
    'main: yolo.md lost the task refusal class');
});

test('the review stage stops cleanly on task and audit slugs', () => {
  for (const { name, root } of trees) {
    const stage = read(root, 'reference', 'review', '_stage.md');
    assert.match(stage, /\*\*Task\*\* \(`workflow-type: task`\)[^]*STOP cleanly/,
      `${name}: review/_stage.md lost the task prerequisite arm`);
    assert.match(stage, /\*\*Audit\*\* \(`workflow-type: audit`\)[^]*STOP cleanly/,
      `${name}: review/_stage.md lost the audit prerequisite arm`);
  }
});
