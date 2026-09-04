// tests/unit/single-source-contract.test.mjs — behavioral proofs of the
// single-source contract that the structural tests in single-source.test.mjs
// and gates.test.mjs could not give (v9.153.2, from the coverage audit):
//
//   - the Codex adapters run from SOURCE on an install with no node_modules, so
//     they may import only ./_adapter.mjs and node builtins;
//   - every bundle a Codex adapter spawns is a build entrypoint that exists;
//   - every neutrality family FIRES on a fixture (a regex that matches nothing
//     would otherwise pass the clean-tree gate silently);
//   - checkVersions() flags a drifted carrier;
//   - SDLC_HUB_STARTED_BY is derived from SDLC_HOST (behavior, not source text);
//   - hub-ensure --bootstrap enqueues the whole-repo pass with the host signal;
//   - codex.hooks.json wires the full event roster and its Windows commands resolve;
//   - the six agents/openai.yaml parse and every SKILL.md name is its directory;
//   - _subagents.md pins the effort-tier → host mapping;
//   - the doc-site gate passes (it is otherwise only a CI step).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const repoRoot = path.resolve(pluginRoot, '..', '..');
const read = (...p) => readFileSync(path.join(pluginRoot, ...p), 'utf8');

const CODEX_ADAPTERS = ['_adapter.mjs', 'session-start.mjs', 'subagent-start.mjs', 'pre-tool-use.mjs', 'permission-request.mjs', 'post-tool-use.mjs', 'stop-verify.mjs'];

test('codex adapters import only ./_adapter.mjs and node builtins (they run from source with no node_modules)', () => {
  for (const name of CODEX_ADAPTERS) {
    const src = read('hooks', name);
    const specifiers = [...src.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    assert.ok(specifiers.length > 0, `${name}: no imports parsed`);
    for (const spec of specifiers) {
      assert.ok(spec === './_adapter.mjs' || spec.startsWith('node:'), `hooks/${name} imports ${spec} — an install has no node_modules and no bundled lib/ for the adapters`);
    }
  }
});

test('every bundle a codex adapter spawns is a build entrypoint and exists in dist/', () => {
  const build = read('scripts', 'build.mjs');
  const entries = new Set([...build.matchAll(/^\s+'([a-z0-9-]+)',\s+\/\//gm)].map((m) => m[1]));
  assert.ok(entries.has('seed-memory') && entries.has('hub-ensure'), 'build.mjs entry parse failed');
  const spawned = new Set();
  for (const name of CODEX_ADAPTERS) {
    const src = read('hooks', name);
    for (const m of src.matchAll(/(?:runBundled|bundledEntry)\([^,]+,\s*'([^']+)'/g)) spawned.add(m[1]);
  }
  assert.ok(spawned.size >= 5, `expected the adapters to spawn several bundles, saw ${[...spawned]}`);
  for (const name of spawned) {
    assert.ok(entries.has(name), `hooks/ spawns dist/${name}.mjs but scripts/build.mjs does not list it as an entry`);
    assert.ok(existsSync(path.join(pluginRoot, 'dist', `${name}.mjs`)), `dist/${name}.mjs missing — run npm run build`);
  }
});

test('every neutrality family fires on a fixture, and the fence exemption holds', async () => {
  const { scan, FAMILIES } = await import('../../scripts/verify-host-neutrality.mjs');
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-neutrality-fixture-'));
  try {
    mkdirSync(path.join(root, 'skills', 'x'), { recursive: true });
    mkdirSync(path.join(root, 'reference'), { recursive: true });
    const lines = [
      'Ask with AskUserQuestion.',                              // claude-tools
      'Use the `deep-research` skill.',                         // claude-tools (retired built-in)
      'Pin model: `haiku` here.',                               // claude-model-pins
      'Spawn with spawn_agent.',                                // codex-tools
      'Type $wf status.',                                       // invocation-sigil
      'Run ${CLAUDE_PLUGIN_ROOT}/x.',                            // plugin-root
      'Stamp with date +"%Y".',                                 // timestamp-mandate
      'The `post-write-verify` hook blocks.',                   // claude-hook-names
      'Under Claude Code this differs.',                        // host-names
      'See sdlc-workflow-codex for the mirror.',                // stale-tree
      'Run $wf-intake now.',                                    // retired-router
      '```',
      'date -u +"%Y" inside a fence is data',                   // exempt in a fence
      '```',
    ];
    writeFileSync(path.join(root, 'skills', 'x', 'SKILL.md'), `${lines.join('\n')}\n`);
    const findings = scan(root);
    const fired = new Set(findings.map((f) => f.family));
    assert.deepEqual([...fired].sort(), FAMILIES.map((f) => f.name).sort(), 'a family with no hit has a regex that matches nothing');
    assert.ok(!findings.some((f) => f.line === 12), 'a fenced shell clock read is data, not prose');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('checkVersions flags a drifted carrier and a wrong catalog path', async () => {
  const { checkVersions } = await import('../../scripts/verify-release-versions.mjs');
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-versions-fixture-'));
  try {
    const plugin = path.join(root, 'plugins', 'sdlc-workflow');
    for (const rel of ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json', 'package.json']) {
      mkdirSync(path.dirname(path.join(plugin, rel)), { recursive: true });
      cpSync(path.join(pluginRoot, rel), path.join(plugin, rel));
    }
    for (const rel of ['.claude-plugin/marketplace.json', '.agents/plugins/marketplace.json']) {
      mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      cpSync(path.join(repoRoot, rel), path.join(root, rel));
    }
    assert.deepEqual(checkVersions({ pluginRoot: plugin, repoRoot: root }).problems, [], 'the copied carriers agree');
    const codex = path.join(plugin, '.codex-plugin', 'plugin.json');
    writeFileSync(codex, read('.codex-plugin', 'plugin.json').replace(/"version": "[^"]+"/, '"version": "0.0.1"'));
    const drifted = checkVersions({ pluginRoot: plugin, repoRoot: root });
    assert.ok(drifted.problems.some((p) => /codex-plugin carries 0\.0\.1/.test(p)), `expected a codex-plugin drift problem, got ${drifted.problems}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('SDLC_HUB_STARTED_BY is DERIVED from SDLC_HOST at the hub-spawn site (behavior)', () => {
  const probe = "import('./lib/hub-lifecycle.mjs').then((m) => process.stdout.write(m.STARTED_BY_HOST))";
  const run = (env) => execFileSync(process.execPath, ['--input-type=module', '-e', probe], { cwd: pluginRoot, encoding: 'utf8', env }).trim();
  const base = { ...process.env };
  delete base.SDLC_HOST;
  delete base.SDLC_HUB_STARTED_BY;
  assert.equal(run(base), 'claude', 'no signal → claude');
  assert.equal(run({ ...base, SDLC_HOST: 'codex' }), 'codex', 'SDLC_HOST=codex → codex');
  assert.equal(run({ ...base, SDLC_HUB_STARTED_BY: 'codex' }), 'claude', 'an inherited SDLC_HUB_STARTED_BY is not an input');
});

test('hub-ensure --bootstrap enqueues the whole-repo pass with the host signal (no hub needed)', async () => {
  const { queueDir } = await import('../../lib/render-queue.mjs');
  const repo = mkdtempSync(path.join(tmpdir(), 'sdlc-bootstrap-'));
  try {
    const viewDir = path.join(repo, '.ai', '_view');
    const env = { ...process.env, SDLC_HOST: 'codex', SDLC_HOME: path.join(repo, '.sdlc-home') };
    delete env.SDLC_HUB_STARTED_BY;
    const r = spawnSync(process.execPath, [
      path.join(pluginRoot, 'dist', 'hub-ensure.mjs'), '--no-ensure', '--bootstrap',
      '--plugin-root', pluginRoot, '--project-root', repo, '--view', viewDir,
    ], { encoding: 'utf8', env, timeout: 20000 });
    assert.equal(r.status, 0, r.stderr);
    const records = readdirSync(queueDir(viewDir)).filter((f) => f.endsWith('.json') && !f.startsWith('.'));
    assert.equal(records.length, 1, `expected one queued bootstrap record, saw ${records}`);
    const rec = JSON.parse(readFileSync(path.join(queueDir(viewDir), records[0]), 'utf8'));
    assert.equal(rec.kind, 'bootstrap');
    assert.equal(rec.bucket, '__bootstrap__');
    assert.equal(rec.enqueuedBy.host, 'codex');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('codex.hooks.json wires the full event roster and its Windows commands resolve', () => {
  const wiring = JSON.parse(read('hooks', 'codex.hooks.json'));
  assert.deepEqual(Object.keys(wiring.hooks).sort(), ['PermissionRequest', 'PostToolUse', 'PreToolUse', 'SessionStart', 'Stop', 'SubagentStart', 'SubagentStop']);
  for (const [event, groups] of Object.entries(wiring.hooks)) {
    for (const group of groups) {
      for (const hook of group.hooks) {
        const win = /\$\{PLUGIN_ROOT\}\\([^"]+)"/.exec(hook.commandWindows);
        assert.ok(win, `${event}: commandWindows lacks a ${'${PLUGIN_ROOT}'}\\… script path`);
        const rel = win[1].replace(/\\/g, '/');
        assert.ok(existsSync(path.join(pluginRoot, rel)), `${event}: commandWindows names ${rel}, which does not exist`);
        assert.ok(CODEX_ADAPTERS.includes(path.basename(rel)), `${event}: ${rel} is not a known Codex adapter`);
      }
    }
  }
});

test('the six skills: openai.yaml parses with the expected shape; SKILL.md name is its directory', () => {
  const skills = readdirSync(path.join(pluginRoot, 'skills')).filter((d) => existsSync(path.join(pluginRoot, 'skills', d, 'SKILL.md')));
  assert.equal(skills.length, 6);
  for (const dir of skills) {
    const doc = yaml.load(read('skills', dir, 'agents', 'openai.yaml'));
    assert.ok(doc?.interface?.display_name && doc.interface.short_description && doc.interface.default_prompt, `${dir}: openai.yaml interface incomplete`);
    assert.equal(doc.policy?.allow_implicit_invocation, false, `${dir}: allow_implicit_invocation must be false so only explicit user invocation selects the skill`);
    const name = /^name:\s*(\S+)/m.exec(read('skills', dir, 'SKILL.md'))?.[1];
    assert.equal(name, dir, `${dir}: SKILL.md name is ${name}`);
    const desc = /^description:\s*(.*)$/m.exec(read('skills', dir, 'SKILL.md'))?.[1] ?? '';
    assert.ok(desc.length > 0 && desc.length <= 1024, `${dir}: description is ${desc.length} chars; both hosts cap at 1024`);
  }
});

test('_subagents.md pins the effort-tier → host mapping', () => {
  const src = read('skills', 'wf', 'reference', '_subagents.md');
  assert.match(src, /low = `haiku`; medium and high = `sonnet`/);
  assert.match(src, /Never `opus`/);
  assert.match(src, /Pass the reasoning effort on the spawn: low, medium, high/);
  assert.match(src, /\*\*Paths in a child prompt are absolute\.\*\*/, 'the child-prompt path rule (v9.153.2) must stay');
  assert.match(src, /A \*\*research sub-agent\*\* is a read-only child/, 'the research sub-agent definition must stay');
});

test('doc-site gate passes (invariants a–f, incl. the host note on every /wf page)', () => {
  const r = spawnSync(process.execPath, [path.join(pluginRoot, 'scripts', 'verify-doc-site.mjs')], { cwd: pluginRoot, encoding: 'utf8' });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
});
