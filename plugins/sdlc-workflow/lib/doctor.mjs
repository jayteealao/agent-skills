// lib/doctor.mjs — machine-state report for the runtime (WIDE-VIEW-REPAIR-PLAN
// §14.2.1, wave W11.1).
//
// `npm run doctor` (scripts/doctor.mjs) calls runDoctor() and prints
// formatDoctorTable(). verify-release-pushed.mjs reuses
// the installed-version readers for its `installed` check. Everything that
// touches the machine takes an injectable root or exec so the unit tests run
// on fixtures; the parsers are pure.
//
// The report answers, from the machine and not from the repository:
//   - which plugin version each host has installed (Claude Code: every scope in
//     ~/.claude/plugins/installed_plugins.json; Codex: the plugin cache under
//     $CODEX_HOME/plugins/cache plus the enabled flag in config.toml)
//   - whether the one-time cleanup removed the old hub and tray state from
//     ~/.sdlc (lib/machine-cleanup.mjs)
//   - pi: the sdlc-workflow pi package in the `packages` of the pi agent settings, the
//     ownership check of that package, and the older pi packages that it replaces

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

import { sdlcHomeDir } from './home.mjs';
import { MARKER, STATE_ENTRIES } from './machine-cleanup.mjs';
import { taskStatus } from './design-server.mjs';

export const PLUGIN_NAME = 'sdlc-workflow';
export const MARKETPLACE = 'agent-skills-marketplace';

/* ───────────────────────── versions ───────────────────────── */

export function shippedVersion(pluginRoot) {
  return JSON.parse(readFileSync(join(pluginRoot, 'package.json'), 'utf-8')).version;
}

/** The file the release writes: the SHA of the commit that the release ships. */
export const BUILD_SHA_FILE = 'BUILD_SHA';

/** The build id of a plugin tree: the SHA in BUILD_SHA, or null in a tree no release wrote. */
export function buildId(pluginRoot) {
  try {
    const sha = readFileSync(join(pluginRoot, BUILD_SHA_FILE), 'utf-8').trim();
    return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

/** [major, minor, patch, prerelease number]; a release ranks above each of its prereleases. */
function semverParts(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z-]+\.(\d+))?$/.exec(String(v ?? ''));
  return m ? [...m.slice(1, 4).map(Number), m[4] === undefined ? Infinity : Number(m[4])] : null;
}

/** 'ok' | 'behind' | 'ahead' | 'absent' | 'unknown' — installed relative to shipped. */
export function versionVerdict(installed, shipped) {
  if (installed == null) return 'absent';
  const a = semverParts(installed);
  const b = semverParts(shipped);
  if (!a || !b) return 'unknown';
  for (let i = 0; i < 4; i++) {
    if (a[i] < b[i]) return 'behind';
    if (a[i] > b[i]) return 'ahead';
  }
  return 'ok';
}

/* ───────────────────────── Claude Code installs ───────────────────────── */

/** Parse installed_plugins.json → one row per install scope of this plugin. */
export function parseClaudeInstalls(json, pluginName = PLUGIN_NAME) {
  const plugins = json?.plugins && typeof json.plugins === 'object' ? json.plugins : {};
  const out = [];
  for (const [key, value] of Object.entries(plugins)) {
    if (key !== pluginName && !key.startsWith(`${pluginName}@`)) continue;
    for (const e of Array.isArray(value) ? value : [value]) {
      if (!e || typeof e !== 'object') continue;
      out.push({
        host: 'claude',
        key,
        scope: e.scope ?? 'user',
        projectPath: e.projectPath ?? null,
        version: e.version ?? null,
        installPath: e.installPath ?? null,
        gitCommitSha: e.gitCommitSha ?? null,
      });
    }
  }
  return out;
}

export function claudeInstalledPluginsPath(homeDir = homedir()) {
  return join(homeDir, '.claude', 'plugins', 'installed_plugins.json');
}

export function readClaudeInstalls(homeDir = homedir(), pluginName = PLUGIN_NAME) {
  const p = claudeInstalledPluginsPath(homeDir);
  if (!existsSync(p)) return [];
  try { return parseClaudeInstalls(JSON.parse(readFileSync(p, 'utf-8')), pluginName); } catch { return []; }
}

/* ───────────────────────── Codex installs ───────────────────────── */

/**
 * Parse config.toml for this plugin: `enabled` (true/false/null when absent)
 * and every legacy `sdlc-workflow-*` plugin identity still present.
 */
export function parseCodexConfig(toml, pluginName = PLUGIN_NAME, marketplace = MARKETPLACE) {
  const text = String(toml ?? '');
  const id = `${pluginName}@${marketplace}`;
  const re = new RegExp(`\\[plugins\\."${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\]\\s*\\r?\\n\\s*enabled\\s*=\\s*(true|false)`);
  const m = re.exec(text);
  const legacy = [...text.matchAll(/\[plugins\."(sdlc-workflow-[a-z0-9-]+)@/g)].map((x) => x[1]);
  const trusted = [...text.matchAll(/\[hooks\.state\."([^"]+):hooks\/codex\.hooks\.json:([a-z_]+):/g)]
    .filter((x) => x[1] === id)
    .map((x) => x[2]);
  return { enabled: m ? m[1] === 'true' : null, legacy: [...new Set(legacy)], trustedEvents: [...new Set(trusted)].sort() };
}

export function codexHomeDir(env = process.env) {
  return env.CODEX_HOME || join(homedir(), '.codex');
}

/** Codex plugin cache rows: plugins/cache/<marketplace>/<plugin>/<version>. */
export function readCodexInstalls(codexHome = codexHomeDir(), pluginName = PLUGIN_NAME) {
  const cache = join(codexHome, 'plugins', 'cache');
  const configPath = join(codexHome, 'config.toml');
  const config = existsSync(configPath) ? parseCodexConfig(readFileSync(configPath, 'utf-8'), pluginName) : { enabled: null, legacy: [], trustedEvents: [] };
  const out = [];
  if (existsSync(cache)) {
    for (const marketplace of readdirSync(cache, { withFileTypes: true })) {
      if (!marketplace.isDirectory()) continue;
      const pluginDir = join(cache, marketplace.name, pluginName);
      if (!existsSync(pluginDir)) continue;
      for (const v of readdirSync(pluginDir, { withFileTypes: true })) {
        if (!v.isDirectory()) continue;
        out.push({
          host: 'codex',
          marketplace: marketplace.name,
          version: v.name,
          installPath: join(pluginDir, v.name),
          enabled: marketplace.name === MARKETPLACE ? config.enabled : null,
        });
      }
    }
  }
  return { installs: out, config };
}

/* ───────────────────────── pi ───────────────────────── */

export const PI_PACKAGE = 'sdlc-workflow-pi';
// The pi packages that the sdlc-workflow pi package replaces. They register the same tools.
export const PI_REPLACED = Object.freeze(['jayte-pi-unified', 'pi-unified', 'pi-sdlc']);

export function piAgentDir(env = process.env) {
  return env.PI_CODING_AGENT_DIR || join(homedir(), '.pi', 'agent');
}

/**
 * The packages of the pi agent settings, each with its name and version. A path entry
 * is relative to the agent dir; an npm or git entry has no local manifest.
 */
export function readPiPackages(agentDir = piAgentDir()) {
  let settings;
  try { settings = JSON.parse(readFileSync(join(agentDir, 'settings.json'), 'utf-8')); } catch { return null; }
  const out = [];
  for (const entry of Array.isArray(settings.packages) ? settings.packages : []) {
    const source = typeof entry === 'string' ? entry : entry?.source;
    if (typeof source !== 'string') continue;
    const local = !/^(npm|git|https?):/.test(source);
    const dir = local ? (isAbsolute(source) ? source : resolve(agentDir, source)) : null;
    let name = null;
    let version = null;
    if (dir) {
      try { ({ name = null, version = null } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'))); } catch { /* not a package dir */ }
    }
    out.push({ source, dir, name, version });
  }
  return out;
}

/** The ownership check of an installed pi package: its own scripts/check.mjs. */
export function piOwnership(dir, run = spawnSync) {
  const check = join(dir, 'scripts', 'check.mjs');
  if (!existsSync(check)) return { ok: false, text: 'no scripts/check.mjs' };
  const r = run(process.execPath, [check], { encoding: 'utf8' });
  const text = String((r.status === 0 ? r.stdout : r.stderr || r.stdout) || '').trim().split('\n').pop();
  return { ok: r.status === 0, text };
}

/* ───────────────────────── the old view layer ───────────────────────── */

/**
 * The one-time machine cleanup (lib/machine-cleanup.mjs): `done` when its marker
 * exists, else the old ~/.sdlc entries that are still there. A session start
 * runs the cleanup; the doctor only reports.
 */
export function cleanupStatus(home = sdlcHomeDir()) {
  if (existsSync(join(home, MARKER))) return { done: true, left: [] };
  return { done: false, left: STATE_ENTRIES.filter((e) => existsSync(join(home, e))) };
}

/* ───────────────────────── the report ───────────────────────── */

/**
 * Collect the whole report. Every root is injectable; nothing here writes.
 * `ok` is true when every installed host is at the shipped version. A host
 * that is not installed at all is `absent`, not a gap: one-host machines pass.
 */
export async function runDoctor({
  pluginRoot,
  homeDir = homedir(),
  codexHome = codexHomeDir(),
  piDir = piAgentDir(),
  sdlcHome = sdlcHomeDir(),
  runCheck = spawnSync,
  designTask = taskStatus,
  now = () => new Date(),
} = {}) {
  const shipped = shippedVersion(pluginRoot);
  const claude = readClaudeInstalls(homeDir).map((i) => ({ ...i, verdict: versionVerdict(i.version, shipped) }));
  const codexRead = readCodexInstalls(codexHome);
  const codex = codexRead.installs.map((i) => ({ ...i, verdict: versionVerdict(i.version, shipped) }));

  const piPackages = readPiPackages(piDir) ?? [];
  const pi = piPackages.filter((p) => p.name === PI_PACKAGE).map((p) => ({ ...p, verdict: versionVerdict(p.version, shipped), ownership: piOwnership(p.dir, runCheck) }));
  const piReplaced = piPackages.filter((p) => PI_REPLACED.includes(p.name)).map((p) => p.name || p.source);

  const hostVerdicts = {
    pi: pi.length ? (pi.every((i) => i.verdict === 'ok' && i.ownership.ok) ? 'ok' : 'mismatch') : 'absent',
    claude: claude.length ? (claude.every((i) => i.verdict === 'ok') ? 'ok' : (claude.some((i) => i.verdict === 'ok') ? 'mixed' : 'mismatch')) : 'absent',
    // `disabled`: the shipped version sits in the cache but config.toml has no
    // `enabled = true` for it — the reinstall landed, the enable step did not.
    codex: codex.length
      ? (codex.some((i) => i.enabled === true && i.verdict === 'ok') ? 'ok' : (codex.some((i) => i.verdict === 'ok') ? 'disabled' : 'mismatch'))
      : 'absent',
  };
  const hostOk = (v) => v === 'ok' || v === 'absent';
  const ok = hostOk(hostVerdicts.claude) && hostOk(hostVerdicts.codex) && hostOk(hostVerdicts.pi);

  return {
    at: now().toISOString(),
    shipped,
    buildId: buildId(pluginRoot),
    hosts: { claude, codex, codexConfig: codexRead.config, pi, piReplaced },
    cleanup: cleanupStatus(sdlcHome),
    designTask: designTask(),
    verdicts: hostVerdicts,
    ok,
  };
}

/** Fixed-width text table of the report. One row per fact; verdict last. */
export function formatDoctorTable(r) {
  const rows = [];
  const push = (k, v, verdict = '') => rows.push([k, String(v), verdict]);
  push('shipped (package.json)', r.shipped);
  push('build (BUILD_SHA)', r.buildId ? r.buildId.slice(0, 8) : 'none: no release wrote this tree');
  if (!r.hosts.claude.length) push('claude install', 'none', 'absent');
  for (const i of r.hosts.claude) push(`claude install (${i.scope}${i.projectPath ? `: ${i.projectPath}` : ''})`, `${i.version} @ ${(i.gitCommitSha ?? '').slice(0, 8)}`, i.verdict);
  if (!r.hosts.codex.length) push('codex install', 'none', 'absent');
  for (const i of r.hosts.codex) push(`codex cache (${i.marketplace})`, `${i.version}${i.enabled === true ? ' enabled' : i.enabled === false ? ' DISABLED' : ''}`, i.verdict);
  if (r.hosts.codexConfig?.legacy?.length) push('codex legacy identities', r.hosts.codexConfig.legacy.join(', '), 'remove');
  if (r.hosts.codexConfig) push('codex trusted hook events', r.hosts.codexConfig.trustedEvents.length ? r.hosts.codexConfig.trustedEvents.join(', ') : 'none');
  if (!r.hosts.pi?.length) push('pi package', 'none', 'absent');
  for (const i of r.hosts.pi ?? []) {
    push(`pi package (${i.source})`, i.version ?? 'unknown', i.verdict);
    push('pi package ownership', i.ownership.text, i.ownership.ok ? 'ok' : 'fix');
  }
  if (r.hosts.piReplaced?.length) push('older pi packages', r.hosts.piReplaced.join(', '), 'remove with pi remove');
  push('old hub and tray state', r.cleanup.done ? 'removed' : (r.cleanup.left.length ? r.cleanup.left.join(', ') : 'none'), r.cleanup.left.length ? 'start a session' : '');
  const t = r.designTask;
  if (t?.supported) push('design server task', t.installed ? (t.targetExists === false ? 'installed, its script is gone' : 'installed') : 'not installed', t.targetExists === false ? 'run design server install' : '');
  push('verdict', `claude ${r.verdicts.claude} · codex ${r.verdicts.codex} · pi ${r.verdicts.pi ?? 'absent'}`, r.ok ? 'OK' : 'ACTION');
  const w0 = Math.max(...rows.map((x) => x[0].length));
  const w1 = Math.min(96, Math.max(...rows.map((x) => x[1].length)));
  return rows.map(([k, v, verdict]) => `${k.padEnd(w0)}  ${v.padEnd(w1)}  ${verdict}`.trimEnd()).join('\n');
}
