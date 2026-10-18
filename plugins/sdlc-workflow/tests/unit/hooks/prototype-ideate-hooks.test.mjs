// WF-PROTOTYPE-PLAN W2 and WF-IDEATE-SOURCES-PLAN 4.2 in the write hooks:
// - post-write-verify checks prototype-ledger.json against $defs.prototypeLedger and
//   the ledger rules, and blocks a bad ledger;
// - post-write-verify blocks a 01-ideate.md that leaves a source item without a result.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { equal, match } from 'node:assert/strict';

import { ledger } from '../../helpers/prototype-ledger.mjs';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const POST = join(PLUGIN_ROOT, 'hooks', 'post-write-verify.mjs');

function runPost(rel, content) {
  const tmp = mkdtempSync(join(tmpdir(), 'sdlc-proto-hooks-'));
  try {
    const abs = join(tmp, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, 'utf-8');
    return spawnSync(process.execPath, [POST], {
      cwd: tmp,
      input: JSON.stringify({ cwd: tmp, tool_input: { file_path: rel } }),
      encoding: 'utf-8',
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT, SDLC_DISABLE_ENSURE_HUB: '1', SDLC_DISABLE_TRAY_HEAL: '1' },
    });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const LEDGER_REL = '.ai/workflows/faces/prototype-ledger.json';

test('post-write-verify accepts a good prototype ledger', () => {
  const r = runPost(LEDGER_REL, JSON.stringify(ledger(), null, 2));
  equal(r.status, 0, r.stderr);
});

test('post-write-verify blocks a ledger whose round names a missing proof', () => {
  const l = ledger();
  l.rounds[0].proofs.push('P-09');
  const r = runPost(LEDGER_REL, JSON.stringify(l, null, 2));
  equal(r.status, 2, r.stderr);
  match(r.stderr, /proof ledger validation FAILED/);
  match(r.stderr, /P-09/);
});

test('post-write-verify blocks a ledger that breaks the schema', () => {
  const l = ledger();
  l.status = 'merged';
  const r = runPost(LEDGER_REL, JSON.stringify(l, null, 2));
  equal(r.status, 2, r.stderr);
  match(r.stderr, /proof ledger validation FAILED/);
});

function ideate(items) {
  const fm = {
    schema: 'sdlc/v1', type: 'ideation', slug: 'ideate-x', focus: 'sources', 'created-at': '2026-10-18T10:00:00Z',
    ideas: [{ id: 'IDEA-001', title: 'Use the cache API' }],
    sources: [{ id: 'S01', kind: 'web', origin: 'https://example.com/changelog', state: 'read', items: items.length }],
    'source-items': items,
  };
  return `---\n${JSON.stringify(fm)}\n---\n\n# Ideation\n`;
}
const IDEATE_REL = '.ai/workflows/ideate-x/01-ideate.md';

test('post-write-verify accepts a 01-ideate.md where every source item has a result', () => {
  const r = runPost(IDEATE_REL, ideate([{ id: 'S01-I01', title: 'A cache API', result: 'applies', idea: 'IDEA-001' }]));
  equal(r.status, 0, r.stderr);
});

test('post-write-verify blocks a 01-ideate.md with a source item that has no result', () => {
  const r = runPost(IDEATE_REL, ideate([{ id: 'S01-I01', title: 'A cache API', result: 'applies', idea: 'IDEA-001' }, { id: 'S01-I02', title: 'A new flag' }]));
  equal(r.status, 2, r.stderr);
  match(r.stderr, /S01-I02|result/);
});
