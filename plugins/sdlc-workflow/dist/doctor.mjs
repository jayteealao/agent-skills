#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  MARKER,
  STATE_ENTRIES
} from "./chunk-UMHCTFEX.mjs";
import {
  sdlcHomeDir
} from "./chunk-BSVWX5RF.mjs";
import "./chunk-ZGVOYTOL.mjs";

// scripts/doctor.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// lib/doctor.mjs
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
var PLUGIN_NAME = "sdlc-workflow";
var MARKETPLACE = "agent-skills-marketplace";
function shippedVersion(pluginRoot) {
  return JSON.parse(readFileSync(join(pluginRoot, "package.json"), "utf-8")).version;
}
function semverParts(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v ?? ""));
  return m ? m.slice(1, 4).map(Number) : null;
}
function versionVerdict(installed, shipped) {
  if (installed == null) return "absent";
  const a = semverParts(installed);
  const b = semverParts(shipped);
  if (!a || !b) return "unknown";
  for (let i = 0; i < 3; i++) {
    if (a[i] < b[i]) return "behind";
    if (a[i] > b[i]) return "ahead";
  }
  return "ok";
}
function parseClaudeInstalls(json, pluginName = PLUGIN_NAME) {
  const plugins = json?.plugins && typeof json.plugins === "object" ? json.plugins : {};
  const out = [];
  for (const [key, value] of Object.entries(plugins)) {
    if (key !== pluginName && !key.startsWith(`${pluginName}@`)) continue;
    for (const e of Array.isArray(value) ? value : [value]) {
      if (!e || typeof e !== "object") continue;
      out.push({
        host: "claude",
        key,
        scope: e.scope ?? "user",
        projectPath: e.projectPath ?? null,
        version: e.version ?? null,
        installPath: e.installPath ?? null,
        gitCommitSha: e.gitCommitSha ?? null
      });
    }
  }
  return out;
}
function claudeInstalledPluginsPath(homeDir = homedir()) {
  return join(homeDir, ".claude", "plugins", "installed_plugins.json");
}
function readClaudeInstalls(homeDir = homedir(), pluginName = PLUGIN_NAME) {
  const p = claudeInstalledPluginsPath(homeDir);
  if (!existsSync(p)) return [];
  try {
    return parseClaudeInstalls(JSON.parse(readFileSync(p, "utf-8")), pluginName);
  } catch {
    return [];
  }
}
function parseCodexConfig(toml, pluginName = PLUGIN_NAME, marketplace = MARKETPLACE) {
  const text = String(toml ?? "");
  const id = `${pluginName}@${marketplace}`;
  const re = new RegExp(`\\[plugins\\."${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\]\\s*\\r?\\n\\s*enabled\\s*=\\s*(true|false)`);
  const m = re.exec(text);
  const legacy = [...text.matchAll(/\[plugins\."(sdlc-workflow-[a-z0-9-]+)@/g)].map((x) => x[1]);
  const trusted = [...text.matchAll(/\[hooks\.state\."([^"]+):hooks\/codex\.hooks\.json:([a-z_]+):/g)].filter((x) => x[1] === id).map((x) => x[2]);
  return { enabled: m ? m[1] === "true" : null, legacy: [...new Set(legacy)], trustedEvents: [...new Set(trusted)].sort() };
}
function codexHomeDir(env = process.env) {
  return env.CODEX_HOME || join(homedir(), ".codex");
}
function readCodexInstalls(codexHome = codexHomeDir(), pluginName = PLUGIN_NAME) {
  const cache = join(codexHome, "plugins", "cache");
  const configPath = join(codexHome, "config.toml");
  const config = existsSync(configPath) ? parseCodexConfig(readFileSync(configPath, "utf-8"), pluginName) : { enabled: null, legacy: [], trustedEvents: [] };
  const out = [];
  if (existsSync(cache)) {
    for (const marketplace of readdirSync(cache, { withFileTypes: true })) {
      if (!marketplace.isDirectory()) continue;
      const pluginDir = join(cache, marketplace.name, pluginName);
      if (!existsSync(pluginDir)) continue;
      for (const v of readdirSync(pluginDir, { withFileTypes: true })) {
        if (!v.isDirectory()) continue;
        out.push({
          host: "codex",
          marketplace: marketplace.name,
          version: v.name,
          installPath: join(pluginDir, v.name),
          enabled: marketplace.name === MARKETPLACE ? config.enabled : null
        });
      }
    }
  }
  return { installs: out, config };
}
function cleanupStatus(home = sdlcHomeDir()) {
  if (existsSync(join(home, MARKER))) return { done: true, left: [] };
  return { done: false, left: STATE_ENTRIES.filter((e) => existsSync(join(home, e))) };
}
async function runDoctor({
  pluginRoot,
  homeDir = homedir(),
  codexHome = codexHomeDir(),
  sdlcHome = sdlcHomeDir(),
  now = () => /* @__PURE__ */ new Date()
} = {}) {
  const shipped = shippedVersion(pluginRoot);
  const claude = readClaudeInstalls(homeDir).map((i) => ({ ...i, verdict: versionVerdict(i.version, shipped) }));
  const codexRead = readCodexInstalls(codexHome);
  const codex = codexRead.installs.map((i) => ({ ...i, verdict: versionVerdict(i.version, shipped) }));
  const hostVerdicts = {
    claude: claude.length ? claude.every((i) => i.verdict === "ok") ? "ok" : claude.some((i) => i.verdict === "ok") ? "mixed" : "mismatch" : "absent",
    // `disabled`: the shipped version sits in the cache but config.toml has no
    // `enabled = true` for it — the reinstall landed, the enable step did not.
    codex: codex.length ? codex.some((i) => i.enabled === true && i.verdict === "ok") ? "ok" : codex.some((i) => i.verdict === "ok") ? "disabled" : "mismatch" : "absent"
  };
  const hostOk = (v) => v === "ok" || v === "absent";
  const ok = hostOk(hostVerdicts.claude) && hostOk(hostVerdicts.codex);
  return {
    at: now().toISOString(),
    shipped,
    hosts: { claude, codex, codexConfig: codexRead.config },
    cleanup: cleanupStatus(sdlcHome),
    verdicts: hostVerdicts,
    ok
  };
}
function formatDoctorTable(r) {
  const rows = [];
  const push = (k, v, verdict = "") => rows.push([k, String(v), verdict]);
  push("shipped (package.json)", r.shipped);
  if (!r.hosts.claude.length) push("claude install", "none", "absent");
  for (const i of r.hosts.claude) push(`claude install (${i.scope}${i.projectPath ? `: ${i.projectPath}` : ""})`, `${i.version} @ ${(i.gitCommitSha ?? "").slice(0, 8)}`, i.verdict);
  if (!r.hosts.codex.length) push("codex install", "none", "absent");
  for (const i of r.hosts.codex) push(`codex cache (${i.marketplace})`, `${i.version}${i.enabled === true ? " enabled" : i.enabled === false ? " DISABLED" : ""}`, i.verdict);
  if (r.hosts.codexConfig?.legacy?.length) push("codex legacy identities", r.hosts.codexConfig.legacy.join(", "), "remove");
  if (r.hosts.codexConfig) push("codex trusted hook events", r.hosts.codexConfig.trustedEvents.length ? r.hosts.codexConfig.trustedEvents.join(", ") : "none");
  push("old hub and tray state", r.cleanup.done ? "removed" : r.cleanup.left.length ? r.cleanup.left.join(", ") : "none", r.cleanup.left.length ? "start a session" : "");
  push("verdict", `claude ${r.verdicts.claude} \xB7 codex ${r.verdicts.codex}`, r.ok ? "OK" : "ACTION");
  const w0 = Math.max(...rows.map((x) => x[0].length));
  const w1 = Math.min(96, Math.max(...rows.map((x) => x[1].length)));
  return rows.map(([k, v, verdict]) => `${k.padEnd(w0)}  ${v.padEnd(w1)}  ${verdict}`.trimEnd()).join("\n");
}

// scripts/doctor.mjs
var PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function parseArgs(argv) {
  const out = { json: false, out: null, advisory: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") out.json = true;
    else if (a === "--advisory") out.advisory = true;
    else if (a === "--out") out.out = argv[++i] ?? null;
    else if (a.startsWith("--out=")) out.out = a.slice(6);
  }
  return out;
}
var args = parseArgs(process.argv.slice(2));
var report = await runDoctor({ pluginRoot: PLUGIN_ROOT });
var table = formatDoctorTable(report);
if (args.out) {
  mkdirSync(dirname(resolve(args.out)), { recursive: true });
  writeFileSync(args.out, `sdlc doctor \xB7 ${report.at}

${table}
`);
  writeFileSync(`${args.out}.json`, `${JSON.stringify(report, null, 2)}
`);
}
process.stdout.write(args.json ? `${JSON.stringify(report, null, 2)}
` : `${table}
`);
process.exit(args.advisory || report.ok ? 0 : 1);
