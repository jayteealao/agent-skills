// W11.1 — the doctor (WIDE-VIEW-REPAIR-PLAN §14.2.1).
//
// (1) The installed-version readers see every Claude Code scope and every Codex
//     cache version, plus the Codex enabled flag, legacy identities, and trust.
// (2) The verdict compares installed to shipped per host.
// (3) The netstat parser and root classifier are pure.
// (4) runDoctor on fixture homes reports the install gap and exits red; on a
//     machine where installed equals shipped it reports OK.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  classifyRoot, formatDoctorTable, parseClaudeInstalls, parseCodexConfig, parseNetstatListeners,
  portOwner, readClaudeInstalls, readCodexInstalls, registryAudit, runDoctor, runtimeStoreStats,
  shippedVersion, versionVerdict,
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
  for (const b of ['aaa', 'bbb', 'ccc', 'ddd']) {
    mkdirSync(path.join(sdlc, 'runtime', b), { recursive: true });
    writeFileSync(path.join(sdlc, 'runtime', b, 'x.mjs'), 'x'.repeat(1024));
  }
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
});

test('parseNetstatListeners + portOwner (win32 via injected exec; posix via lsof)', () => {
  const text = [
    'Active Connections',
    '',
    '  Proto  Local Address          Foreign Address        State           PID',
    '  TCP    0.0.0.0:22             0.0.0.0:0              LISTENING       7748',
    '  TCP    127.0.0.1:4173         0.0.0.0:0              LISTENING       31928',
    '  TCP    127.0.0.1:4173         127.0.0.1:52001        ESTABLISHED     31928',
    '  TCP    [::]:135               [::]:0                 LISTENING       1444',
  ].join('\r\n');
  const rows = parseNetstatListeners(text);
  assert.deepEqual(rows.map((r) => [r.port, r.pid]), [[22, 7748], [4173, 31928], [135, 1444]]);
  const winExec = () => ({ stdout: text });
  assert.deepEqual(portOwner(4173, { platform: 'win32', exec: winExec }), { pid: 31928, source: 'netstat' });
  assert.equal(portOwner(9999, { platform: 'win32', exec: winExec }), null);
  assert.deepEqual(portOwner(4173, { platform: 'linux', exec: () => ({ stdout: '4242\n' }) }), { pid: 4242, source: 'lsof' });
  assert.equal(portOwner(4173, { platform: 'linux', exec: () => ({ stdout: '' }) }), null);
  assert.equal(portOwner(4173, { platform: 'linux', exec: () => { throw new Error('ENOENT'); } }), null);
});

test('classifyRoot + registryAudit flag temp, scratchpad, and worktree roots', () => {
  const tmp = 'C:\\Users\\x\\AppData\\Local\\Temp';
  assert.equal(classifyRoot('C:\\Users\\x\\AppData\\Local\\Temp\\claude\\C--x\\abc\\scratchpad\\repo', { tmpDir: tmp }), 'temp');
  assert.equal(classifyRoot('/tmp/sdlc-e2e-1234', { tmpDir: '/tmp' }), 'temp');
  assert.equal(classifyRoot('C:\\dev\\app\\.claude\\worktrees\\feature-x', { tmpDir: tmp }), 'worktree');
  assert.equal(classifyRoot('C:\\dev\\app', { tmpDir: tmp }), null);
  const audit = registryAudit([
    { id: 'a', repoRoot: 'C:\\dev\\app', slugs: ['x'] },
    { id: 'b', repoRoot: 'C:\\Users\\x\\AppData\\Local\\Temp\\z', slugs: [] },
    { id: 'c', repoRoot: 'C:\\dev\\app\\.claude\\worktrees\\w' },
  ], { tmpDir: tmp });
  assert.equal(audit.total, 3);
  assert.deepEqual(audit.flagged.map((f) => [f.id, f.reason]), [['b', 'temp'], ['c', 'worktree']]);
  assert.deepEqual(audit.zeroSlugs.map((z) => z.id), ['b']);
  assert.deepEqual(registryAudit(null), { total: 0, flagged: [], zeroSlugs: [] });
});

test('runDoctor on a fixture home: install gap → not ok; equal versions → ok', async () => {
  const { home, codex, sdlc } = fixtureHome();
  try {
    const exec = () => ({ stdout: '', status: 1, stderr: 'not installed' });
    const common = { pluginRoot, homeDir: home, codexHome: codex, sdlcHome: sdlc, hubConfig: { host: '127.0.0.1', port: 1, tailscale: { enabled: false } }, exec, platform: 'linux', probeHub: false, tmpDir: path.join(home, 'no-such-tmp') };
    const r = await runDoctor(common);
    assert.equal(r.shipped, SHIPPED);
    // 9.153.5 and 9.144.0 are both behind the shipped version unless shipped is 9.153.5.
    const claudeOk = r.hosts.claude.filter((i) => i.verdict === 'ok').length;
    assert.equal(r.verdicts.claude, claudeOk === 2 ? 'ok' : claudeOk === 1 ? 'mixed' : 'mismatch');
    assert.equal(r.hub.reachable, false);
    assert.equal(r.verdicts.hub, 'unreachable');
    assert.equal(r.hub.portOwner, null);
    assert.equal(r.runtimeStore.count, 4);
    assert.equal(r.runtimeStore.bytes, 4096);
    assert.equal(r.tailscale.available, false);
    assert.equal(r.ok, false, 'a local scope behind shipped is the install gap');
    const table = formatDoctorTable(r);
    assert.match(table, /claude install \(user\)/);
    assert.match(table, /claude install \(local: C:\\Users\\x\\Documents\\dev\\Isometric\)/);
    assert.match(table, /codex legacy identities\s+sdlc-workflow-codex\s+remove/);
    assert.match(table, /runtime store\s+4 builds · 0\.0 MB .*\s+gc$/m);
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

test('runtimeStoreStats on a missing dir is empty', () => {
  const r = runtimeStoreStats(path.join(tmpdir(), 'sdlc-doctor-none-' + Date.now()));
  assert.equal(r.count, 0);
  assert.equal(r.bytes, 0);
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
