#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  readHubConfig
} from "./chunk-MKMDFMEG.mjs";
import "./chunk-N7IAPX7N.mjs";
import {
  readActiveRuntime,
  runtimeStoreDir
} from "./chunk-FVH7UCVI.mjs";
import "./chunk-EQC6XDOG.mjs";
import "./chunk-KRRL2TSM.mjs";
import "./chunk-YVM64S7E.mjs";
import "./chunk-FZ2GR6GF.mjs";
import {
  ephemeralRootReason,
  readRegistry,
  sdlcHomeDir
} from "./chunk-4K63PVBZ.mjs";
import "./chunk-LFGT2BKG.mjs";
import "./chunk-SGA7NFMW.mjs";

// scripts/doctor.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve as resolve2 } from "node:path";
import { fileURLToPath } from "node:url";

// lib/doctor.mjs
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { request } from "node:http";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
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
function hubHealth({ host = "127.0.0.1", port, timeoutMs = 1200 } = {}) {
  const probeHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  return new Promise((resolveP) => {
    const req = request({ hostname: probeHost, port, path: "/__sdlc/health", method: "GET", timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        resolveP({ reachable: false, status: res.statusCode });
        return;
      }
      let buf = "";
      res.setEncoding("utf-8");
      res.on("data", (c) => {
        if (buf.length < 262144) buf += c;
      });
      res.on("end", () => {
        try {
          const body = JSON.parse(buf);
          const hub = body.hub && typeof body.hub === "object" ? body.hub : {};
          resolveP({
            reachable: true,
            pid: Number.isInteger(body.pid) ? body.pid : null,
            isHub: Array.isArray(body.entries),
            runtimeVersion: hub.runtimeVersion ?? body.version ?? null,
            buildId: hub.buildId ?? null,
            startedBy: body.startedBy && typeof body.startedBy.host === "string" ? body.startedBy.host : typeof body.startedBy === "string" ? body.startedBy : null,
            entries: Array.isArray(body.entries) ? body.entries.length : null,
            uptimeMs: Number.isFinite(body.uptimeMs) ? body.uptimeMs : null
          });
        } catch {
          resolveP({ reachable: false, status: "unparseable" });
        }
      });
    });
    req.on("timeout", () => {
      req.destroy();
      resolveP({ reachable: false, status: "timeout" });
    });
    req.on("error", (e) => resolveP({ reachable: false, status: e.code || "error" }));
    req.end();
  });
}
function parseNetstatListeners(text) {
  const out = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const m = /^\s*(TCP|UDP)\s+(\S+?):(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/.exec(line);
    if (m) out.push({ proto: m[1], local: m[2], port: Number(m[3]), pid: Number(m[4]) });
  }
  return out;
}
function portOwner(port, { platform = process.platform, exec = spawnSync } = {}) {
  try {
    if (platform === "win32") {
      const r2 = exec("netstat", ["-ano", "-p", "TCP"], { encoding: "utf-8", windowsHide: true, timeout: 1e4 });
      const row = parseNetstatListeners(r2.stdout).find((x) => x.port === Number(port));
      return row ? { pid: row.pid, source: "netstat" } : null;
    }
    const r = exec("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf-8", timeout: 1e4 });
    const pid = Number(String(r.stdout ?? "").trim().split(/\s+/)[0]);
    return Number.isInteger(pid) && pid > 0 ? { pid, source: "lsof" } : null;
  } catch {
    return null;
  }
}
function dirBytes(dir) {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let ents = [];
    try {
      ents = readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of ents) {
      const p = join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) {
        try {
          total += statSync(p).size;
        } catch {
        }
      }
    }
  }
  return total;
}
function runtimeStoreStats(dir = runtimeStoreDir()) {
  if (!existsSync(dir)) return { dir, count: 0, bytes: 0, builds: [] };
  const builds = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  return { dir, count: builds.length, bytes: dirBytes(dir), builds };
}
function classifyRoot(repoRoot, { tmpDir = tmpdir() } = {}) {
  return ephemeralRootReason(repoRoot, { tmpDir });
}
function registryAudit(entries, { tmpDir } = {}) {
  const list = Array.isArray(entries) ? entries : [];
  const flagged = [];
  const zeroSlugs = [];
  for (const e of list) {
    const reason = classifyRoot(e?.repoRoot, { tmpDir });
    const slugs = Array.isArray(e?.slugs) ? e.slugs.length : Number.isInteger(e?.slugCount) ? e.slugCount : null;
    if (reason) flagged.push({ id: e.id ?? null, repoRoot: e.repoRoot ?? null, reason });
    if (slugs === 0) zeroSlugs.push({ id: e.id ?? null, repoRoot: e.repoRoot ?? null });
  }
  return { total: list.length, flagged, zeroSlugs };
}
function tailscaleServeStatus({ exec = spawnSync } = {}) {
  try {
    const r = exec("tailscale", ["serve", "status"], { encoding: "utf-8", windowsHide: true, timeout: 1e4 });
    if (r.error || r.status !== 0) return { available: false, text: (r.stderr || r.stdout || r.error?.message || "").trim() };
    return { available: true, text: String(r.stdout ?? "").trim() };
  } catch (e) {
    return { available: false, text: String(e?.message ?? e) };
  }
}
async function runDoctor({
  pluginRoot,
  homeDir = homedir(),
  codexHome = codexHomeDir(),
  sdlcHome = sdlcHomeDir(),
  hubConfig = null,
  tmpDir = tmpdir(),
  exec = spawnSync,
  platform = process.platform,
  now = () => /* @__PURE__ */ new Date(),
  probeHub = true
} = {}) {
  const shipped = shippedVersion(pluginRoot);
  const claude = readClaudeInstalls(homeDir).map((i) => ({ ...i, verdict: versionVerdict(i.version, shipped) }));
  const codexRead = readCodexInstalls(codexHome);
  const codex = codexRead.installs.map((i) => ({ ...i, verdict: versionVerdict(i.version, shipped) }));
  let cfg = hubConfig;
  if (!cfg) {
    try {
      cfg = readHubConfig({ create: false });
    } catch {
      cfg = { host: "127.0.0.1", port: 4173, tailscale: { enabled: false } };
    }
  }
  const host = cfg.host ?? "127.0.0.1";
  const port = cfg.port ?? 4173;
  const health = probeHub ? await hubHealth({ host, port }) : { reachable: false, status: "skipped" };
  const owner = portOwner(port, { platform, exec });
  let active = null;
  try {
    active = await readActiveRuntime();
  } catch {
    active = null;
  }
  const store = runtimeStoreStats(join(sdlcHome, "runtime"));
  let entries = [];
  try {
    entries = readRegistry({ validate: false, logInvalid: false })?.entries ?? [];
  } catch {
    entries = [];
  }
  const registry = registryAudit(entries, { tmpDir });
  const tailscale = { configured: cfg.tailscale?.enabled === true, mode: cfg.tailscale?.mode ?? null, ...tailscaleServeStatus({ exec }) };
  const hostVerdicts = {
    claude: claude.length ? claude.every((i) => i.verdict === "ok") ? "ok" : claude.some((i) => i.verdict === "ok") ? "mixed" : "mismatch" : "absent",
    codex: codex.length ? codex.some((i) => i.enabled === true && i.verdict === "ok") ? "ok" : "mismatch" : "absent",
    hub: health.reachable ? versionVerdict(health.runtimeVersion, shipped) : "unreachable"
  };
  const ok = hostVerdicts.claude === "ok" && hostVerdicts.codex === "ok" && (hostVerdicts.hub === "ok" || hostVerdicts.hub === "unreachable");
  return {
    at: now().toISOString(),
    shipped,
    hosts: { claude, codex, codexConfig: codexRead.config },
    hub: { host, port, ...health, portOwner: owner, activeRuntime: active ? { buildId: active.buildId ?? null, runtimeVersion: active.runtimeVersion ?? null } : null },
    runtimeStore: store,
    registry,
    tailscale,
    verdicts: hostVerdicts,
    ok
  };
}
var mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;
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
  push(`hub ${r.hub.host}:${r.hub.port}`, r.hub.reachable ? `${r.hub.runtimeVersion} build ${(r.hub.buildId ?? "").slice(0, 12)} pid ${r.hub.pid} by ${r.hub.startedBy ?? "?"} \xB7 ${r.hub.entries ?? "?"} repos` : `unreachable (${r.hub.status})`, r.verdicts.hub);
  push("hub port owner", r.hub.portOwner ? `pid ${r.hub.portOwner.pid} (${r.hub.portOwner.source})` : "none listening", r.hub.portOwner && r.hub.reachable && r.hub.pid && r.hub.portOwner.pid !== r.hub.pid ? "foreign" : "");
  push("active runtime", r.hub.activeRuntime ? `${r.hub.activeRuntime.runtimeVersion} build ${(r.hub.activeRuntime.buildId ?? "").slice(0, 12)}` : "none");
  push("runtime store", `${r.runtimeStore.count} builds \xB7 ${mb(r.runtimeStore.bytes)} \xB7 ${r.runtimeStore.dir}`, r.runtimeStore.count > 3 ? "gc" : "");
  push("registry entries", r.registry.total);
  push("registry ephemeral roots", r.registry.flagged.length ? r.registry.flagged.map((f) => `${f.reason}: ${f.repoRoot}`).join("; ") : "none", r.registry.flagged.length ? "refuse" : "");
  push("registry entries with 0 slugs", r.registry.zeroSlugs.length ? r.registry.zeroSlugs.map((z) => z.repoRoot).join("; ") : "none");
  push("tailscale", `${r.tailscale.configured ? `configured (${r.tailscale.mode})` : "not configured"} \xB7 serve status: ${r.tailscale.available ? r.tailscale.text.split("\n").filter(Boolean).slice(-1)[0] ?? "ok" : "unavailable"}`);
  push("verdict", `claude ${r.verdicts.claude} \xB7 codex ${r.verdicts.codex} \xB7 hub ${r.verdicts.hub}`, r.ok ? "OK" : "ACTION");
  const w0 = Math.max(...rows.map((x) => x[0].length));
  const w1 = Math.min(96, Math.max(...rows.map((x) => x[1].length)));
  return rows.map(([k, v, verdict]) => `${k.padEnd(w0)}  ${v.padEnd(w1)}  ${verdict}`.trimEnd()).join("\n");
}

// scripts/doctor.mjs
var PLUGIN_ROOT = resolve2(dirname(fileURLToPath(import.meta.url)), "..");
function parseArgs(argv) {
  const out = { json: false, out: null, advisory: false, probeHub: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") out.json = true;
    else if (a === "--advisory") out.advisory = true;
    else if (a === "--no-hub") out.probeHub = false;
    else if (a === "--out") out.out = argv[++i] ?? null;
    else if (a.startsWith("--out=")) out.out = a.slice(6);
  }
  return out;
}
var args = parseArgs(process.argv.slice(2));
var report = await runDoctor({ pluginRoot: PLUGIN_ROOT, probeHub: args.probeHub });
var table = formatDoctorTable(report);
if (args.out) {
  mkdirSync(dirname(resolve2(args.out)), { recursive: true });
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
