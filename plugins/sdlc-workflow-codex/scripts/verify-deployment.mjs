#!/usr/bin/env node
// scripts/verify-deployment.mjs — machine-side deployment doctor.
//
// `npm test` proves the repo conforms to the Codex plugin contract; it cannot
// prove the plugin actually EXECUTES on this machine. That failure mode is
// real: from 2026-06 to 2026-07 this repo was fully conformant while the
// machine ran a year-old legacy wrapper with hooks feature-flagged off
// (CODEX-PLATFORM-GAPS.md §0). This doctor inspects machine state — CLI
// version, hooks feature, install, trust, legacy leftovers — and reports.
//
// Advisory by design: run via `npm run verify:deployment`. Exits 1 only on
// FAIL findings (missing install, legacy active, hooks disabled); warnings
// (e.g. untrusted hooks, version skew) exit 0 so automation can distinguish.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CODEX_HOME = process.env.CODEX_HOME || join(homedir(), '.codex');
const PLUGIN_NAME = 'sdlc-workflow-codex';
const LEGACY_NAME = 'sdlc-workflow@local-marketplace';
// Verified working end-to-end on 0.143.0 (2026-07-08 cutover): plugin
// subcommands, hooks stable-on, SessionStart/Stop observed firing live.
const VERIFIED_CLI = '0.143.0';

const results = []; // { level: 'ok'|'warn'|'fail', text }
const ok = (text) => results.push({ level: 'ok', text });
const warn = (text) => results.push({ level: 'warn', text });
const fail = (text) => results.push({ level: 'fail', text });

function codex(args) {
  const r = spawnSync('codex', args, { encoding: 'utf-8', shell: process.platform === 'win32', windowsHide: true, timeout: 30000 });
  return r.status === 0 ? (r.stdout || '') : null;
}

function parseVersion(s) {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(String(s ?? ''));
  return m ? m.slice(1, 4).map(Number) : null;
}

function versionLt(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}

// 1. CLI present + version
const versionOut = codex(['--version']);
if (!versionOut) {
  fail('codex CLI not found on PATH (or it errored) — install/upgrade @openai/codex');
} else {
  const v = parseVersion(versionOut);
  const min = parseVersion(VERIFIED_CLI);
  if (v && versionLt(v, min)) {
    fail(`codex CLI ${v.join('.')} predates the verified hooks-GA build ${VERIFIED_CLI} — upgrade (npm i -g @openai/codex@latest)`);
  } else {
    ok(`codex CLI ${versionOut.trim()} (verified baseline ${VERIFIED_CLI})`);
  }
}

// 1b. Codex Desktop bundled binary (FRESH-REPO-REGISTRATION-FIX-PLAN F6):
// Desktop sessions run their OWN bundled codex.exe, not the PATH one — a
// PATH-only check once reported a stale third install while Desktop actually
// ran 0.144.0-alpha.4. Scan the Desktop install dirs and compare both worlds.
if (process.platform === 'win32') {
  const desktopBin = join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'OpenAI', 'Codex', 'bin');
  const desktopVersions = [];
  try {
    for (const dir of readdirSync(desktopBin)) {
      const exe = join(desktopBin, dir, 'codex.exe');
      if (!existsSync(exe)) continue;
      const r = spawnSync(exe, ['--version'], { encoding: 'utf-8', windowsHide: true, timeout: 30000 });
      const out = r.status === 0 ? (r.stdout || '').trim() : null;
      if (out) desktopVersions.push({ dir, version: out });
    }
  } catch { /* no Desktop install — CLI-only machine */ }
  if (!desktopVersions.length) {
    ok('no Codex Desktop bundled binary found (CLI-only machine)');
  } else {
    const min = parseVersion(VERIFIED_CLI);
    for (const d of desktopVersions) {
      const v = parseVersion(d.version);
      if (v && versionLt(v, min)) {
        warn(`Codex Desktop bundled ${d.version} (bin/${d.dir}) predates the verified hooks-GA baseline ${VERIFIED_CLI} — Desktop sessions there run WITHOUT working hooks`);
      } else {
        ok(`Codex Desktop bundled ${d.version} (bin/${d.dir})`);
      }
    }
    const pathV = parseVersion(versionOut ?? '');
    const newestDesktop = desktopVersions
      .map((d) => parseVersion(d.version)).filter(Boolean)
      .sort((a, b) => (versionLt(a, b) ? -1 : 1)).pop();
    if (pathV && newestDesktop && (versionLt(pathV, newestDesktop) || versionLt(newestDesktop, pathV))) {
      warn(`PATH codex ${pathV.join('.')} and Desktop bundled ${newestDesktop.join('.')} diverge — terminal and Desktop sessions run different builds`);
    }
  }
}

// 2. hooks + multi_agent feature state
const features = codex(['features', 'list']);
if (features == null) {
  warn('`codex features list` unavailable — cannot confirm the hooks feature (very old CLI?)');
} else {
  for (const name of ['hooks', 'plugins']) {
    const line = features.split(/\r?\n/).find((l) => new RegExp(`^${name}\\s`).test(l.trim()));
    if (line && /\btrue\s*$/.test(line.trim())) ok(`feature \`${name}\` enabled (${line.trim().replace(/\s+/g, ' ')})`);
    else fail(`feature \`${name}\` not enabled — \`codex features enable ${name}\` (line: ${line ? line.trim() : 'absent'})`);
  }
}

// 3. config.toml: native plugin enabled, legacy gone
const configPath = join(CODEX_HOME, 'config.toml');
let config = '';
if (!existsSync(configPath)) {
  fail(`${configPath} not found — codex has never run here?`);
} else {
  config = readFileSync(configPath, 'utf-8');
  const nativeEntry = new RegExp(`\\[plugins\\."${PLUGIN_NAME}@[^"]+"\\]\\s*\\r?\\n\\s*enabled\\s*=\\s*true`);
  if (nativeEntry.test(config)) ok(`plugin \`${PLUGIN_NAME}\` enabled in config.toml`);
  else fail(`plugin \`${PLUGIN_NAME}\` not enabled in config.toml — \`codex plugin add ${PLUGIN_NAME}@agent-skills-marketplace\``);

  if (config.includes(LEGACY_NAME)) fail(`legacy \`${LEGACY_NAME}\` still referenced in config.toml — \`codex plugin remove ${LEGACY_NAME}\` and delete stale hooks.state entries`);
  else ok('no legacy sdlc-workflow@local-marketplace entries in config.toml');
}

// 4. install cache: snapshot exists and matches the repo manifest version
const repoVersion = (() => {
  try { return JSON.parse(readFileSync(join(ROOT, '.codex-plugin', 'plugin.json'), 'utf-8')).version; }
  catch { return null; }
})();
const cacheRoot = join(CODEX_HOME, 'plugins', 'cache');
let installed = null;
try {
  for (const marketplace of readdirSync(cacheRoot)) {
    const pluginDir = join(cacheRoot, marketplace, PLUGIN_NAME);
    if (!existsSync(pluginDir)) continue;
    for (const version of readdirSync(pluginDir)) installed = { marketplace, version };
  }
} catch { /* no cache at all */ }
if (!installed) {
  fail(`no installed snapshot of ${PLUGIN_NAME} under ${cacheRoot}`);
} else if (repoVersion && installed.version !== repoVersion) {
  warn(`installed snapshot ${installed.version} != repo manifest ${repoVersion} — \`codex plugin marketplace upgrade ${installed.marketplace}\` (local sources usually re-snapshot on their own)`);
} else {
  ok(`installed snapshot ${installed.version} from \`${installed.marketplace}\` matches repo manifest`);
}
// Legacy cache leftovers
if (existsSync(join(cacheRoot, 'local-marketplace', 'sdlc-workflow'))) {
  fail('legacy plugin cache still present at plugins/cache/local-marketplace/sdlc-workflow — delete it');
} else {
  ok('no legacy plugin cache');
}

// 5. hook trust: hooks.json registers events; each needs a trusted hash
let hookEvents = [];
try {
  const hooksJson = JSON.parse(readFileSync(join(ROOT, 'hooks', 'hooks.json'), 'utf-8'));
  hookEvents = Object.keys(hooksJson.hooks ?? hooksJson);
} catch { warn('could not read hooks/hooks.json to enumerate events'); }
if (config && hookEvents.length) {
  const trusted = hookEvents.filter((e) => {
    const snake = e.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
    return new RegExp(`\\[hooks\\.state\\."${PLUGIN_NAME}@[^"]*:hooks/hooks\\.json:${snake}[^"]*"\\]`).test(config);
  });
  if (trusted.length === hookEvents.length) ok(`all ${hookEvents.length} hook definitions trusted`);
  else warn(`hook trust: ${trusted.length}/${hookEvents.length} events trusted (${hookEvents.filter((e) => !trusted.includes(e)).join(', ')} untrusted) — open an interactive codex session and trust via /hooks; untrusted hooks are SKIPPED in normal sessions`);
}

// Report
const icon = { ok: '  ok ', warn: 'WARN ', fail: 'FAIL ' };
for (const r of results) console.log(icon[r.level] + r.text);
const fails = results.filter((r) => r.level === 'fail').length;
const warns = results.filter((r) => r.level === 'warn').length;
console.log(`\nverify-deployment: ${fails} failure(s), ${warns} warning(s)`);
process.exit(fails ? 1 : 0);
