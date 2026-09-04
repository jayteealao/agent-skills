// tests/unit/hooks/codex-hooks.test.mjs — the Codex hook adapter layer, in the
// single-source tree (SINGLE-SOURCE-PLAN W6; migrated from the deleted codex
// tree's tests/hooks.test.mjs).
//
// Two layers: pure adapter logic (apply_patch parsing, touched-file extraction,
// stdin synthesis, activation decision, the Stop-time ledger + repair ceiling),
// and live integration that spawns the REAL hooks against a temp repo so the
// bundled shared-runtime policy actually runs (verify blocks an invalid artifact,
// the Stop hook re-checks the ledger, session-start stays silent).
//
// The plugin root IS the runtime root now: the adapter resolves dist/ and
// runtime-manifest.json at the plugin root, and the hook wiring it hashes is
// hooks/codex.hooks.json (the file .codex-plugin/plugin.json declares).

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  CODEX_HOOKS_FILE,
  PLUGIN_NAME,
  REPAIR_CEILING,
  bumpRepairAttempt,
  clearLedger,
  codexHostEnv,
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
} from '../../../hooks/_adapter.mjs';
import { commandFromEvent, isAllowedRuntimeInvocation } from '../../../hooks/permission-request.mjs';

const PKG_ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
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

// ── layout: one tree, one dist ─────────────────────────────────────────────────

test('resolveLayout: the plugin root is the runtime root (no runtime/ subdir)', () => {
  const layout = resolveLayout({ pluginRoot: PKG_ROOT });
  assert.equal(layout.runtimeRoot, layout.pluginRoot);
  assert.equal(layout.distDir, join(PKG_ROOT, 'dist'));
  assert.ok(existsSync(join(layout.distDir, 'post-write-verify.mjs')), 'bundled policy entry at <root>/dist');
  assert.ok(existsSync(join(layout.runtimeRoot, 'runtime-manifest.json')), 'identity at <root>/runtime-manifest.json');
  // Default (no --plugin-root): resolves to this tree, as a filesystem path on every platform.
  const implicit = resolveLayout({});
  assert.equal(implicit.pluginRoot, PKG_ROOT);
});

test('the hook hash covers hooks/codex.hooks.json, the file the Codex manifest declares', () => {
  assert.equal(CODEX_HOOKS_FILE, join('hooks', 'codex.hooks.json'));
  const manifest = JSON.parse(readFileSync(join(PKG_ROOT, '.codex-plugin', 'plugin.json'), 'utf-8'));
  assert.equal(manifest.hooks, './hooks/codex.hooks.json');
  assert.equal(hookDefinitionHash(PKG_ROOT).length, 64);
});

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

test('computeBaseline carries the single-source identity + hook hash', () => {
  const base = computeBaseline(resolveLayout({ pluginRoot: PKG_ROOT }));
  assert.equal(PLUGIN_NAME, 'sdlc-workflow');
  assert.equal(base.pluginName, 'sdlc-workflow');
  assert.equal(base.hubName, 'sdlc-workflow-hub');
  assert.equal(base.hookContractVersion, 1);
  assert.ok(base.runtimeBuildId && base.runtimeBuildId.length === 64, 'runtime buildId present');
  assert.equal(base.hookDefinitionHash, hookDefinitionHash(PKG_ROOT));
  // The version the activation record keys on is the Codex manifest's, which the
  // release guard keeps equal to .claude-plugin/plugin.json and package.json.
  const codexManifest = JSON.parse(readFileSync(join(PKG_ROOT, '.codex-plugin', 'plugin.json'), 'utf-8'));
  assert.equal(base.pluginVersion, codexManifest.version);
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

// ── host signal (SINGLE-SOURCE-PLAN §3.4) ───────────────────────────────────────

test('codexHostEnv sets SDLC_HOST only; SDLC_HUB_STARTED_BY is derived at the hub-spawn site, never here', () => {
  const env = codexHostEnv({ PATH: '/x' });
  assert.equal(env.SDLC_HOST, 'codex');
  assert.equal(env.PATH, '/x');
  assert.ok(!('SDLC_HUB_STARTED_BY' in env), 'adapter never sets the derived signal');
  // An explicit entrypoint override wins (tests + escape hatches)…
  const overridden = codexHostEnv({ SDLC_HOST: 'test-host', SDLC_HUB_STARTED_BY: 'x' });
  assert.equal(overridden.SDLC_HOST, 'test-host');
  // …but an inherited derived signal is stripped so one place decides.
  assert.ok(!('SDLC_HUB_STARTED_BY' in overridden), 'inherited SDLC_HUB_STARTED_BY is dropped');
});

test('lib/hub-lifecycle derives SDLC_HUB_STARTED_BY from SDLC_HOST at the single spawn site', () => {
  const src = readFileSync(join(PKG_ROOT, 'lib', 'hub-lifecycle.mjs'), 'utf-8');
  assert.match(src, /const STARTED_BY_HOST = process\.env\.SDLC_HOST \|\| 'claude';/);
  assert.match(src, /SDLC_HUB_STARTED_BY: STARTED_BY_HOST,/);
  // No other source file may set the derived signal.
  for (const rel of ['hooks/_adapter.mjs', 'hooks/session-start.mjs', 'hooks/seed-memory.mjs', 'hooks/session-start-orient.mjs']) {
    const s = readFileSync(join(PKG_ROOT, rel), 'utf-8');
    assert.ok(!/SDLC_HUB_STARTED_BY\s*[:=]\s*['"]/.test(s), `${rel} must not set SDLC_HUB_STARTED_BY`);
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
    for (let i = 1; i <= REPAIR_CEILING; i++) {
      const res = runHook('stop-verify.mjs', event, { repo, pluginData });
      assert.equal(res.status, 0);
      const out = JSON.parse(res.stdout);
      assert.equal(out.decision, 'block', `attempt ${i} should block`);
    }
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
    recordTouched(pluginData, 'sOk', ['.ai/workflows/demo/99-gone.md']);
    const res = runHook('stop-verify.mjs', { session_id: 'sOk', cwd: repo, hook_event_name: 'Stop' }, { repo, pluginData });
    assert.equal(res.status, 0);
    assert.equal(res.stdout.trim(), '', 'no block emitted');
  } finally {
    cleanup();
  }
});

const DEMO_INDEX = '---\nschema: sdlc/v1\ntype: index\nslug: demo\ntitle: Demo Feature\ncurrent-stage: plan\nstatus: active\nrecommended-next-invocation: /wf plan demo\n---\n# demo\n';

test('session-start emits NO orientation and records NO activation without a confirmed hub', () => {
  const { repo, pluginData, cleanup } = mkRepo();
  try {
    writeFileSync(join(repo, '.ai', 'workflows', 'demo', '00-index.md'), DEMO_INDEX);
    const env = { SDLC_DISABLE_HUB_ENSURE: '1', SDLC_DISABLE_MEMORY_SEED: '1' };
    const res = runHook('session-start.mjs', { cwd: repo, hook_event_name: 'SessionStart', source: 'startup', session_id: 's1' }, { repo, pluginData, env });
    assert.equal(res.status, 0, `stderr=${res.stderr}`);
    assert.equal(res.stdout.trim(), '', 'no orientation payload — the hook is background-maintenance only');
    assert.ok(!existsSync(join(pluginData, 'activation.json')), 'no activation record without a confirmed hub');
  } finally {
    cleanup();
  }
});

test('session-start seeds the /wf rules kernel silently (SDLC_HOST=codex suppresses the Claude notice)', () => {
  const { repo, pluginData, cleanup } = mkRepo();
  try {
    const env = { SDLC_DISABLE_HUB_ENSURE: '1' };
    const res = runHook('session-start.mjs', { cwd: repo, hook_event_name: 'SessionStart', source: 'startup', session_id: 's1' }, { repo, pluginData, env });
    assert.equal(res.status, 0, `stderr=${res.stderr}`);
    // runBundled CAPTURES the child's stdout, so an empty stdout here proves only
    // that the adapter emits nothing — not that the signal reached the seed. The
    // env-propagation proof is host-signal.test.mjs ("runBundled spawns with
    // SDLC_HOST=codex and strips an inherited SDLC_HUB_STARTED_BY").
    assert.equal(res.stdout.trim(), '', 'the adapter itself emits nothing on SessionStart');
    assert.ok(existsSync(join(repo, 'AGENTS.md')), 'kernel seeded into AGENTS.md');
    assert.ok(existsSync(join(repo, '.ai', '.wf-rules-seeded')), 'seed marker written');
  } finally {
    cleanup();
  }
});

test('pre-tool-use DENY emits the modern permissionDecision envelope + legacy exit 2', () => {
  const { repo, pluginData, cleanup } = mkRepo();
  try {
    const rel = '.ai/workflows/demo/01-intake.md';
    const event = {
      session_id: 'sPre', cwd: repo, hook_event_name: 'PreToolUse', tool_name: 'Write',
      tool_input: { file_path: rel, content: '---\nschema: bogus/v1\ntype: intake\nslug: demo\n---\n# intake\n' },
    };
    const res = runHook('pre-tool-use.mjs', event, { repo, pluginData });
    assert.equal(res.status, 2, `expected legacy deny exit; stderr=${res.stderr}`);
    const out = JSON.parse(res.stdout);
    assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
    assert.ok(out.hookSpecificOutput.permissionDecisionReason, 'deny carries a reason');
  } finally {
    cleanup();
  }
});

test('subagent-start injects active-slug + boundary context; silent with no workflows', () => {
  const { repo, pluginData, cleanup } = mkRepo();
  try {
    let res = runHook('subagent-start.mjs', { cwd: repo, hook_event_name: 'SubagentStart', agent_type: 'explorer' }, { repo, pluginData });
    assert.equal(res.status, 0);
    assert.equal(res.stdout.trim(), '', 'silent when nothing is active');

    writeFileSync(join(repo, '.ai', 'workflows', 'demo', '00-index.md'), DEMO_INDEX);
    writeFileSync(join(repo, '.ai', 'workflows', 'INDEX.md'), 'demo\tactive\tfeature\tmain\t2026-07-08T00:00:00Z\nother\tclosed\tfix\tmain\t2026-07-01T00:00:00Z\n');
    res = runHook('subagent-start.mjs', { cwd: repo, hook_event_name: 'SubagentStart', agent_type: 'explorer' }, { repo, pluginData });
    assert.equal(res.status, 0, `stderr=${res.stderr}`);
    const out = JSON.parse(res.stdout);
    assert.equal(out.hookSpecificOutput.hookEventName, 'SubagentStart');
    const ctx = out.hookSpecificOutput.additionalContext;
    assert.match(ctx, /`demo` \(stage: plan\)/, 'names the active slug + stage');
    assert.doesNotMatch(ctx, /other/, 'closed workflows excluded');
    assert.match(ctx, /External Output Boundary/, 'carries the boundary reminder');
    assert.match(ctx, /do NOT\s+write workflow artifacts/, 'children read, parent writes');
  } finally {
    cleanup();
  }
});

test('permission-request allowlist: plugin runtime invocations only', () => {
  const layout = resolveLayout({ pluginRoot: PKG_ROOT });
  const distScript = join(layout.runtimeRoot, 'dist', 'hub-ensure.mjs');
  const roots = [join(layout.runtimeRoot, 'dist')];
  assert.ok(isAllowedRuntimeInvocation(['node', distScript, '--confirm'], roots));
  assert.ok(isAllowedRuntimeInvocation([process.execPath, distScript], roots));
  assert.ok(!isAllowedRuntimeInvocation(['node', join(PKG_ROOT, 'evil.mjs')], roots), 'outside runtime dist');
  assert.ok(!isAllowedRuntimeInvocation(['node', 'hub-ensure.mjs'], roots), 'bare relative script');
  assert.ok(!isAllowedRuntimeInvocation(['python', distScript], roots), 'non-node executable');
  assert.ok(!isAllowedRuntimeInvocation(['rm', '-rf', '/'], roots));
  assert.deepEqual(commandFromEvent({ tool_input: { command: `node "${distScript}" --confirm` } }), ['node', distScript, '--confirm']);
  assert.deepEqual(commandFromEvent({ tool_input: { command: ['node', distScript] } }), ['node', distScript]);
  assert.equal(commandFromEvent({ tool_input: {} }), null);
});

test('permission-request hook: emits allow for runtime dist, silent otherwise, logs the allow', () => {
  const { repo, pluginData, cleanup } = mkRepo();
  try {
    const layout = resolveLayout({ pluginRoot: PKG_ROOT });
    const distScript = join(layout.runtimeRoot, 'dist', 'post-write-render.mjs');
    let res = runHook('permission-request.mjs', {
      cwd: repo, hook_event_name: 'PermissionRequest', tool_name: 'shell',
      tool_input: { command: `node "${distScript}"` },
    }, { repo, pluginData });
    assert.equal(res.status, 0, `stderr=${res.stderr}`);
    const out = JSON.parse(res.stdout);
    assert.equal(out.hookSpecificOutput.hookEventName, 'PermissionRequest');
    assert.equal(out.hookSpecificOutput.decision.behavior, 'allow');
    assert.match(readFileSync(join(pluginData, 'permission-auto-allow.log'), 'utf-8'), /post-write-render\.mjs/);

    res = runHook('permission-request.mjs', {
      cwd: repo, hook_event_name: 'PermissionRequest', tool_name: 'shell',
      tool_input: { command: 'rm -rf node_modules' },
    }, { repo, pluginData });
    assert.equal(res.status, 0);
    assert.equal(res.stdout.trim(), '', 'no opinion on non-runtime commands');
  } finally {
    cleanup();
  }
});

test('session-start writes activation once after the hub is confirmed', () => {
  const { repo, pluginData, cleanup } = mkRepo();
  try {
    writeFileSync(join(repo, '.ai', 'workflows', 'demo', '00-index.md'), DEMO_INDEX);
    const env = { SDLC_ASSUME_HUB_READY: '1', SDLC_DISABLE_MEMORY_SEED: '1' };
    const res = runHook('session-start.mjs', { cwd: repo, hook_event_name: 'SessionStart', source: 'startup', session_id: 's1' }, { repo, pluginData, env });
    assert.equal(res.status, 0, `stderr=${res.stderr}`);
    assert.equal(res.stdout.trim(), '', 'no orientation payload even on the activation path');

    const actPath = join(pluginData, 'activation.json');
    assert.ok(existsSync(actPath), 'activation recorded after a confirmed hub');
    const first = readFileSync(actPath, 'utf-8');
    assert.equal(JSON.parse(first).pluginName, 'sdlc-workflow');

    runHook('session-start.mjs', { cwd: repo, hook_event_name: 'SessionStart', source: 'resume', session_id: 's2' }, { repo, pluginData, env });
    assert.equal(readFileSync(actPath, 'utf-8'), first, 'activation not repeated');
  } finally {
    cleanup();
  }
});
