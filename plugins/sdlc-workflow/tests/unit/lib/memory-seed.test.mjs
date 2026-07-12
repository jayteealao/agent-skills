// Unit tests for lib/memory-seed.mjs — the /wf rules-kernel seeder
// (MEMORY-SEED-PLAN). Two layers: the pure fence surgery (no fs), and the
// fail-open fs orchestrator exercised against real temp dirs. The blast radius
// is a user's committed memory files, so the surgical-edit guarantees carry the
// heaviest coverage.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { equal, match, doesNotMatch, ok } from 'node:assert/strict';

import {
  KERNEL_VERSION,
  ensureAgentsKernel,
  ensureClaudeImport,
  renderAgentsBlock,
  renderImportBlock,
  seedMemoryKernel,
} from '../../../lib/memory-seed.mjs';

function tempDir(prefix = 'sdlc-memory-seed-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

// Make `dir` an sdlc-engaged repo (the seed gate).
function engage(dir) {
  mkdirSync(join(dir, '.ai', 'workflows'), { recursive: true });
}

// ── ensureAgentsKernel (pure) ─────────────────────────────────────────────────

test('ensureAgentsKernel: absent file → creates block', () => {
  const r = ensureAgentsKernel(null);
  equal(r.changed, true);
  equal(r.action, 'created');
  match(r.text, /sdlc:wf-rules v1 START/);
  match(r.text, /study-sources/);
});

test('ensureAgentsKernel: existing content, no fence → appends, preserves user bytes', () => {
  const user = '# My Project\n\nSome notes.\n';
  const r = ensureAgentsKernel(user);
  equal(r.changed, true);
  equal(r.action, 'appended');
  ok(r.text.startsWith('# My Project\n\nSome notes.'), 'user content preserved verbatim at the top');
  match(r.text, /sdlc:wf-rules v1 END -->\n$/);
});

test('ensureAgentsKernel: current fence present → no change (idempotent)', () => {
  const seeded = ensureAgentsKernel('# X\n').text;
  const r = ensureAgentsKernel(seeded);
  equal(r.changed, false);
  equal(r.action, 'current');
  equal(r.text, seeded);
});

test('ensureAgentsKernel: older version fence → replaces ONLY the span, neighbors intact', () => {
  const stale =
    'TOP USER TEXT\n\n' +
    '<!-- sdlc:wf-rules v0 START - managed by sdlc-workflow; edit outside this fence -->\n' +
    'old kernel body\n' +
    '<!-- sdlc:wf-rules v0 END -->\n\n' +
    'BOTTOM USER TEXT\n';
  const r = ensureAgentsKernel(stale);
  equal(r.changed, true);
  equal(r.action, 'updated');
  match(r.text, /^TOP USER TEXT/);
  match(r.text, /BOTTOM USER TEXT\n$/);
  match(r.text, new RegExp(`sdlc:wf-rules v${KERNEL_VERSION} START`));
  doesNotMatch(r.text, /v0 START/);
  doesNotMatch(r.text, /old kernel body/);
});

test('ensureAgentsKernel: CRLF-normalized current fence → no change (no Windows churn)', () => {
  const lf = ensureAgentsKernel('# X\n').text;
  const crlf = lf.replace(/\n/g, '\r\n'); // simulate git autocrlf checkout
  const r = ensureAgentsKernel(crlf);
  equal(r.changed, false);
  equal(r.action, 'current');
  equal(r.text, crlf, 'CRLF preserved, not rewritten');
});

// ── ensureClaudeImport (pure) ─────────────────────────────────────────────────

test('ensureClaudeImport: absent → creates import fence with @AGENTS.md', () => {
  const r = ensureClaudeImport(null);
  equal(r.changed, true);
  match(r.text, /@AGENTS\.md/);
  match(r.text, /sdlc:wf-rules-import START/);
});

test('ensureClaudeImport: existing content, no import → appends', () => {
  const r = ensureClaudeImport('# Claude rules\n');
  equal(r.changed, true);
  equal(r.action, 'appended');
  ok(r.text.startsWith('# Claude rules'));
});

test('ensureClaudeImport: user already imports @AGENTS.md → no duplicate', () => {
  const r = ensureClaudeImport('See @AGENTS.md for shared rules.\n');
  equal(r.changed, false);
  equal(r.action, 'user-import');
});

test('ensureClaudeImport: @AGENTS.md only inside a code block → still inserts', () => {
  const md = 'Example:\n\n```\n@AGENTS.md\n```\n';
  const r = ensureClaudeImport(md);
  equal(r.changed, true);
  equal(r.action, 'appended');
});

test('ensureClaudeImport: @AGENTS.md only in an inline code span → still inserts', () => {
  const r = ensureClaudeImport('Write `@AGENTS.md` to import it.\n');
  equal(r.changed, true);
  equal(r.action, 'appended');
});

test('ensureClaudeImport: our fence already present → no change', () => {
  const seeded = ensureClaudeImport(null).text;
  const r = ensureClaudeImport(seeded);
  equal(r.changed, false);
  equal(r.action, 'current');
});

test('ensureClaudeImport: CRLF-normalized import fence → no change (no Windows churn)', () => {
  const lf = ensureClaudeImport(null).text;
  const crlf = lf.replace(/\n/g, '\r\n');
  const r = ensureClaudeImport(crlf);
  equal(r.changed, false);
  equal(r.action, 'current');
});

// ── seedMemoryKernel (fs orchestrator) ────────────────────────────────────────

test('seedMemoryKernel: non-engaged repo (no .ai/workflows) → touches nothing', () => {
  const dir = tempDir();
  try {
    const r = seedMemoryKernel(dir, {});
    equal(r.seeded, false);
    equal(existsSync(join(dir, 'AGENTS.md')), false);
    equal(existsSync(join(dir, 'CLAUDE.md')), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('seedMemoryKernel: first insert → writes both files, marker, and a notice', () => {
  const dir = tempDir();
  try {
    engage(dir);
    const r = seedMemoryKernel(dir, {});
    equal(r.changed, true);
    equal(r.firstInsert, true);
    ok(r.notice && r.notice.includes('seedRules'), 'notice mentions the opt-out flag');
    match(readFileSync(join(dir, 'AGENTS.md'), 'utf-8'), /sdlc:wf-rules v1 START/);
    match(readFileSync(join(dir, 'CLAUDE.md'), 'utf-8'), /@AGENTS\.md/);
    ok(existsSync(join(dir, '.ai', '.wf-rules-seeded')), 'marker written');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('seedMemoryKernel: second run → idempotent no-op, no re-announce', () => {
  const dir = tempDir();
  try {
    engage(dir);
    seedMemoryKernel(dir, {});
    const before = readFileSync(join(dir, 'AGENTS.md'), 'utf-8');
    const r = seedMemoryKernel(dir, {});
    equal(r.changed, false);
    equal(r.firstInsert, false);
    equal(r.notice, null);
    equal(readFileSync(join(dir, 'AGENTS.md'), 'utf-8'), before);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('seedMemoryKernel: marker present but kernel stale → silent version replace', () => {
  const dir = tempDir();
  try {
    engage(dir);
    // Pre-seed a v0 fence and the marker, simulating an earlier release.
    writeFileSync(
      join(dir, 'AGENTS.md'),
      '<!-- sdlc:wf-rules v0 START - old -->\nold\n<!-- sdlc:wf-rules v0 END -->\n',
      'utf-8',
    );
    writeFileSync(join(dir, '.ai', '.wf-rules-seeded'), 'seeded\n', 'utf-8');
    const r = seedMemoryKernel(dir, {});
    equal(r.changed, true);
    equal(r.firstInsert, false, 'marker present → no re-announce');
    equal(r.notice, null);
    match(readFileSync(join(dir, 'AGENTS.md'), 'utf-8'), new RegExp(`v${KERNEL_VERSION} START`));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('seedMemoryKernel: opt-out (memory.seedRules=false) → touches nothing', () => {
  const dir = tempDir();
  try {
    engage(dir);
    const r = seedMemoryKernel(dir, { memory: { seedRules: false } });
    equal(r.enabled, false);
    equal(existsSync(join(dir, 'AGENTS.md')), false);
    equal(existsSync(join(dir, '.ai', '.wf-rules-seeded')), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('seedMemoryKernel: fs write error → fail-open (no throw)', () => {
  const dir = tempDir();
  try {
    engage(dir);
    const boom = {
      existsSync,
      mkdirSync,
      readFileSync,
      writeFileSync() { throw new Error('read-only fs'); },
    };
    const r = seedMemoryKernel(dir, {}, { fs: boom });
    // Did not throw; reports nothing seeded.
    equal(r.firstInsert, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('renderAgentsBlock / renderImportBlock are stable strings', () => {
  match(renderAgentsBlock(), /^<!-- sdlc:wf-rules v1 START/);
  match(renderAgentsBlock(), /sdlc:wf-rules v1 END -->$/);
  equal(renderImportBlock().includes('@AGENTS.md'), true);
});
