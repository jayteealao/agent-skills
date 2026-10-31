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
//   - codex.hooks.json wires the full event roster and its Windows commands resolve;
//   - the six agents/openai.yaml parse and every SKILL.md name is its directory;
//   - _subagents.md pins the effort-tier → host mapping;
//   - the doc-site gate passes (it is otherwise only a CI step).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from '../../lib/yaml.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const repoRoot = path.resolve(pluginRoot, '..', '..');
const read = (...p) => readFileSync(path.join(pluginRoot, ...p), 'utf8');

const CODEX_ADAPTERS = ['_adapter.mjs', 'session-start.mjs', 'subagent-start.mjs', 'pre-tool-use.mjs', 'permission-request.mjs', 'post-tool-use.mjs', 'stop-verify.mjs', 'stop-cost.mjs', 'answer-codex.mjs'];

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

test('every policy a codex adapter spawns is a hook source that exists', () => {
  const spawned = new Set();
  for (const name of CODEX_ADAPTERS) {
    const src = read('hooks', name);
    for (const m of src.matchAll(/(?:runPolicy|policyEntry)\([^,]+,\s*'([^']+)'/g)) spawned.add(m[1]);
  }
  assert.ok(spawned.size >= 5, `expected the adapters to spawn several policies, saw ${[...spawned]}`);
  for (const name of spawned) {
    assert.ok(existsSync(path.join(pluginRoot, 'hooks', `${name}.mjs`)), `hooks/ spawns hooks/${name}.mjs, which does not exist`);
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
      'Split $ARGUMENTS on whitespace.',                        // arguments-token (no earlier citation)
      '```',
      'date -u +"%Y" inside a fence is data',                   // exempt in a fence
      '```',
    ];
    writeFileSync(path.join(root, 'skills', 'x', 'SKILL.md'), `${lines.join('\n')}\n`);
    const findings = scan(root);
    const fired = new Set(findings.map((f) => f.family));
    assert.deepEqual([...fired].sort(), FAMILIES.map((f) => f.name).sort(), 'a family with no hit has a regex that matches nothing');
    assert.ok(!findings.some((f) => f.line === 13), 'a fenced shell clock read is data, not prose');
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

test('the four skills: openai.yaml parses with the expected shape; SKILL.md name is its directory', () => {
  const skills = readdirSync(path.join(pluginRoot, 'skills')).filter((d) => existsSync(path.join(pluginRoot, 'skills', d, 'SKILL.md')));
  assert.equal(skills.length, 4);
  for (const dir of skills) {
    const doc = parseYaml(read('skills', dir, 'agents', 'openai.yaml'));
    assert.ok(doc?.interface?.display_name && doc.interface.short_description && doc.interface.default_prompt, `${dir}: openai.yaml interface incomplete`);
    // wf is implicit: the model may start it, under the consent rule of its SKILL.md.
    assert.equal(doc.policy?.allow_implicit_invocation, dir === 'wf', `${dir}: allow_implicit_invocation must be ${dir === 'wf'}`);
    const name = /^name:\s*(\S+)/m.exec(read('skills', dir, 'SKILL.md'))?.[1];
    assert.equal(name, dir, `${dir}: SKILL.md name is ${name}`);
    const desc = /^description:\s*(.*)$/m.exec(read('skills', dir, 'SKILL.md'))?.[1] ?? '';
    assert.ok(desc.length > 0 && desc.length <= 1024, `${dir}: description is ${desc.length} chars; both hosts cap at 1024`);
  }
});

test('docs gate passes (the command page lists the registry, the README rules hold)', () => {
  const r = spawnSync(process.execPath, [path.join(pluginRoot, 'scripts', 'verify-docs.mjs')], { cwd: pluginRoot, encoding: 'utf8' });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
});

test('_subagents.md names only bookkeeping labels that yolo.js pins to the haiku tier', () => {
  const sub = read('skills', 'wf', 'reference', '_subagents.md');
  const m = /the bookkeeping agents that run fixed commands or copy data \(([^]*?)\) to `claude-haiku-5-5`/.exec(sub);
  assert.ok(m, '_subagents.md lists the bookkeeping labels');
  const names = [...m[1].matchAll(/`([a-z-]+)`/g)].map((x) => x[1]);
  assert.deepEqual(names, ['branch', 'writeback', 'run-end']);
  const yolo = read('skills', 'wf', 'workflows', 'yolo.js');
  for (const name of names) {
    assert.match(yolo, new RegExp(`label: [\`']${name}[\`':][^\n]*\.\.\.HAIKU`), `${name} is a HAIKU label of yolo.js`);
  }
});

test('the rule body of _output-boundary.md occurs under skills/ only in that file', () => {
  const owner = read('skills', 'wf', 'reference', '_output-boundary.md');
  const sentences = [
    'Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.',
    'translate workflow context into product/project language',
  ];
  for (const s of sentences) assert.ok(owner.includes(s), `the owner states: ${s}`);
  const files = [];
  (function walk(dir) {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, name.name);
      if (name.isDirectory()) walk(abs);
      else if (/\.(md|mjs|js|json|yaml)$/.test(name.name)) files.push(abs);
    }
  })(path.join(pluginRoot, 'skills'));
  const copies = files.filter((f) => !f.endsWith(`${path.sep}_output-boundary.md`) && sentences.some((s) => readFileSync(f, 'utf8').includes(s)));
  assert.deepEqual(copies.map((f) => path.relative(pluginRoot, f)), []);
});
