// tests/unit/single-source.test.mjs — structural invariants of the single-source
// tree (SINGLE-SOURCE-PLAN W4/W6/W8): one plugin directory that both hosts read
// directly, two in-tree manifests, two hook wirings, one skills/ tree, and a
// plugin-owned host-filtered roster.
//
// Codex catalogs SKILLS, never `wf` sub-command keys (plan C10), so the roster
// check here is against this repo's own dispatch data — SKILL.md's key tables
// and _host-invocation.md's availability table — not against anything a host
// exposes. That is the strongest assertion available for a Claude-only KEY.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const repoRoot = path.resolve(pluginRoot, '..', '..');
const read = (...p) => readFileSync(path.join(...p), 'utf8');
const json = (...p) => JSON.parse(read(...p));

function* walk(dir, exts) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p, exts);
    else if (exts.some((e) => p.endsWith(e))) yield p;
  }
}

// ── one tree ────────────────────────────────────────────────────────────────────

test('the codex tree, the sync apparatus, and the legacy generator are gone', () => {
  // Assert on tracked CONTENT, not on the directory: `git rm` leaves the empty
  // skeleton (and any gitignored logs under it) behind on every clone that had
  // the tree, and that residue is not a regression (v9.153.1).
  const codexDir = path.join(repoRoot, 'plugins', 'sdlc-workflow-codex');
  for (const rel of [path.join('.codex-plugin', 'plugin.json'), 'package.json', path.join('skills', 'wf', 'SKILL.md'), path.join('hooks', 'hooks.json'), 'runtime-manifest.json']) {
    assert.ok(!existsSync(path.join(codexDir, rel)), `plugins/sdlc-workflow-codex/${rel} still exists`);
  }
  assert.ok(!existsSync(path.join(repoRoot, 'scripts', 'generate-codex-plugin.mjs')), 'root generate-codex-plugin.mjs still exists');
  assert.ok(!existsSync(path.join(pluginRoot, '.codex-generated')), '.codex-generated present');
  assert.ok(!existsSync(path.join(pluginRoot, '.codex-plugin.overrides.json')), 'overrides file present');
});

test('both root catalogs point at the one plugin directory', () => {
  const codex = json(repoRoot, '.agents', 'plugins', 'marketplace.json');
  const entry = codex.plugins.find((p) => p.name === 'sdlc-workflow');
  assert.ok(entry, '.agents/plugins/marketplace.json does not expose sdlc-workflow');
  assert.equal(entry.source.path, './plugins/sdlc-workflow');
  assert.ok(!codex.plugins.some((p) => p.name === 'sdlc-workflow-codex'), 'old codex identity still cataloged');

  const claude = json(repoRoot, '.claude-plugin', 'marketplace.json');
  const cEntry = claude.plugins.find((p) => p.name === 'sdlc-workflow');
  assert.ok(cEntry);
  assert.equal(cEntry.source, './plugins/sdlc-workflow');
});

// ── two manifests, one version ──────────────────────────────────────────────────

test('.codex-plugin/plugin.json names the merged identity and declares skills + hooks', () => {
  const m = json(pluginRoot, '.codex-plugin', 'plugin.json');
  assert.equal(m.name, 'sdlc-workflow');
  assert.equal(m.skills, './skills/');
  assert.equal(m.hooks, './hooks/codex.hooks.json', 'declared hooks REPLACE hooks/hooks.json discovery (plan C3)');
  assert.ok(m.interface?.displayName && m.interface?.defaultPrompt?.length, 'interface metadata carried over');
  assert.ok(!/handwritten/i.test(m.description + m.interface.longDescription), 'description no longer claims a handwritten codex tree');
});

test('the three in-tree version carriers agree', () => {
  const claude = json(pluginRoot, '.claude-plugin', 'plugin.json').version;
  const codex = json(pluginRoot, '.codex-plugin', 'plugin.json').version;
  const pkg = json(pluginRoot, 'package.json').version;
  assert.equal(codex, claude, '.codex-plugin/plugin.json version drifted from .claude-plugin/plugin.json');
  assert.equal(pkg, claude, 'package.json version drifted from .claude-plugin/plugin.json');
});

// ── two hook wirings ────────────────────────────────────────────────────────────

test('hooks/codex.hooks.json: every command resolves to a file in this tree, has a Windows form, and never names runtime/', () => {
  const wiring = json(pluginRoot, 'hooks', 'codex.hooks.json');
  const events = Object.keys(wiring.hooks);
  assert.ok(events.includes('SessionStart') && events.includes('Stop') && events.includes('PostToolUse'));
  for (const [event, groups] of Object.entries(wiring.hooks)) {
    for (const g of groups) for (const h of g.hooks) {
      assert.equal(h.type, 'command', `${event}: non-command hook`);
      assert.ok(h.commandWindows, `${event}: missing commandWindows`);
      assert.ok(!/runtime\//.test(h.command) && !/runtime\\/.test(h.commandWindows), `${event}: still points at runtime/`);
      assert.ok(!/\$\{CLAUDE_PLUGIN_ROOT\}/.test(h.command), `${event}: Claude root variable in Codex wiring`);
      const m = /\$\{PLUGIN_ROOT\}\/([^"]+)"/.exec(h.command);
      assert.ok(m, `${event}: command does not start with \${PLUGIN_ROOT}/`);
      assert.ok(existsSync(path.join(pluginRoot, m[1])), `${event}: ${m[1]} missing`);
    }
  }
  // seed-memory is spawned by session-start.mjs with the host signal, never directly.
  assert.ok(!JSON.stringify(wiring).includes('seed-memory'), 'seed-memory must not be a direct Codex hook command');
});

test('hooks/hooks.json (Claude Code) is untouched in shape: every command is a dist/ entry that exists', () => {
  const wiring = json(pluginRoot, 'hooks', 'hooks.json');
  for (const groups of Object.values(wiring.hooks)) {
    for (const g of groups) for (const h of g.hooks) {
      const m = /\$\{CLAUDE_PLUGIN_ROOT\}\/(dist\/[^"]+)"/.exec(h.command);
      assert.ok(m, `Claude hook command does not use \${CLAUDE_PLUGIN_ROOT}/dist/: ${h.command}`);
      assert.ok(existsSync(path.join(pluginRoot, m[1])), `${m[1]} missing`);
    }
  }
});

// ── skills: Codex interface metadata and explicit-only invocation ───────────────

test('every skill carries agents/openai.yaml with interface metadata and implicit invocation disabled', () => {
  const skills = readdirSync(path.join(pluginRoot, 'skills')).filter((s) => existsSync(path.join(pluginRoot, 'skills', s, 'SKILL.md')));
  assert.equal(skills.length, 6, `expected 6 skills, found ${skills.join(', ')}`);
  for (const s of skills) {
    const p = path.join(pluginRoot, 'skills', s, 'agents', 'openai.yaml');
    assert.ok(existsSync(p), `${s}: missing agents/openai.yaml`);
    const y = readFileSync(p, 'utf8');
    assert.match(y, /display_name:\s*"[^"]+"/, `${s}: no display_name`);
    assert.match(y, /short_description:\s*"[^"]+"/, `${s}: no short_description`);
    assert.match(y, /allow_implicit_invocation:\s*false/, `${s}: implicit invocation must be disabled; users explicitly select the skill`);
  }
});

// ── plugin-owned host-filtered roster (plan W3 P1 / W8) ─────────────────────────

function rosterKeys() {
  const skill = read(pluginRoot, 'skills', 'wf', 'SKILL.md');
  const keys = new Set();
  for (const m of skill.matchAll(/^\| `([a-z-]+)`\s+\|/gm)) keys.add(m[1]);
  keys.delete('Key');
  return keys;
}

function claudeOnlyKeys() {
  const hi = read(pluginRoot, 'skills', 'wf', 'reference', '_host-invocation.md');
  const out = new Set();
  for (const m of hi.matchAll(/^\| `([a-z-]+)` \| Claude Code only \|/gm)) out.add(m[1]);
  return out;
}

test('dispatch table ↔ host-invocation ↔ reference files agree on host availability', () => {
  const keys = rosterKeys();
  assert.equal(keys.size, 22, `expected 22 keys, got ${[...keys].join(', ')}`);
  const claudeOnly = claudeOnlyKeys();
  assert.deepEqual([...claudeOnly], ['yolo']);
  for (const k of claudeOnly) {
    assert.ok(keys.has(k), `${k} is Claude-only but not in the roster`);
    assert.ok(existsSync(path.join(pluginRoot, 'skills', 'wf', 'reference', `${k}.md`)));
    const head = read(pluginRoot, 'skills', 'wf', 'reference', `${k}.md`).split('\n').slice(0, 25).join('\n');
    assert.match(head, /Claude Code only/, `${k}.md must open with its host restriction`);
  }
  const codexKeys = [...keys].filter((k) => !claudeOnly.has(k));
  assert.equal(codexKeys.length, 21);
  assert.ok(!codexKeys.includes('yolo'));
  // The dispatch table's own availability line names the same exception.
  const skill = read(pluginRoot, 'skills', 'wf', 'SKILL.md');
  assert.match(skill, /Every key runs under every host except `yolo`, which is Claude Code only/);
});

// ── residual references: the deleted tree is history, not a live path ─────────────

test('no live file names sdlc-workflow-codex (guards, archived docs, CHANGELOGs, and the cutover runbook excepted)', () => {
  // scripts/ and tests/ are excluded: the deployment doctor and the guards name
  // the retired identity in order to DETECT it. docs/site/start/installation.html
  // carries the machine cutover runbook (`codex plugin remove sdlc-workflow-codex`).
  const roots = ['skills', 'hooks', 'lib', 'reference', 'renderers', path.join('docs', 'site'), '.codex-plugin', '.claude-plugin'];
  const hits = [];
  for (const r of roots) {
    const abs = path.join(pluginRoot, r);
    if (!existsSync(abs)) continue;
    for (const f of walk(abs, ['.md', '.mjs', '.js', '.json', '.yaml', '.html'])) {
      if (/start[\\/]installation\.html$/.test(f)) continue;
      if (/sdlc-workflow-codex/.test(readFileSync(f, 'utf8'))) hits.push(path.relative(pluginRoot, f));
    }
  }
  for (const f of ['README.md', 'package.json']) {
    if (/sdlc-workflow-codex/.test(read(pluginRoot, f))) hits.push(f);
  }
  for (const f of ['README.md']) {
    if (/sdlc-workflow-codex/.test(read(repoRoot, f))) hits.push(`<repo>/${f}`);
  }
  const live = hits.filter((h) => !/single-source\.test\.mjs$/.test(h));
  assert.deepEqual(live, [], `live references to the deleted tree: ${live.join(', ')}`);
});
