// W11.1 — the doctor (WIDE-VIEW-REPAIR-PLAN §14.2.1).
//
// (1) The installed-version readers see every Claude Code scope and every Codex
//     cache version, plus the Codex enabled flag, legacy identities, and trust.
// (2) The verdict compares installed to shipped per host.
// (3) runDoctor on fixture homes reports the install gap and exits red; on a
//     machine where installed equals shipped it reports OK.
// (4) The cleanup row names the old ~/.sdlc entries until the marker exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  formatDoctorTable, parseClaudeInstalls, parseCodexConfig, readClaudeInstalls, readCodexInstalls,
  buildId, runDoctor, shippedVersion, versionVerdict,
} from '../../../lib/doctor.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SHIPPED = shippedVersion(pluginRoot);

const INSTALLED = {
  version: 2,
  plugins: {
    'sdlc-workflow@agent-skills-marketplace': [
      { scope: 'user', installPath: 'C:\\u\\.claude\\plugins\\cache\\agent-skills-marketplace\\sdlc-workflow\\9.153.5', version: '9.153.5', gitCommitSha: 'abdca984deadbeef' },
      { scope: 'local', projectPath: 'C:\\Users\\x\\Documents\\dev\\Isometric', version: '9.144.0', gitCommitSha: '203dfa4f00000000' },
    ],
    'other-plugin@somewhere': [{ scope: 'user', version: '1.0.0' }],
  },
};

const CODEX_TOML = `
model = "gpt-5"

[plugins."sdlc-workflow@agent-skills-marketplace"]
enabled = true

[plugins."sdlc-workflow-codex@agent-skills-marketplace"]
enabled = false

[hooks.state."sdlc-workflow@agent-skills-marketplace:hooks/codex.hooks.json:session_start:0:0"]
trusted = true
[hooks.state."sdlc-workflow@agent-skills-marketplace:hooks/codex.hooks.json:stop:0:0"]
trusted = true
`;

function fixtureHome() {
  const home = mkdtempSync(path.join(tmpdir(), 'sdlc-doctor-'));
  mkdirSync(path.join(home, '.claude', 'plugins'), { recursive: true });
  writeFileSync(path.join(home, '.claude', 'plugins', 'installed_plugins.json'), JSON.stringify(INSTALLED));
  const codex = path.join(home, '.codex');
  mkdirSync(path.join(codex, 'plugins', 'cache', 'agent-skills-marketplace', 'sdlc-workflow', '9.153.5'), { recursive: true });
  mkdirSync(path.join(codex, 'plugins', 'cache', 'agent-skills-marketplace', 'sdlc-workflow', '9.152.1'), { recursive: true });
  writeFileSync(path.join(codex, 'config.toml'), CODEX_TOML);
  const sdlc = path.join(home, '.sdlc');
  mkdirSync(path.join(sdlc, 'runtime', 'aaa'), { recursive: true });
  writeFileSync(path.join(sdlc, 'hub.pid'), '{"pid":1}');
  return { home, codex, sdlc };
}

test('parseClaudeInstalls: one row per scope of this plugin only', () => {
  const rows = parseClaudeInstalls(INSTALLED);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => [r.scope, r.version]), [['user', '9.153.5'], ['local', '9.144.0']]);
  assert.equal(rows[1].projectPath, 'C:\\Users\\x\\Documents\\dev\\Isometric');
  assert.deepEqual(parseClaudeInstalls({}), []);
  assert.deepEqual(parseClaudeInstalls(null), []);
});

test('parseCodexConfig: enabled flag, legacy identities, trusted hook events', () => {
  const c = parseCodexConfig(CODEX_TOML);
  assert.equal(c.enabled, true);
  assert.deepEqual(c.legacy, ['sdlc-workflow-codex']);
  assert.deepEqual(c.trustedEvents, ['session_start', 'stop']);
  assert.equal(parseCodexConfig('model = "x"\n').enabled, null);
  assert.equal(parseCodexConfig('[plugins."sdlc-workflow@agent-skills-marketplace"]\nenabled = false\n').enabled, false);
});

test('readClaudeInstalls / readCodexInstalls read fixture homes; missing files yield empty', () => {
  const { home, codex } = fixtureHome();
  try {
    assert.equal(readClaudeInstalls(home).length, 2);
    const cx = readCodexInstalls(codex);
    assert.deepEqual(cx.installs.map((i) => i.version).sort(), ['9.152.1', '9.153.5']);
    assert.ok(cx.installs.every((i) => i.marketplace === 'agent-skills-marketplace' && i.enabled === true));
    assert.equal(cx.config.legacy[0], 'sdlc-workflow-codex');
    assert.deepEqual(readClaudeInstalls(path.join(home, 'nope')), []);
    assert.deepEqual(readCodexInstalls(path.join(home, 'nope')).installs, []);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('versionVerdict compares installed to shipped', () => {
  assert.equal(versionVerdict('9.153.5', '9.153.5'), 'ok');
  assert.equal(versionVerdict('9.144.0', '9.153.5'), 'behind');
  assert.equal(versionVerdict('9.160.0', '9.153.5'), 'ahead');
  assert.equal(versionVerdict(null, '9.153.5'), 'absent');
  assert.equal(versionVerdict('garbage', '9.153.5'), 'unknown');
  assert.equal(versionVerdict('10.0.0-next.1', '10.0.0-next.2'), 'behind');
  assert.equal(versionVerdict('10.0.0-next.2', '10.0.0-next.2'), 'ok');
  assert.equal(versionVerdict('10.0.0-next.9', '10.0.0'), 'behind', 'a release ranks above its prereleases');
  assert.equal(versionVerdict('9.201.0', '10.0.0-next.0'), 'behind');
});

test('runDoctor on a fixture home: install gap → not ok; equal versions → ok', async () => {
  const { home, codex, sdlc } = fixtureHome();
  try {
    const common = { pluginRoot, homeDir: home, codexHome: codex, sdlcHome: sdlc };
    const r = await runDoctor(common);
    assert.equal(r.shipped, SHIPPED);
    // 9.153.5 and 9.144.0 are both behind the shipped version unless shipped is 9.153.5.
    const claudeOk = r.hosts.claude.filter((i) => i.verdict === 'ok').length;
    assert.equal(r.verdicts.claude, claudeOk === 2 ? 'ok' : claudeOk === 1 ? 'mixed' : 'mismatch');
    assert.deepEqual(r.cleanup, { done: false, left: ['hub.pid', 'runtime'] });
    assert.equal(r.ok, false, 'a local scope behind shipped is the install gap');
    const table = formatDoctorTable(r);
    assert.match(table, /claude install \(user\)/);
    assert.match(table, /claude install \(local: C:\\Users\\x\\Documents\\dev\\Isometric\)/);
    assert.match(table, /codex legacy identities\s+sdlc-workflow-codex\s+remove/);
    assert.match(table, /old hub and tray state\s+hub\.pid, runtime\s+start a session$/m);
    assert.match(table, /verdict .*ACTION$/m);

    // Equal versions everywhere → OK.
    const eq = JSON.parse(JSON.stringify(INSTALLED));
    for (const i of eq.plugins['sdlc-workflow@agent-skills-marketplace']) i.version = SHIPPED;
    writeFileSync(path.join(home, '.claude', 'plugins', 'installed_plugins.json'), JSON.stringify(eq));
    mkdirSync(path.join(codex, 'plugins', 'cache', 'agent-skills-marketplace', 'sdlc-workflow', SHIPPED), { recursive: true });
    const r2 = await runDoctor(common);
    assert.equal(r2.verdicts.claude, 'ok');
    assert.equal(r2.verdicts.codex, 'ok');
    assert.equal(r2.ok, true);
    assert.match(formatDoctorTable(r2), /verdict .*OK$/m);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('verify-release-pushed evaluateInstalled: a local scope behind shipped is the install gap', async () => {
  // pathToFileURL, not a raw path — a Windows drive letter reads as a URL scheme.
  const { evaluateInstalled } = await import(pathToFileURL(path.join(pluginRoot, 'scripts', 'verify-release-pushed.mjs')).href);
  const claude = parseClaudeInstalls(INSTALLED);
  const codex = [{ marketplace: 'agent-skills-marketplace', version: '9.153.5', enabled: true }, { marketplace: 'agent-skills-marketplace', version: '9.152.1', enabled: true }];
  const gap = evaluateInstalled({ shipped: '9.153.5', claude, codex });
  assert.equal(gap.ok, false);
  assert.deepEqual(gap.rows.map((r) => [r.host, r.verdict]), [['claude', 'ok'], ['claude', 'behind'], ['codex', 'ok'], ['codex', 'behind']]);
  // A superseded Codex cache version beside the current one is not a gap.
  const fine = evaluateInstalled({ shipped: '9.153.5', claude: [claude[0]], codex });
  assert.equal(fine.ok, true);
  // Nothing installed (CI runner, fresh machine) is ok.
  assert.equal(evaluateInstalled({ shipped: '9.153.5' }).ok, true);
  // A newer install than the tree is also a mismatch: the tree is behind the machine.
  assert.equal(evaluateInstalled({ shipped: '9.153.5', claude: [{ scope: 'user', version: '9.160.0' }] }).ok, false);
});

test('runDoctor: an absent host is not a gap; a cache at shipped with no enabled line is "disabled"; the cleanup marker reads as removed', async () => {
  const { home, codex, sdlc } = fixtureHome();
  try {
    const common = { pluginRoot, homeDir: home, codexHome: codex, sdlcHome: sdlc };
    const eq = JSON.parse(JSON.stringify(INSTALLED));
    for (const i of eq.plugins['sdlc-workflow@agent-skills-marketplace']) i.version = SHIPPED;
    writeFileSync(path.join(home, '.claude', 'plugins', 'installed_plugins.json'), JSON.stringify(eq));

    // No Codex at all on this machine.
    rmSync(path.join(codex, 'plugins'), { recursive: true, force: true });
    rmSync(path.join(codex, 'config.toml'), { force: true });
    const r = await runDoctor(common);
    assert.equal(r.verdicts.claude, 'ok');
    assert.equal(r.verdicts.codex, 'absent');
    assert.equal(r.ok, true, 'a host that is not installed is not an install gap');
    const table = formatDoctorTable(r);
    assert.match(table, /codex install\s+none\s+absent/);
    assert.match(table, /verdict .*OK$/m);

    // The shipped version sits in the cache, but config.toml has no enabled line.
    mkdirSync(path.join(codex, 'plugins', 'cache', 'agent-skills-marketplace', 'sdlc-workflow', SHIPPED), { recursive: true });
    const r2 = await runDoctor(common);
    assert.equal(r2.verdicts.codex, 'disabled');
    assert.equal(r2.ok, false, 'installed but not enabled is a gap');

    // After the cleanup the marker exists and the row says so.
    writeFileSync(path.join(sdlc, '.v10-cleanup.json'), '{}');
    const r3 = await runDoctor(common);
    assert.deepEqual(r3.cleanup, { done: true, left: [] });
    assert.match(formatDoctorTable(r3), /old hub and tray state\s+removed$/m);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('buildId reads the SHA that the release writes, and is null without one', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'doctor-build-'));
  try {
    assert.equal(buildId(root), null);
    writeFileSync(path.join(root, 'BUILD_SHA'), 'not a sha\n');
    assert.equal(buildId(root), null);
    writeFileSync(path.join(root, 'BUILD_SHA'), `${'a1'.repeat(20)}\n`);
    assert.equal(buildId(root), 'a1'.repeat(20));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
