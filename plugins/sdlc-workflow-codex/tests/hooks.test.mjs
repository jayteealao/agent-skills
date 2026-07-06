// tests/hooks.test.mjs — native Codex hook adapter (Workstream E).
//
// Two layers: pure adapter logic (apply_patch parsing, touched-file extraction,
// stdin synthesis, activation decision, the Stop-time ledger + repair ceiling),
// and live integration that spawns the REAL hooks against a temp repo so the
// bundled shared-runtime policy actually runs (verify blocks an invalid artifact,
// the Stop hook re-checks the ledger, session-start emits native orientation).

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  REPAIR_CEILING,
  bumpRepairAttempt,
  clearLedger,
  computeBaseline,
  findProjectRoot,
  hookDefinitionHash,
  isManagedArtifactPath,
  needsActivation,
  parseApplyPatch,
  readLedger,
  recordTouched,
  resolveLayout,
  synthMultiStdin,
  synthSingleStdin,
  touchedFromEvent,
} from '../hooks/_adapter.mjs';

const PKG_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const HOOKS = join(PKG_ROOT, 'hooks');

function mkRepo() {
  const repo = mkdtempSync(join(tmpdir(), 'codex-hook-repo-'));
  const pluginData = mkdtempSync(join(tmpdir(), 'codex-hook-data-'));
  mkdirSync(join(repo, '.ai', 'workflows', 'demo'), { recursive: true });
  // Keep tests hermetic: suppress the render stage so no hub is spawned.
  mkdirSync(join(repo, '.ai', '_view'), { recursive: true });
  writeFileSync(join(repo, '.ai', '_view', '.render-suppress'), '');
  return { repo, pluginData, cleanup: () => { rmSync(repo, { recursive: true, force: true }); rmSync(pluginData, { recursive: true, force: true }); } };
}

function runHook(name, event, { repo, pluginData, env = {} }) {
  try {
    const stdout = execFileSync(
      process.execPath,
      [join(HOOKS, name), '--plugin-root', PKG_ROOT, '--plugin-data', pluginData],
      { input: JSON.stringify(event), cwd: repo, encoding: 'utf-8', env: { ...process.env, ...env } },
    );
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    return { status: err.status ?? 1, stdout: err.stdout?.toString() ?? '', stderr: err.stderr?.toString() ?? '' };
  }
}

// ── pure adapter logic ──────────────────────────────────────────────────────────

test('parseApplyPatch extracts Add/Update/Delete paths and Add content', () => {
  const patch = [
    '*** Begin Patch',
    '*** Add File: .ai/workflows/demo/01-intake.md',
    '+---',
    '+schema: sdlc/v1',
    '+---',
    '*** Update File: src/app.ts',
    '@@',
    '-old',
    '+new',
    '*** Delete File: tmp/old.md',
    '*** End Patch',
  ].join('\n');
  const ops = parseApplyPatch(patch);
  assert.deepEqual(ops.map((o) => `${o.op}:${o.path}`), [
    'add:.ai/workflows/demo/01-intake.md',
    'update:src/app.ts',
    'delete:tmp/old.md',
  ]);
  assert.equal(ops[0].content, '---\nschema: sdlc/v1\n---');
});

test('touchedFromEvent handles Write, Edit edits[], and apply_patch', () => {
  assert.deepEqual(touchedFromEvent({ tool_input: { file_path: 'a.md', content: 'x' } }).map((t) => t.path), ['a.md']);
  assert.deepEqual(
    touchedFromEvent({ tool_input: { edits: [{ file_path: 'a.md' }, { file_path: 'b.md' }] } }).map((t) => t.path),
    ['a.md', 'b.md'],
  );
  const ap = touchedFromEvent({ tool_name: 'apply_patch', tool_input: { input: '*** Begin Patch\n*** Update File: c.md\n*** End Patch' } });
  assert.deepEqual(ap.map((t) => t.path), ['c.md']);
});

test('synth stdin shapes match the bundled policy contract', () => {
  const multi = synthMultiStdin('/repo', 'PostToolUse', ['a.md', 'b.md']);
  assert.equal(multi.cwd, '/repo');
  assert.equal(multi.tool_input.file_path, 'a.md');
  assert.deepEqual(multi.tool_input.edits, [{ file_path: 'a.md' }, { file_path: 'b.md' }]);
  const single = synthSingleStdin('/repo', 'PreToolUse', 'a.md', 'BODY');
  assert.equal(single.tool_input.content, 'BODY');
});

test('isManagedArtifactPath matches sdlc artifacts only', () => {
  assert.ok(isManagedArtifactPath('.ai/workflows/demo/01-intake.md'));
  assert.ok(isManagedArtifactPath('repo/PRODUCT.md'));
  // ship-plan.md is a managed project-context artifact (the verifier checks it on
  // write, so the Stop-time ledger must track it too — mirrors the shared helper).
  assert.ok(isManagedArtifactPath('.ai/ship-plan.md'));
  assert.ok(isManagedArtifactPath('repo/.ai/ship-plan.md'));
  assert.ok(!isManagedArtifactPath('src/app.ts'));
  assert.ok(!isManagedArtifactPath('.ai/workflows/demo/01-intake.yaml'));
});

test('needsActivation: missing/mismatched record requires activation', () => {
  const base = computeBaseline(resolveLayout({ pluginRoot: PKG_ROOT }));
  assert.equal(needsActivation(null, base), true);
  assert.equal(needsActivation({ ...base }, base), false);
  assert.equal(needsActivation({ ...base, pluginVersion: '0.0.1' }, base), true);
  assert.equal(needsActivation({ ...base, runtimeBuildId: 'deadbeef' }, base), true);
  assert.equal(needsActivation({ ...base, hookDefinitionHash: 'x' }, base), true);
});

test('computeBaseline carries the bundled runtime identity + hook hash', () => {
  const base = computeBaseline(resolveLayout({ pluginRoot: PKG_ROOT }));
  assert.equal(base.pluginName, 'sdlc-workflow-codex');
  assert.equal(base.hubName, 'sdlc-workflow-hub');
  assert.equal(base.hookContractVersion, 1);
  assert.ok(base.runtimeBuildId && base.runtimeBuildId.length === 64, 'runtime buildId present');
  assert.equal(base.hookDefinitionHash, hookDefinitionHash(PKG_ROOT));
});

test('findProjectRoot climbs to the .ai/workflows root', () => {
  const { repo, cleanup } = mkRepo();
  try {
    const deep = join(repo, '.ai', 'workflows', 'demo');
    assert.equal(findProjectRoot(deep), repo);
  } finally {
    cleanup();
  }
});

test('Stop-time ledger: record, repair counter, clear', () => {
  const { pluginData, cleanup } = mkRepo();
  try {
    recordTouched(pluginData, 'sess1', ['.ai/workflows/demo/01-intake.md', '.ai/workflows/demo/01-intake.md']);
    recordTouched(pluginData, 'sess1', ['.ai/workflows/demo/02-shape.md']);
    let ledger = readLedger(pluginData, 'sess1');
    assert.deepEqual(ledger.paths, ['.ai/workflows/demo/01-intake.md', '.ai/workflows/demo/02-shape.md']);
    assert.equal(bumpRepairAttempt(pluginData, 'sess1'), 1);
    assert.equal(bumpRepairAttempt(pluginData, 'sess1'), 2);
    clearLedger(pluginData, 'sess1');
    ledger = readLedger(pluginData, 'sess1');
    assert.deepEqual(ledger.paths, []);
  } finally {
    cleanup();
  }
});

// ── live integration ────────────────────────────────────────────────────────────

test('post-tool-use BLOCKS an invalid managed artifact + records the ledger', () => {
  const { repo, pluginData, cleanup } = mkRepo();
  try {
    const rel = '.ai/workflows/demo/01-intake.md';
    writeFileSync(join(repo, rel), '---\nschema: bogus/v1\ntype: intake\nslug: demo\n---\n# intake\n');
    const event = { session_id: 'sX', cwd: repo, hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: rel } };
    const res = runHook('post-tool-use.mjs', event, { repo, pluginData });
    assert.equal(res.status, 2, `expected block; stderr=${res.stderr}`);
    assert.match(res.stderr, /schema|sdlc\/v1|validation/i);
    assert.deepEqual(readLedger(pluginData, 'sX').paths, [rel]);
  } finally {
    cleanup();
  }
});

test('post-tool-use exits 0 when no managed artifact is touched', () => {
  const { repo, pluginData, cleanup } = mkRepo();
  try {
    writeFileSync(join(repo, 'notes.md'), '# just notes\n');
    const event = { session_id: 'sY', cwd: repo, hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: 'notes.md' } };
    const res = runHook('post-tool-use.mjs', event, { repo, pluginData });
    assert.equal(res.status, 0, `stderr=${res.stderr}`);
  } finally {
    cleanup();
  }
});

test('stop-verify blocks on a ledgered invalid artifact, then bounds the repair loop', () => {
  const { repo, pluginData, cleanup } = mkRepo();
  try {
    const rel = '.ai/workflows/demo/01-intake.md';
    writeFileSync(join(repo, rel), '---\nschema: bogus/v1\ntype: intake\nslug: demo\n---\n# intake\n');
    recordTouched(pluginData, 'sZ', [rel]);
    const event = { session_id: 'sZ', cwd: repo, hook_event_name: 'Stop' };

    // First REPAIR_CEILING calls block with a repair continuation.
    for (let i = 1; i <= REPAIR_CEILING; i++) {
      const res = runHook('stop-verify.mjs', event, { repo, pluginData });
      assert.equal(res.status, 0);
      const out = JSON.parse(res.stdout);
      assert.equal(out.decision, 'block', `attempt ${i} should block`);
    }
    // The next call exceeds the ceiling: no block, surfaces a hard failure note.
    const final = runHook('stop-verify.mjs', event, { repo, pluginData });
    const out = JSON.parse(final.stdout);
    assert.notEqual(out.decision, 'block');
    assert.match(JSON.stringify(out), /repair attempts/i);
  } finally {
    cleanup();
  }
});

test('stop-verify clears the ledger when artifacts are valid (no managed touched)', () => {
  const { repo, pluginData, cleanup } = mkRepo();
  try {
    // A managed path that does not exist on disk: verify skips it → clean.
    recordTouched(pluginData, 'sOk', ['.ai/workflows/demo/99-gone.md']);
    const res = runHook('stop-verify.mjs', { session_id: 'sOk', cwd: repo, hook_event_name: 'Stop' }, { repo, pluginData });
    assert.equal(res.status, 0);
    assert.equal(res.stdout.trim(), '', 'no block emitted');
  } finally {
    cleanup();
  }
});

const DEMO_INDEX = '---\nschema: sdlc/v1\ntype: index\nslug: demo\ntitle: Demo Feature\ncurrent-stage: plan\nstatus: active\nrecommended-next-invocation: /wf-meta plan demo\n---\n# demo\n';

test('session-start emits NO orientation and records NO activation without a confirmed hub', () => {
  const { repo, pluginData, cleanup } = mkRepo();
  try {
    // An ACTIVE workflow is present on disk — the strongest case for the
    // orientation strip: even with something to orient about, the hook stays
    // silent (pure background maintenance; the wf skills re-read 00-index.md
    // themselves on invocation).
    writeFileSync(join(repo, '.ai', 'workflows', 'demo', '00-index.md'), DEMO_INDEX);
    // Hub ensure disabled → no hub confirmed → activation must NOT be recorded
    // (the native-interop contract records activation only after a confirmed hub).
    const env = { SDLC_DISABLE_HUB_ENSURE: '1' };
    const res = runHook('session-start.mjs', { cwd: repo, hook_event_name: 'SessionStart', source: 'startup', session_id: 's1' }, { repo, pluginData, env });
    assert.equal(res.status, 0, `stderr=${res.stderr}`);
    assert.equal(res.stdout.trim(), '', 'no orientation payload — the hook is background-maintenance only');
    assert.ok(!existsSync(join(pluginData, 'activation.json')), 'no activation record without a confirmed hub');
  } finally {
    cleanup();
  }
});

test('session-start writes activation once after the hub is confirmed', () => {
  const { repo, pluginData, cleanup } = mkRepo();
  try {
    writeFileSync(join(repo, '.ai', 'workflows', 'demo', '00-index.md'), DEMO_INDEX);
    // Treat the hub as confirmed (no real hub spawned) so the activation-write
    // path runs hermetically.
    const env = { SDLC_ASSUME_HUB_READY: '1' };
    const res = runHook('session-start.mjs', { cwd: repo, hook_event_name: 'SessionStart', source: 'startup', session_id: 's1' }, { repo, pluginData, env });
    assert.equal(res.status, 0, `stderr=${res.stderr}`);
    assert.equal(res.stdout.trim(), '', 'no orientation payload even on the activation path');

    const actPath = join(pluginData, 'activation.json');
    assert.ok(existsSync(actPath), 'activation recorded after a confirmed hub');
    const first = readFileSync(actPath, 'utf-8');

    // Second SessionStart with the same baseline must NOT rewrite the record.
    runHook('session-start.mjs', { cwd: repo, hook_event_name: 'SessionStart', source: 'resume', session_id: 's2' }, { repo, pluginData, env });
    assert.equal(readFileSync(actPath, 'utf-8'), first, 'activation not repeated');
  } finally {
    cleanup();
  }
});
