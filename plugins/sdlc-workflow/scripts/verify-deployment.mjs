#!/usr/bin/env node
// scripts/verify-deployment.mjs — machine-side Codex deployment doctor
// (SINGLE-SOURCE-PLAN W6; rewritten from the deleted codex tree's copy).
//
// `npm test` proves the repo conforms to the Codex plugin contract; it cannot
// prove the plugin actually EXECUTES on this machine. That failure mode is
// real: from 2026-06 to 2026-07 this repo was fully conformant while the
// machine ran a year-old legacy wrapper with hooks feature-flagged off
// (docs/internal/CODEX-PLATFORM-GAPS.md §0). This doctor inspects machine
// state — CLI version, hooks feature, install, trust, legacy leftovers — and
// reports.
//
// Identity, post-merge: the Codex plugin is `sdlc-workflow` (the same name as
// the Claude Code plugin, from the same tree); its hook wiring is
// hooks/codex.hooks.json, which is the relpath every trust key embeds. The
// pre-merge identity `sdlc-workflow-codex` is LEGACY: an install under that
// name means the machine has not cut over (SINGLE-SOURCE-PLAN W7 step 2).
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
const PLUGIN_NAME = 'sdlc-workflow';
const MARKETPLACE = 'agent-skills-marketplace';
const HOOKS_RELPATH = 'hooks/codex.hooks.json';
// Pre-merge identities. Either one still installed/enabled is a FAIL: two
// plugins would expose two `wf` skills and fire two SessionStart hook sets.
const LEGACY_NAMES = ['sdlc-workflow-codex', 'sdlc-workflow@local-marketplace'];
// Verified end-to-end (single-source layout: declared hooks file, merged
// identity, plugin-root runtime) on the pinned contract 0.146.0.
const VERIFIED_CLI = '0.146.0';

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
    fail(`codex CLI ${v.join('.')} predates the verified single-source baseline ${VERIFIED_CLI} — upgrade (npm i -g @openai/codex@latest)`);
  } else {
    ok(`codex CLI ${versionOut.trim()} (verified baseline ${VERIFIED_CLI})`);
  }
}

// 1b. Codex Desktop bundled binary: Desktop sessions run their OWN bundled
// codex.exe, not the PATH one — compare both worlds.
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
        warn(`Codex Desktop bundled ${d.version} (bin/${d.dir}) predates the verified baseline ${VERIFIED_CLI}`);
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

// 2. hooks + plugins feature state
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

// 3. config.toml: the merged identity enabled, every legacy identity gone
const configPath = join(CODEX_HOME, 'config.toml');
let config = '';
if (!existsSync(configPath)) {
  fail(`${configPath} not found — codex has never run here?`);
} else {
  config = readFileSync(configPath, 'utf-8');
  const nativeEntry = new RegExp(`\\[plugins\\."${PLUGIN_NAME}@${MARKETPLACE}"\\]\\s*\\r?\\n\\s*enabled\\s*=\\s*true`);
  if (nativeEntry.test(config)) ok(`plugin \`${PLUGIN_NAME}@${MARKETPLACE}\` enabled in config.toml`);
  else fail(`plugin \`${PLUGIN_NAME}@${MARKETPLACE}\` not enabled in config.toml — \`codex plugin marketplace upgrade ${MARKETPLACE}\`, remove any legacy identity, then \`codex plugin add ${PLUGIN_NAME}@${MARKETPLACE}\` (remove before add: never both enabled)`);

  for (const legacy of LEGACY_NAMES) {
    if (config.includes(`"${legacy}`)) {
      fail(`legacy \`${legacy}\` still referenced in config.toml — \`codex plugin remove ${legacy.includes('@') ? legacy : `${legacy}@${MARKETPLACE}`}\` BEFORE adding ${PLUGIN_NAME}, then delete its stale hooks.state entries (SINGLE-SOURCE-CUTOVER step 2: never run a session with both identities enabled)`);
    } else {
      ok(`no legacy \`${legacy}\` entries in config.toml`);
    }
  }
}

// 4. install cache: a snapshot of the merged identity exists and matches the repo manifest
const repoVersion = (() => {
  try { return JSON.parse(readFileSync(join(ROOT, '.codex-plugin', 'plugin.json'), 'utf-8')).version; }
  catch { return null; }
})();
const cacheRoot = join(CODEX_HOME, 'plugins', 'cache');
// Only the merged identity under ITS marketplace counts as installed (a
// `local-marketplace/sdlc-workflow` snapshot is legacy, flagged below), and the
// highest semver wins — readdir order is lexical (v9.153.1).
let installed = null;
try {
  const pluginDir = join(cacheRoot, MARKETPLACE, PLUGIN_NAME);
  const versions = readdirSync(pluginDir).map(parseVersion).filter(Boolean).sort((a, b) => (versionLt(a, b) ? 1 : versionLt(b, a) ? -1 : 0));
  if (versions.length) installed = { marketplace: MARKETPLACE, version: versions[0].join('.') };
} catch { /* no cache at all */ }
if (!installed) {
  fail(`no installed snapshot of ${PLUGIN_NAME} under ${cacheRoot}`);
} else if (repoVersion && installed.version !== repoVersion) {
  warn(`installed snapshot ${installed.version} != repo manifest ${repoVersion} — \`codex plugin marketplace upgrade ${installed.marketplace}\``);
} else {
  ok(`installed snapshot ${installed.version} from \`${installed.marketplace}\` matches repo manifest`);
}
// Legacy cache leftovers (kept until the cutover verification passes, then pruned).
for (const legacyDir of [join(cacheRoot, MARKETPLACE, 'sdlc-workflow-codex'), join(cacheRoot, 'local-marketplace', 'sdlc-workflow')]) {
  if (existsSync(legacyDir)) warn(`legacy plugin cache still present at ${legacyDir} — safe to delete once this doctor is otherwise clean`);
}

// 5. hook trust: codex.hooks.json registers events; each needs a trusted hash keyed on ITS relpath
let hookEvents = [];
try {
  const hooksJson = JSON.parse(readFileSync(join(ROOT, HOOKS_RELPATH), 'utf-8'));
  hookEvents = Object.keys(hooksJson.hooks ?? hooksJson);
} catch { warn(`could not read ${HOOKS_RELPATH} to enumerate events`); }
if (config && hookEvents.length) {
  const trusted = hookEvents.filter((e) => {
    const snake = e.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
    return new RegExp(`\\[hooks\\.state\\."${PLUGIN_NAME}@[^"]*:${HOOKS_RELPATH.replace(/[.\/]/g, '\\$&')}:${snake}[^"]*"\\]`).test(config);
  });
  if (trusted.length === hookEvents.length) ok(`all ${hookEvents.length} hook definitions trusted (${HOOKS_RELPATH})`);
  else warn(`hook trust: ${trusted.length}/${hookEvents.length} events trusted (${hookEvents.filter((e) => !trusted.includes(e)).join(', ')} untrusted) — open an interactive codex session and trust via /hooks; untrusted hooks are SKIPPED in normal sessions. Trust keys embed the hooks-file path + content hash, so the cutover to ${HOOKS_RELPATH} re-asks once.`);
}

// Report
const icon = { ok: '  ok ', warn: 'WARN ', fail: 'FAIL ' };
for (const r of results) console.log(icon[r.level] + r.text);
const fails = results.filter((r) => r.level === 'fail').length;
const warns = results.filter((r) => r.level === 'warn').length;
console.log(`\nverify-deployment: ${fails} failure(s), ${warns} warning(s)`);
process.exit(fails ? 1 : 0);
