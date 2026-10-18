#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  composeStagePage,
  evidenceDirFor,
  splitStorySection,
  stageKeyFor,
  viewHref
} from "./chunk-QTWRR75H.mjs";
import {
  boardsGallery
} from "./chunk-FHZLIB5Q.mjs";
import {
  expand
} from "./chunk-OD4U4WLL.mjs";
import {
  loadArtifact,
  loadHistory,
  md2html
} from "./chunk-UW3C7ZAM.mjs";
import {
  EVIDENCE_DIRS,
  NO_PAGE_DIRS,
  PLUGIN_VERSION,
  SURFACE_SWEEP_RE,
  breadcrumbFromView,
  classifyFragmentName,
  hubAssetBase,
  renderShell,
  resolveViewPath,
  siblingPaths
} from "./chunk-AUY2HYM2.mjs";
import {
  aggregateCost,
  readCostRows
} from "./chunk-SQWQDGCF.mjs";
import {
  escapeHtml,
  renderWarnBanner,
  validateFrontmatter
} from "./chunk-3RXHOXIK.mjs";
import {
  ensureHubLifecycle,
  maybeConfigureTailscale,
  tailscaleDnsName
} from "./chunk-3AKK7WBO.mjs";
import "./chunk-KIZZEX5M.mjs";
import {
  HUB_DEFAULT_PORT,
  effectiveCodeBrowserConfig,
  readHubConfig
} from "./chunk-QZWRAAAQ.mjs";
import {
  frozenBoardsOf
} from "./chunk-5QUQXL7Q.mjs";
import "./chunk-523C7UE2.mjs";
import {
  readRenderedIdentity,
  renderIdentityMatches,
  runtimeIdentity
} from "./chunk-CGSPUUFD.mjs";
import {
  spawnDetachedNode
} from "./chunk-K6PBZI5W.mjs";
import {
  resolveEntrypoint
} from "./chunk-KRRL2TSM.mjs";
import {
  configHash,
  loadConfigWithMeta
} from "./chunk-QUEAOP62.mjs";
import {
  activeWorkflowIndexes,
  classifyRenderState,
  hubPidPath,
  isPidAlive,
  latestMtimeMs,
  latestTreeMtimeMs,
  pidFileStatus,
  readPidFile,
  removePidFile,
  resolveProjectRoot,
  scanWorkflowIndexes,
  upsertRegistryEntry,
  viewMtimeForSlug,
  writePidFile
} from "./chunk-GUVQYSNY.mjs";
import "./chunk-FZ2GR6GF.mjs";
import "./chunk-5U76735W.mjs";
import "./chunk-LFGT2BKG.mjs";
import "./chunk-SGA7NFMW.mjs";

// scripts/render-sunflower.mjs
import {
  existsSync as existsSync2,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  statSync as statSync2,
  rmSync,
  renameSync,
  appendFileSync,
  copyFileSync
} from "node:fs";
import { spawn } from "node:child_process";
import { dirname, resolve, join as join2, relative, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// renderers/_fragment-gen.mjs
var RICH_TIER_TYPES = Object.freeze([
  "review",
  "plan",
  "design",
  "ship-run",
  "rca",
  "benchmark",
  "experiment",
  "instrument",
  "profile",
  "simplify-run",
  "review-command",
  "design-audit",
  "design-critique",
  "design-contract"
]);
var FRAGMENT_NAME = {
  "review-command": "review-dimension"
};
function fragmentNameFor(type) {
  return FRAGMENT_NAME[type] ?? type;
}
function shouldGenerateFragment({ type, yamlMtimeMs, fragmentMtimeMs }) {
  if (!RICH_TIER_TYPES.includes(type)) return false;
  if (yamlMtimeMs == null) return false;
  if (fragmentMtimeMs == null) return true;
  return fragmentMtimeMs < yamlMtimeMs;
}
var SEVERITY_ORDER = ["blocker", "high", "med", "medium", "low", "nit", "info"];
var CLOSED_STATUS = /* @__PURE__ */ new Set(["fixed", "resolved", "closed", "dismissed", "wontfix", "won't-fix", "accepted", "done"]);
function generateTypedFragment({ type, siblingYaml, artifact = "" }) {
  const name = fragmentNameFor(type);
  const sy = siblingYaml && typeof siblingYaml === "object" ? siblingYaml : {};
  const parts = [];
  const findings = Array.isArray(sy.findings) ? sy.findings : null;
  if (type === "review" && findings?.length) {
    parts.push(findingsList(findings));
  }
  parts.push(dataProjection(sy));
  const detail = {
    generated: true,
    keys: Object.keys(sy).length,
    ...findings ? { findings: findings.length } : {}
  };
  return [
    `<section class="fragment-${escapeHtml(name)}" data-generated="yaml">`,
    ...parts.filter(Boolean),
    // Inline dispatch (the fragment-ready snippet shape), so the generated
    // fragment also passes verify-fragment Check 4 if someone writes it out.
    `<script>window.dispatchEvent(new CustomEvent('sdlc:fragment-ready', { detail: ${jsonForScript({ ...detail, name, artifact })} }));</script>`,
    "</section>"
  ].join("\n");
}
function jsonForScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
function isOpen(f) {
  const s = String(f?.status ?? "open").toLowerCase();
  return !CLOSED_STATUS.has(s);
}
function sevRank(s) {
  const i = SEVERITY_ORDER.indexOf(String(s ?? "").toLowerCase());
  return i === -1 ? SEVERITY_ORDER.length : i;
}
function findingsList(findings) {
  const rows = findings.map((f, i) => ({ f, i })).sort((a, b) => Number(isOpen(b.f)) - Number(isOpen(a.f)) || sevRank(a.f?.severity) - sevRank(b.f?.severity) || a.i - b.i);
  const items = rows.map(({ f }) => {
    if (!f || typeof f !== "object") return `<li>${escapeHtml(String(f))}</li>`;
    const sev = String(f.severity ?? "").toLowerCase();
    const sevClass = sev === "medium" ? "med" : sev;
    const chip = sev ? `<span class="sev severity-${escapeHtml(sevClass)}">${escapeHtml(sev)}</span> ` : "";
    const id = f.id ? `<code>${escapeHtml(f.id)}</code> ` : "";
    const title = escapeHtml(f.title ?? f.summary ?? f.finding ?? "");
    const where = f.file ?? f.location ?? f.path;
    const loc = where ? ` <span class="meta"><code>${escapeHtml(where)}${f.line != null ? `:${escapeHtml(f.line)}` : ""}</code></span>` : "";
    const status = f.status ? ` <span class="meta">${escapeHtml(f.status)}</span>` : "";
    return `<li class="${isOpen(f) ? "is-open" : "is-closed"}">${chip}${id}${title}${loc}${status}</li>`;
  }).join("");
  const open = findings.filter(isOpen).length;
  return `<section class="gen-findings"><h3 class="sdlc-h3">Findings \xB7 ${open} open of ${findings.length}</h3><ul class="gen-findings-list">${items}</ul></section>`;
}
function dataProjection(sy) {
  const keys = Object.keys(sy ?? {});
  if (!keys.length) return "";
  return `<details class="gen-data"><summary>Structured data \xB7 ${keys.length} key${keys.length === 1 ? "" : "s"}</summary>${projectValue(sy, 0)}</details>`;
}
function projectValue(v, depth) {
  if (v == null) return '<span class="meta">\u2014</span>';
  if (v instanceof Date) return escapeHtml(v.toISOString());
  if (Array.isArray(v)) {
    if (!v.length) return '<span class="meta">none</span>';
    if (v.every((x) => x && typeof x === "object" && !Array.isArray(x)) && depth < 4) return objectTable(v, depth);
    return `<ul>${v.map((x) => `<li>${projectValue(x, depth + 1)}</li>`).join("")}</ul>`;
  }
  if (typeof v === "object") {
    if (depth >= 4) return `<code>${escapeHtml(JSON.stringify(v))}</code>`;
    const rows = Object.entries(v).map(([k, x]) => `<div><dt>${escapeHtml(k)}</dt><dd>${projectValue(x, depth + 1)}</dd></div>`).join("");
    return `<dl class="frontmatter-card">${rows}</dl>`;
  }
  return escapeHtml(String(v));
}
function objectTable(list, depth) {
  const cols = [];
  for (const row of list) for (const k of Object.keys(row)) if (!cols.includes(k)) cols.push(k);
  const head = cols.map((c) => `<th>${escapeHtml(c)}</th>`).join("");
  const body = list.map((row) => `<tr>${cols.map((c) => `<td>${row[c] === void 0 ? "" : projectValue(row[c], depth + 1)}</td>`).join("")}</tr>`).join("");
  return `<table class="prose-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

// renderers/_link-graph.mjs
import { posix as path } from "node:path";
function buildPathMap(artifacts) {
  const map = /* @__PURE__ */ new Map();
  for (const a of artifacts) {
    const r = resolveViewPath(a.path, { kind: a.kind });
    if (r) map.set(a.path, r.viewRel);
  }
  return map;
}
function relativeBetween(fromViewRel, toViewRel) {
  const fromParts = fromViewRel.split("/").slice(0, -1);
  const toParts = toViewRel.split("/");
  let common = 0;
  while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) common++;
  const up = "../".repeat(fromParts.length - common);
  const down = toParts.slice(common).join("/");
  return up + down || "./";
}
function rewriteBodyLinks(html, { pathMap, fromStorageRel, fromViewRel } = {}) {
  if (!html || !pathMap || !fromViewRel) return html;
  const fromDir = path.dirname(String(fromStorageRel || ""));
  return html.replace(/(<a\b[^>]*?\shref=")([^"]+)(")/gi, (full, pre, href, post) => {
    const hashAt = href.indexOf("#");
    const rawPath = hashAt >= 0 ? href.slice(0, hashAt) : href;
    const hash = hashAt >= 0 ? href.slice(hashAt) : "";
    if (!rawPath || rawPath.startsWith("#") || rawPath.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(rawPath)) return full;
    if (!/\.md$/i.test(rawPath)) return full;
    const targetStorage = path.join(fromDir, rawPath).replace(/^\.\//, "");
    const targetView = pathMap.get(targetStorage) ?? pathMap.get(rawPath);
    if (!targetView) return full;
    return `${pre}${relativeBetween(fromViewRel, targetView)}${hash}${post}`;
  });
}

// renderers/_mtime.mjs
import { statSync, existsSync } from "node:fs";
function maxMtime(absPaths) {
  let max = 0;
  for (const p of absPaths) {
    if (!p || !existsSync(p)) continue;
    try {
      const s = statSync(p);
      if (s.mtimeMs > max) max = s.mtimeMs;
    } catch {
    }
  }
  return max;
}
function isDirty({ storageInputs, viewOutput }) {
  if (!existsSync(viewOutput)) return true;
  const inputMtime = maxMtime(storageInputs);
  const outputMtime = maxMtime([viewOutput]);
  return inputMtime >= outputMtime;
}
function workSetFilter({ mode, onlyGlob }) {
  const onlyRe = onlyGlob ? globToRegex(onlyGlob) : null;
  return ({ storagePath, storageInputs, viewOutput }) => {
    if (onlyRe && !onlyRe.test(storagePath)) return false;
    if (mode === "clean") return true;
    return isDirty({ storageInputs, viewOutput });
  };
}
function globToRegex(glob) {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "<<DOUBLESTAR>>").replace(/\*/g, "[^/]*").replace(/<<DOUBLESTAR>>/g, ".*");
  return new RegExp("^" + esc + "$");
}

// lib/serve-lifecycle.mjs
import { request } from "node:http";
import { join } from "node:path";
var RUNTIME = runtimeIdentity();
function servePidPath(projectRoot) {
  return join(projectRoot, ".ai", "_view", ".serve.pid");
}
async function ensureServeLifecycle({
  projectRoot = process.cwd(),
  pluginRoot,
  viewRoot = join(projectRoot, ".ai", "_view"),
  configHash: configHash2 = "",
  log = () => {
  }
} = {}) {
  const hubCfg = readHubConfig({ create: false });
  const host = hubCfg.host ?? "127.0.0.1";
  const port = Number(hubCfg.port ?? HUB_DEFAULT_PORT);
  const tailscale = hubCfg.tailscale ?? {};
  const liveReload = hubCfg.liveReload !== false;
  const pidPath = servePidPath(projectRoot);
  const status = await pidFileStatus(pidPath);
  if (hubCfg.perRepoServe !== true) {
    if (status.alive) {
      stopPid(status.record.pid, log);
      log(`[serve] per-repo daemons off by default (hub-config.perRepoServe not true) \u2014 reaped pid ${status.record.pid}`);
    } else {
      log("[serve] per-repo daemons off by default (hub-config.perRepoServe not true) \u2014 the hub serves this repo at /r/<id>/");
    }
    if (status.record) await removePidFile(pidPath);
    return { action: "per-repo-disabled" };
  }
  {
    const hub = await liveHub();
    if (hub) {
      if (status.alive) stopPid(status.record.pid, log);
      if (status.record) await removePidFile(pidPath);
      log(`[serve] hub active at http://${displayHost(hub.host ?? "127.0.0.1")}:${hub.port} \u2014 this repo is served there under /r/<id>/`);
      return { action: "hub-active", hub: { host: hub.host ?? "127.0.0.1", port: hub.port, pid: hub.pid } };
    }
  }
  if (host === "0.0.0.0" && !(tailscale.enabled === true && tailscale.acknowledgedPublic === true)) {
    log("[serve] refused host 0.0.0.0 without hub-config.tailscale.enabled + acknowledgedPublic");
    return { action: "refused-host" };
  }
  if (status.alive) {
    const id = await probeServeIdentity({ host, port, timeoutMs: 600 });
    if (id && id.version === RUNTIME.runtimeVersion) {
      log(`[serve] already running at http://${displayHost(host)}:${port}`);
      maybeConfigureTailscale({ tailscale, port, log });
      return { action: "already-running", pid: status.record.pid };
    }
    stopPid(status.record.pid, log);
    await removePidFile(pidPath);
    log(id ? `[serve] reaped stale daemon v${id.version || "?"} \u2192 v${RUNTIME.runtimeVersion} (pid ${status.record.pid})` : `[serve] stopped unhealthy daemon pid ${status.record.pid}`);
  } else if (status.stale) {
    await removePidFile(pidPath);
    log(`[serve] removed stale pid file for pid ${status.record?.pid}`);
  }
  const script = resolveEntrypoint(pluginRoot, "render-sunflower-serve");
  const spawnArgs = [
    "--view",
    viewRoot,
    "--host",
    host,
    "--port",
    String(port),
    "--pid-file",
    pidPath,
    "--project-root",
    projectRoot,
    "--config-hash",
    configHash2,
    liveReload ? "--live-reload" : "--no-live-reload",
    host === "0.0.0.0" && tailscale.enabled === true ? "--allow-all-hosts" : ""
  ].filter(Boolean);
  if (host !== "0.0.0.0" && tailscale.enabled === true) {
    const dns = tailscaleDnsName({ log });
    if (dns) {
      spawnArgs.push("--allowed-hosts", dns);
      log(`[serve] allowlisting tailnet host ${dns}`);
    }
  }
  const child = spawnDetachedNode(script, spawnArgs, {
    cwd: projectRoot,
    // codeBrowser + staleRender blocks via env: JSON can't ride argv through the
    // Windows launch-hidden.vbs shim (same channel the hub uses for its token).
    // staleRender carries the heal settings; the standalone fallback picks up a
    // changed block on its next respawn (the hub, the primary, restarts on the
    // hub-config hash). See STALE-RENDER-HEAL-PLAN §8.
    env: {
      ...process.env,
      SDLC_CODE_BROWSER: JSON.stringify(effectiveCodeBrowserConfig(hubCfg)),
      SDLC_STALE_RENDER: JSON.stringify(hubCfg.staleRender ?? {})
    }
  });
  if (child.pid) {
    await writePidFile(pidPath, { pid: child.pid, host, port, configHash: configHash2 });
  }
  const healthy = await waitForHealth({ host, port, timeoutMs: 2500 });
  if (!healthy) {
    log(`[serve] started pid ${child.pid}, health check not ready yet`);
    return { action: "started-unconfirmed", pid: child.pid };
  }
  log(`[serve] started pid ${child.pid} at http://${displayHost(host)}:${port}`);
  maybeConfigureTailscale({ tailscale, port, log });
  return { action: "started", pid: child.pid };
}
async function liveHub() {
  const record = await readPidFile(hubPidPath());
  if (!record || !record.pid || !isPidAlive(record.pid)) return null;
  return record;
}
function stopPid(pid, log) {
  if (!isPidAlive(pid)) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch (err) {
    log(`[serve] could not stop pid ${pid}: ${err.message}`);
  }
}
function waitForHealth({ host, port, timeoutMs }) {
  const started = Date.now();
  return new Promise((resolve2) => {
    const tick = () => {
      probeHealth({ host, port, timeoutMs: 250 }).then((ok) => {
        if (ok) return resolve2(true);
        if (Date.now() - started >= timeoutMs) return resolve2(false);
        setTimeout(tick, 120);
      });
    };
    tick();
  });
}
function probeHealth({ host, port, timeoutMs }) {
  const probeHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  return new Promise((resolve2) => {
    const req = request({
      hostname: probeHost,
      port,
      path: "/__sdlc/health",
      method: "GET",
      timeout: timeoutMs
    }, (res) => {
      res.resume();
      resolve2(res.statusCode === 200);
    });
    req.on("timeout", () => {
      req.destroy();
      resolve2(false);
    });
    req.on("error", () => resolve2(false));
    req.end();
  });
}
function probeServeIdentity({ host, port, timeoutMs }) {
  const probeHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  return new Promise((resolve2) => {
    const req = request({
      hostname: probeHost,
      port,
      path: "/__sdlc/health",
      method: "GET",
      timeout: timeoutMs
    }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        resolve2(null);
        return;
      }
      let buf = "";
      res.setEncoding("utf-8");
      res.on("data", (c) => {
        if (buf.length < 65536) buf += c;
      });
      res.on("end", () => {
        try {
          const body = JSON.parse(buf);
          resolve2({
            pid: Number.isInteger(body.pid) ? body.pid : null,
            version: typeof body.version === "string" ? body.version : ""
          });
        } catch {
          resolve2(null);
        }
      });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve2(null);
    });
    req.on("error", () => resolve2(null));
    req.end();
  });
}
function displayHost(host) {
  return host === "0.0.0.0" ? "127.0.0.1" : host;
}

// scripts/render-sunflower.mjs
var __dirname = dirname(fileURLToPath(import.meta.url));
var PLUGIN_ROOT_DEFAULT = resolve(__dirname, "..");
var RUNNING_FROM_DIST = basename(__dirname) === "dist";
var OFF_PIPELINE_BUCKET = {
  simplify: "simplify",
  profile: "profiles",
  deps: "dep-updates",
  ideation: "ideation"
};
function parseArgs(argv) {
  const args = {
    storage: ".ai/workflows",
    view: ".ai/_view",
    simplify: ".ai/simplify",
    profiles: ".ai/profiles",
    docs: ".ai/docs",
    depUpdates: ".ai/dep-updates",
    ideation: ".ai/ideation",
    assetBase: null,
    pluginRoot: PLUGIN_ROOT_DEFAULT,
    schema: null,
    mode: "additive",
    onlyGlob: null,
    bootstrap: false,
    dryRun: false,
    diag: false,
    includeProjectContext: true,
    concurrency: null,
    sharedOutput: true
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--clean") args.mode = "clean";
    else if (a === "--only") args.onlyGlob = argv[++i];
    else if (a === "--bootstrap") args.bootstrap = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--diag") args.diag = true;
    else if (a === "--concurrency") args.concurrency = Number(argv[++i]);
    else if (a === "--include-project-context") args.includeProjectContext = true;
    else if (a === "--no-include-project-context") args.includeProjectContext = false;
    else if (a === "--storage") args.storage = argv[++i];
    else if (a === "--view") args.view = argv[++i];
    else if (a === "--simplify") args.simplify = argv[++i];
    else if (a === "--profiles") args.profiles = argv[++i];
    else if (a === "--docs") args.docs = argv[++i];
    else if (a === "--dep-updates") args.depUpdates = argv[++i];
    else if (a === "--ideation") args.ideation = argv[++i];
    else if (a === "--asset-base") args.assetBase = argv[++i];
    else if (a === "--plugin-root") args.pluginRoot = resolve(argv[++i]);
    else if (a === "--schema") args.schema = resolve(argv[++i]);
    else if (a === "--no-shared-output") args.sharedOutput = false;
  }
  args.schema ??= join2(args.pluginRoot, "tests", "frontmatter.schema.json");
  return args;
}
var cachedAssetBase = null;
function defaultAssetBase(args) {
  if (args.assetBase) return args.assetBase;
  cachedAssetBase ??= hubAssetBase(runtimeIdentity().buildId);
  return cachedAssetBase;
}
function* walkStorage(root) {
  if (!existsSync2(root)) return;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const abs = join2(dir, e.name);
      if (e.isDirectory()) {
        if (e.name.startsWith(".") && e.name !== ".ai") continue;
        if (e.name === "node_modules") continue;
        if (EVIDENCE_DIRS.includes(e.name)) continue;
        if (NO_PAGE_DIRS.includes(e.name) && /[\\/]\.ai[\\/]workflows[\\/][^\\/]+$/.test(dir)) continue;
        stack.push(abs);
      } else if (e.isFile()) {
        if (abs.endsWith(".md") || abs.endsWith(".yaml") || abs.endsWith(".html.fragment")) {
          yield abs;
        }
      }
    }
  }
}
function discoverArtifacts({ storageRoot, simplifyRoot, profilesRoot, docsRoot, depUpdatesRoot, ideationRoot, projectRoot, includeProjectContext = true }) {
  const artifacts = [];
  for (const abs of walkStorage(storageRoot)) {
    if (!abs.endsWith(".md")) continue;
    const rel = relative(storageRoot, abs).replace(/\\/g, "/");
    const slugParts = rel.split("/");
    if (slugParts.length < 2) continue;
    const slug = slugParts[0];
    const storageRel = slugParts.slice(1).join("/");
    artifacts.push({
      mdAbs: abs,
      slug,
      storageRel,
      kind: "workflow"
    });
  }
  if (existsSync2(simplifyRoot)) {
    for (const abs of walkStorage(simplifyRoot)) {
      if (!abs.endsWith(".md")) continue;
      const rel = relative(simplifyRoot, abs).replace(/\\/g, "/");
      artifacts.push({
        mdAbs: abs,
        slug: "__simplify__",
        storageRel: rel,
        kind: "simplify"
      });
    }
  }
  if (existsSync2(profilesRoot)) {
    for (const abs of walkStorage(profilesRoot)) {
      if (!abs.endsWith(".md")) continue;
      const rel = relative(profilesRoot, abs).replace(/\\/g, "/");
      artifacts.push({
        mdAbs: abs,
        slug: "__profiles__",
        storageRel: rel,
        kind: "profile"
      });
    }
  }
  if (depUpdatesRoot && existsSync2(depUpdatesRoot)) {
    for (const abs of walkStorage(depUpdatesRoot)) {
      if (!abs.endsWith(".md")) continue;
      const rel = relative(depUpdatesRoot, abs).replace(/\\/g, "/");
      artifacts.push({ mdAbs: abs, slug: "__deps__", storageRel: rel, kind: "deps" });
    }
  }
  if (ideationRoot && existsSync2(ideationRoot)) {
    for (const abs of walkStorage(ideationRoot)) {
      if (!abs.endsWith(".md")) continue;
      const rel = relative(ideationRoot, abs).replace(/\\/g, "/");
      artifacts.push({ mdAbs: abs, slug: "__ideation__", storageRel: rel, kind: "ideation" });
    }
  }
  artifacts.push(...discoverDocsArtifacts({ docsRoot }));
  if (includeProjectContext) {
    artifacts.push(...discoverProjectArtifacts({ projectRoot }));
  }
  return artifacts;
}
function discoverDocsArtifacts({ docsRoot }) {
  const out = [];
  if (!existsSync2(docsRoot)) return out;
  for (const abs of walkStorage(docsRoot)) {
    if (!abs.endsWith(".md")) continue;
    const rel = relative(docsRoot, abs).replace(/\\/g, "/");
    out.push({
      mdAbs: abs,
      slug: "__docs__",
      storageRel: rel,
      kind: "docs",
      siblingRoot: docsRoot
    });
  }
  return out;
}
function discoverProjectArtifacts({ projectRoot }) {
  const out = [];
  const candidates = [
    { rel: "PRODUCT.md", type: "project-context", title: "Product context", siblingRoot: projectRoot },
    { rel: "DESIGN.md", type: "project-context", title: "Design context", siblingRoot: projectRoot },
    { rel: ".ai/ship-plan.md", type: "ship-plan", title: "Ship plan", siblingRoot: projectRoot },
    // Project-root observability artifacts (/wf project observability init|build) — same
    // family as ship-plan. Absent from discovery v9.132.0–v9.150.0, so they were
    // written but never rendered; the e2e's missing-renderer signal surfaced it.
    { rel: ".ai/observability.md", type: "observability-plan", title: "Observability plan", siblingRoot: projectRoot },
    { rel: ".ai/observability-build.md", type: "observability-build", title: "Observability build", siblingRoot: projectRoot }
  ];
  const aiDir = join2(projectRoot, ".ai");
  if (existsSync2(aiDir)) {
    for (const name of readdirSync(aiDir).sort()) {
      const rel = `.ai/${name}`;
      if (!SURFACE_SWEEP_RE.test(rel)) continue;
      candidates.push({ rel, type: "surface-sweep", title: `Surface sweep ${name.slice("surface-sweep-".length, -".md".length)}`, siblingRoot: projectRoot });
    }
  }
  for (const candidate of candidates) {
    const mdAbs = join2(projectRoot, candidate.rel);
    if (!existsSync2(mdAbs)) continue;
    out.push({
      mdAbs,
      slug: "__project__",
      storageRel: candidate.rel.replace(/\\/g, "/"),
      kind: "project",
      siblingRoot: candidate.siblingRoot,
      syntheticType: candidate.type,
      syntheticTitle: candidate.title
    });
  }
  return out;
}
var rendererCache = /* @__PURE__ */ new Map();
async function loadRenderer(type, pluginRoot) {
  if (rendererCache.has(type)) return rendererCache.get(type);
  const rendererDir = RUNNING_FROM_DIST ? join2(pluginRoot, "dist", "renderers") : join2(pluginRoot, "renderers");
  const path2 = join2(rendererDir, `${type}.mjs`);
  if (!existsSync2(path2)) {
    rendererCache.set(type, null);
    return null;
  }
  try {
    const mod = await import(pathToFileURL(path2).href);
    rendererCache.set(type, mod);
    return mod;
  } catch (err) {
    console.warn(`[renderer] failed to load ${type}: ${err.message}`);
    rendererCache.set(type, null);
    return null;
  }
}
function assetUpToDate(src, dst) {
  if (!existsSync2(dst)) return false;
  try {
    if (statSync2(src).size !== statSync2(dst).size) return false;
    return readFileSync(src).equals(readFileSync(dst));
  } catch {
    return false;
  }
}
function copyBoardImages(designBoards, pageDir) {
  const dir = join2(pageDir, "boards");
  mkdirSync(dir, { recursive: true });
  for (const b of designBoards.boards) {
    const dst = join2(dir, b.file);
    if (assetUpToDate(b.abs, dst)) continue;
    try {
      copyFileSync(b.abs, dst);
    } catch (err) {
      console.warn(`[render] board copy failed for ${b.key}: ${err.code ?? err.message}`);
    }
  }
}
function writeFileAtomic(absPath, content) {
  const tmp = `${absPath}.tmp`;
  writeFileSync(tmp, content, "utf-8");
  try {
    renameSync(tmp, absPath);
  } catch (err) {
    try {
      rmSync(tmp, { force: true });
    } catch {
    }
    throw err;
  }
}
function* walkViewIndexes(dir) {
  if (!existsSync2(dir)) return;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const abs = join2(d, e.name);
      if (e.isDirectory()) stack.push(abs);
      else if (e.isFile() && e.name === "INDEX.html") yield abs;
    }
  }
}
function fallbackRender(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const headerHtml = `<header class="artifact-header">
    <h1 class="sdlc-h1">${escape(fm.title ?? fm.type ?? artifact.path)}</h1>
    <div class="sdlc-crumb">${escape(artifact.path)}</div>
  </header>`;
  const bodyHtml = [
    artifact.fragment ? `<div class="fragment">${artifact.fragment}</div>` : "",
    artifact.body ? `<div class="prose">${md2html(artifact.body)}</div>` : ""
  ].join("");
  return { headerHtml, bodyHtml, links: [], children: [] };
}
function escape(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}
function discoverFreeFragments(mdAbs) {
  const dir = dirname(mdAbs);
  const stem = basename(mdAbs, ".md");
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const out = [];
  for (const name of names) {
    const c = classifyFragmentName(name, stem);
    if (c?.tier === "free") out.push({ label: c.label, abs: join2(dir, name) });
  }
  return out.sort((a, b) => a.label < b.label ? -1 : a.label > b.label ? 1 : 0);
}
function loadFreeFragments(mdAbs, expandCtx) {
  return discoverFreeFragments(mdAbs).map(({ label, abs }) => {
    let html = "";
    try {
      html = readFileSync(abs, "utf-8");
    } catch (err) {
      console.warn(`[nfrag] ${abs}: ${err.message}`);
      return null;
    }
    try {
      html = expand(html, expandCtx);
    } catch (err) {
      console.warn(`[nfrag:expand] ${abs}: ${err.message}`);
    }
    return { label, html, abs };
  }).filter(Boolean);
}
function cssAttrValue(label) {
  return String(label).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
function scopeFragmentCss(html, label) {
  const root = `.nfrag[data-label="${cssAttrValue(label)}"]`;
  return String(html).replace(
    /<style\b([^>]*)>([\s\S]*?)<\/style>/gi,
    (_m, attrs, css) => `<style${attrs}>@scope (${root}) {
${css}
}</style>`
  );
}
function appendNarrativeFragments(bodyHtml, fragments, config) {
  if (config?.view?.narrativeFragments === false) return bodyHtml;
  if (!fragments?.length) return bodyHtml;
  const scopeCss = config?.view?.scopeNarrativeCss !== false;
  const blocks = fragments.map((f) => {
    const inner = scopeCss ? scopeFragmentCss(f.html, f.label) : f.html;
    return `<section class="nfrag" data-label="${escape(f.label)}">
${inner}
</section>`;
  }).join("\n");
  return `${bodyHtml}
<section class="narrative-fragments" aria-label="narrative fragments">
${blocks}
</section>`;
}
function mtimeOrNull(abs) {
  if (!abs) return null;
  try {
    return statSync2(abs).mtimeMs;
  } catch {
    return null;
  }
}
var EVIDENCE_LINK_CAP = 60;
function listEvidenceFiles(dirAbs) {
  const out = [];
  const stack = [dirAbs];
  while (stack.length && out.length < EVIDENCE_LINK_CAP * 4) {
    const d = stack.pop();
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const abs = join2(d, e.name);
      if (e.isDirectory()) stack.push(abs);
      else if (e.isFile()) out.push(abs);
    }
  }
  return out.sort().slice(0, EVIDENCE_LINK_CAP);
}
function synthesizeProjectFrontmatter(artifact, frontmatter) {
  const fm = frontmatter && typeof frontmatter === "object" ? frontmatter : {};
  if (fm.schema && fm.type) return fm;
  return {
    schema: "sdlc/v1",
    type: artifact.syntheticType,
    title: fm.title ?? artifact.syntheticTitle ?? basename(artifact.storageRel, ".md"),
    status: fm.status ?? "active",
    source: artifact.storageRel,
    ...fm
  };
}
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.bootstrap) {
    await bootstrapMain(args);
    return;
  }
  await renderMain(args);
}
async function renderMain(args) {
  const cwd = resolveProjectRoot();
  const storageRoot = resolve(cwd, args.storage);
  const viewRoot = resolve(cwd, args.view);
  const simplifyRoot = resolve(cwd, args.simplify);
  const profilesRoot = resolve(cwd, args.profiles);
  const docsRoot = resolve(cwd, args.docs);
  const depUpdatesRoot = resolve(cwd, args.depUpdates);
  const ideationRoot = resolve(cwd, args.ideation);
  const configMeta = await loadConfigWithMeta(cwd);
  const config = configMeta.config;
  const liveReload = config.view?.serve?.enabled === true && config.view?.serve?.liveReload !== false;
  mkdirSync(viewRoot, { recursive: true });
  if (args.mode !== "clean") {
    const active = runtimeIdentity();
    const prior = readRenderedIdentity(join2(viewRoot, ".last-render"));
    if ((prior.version || prior.buildId || prior.rendererBuildId) && !renderIdentityMatches(prior, active)) {
      const label = (rb, b, v) => rb ? `renderer ${rb.slice(0, 12)}` : b ? `build ${b.slice(0, 12)}` : `v${v}`;
      const was = label(prior.rendererBuildId, prior.buildId, prior.version);
      const now = label(active.rendererBuildId, active.buildId, active.runtimeVersion);
      console.log(`[render] runtime ${was} \u2192 ${now}: template/runtime changed, forcing clean re-render`);
      args.mode = "clean";
    }
  }
  if (args.mode === "clean") {
    for (const entry of readdirSync(viewRoot, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== "_assets") {
        rmSync(join2(viewRoot, entry.name), { recursive: true, force: true });
      }
    }
    try {
      rmSync(join2(viewRoot, "_assets"), { recursive: true, force: true });
    } catch {
    }
    for (const f of ["INDEX.html", "INDEX.yaml", ".last-render"]) {
      rmSync(join2(viewRoot, f), { force: true });
    }
  }
  const artifacts = discoverArtifacts({
    storageRoot,
    simplifyRoot,
    profilesRoot,
    docsRoot,
    depUpdatesRoot,
    ideationRoot,
    projectRoot: cwd,
    includeProjectContext: args.includeProjectContext
  });
  if (args.diag) {
    console.log(`[render:diag] discovered ${artifacts.length} artifact candidate${artifacts.length === 1 ? "" : "s"}`);
  }
  for (const warning of configMeta.warnings) console.warn(`[render] config warning: ${warning}`);
  const parsed = [];
  for (const a of artifacts) {
    const siblings = siblingPaths(a.storageRel);
    const siblingRoot = a.kind === "workflow" ? join2(storageRoot, a.slug) : a.kind === "simplify" ? simplifyRoot : a.kind === "profile" ? profilesRoot : a.kind === "docs" ? a.siblingRoot : a.kind === "project" ? a.siblingRoot : a.kind === "deps" ? depUpdatesRoot : a.kind === "ideation" ? ideationRoot : null;
    const yamlAbs = siblingRoot ? join2(siblingRoot, siblings.yaml) : null;
    const fragmentAbs = siblingRoot ? join2(siblingRoot, siblings.fragment) : null;
    let loaded;
    try {
      loaded = loadArtifact(a.mdAbs, yamlAbs);
    } catch (err) {
      console.warn(`[parse] ${a.mdAbs}: ${err.message}`);
      continue;
    }
    if (a.kind === "project") {
      loaded.frontmatter = synthesizeProjectFrontmatter(a, loaded.frontmatter);
    }
    let fragmentHtml = fragmentAbs && existsSync2(fragmentAbs) ? readFileSync(fragmentAbs, "utf-8") : null;
    let fragmentGenerated = false;
    const fmType = loaded.frontmatter?.type;
    if (loaded.siblingYaml && typeof loaded.siblingYaml === "object" && loaded.frontmatter?.fragment !== "none" && shouldGenerateFragment({
      type: fmType,
      yamlMtimeMs: mtimeOrNull(yamlAbs),
      fragmentMtimeMs: fragmentHtml == null ? null : mtimeOrNull(fragmentAbs)
    })) {
      try {
        fragmentHtml = generateTypedFragment({
          type: fmType,
          siblingYaml: loaded.siblingYaml,
          artifact: basename(a.storageRel, ".md")
        });
        fragmentGenerated = true;
      } catch (err) {
        console.warn(`[fragment-gen] ${a.mdAbs}: ${err.message}`);
      }
    }
    if (fragmentHtml) {
      try {
        fragmentHtml = expand(fragmentHtml, {
          componentsRoot: join2(args.pluginRoot, "components"),
          maxDepth: 4
        });
      } catch (err) {
        console.warn(`[expand] ${fragmentAbs}: ${err.message}`);
      }
    }
    const allFree = loadFreeFragments(a.mdAbs, {
      componentsRoot: join2(args.pluginRoot, "components"),
      maxDepth: 4
    });
    const explainer = fmType !== "brainstorm" ? allFree.find((f) => f.label === "explainer") ?? null : null;
    const narrativeFragments = allFree.filter((f) => f !== explainer);
    let evidenceFiles = [];
    if (explainer && a.kind === "workflow") {
      const stage = stageKeyFor({ type: fmType, frontmatter: loaded.frontmatter ?? {}, path: a.storageRel });
      const dir = evidenceDirFor({ stage, frontmatter: loaded.frontmatter ?? {}, path: a.storageRel });
      if (dir) evidenceFiles = listEvidenceFiles(join2(storageRoot, a.slug, dir));
    }
    const history = loadHistory(a.mdAbs);
    parsed.push({
      ...a,
      ...loaded,
      fragment: fragmentHtml,
      fragmentGenerated,
      explainer,
      evidenceFiles,
      narrativeFragments,
      // The explainer and evidence files join the dirty-check inputs.
      narrativeFragmentPaths: [...allFree.map((f) => f.abs), ...evidenceFiles],
      history,
      siblingPaths: { yaml: yamlAbs, fragment: fragmentAbs }
    });
  }
  const filter = workSetFilter({ mode: args.mode, onlyGlob: args.onlyGlob });
  const slugArtifacts = /* @__PURE__ */ new Map();
  const workSet = [];
  const viewAbsSeen = /* @__PURE__ */ new Map();
  for (const a of parsed) {
    const r = resolveViewPath(a.storageRel, { kind: a.kind });
    if (!r) continue;
    const viewRel = r.viewRel;
    const viewAbs = a.kind === "workflow" ? join2(viewRoot, a.slug, viewRel) : join2(viewRoot, viewRel);
    if (viewAbsSeen.has(viewAbs)) {
      console.warn(`[render] path collision: ${a.slug}/${a.storageRel} and ${viewAbsSeen.get(viewAbs)} both map to ${viewRel} \u2014 keeping the first`);
      continue;
    }
    viewAbsSeen.set(viewAbs, `${a.slug}/${a.storageRel}`);
    const storageInputs = [a.mdAbs, a.siblingPaths.yaml, a.siblingPaths.fragment, ...a.narrativeFragmentPaths ?? []].filter(Boolean);
    const filterStoragePath = a.kind === "workflow" ? `${a.slug}/${a.storageRel}` : a.kind === "project" ? `project/${a.storageRel}` : a.kind === "docs" ? `docs/${a.storageRel}` : OFF_PIPELINE_BUCKET[a.kind] ? `${OFF_PIPELINE_BUCKET[a.kind]}/${a.storageRel}` : a.storageRel;
    a.viewRel = viewRel;
    a.viewAbs = viewAbs;
    a.storageInputs = storageInputs;
    a.filterStoragePath = filterStoragePath;
    if (!slugArtifacts.has(a.slug)) slugArtifacts.set(a.slug, []);
    slugArtifacts.get(a.slug).push(a);
    if (filter({ storagePath: filterStoragePath, storageInputs, viewOutput: viewAbs })) {
      workSet.push(a);
    }
  }
  const pathMaps = /* @__PURE__ */ new Map();
  for (const [slug, list] of slugArtifacts) {
    pathMaps.set(slug, buildPathMap(list.map((x) => ({ path: x.storageRel, kind: x.kind }))));
  }
  let renderedCount = 0;
  let schemaWarnings = 0;
  let missingRenderers = /* @__PURE__ */ new Set();
  for (const a of workSet) {
    const type = a.frontmatter?.type ?? "unknown";
    const renderer = await loadRenderer(type, args.pluginRoot);
    if (!renderer) missingRenderers.add(type);
    const validation = validateFrontmatter(a.frontmatter, args.schema);
    const warnBanner = validation.valid ? "" : renderWarnBanner(validation.errors);
    if (!validation.valid) schemaWarnings++;
    const allArtifacts = (slugArtifacts.get(a.slug) ?? []).reduce((acc, x) => {
      const k = x.frontmatter?.type ?? "unknown";
      (acc[k] ??= []).push(x);
      return acc;
    }, {});
    const displaySlug = a.kind === "docs" ? "docs" : a.slug;
    const effectiveAssetBase = defaultAssetBase(args);
    const fourPart = Boolean(a.explainer) && config?.view?.narrativeFragments !== false;
    const designBoards = type === "design-contract" && a.kind === "workflow" && !/(?:^|\/)history\//.test(a.storageRel) ? frozenBoardsOf(join2(storageRoot, a.slug), a.frontmatter ?? {}) : null;
    const ctx = {
      designBoards,
      fourPart,
      slug: displaySlug,
      slugRoot: a.kind === "workflow" ? join2(storageRoot, a.slug) : null,
      viewRoot: a.kind === "workflow" ? join2(viewRoot, a.slug) : viewRoot,
      assetBase: effectiveAssetBase,
      allArtifacts,
      pathMap: pathMaps.get(a.slug),
      mode: args.mode
    };
    const stage = fourPart ? stageKeyFor({ type, frontmatter: a.frontmatter ?? {}, path: a.storageRel }) : null;
    const { storyMarkdown, bodyRest } = fourPart ? { storyMarkdown: "", bodyRest: a.body } : splitStorySection(a.body);
    const recordHistory = fourPart && stage && stage !== "recap" ? [] : a.history;
    let result;
    try {
      const fn = renderer?.render ?? fallbackRender;
      result = fn({
        type,
        frontmatter: a.frontmatter,
        body: bodyRest,
        siblingYaml: a.siblingYaml,
        history: recordHistory,
        fragment: a.fragment,
        fragmentGenerated: a.fragmentGenerated,
        path: a.storageRel
      }, ctx);
    } catch (err) {
      console.warn(`[render] ${a.storageRel}: ${err.stack ?? err.message}`);
      result = fallbackRender({ ...a, body: bodyRest, type, path: a.storageRel }, ctx);
    }
    if (storyMarkdown) {
      result.bodyHtml = `<section class="story">${md2html(storyMarkdown)}</section>${result.bodyHtml ?? ""}`;
    }
    if (fourPart) {
      const pageDir = dirname(a.viewAbs);
      const evidence = (a.evidenceFiles ?? []).map((abs) => ({
        label: relative(join2(storageRoot, a.slug), abs).replace(/\\/g, "/"),
        href: relative(pageDir, abs).replace(/\\/g, "/")
      }));
      const stem = basename(a.storageRel, ".md");
      const related = stage === "review" ? (slugArtifacts.get(a.slug) ?? []).filter((x) => x !== a && x.viewRel && x.frontmatter?.type === "review-command" && !/(?:^|\/)history\//.test(x.storageRel) && (stem === "07-review" || basename(x.storageRel, ".md").startsWith(`${stem}-`))).sort((x, y) => String(x.storageRel).localeCompare(String(y.storageRel))).map((x) => ({ label: x.frontmatter?.title ?? basename(x.storageRel, ".md"), href: viewHref(a.viewRel, x.viewRel) })) : [];
      result.bodyHtml = composeStagePage({
        stage,
        frontmatter: a.frontmatter ?? {},
        body: a.body ?? "",
        siblingYaml: a.siblingYaml,
        history: a.history,
        explainerHtml: a.explainer.html,
        recordHtml: result.bodyHtml ?? "",
        evidence,
        related,
        boardsHtml: designBoards ? boardsGallery(designBoards) : "",
        allArtifacts: ctx.allArtifacts,
        viewRel: a.viewRel,
        scopeCss: config?.view?.scopeNarrativeCss !== false ? scopeFragmentCss : (h) => h
      });
    }
    result.bodyHtml = rewriteBodyLinks(result.bodyHtml ?? "", {
      pathMap: pathMaps.get(a.slug),
      fromStorageRel: a.storageRel,
      fromViewRel: a.viewRel
    });
    result.bodyHtml = appendNarrativeFragments(result.bodyHtml, a.narrativeFragments, config);
    const breadcrumbs = breadcrumbFromView(a.viewRel, displaySlug);
    const html = renderShell({
      title: a.frontmatter?.title ?? `${a.slug} \xB7 ${type}`,
      type,
      slug: displaySlug,
      status: a.frontmatter?.status ?? "",
      breadcrumbs,
      assetBase: effectiveAssetBase,
      headerHtml: result.headerHtml ?? "",
      bodyHtml: result.bodyHtml ?? "",
      warnBanner,
      storageHref: relative(dirname(a.viewAbs), a.mdAbs).replace(/\\/g, "/"),
      updatedAt: a.frontmatter?.["updated-at"] ?? "",
      liveReload
    });
    try {
      mkdirSync(dirname(a.viewAbs), { recursive: true });
      writeFileAtomic(a.viewAbs, html);
      renderedCount++;
      if (designBoards?.boards.length) copyBoardImages(designBoards, dirname(a.viewAbs));
      if (result.children?.length) {
        for (const child of result.children) {
          if (child.viewRel && child.html) {
            const childAbs = join2(viewRoot, a.slug, child.viewRel);
            mkdirSync(dirname(childAbs), { recursive: true });
            writeFileAtomic(childAbs, child.html);
            renderedCount++;
          }
        }
      }
    } catch (err) {
      console.warn(`[render] write failed for ${a.viewRel}: ${err.code ?? err.message}`);
    }
  }
  if (args.mode !== "clean") {
    const touchedSlugs = new Set(workSet.filter((a) => a.kind === "workflow").map((a) => a.slug));
    for (const slug of touchedSlugs) {
      const expected = new Set((slugArtifacts.get(slug) ?? []).map((a) => a.viewAbs));
      for (const abs of walkViewIndexes(join2(viewRoot, slug))) {
        if (!expected.has(abs)) {
          try {
            rmSync(abs, { force: true });
          } catch {
          }
        }
      }
    }
  }
  if (args.sharedOutput) {
    const dashboardMod = await loadRenderer("dashboard", args.pluginRoot);
    if (dashboardMod?.render) {
      try {
        const slugsSummary = [];
        for (const [slug, list] of slugArtifacts) {
          if (slug.startsWith("__")) continue;
          const indexArt = list.find((x) => x.frontmatter?.type === "index" || x.frontmatter?.type === "workflow-index") ?? list.find((x) => /(?:^|[\\/])00-index\.md$/.test(x.storageRel ?? ""));
          let cost = null;
          try {
            cost = aggregateCost(readCostRows(join2(storageRoot, slug)));
          } catch {
            cost = null;
          }
          if (indexArt) slugsSummary.push({ slug, frontmatter: indexArt.frontmatter, cost });
        }
        const projectSummary = (slugArtifacts.get("__project__") ?? []).map((x) => ({
          path: x.storageRel,
          viewRel: x.viewRel,
          frontmatter: x.frontmatter
        }));
        const result = dashboardMod.render(
          { type: "dashboard", frontmatter: { title: "sdlc dashboard" }, body: "", siblingYaml: null, history: [], fragment: null, path: "__dashboard__" },
          { slug: "", viewRoot, assetBase: defaultAssetBase(args), allArtifacts: { __summary__: slugsSummary, __project__: projectSummary } }
        );
        const html = renderShell({
          title: "sdlc \xB7 dashboard",
          type: "dashboard",
          slug: "",
          status: "",
          breadcrumbs: [{ label: "sdlc", href: "./" }],
          assetBase: defaultAssetBase(args),
          headerHtml: result.headerHtml ?? "",
          bodyHtml: result.bodyHtml ?? "",
          upHref: "./",
          liveReload
        });
        writeFileAtomic(join2(viewRoot, "INDEX.html"), html);
        renderedCount++;
      } catch (err) {
        console.warn(`[dashboard] ${err.message}`);
      }
    }
    const manifest = {
      version: PLUGIN_VERSION,
      generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      slugs: [...slugArtifacts.keys()].filter((slug) => !slug.startsWith("__")).map((slug) => ({
        slug,
        artifacts: (slugArtifacts.get(slug) ?? []).length
      }))
    };
    writeFileAtomic(join2(viewRoot, "INDEX.yaml"), `# sdlc view manifest
${toYaml(manifest)}`);
    const rt = runtimeIdentity();
    writeFileAtomic(join2(viewRoot, ".last-render"), `${JSON.stringify({
      version: rt.runtimeVersion,
      buildId: rt.buildId,
      rendererBuildId: rt.rendererBuildId,
      renderedAt: manifest.generatedAt,
      renderedCount,
      schemaWarnings,
      configHash: configHash(config)
    }, null, 2)}
`);
    await upsertRegistryEntry({
      projectRoot: cwd,
      viewDir: viewRoot,
      configHash: configHash(config)
    }).catch(() => {
    });
  }
  console.log(`[render] ${slugArtifacts.size} slug${slugArtifacts.size === 1 ? "" : "s"} \xB7 ${renderedCount} files written \xB7 ${parsed.length - workSet.length} skipped \xB7 ${schemaWarnings} schema warnings`);
  if (missingRenderers.size) {
    console.log(`[render] no renderer for: ${[...missingRenderers].join(", ")}`);
  }
}
async function bootstrapMain(args) {
  const cwd = resolveProjectRoot();
  const storageRoot = resolve(cwd, args.storage);
  const viewRoot = resolve(cwd, args.view);
  const docsRoot = resolve(cwd, args.docs);
  const simplifyRoot = resolve(cwd, args.simplify);
  const profilesRoot = resolve(cwd, args.profiles);
  const depUpdatesRoot = resolve(cwd, args.depUpdates);
  const ideationRoot = resolve(cwd, args.ideation);
  const configMeta = await loadConfigWithMeta(cwd);
  const config = configMeta.config;
  const hash = configHash(config);
  const logPath = join2(viewRoot, ".bootstrap.log");
  mkdirSync(viewRoot, { recursive: true });
  const log = (line) => logBootstrap(logPath, line);
  for (const warning of configMeta.warnings) log(`[config] ${warning}`);
  if (config.view?.bootstrap?.enabled === false) {
    log("[bootstrap] disabled by config");
    return;
  }
  if (existsSync2(join2(viewRoot, ".render-suppress"))) {
    log("[bootstrap] skipped: .render-suppress present");
    return;
  }
  const pidPath = join2(viewRoot, ".bootstrap.pid");
  const status = await pidFileStatus(pidPath);
  if (status.alive) {
    log(`[bootstrap] skipped: already running pid ${status.record.pid}`);
    return;
  }
  if (status.stale) await removePidFile(pidPath);
  await writePidFile(pidPath, { pid: process.pid, kind: "bootstrap", configHash: hash });
  try {
    const bootstrapConfig = config.view?.bootstrap ?? {};
    const workflows = await scanWorkflowIndexes({ projectRoot: cwd, workflowsRoot: storageRoot });
    const active = activeWorkflowIndexes(workflows);
    for (const invalid of workflows.filter((workflow) => workflow.classification === "invalid")) {
      log(`[bootstrap] invalid workflow skipped: ${invalid.directorySlug}${invalid.invalidReason ? ` (${invalid.invalidReason})` : ""}`);
    }
    const jobs = [];
    for (const workflow of active) {
      const viewMtime = await viewMtimeForSlug(viewRoot, workflow.directorySlug);
      const state = classifyRenderState({
        latestArtifactMtime: workflow.latestArtifactMtime,
        viewMtime,
        renderMissing: bootstrapConfig.renderMissing !== false,
        renderStale: bootstrapConfig.renderStale !== false
      });
      log(`[bootstrap] ${state.action} ${workflow.slug} (${state.reason})`);
      if (state.action === "render") {
        jobs.push({ label: workflow.directorySlug, only: `${workflow.directorySlug}/**`, reason: state.reason });
      }
    }
    if (args.includeProjectContext) {
      const projectArtifacts = discoverProjectArtifacts({ projectRoot: cwd });
      if (projectArtifacts.length) {
        const latestProjectMtime = await latestMtimeMs(projectArtifactInputs(projectArtifacts));
        const projectViewMtime = await latestTreeMtimeMs(join2(viewRoot, "project"));
        const projectState = classifyRenderState({
          latestArtifactMtime: latestProjectMtime,
          viewMtime: projectViewMtime,
          renderMissing: bootstrapConfig.renderMissing !== false,
          renderStale: bootstrapConfig.renderStale !== false
        });
        log(`[bootstrap] ${projectState.action} project (${projectState.reason})`);
        if (projectState.action === "render") {
          jobs.push({ label: "project", only: "project/**", reason: projectState.reason });
        }
      }
    }
    const docsArtifacts = discoverDocsArtifacts({ docsRoot });
    if (docsArtifacts.length) {
      const latestDocsMtime = await latestMtimeMs(artifactInputs(docsArtifacts));
      const docsViewMtime = await latestTreeMtimeMs(join2(viewRoot, "docs"));
      const docsState = classifyRenderState({
        latestArtifactMtime: latestDocsMtime,
        viewMtime: docsViewMtime,
        renderMissing: bootstrapConfig.renderMissing !== false,
        renderStale: bootstrapConfig.renderStale !== false
      });
      log(`[bootstrap] ${docsState.action} docs (${docsState.reason})`);
      if (docsState.action === "render") {
        jobs.push({ label: "docs", only: "docs/**", reason: docsState.reason });
      }
    }
    for (const [kind, bucket] of Object.entries(OFF_PIPELINE_BUCKET)) {
      const root = { simplify: simplifyRoot, profile: profilesRoot, deps: depUpdatesRoot, ideation: ideationRoot }[kind];
      if (!root || !existsSync2(root)) continue;
      const mdFiles = [...walkStorage(root)].filter((p) => p.endsWith(".md"));
      if (!mdFiles.length) continue;
      const latestArtifactMtime = await latestMtimeMs(offPipelineInputs(root, mdFiles));
      const offViewMtime = await latestTreeMtimeMs(join2(viewRoot, bucket));
      const offState = classifyRenderState({
        latestArtifactMtime,
        viewMtime: offViewMtime,
        renderMissing: bootstrapConfig.renderMissing !== false,
        renderStale: bootstrapConfig.renderStale !== false
      });
      log(`[bootstrap] ${offState.action} ${bucket} (${offState.reason})`);
      if (offState.action === "render") {
        jobs.push({ label: bucket, only: `${bucket}/**`, reason: offState.reason });
      }
    }
    if (args.dryRun) {
      log(`[bootstrap] dry-run complete: ${jobs.length} render job${jobs.length === 1 ? "" : "s"}`);
      return;
    }
    const concurrency = normalizeConcurrency(
      args.concurrency ?? config.view?.render?.concurrency ?? 4
    );
    const failedJobs = await runRenderJobs(jobs, { args, cwd, concurrency, log });
    if (jobs.length) {
      const sharedCode = await runRenderJob(
        { label: "shared outputs", only: "__sdlc_shared__/**", reason: "finalize" },
        { args, cwd, log, sharedOutput: true }
      );
      if (sharedCode) log(`[bootstrap] shared-output pass failed: exit ${sharedCode}`);
    }
    if (failedJobs) {
      log(`[bootstrap] ${failedJobs} render job${failedJobs === 1 ? "" : "s"} failed \u2014 see entries above`);
      process.exitCode = 1;
    }
    if (config.view?.hub?.enabled === true) {
      await ensureHubLifecycle({ pluginRoot: args.pluginRoot, log });
    }
    await ensureServeLifecycle({
      projectRoot: cwd,
      pluginRoot: args.pluginRoot,
      viewRoot,
      config,
      configHash: hash,
      log
    });
    log(`[bootstrap] complete: ${jobs.length} render job${jobs.length === 1 ? "" : "s"}`);
  } finally {
    await removePidFile(pidPath);
  }
}
function projectArtifactInputs(projectArtifacts) {
  return artifactInputs(projectArtifacts);
}
function artifactInputs(artifacts) {
  const inputs = [];
  for (const artifact of artifacts) {
    inputs.push(artifact.mdAbs);
    const siblings = siblingPaths(artifact.storageRel);
    inputs.push(join2(artifact.siblingRoot, siblings.yaml));
    inputs.push(join2(artifact.siblingRoot, siblings.fragment));
    for (const f of discoverFreeFragments(artifact.mdAbs)) inputs.push(f.abs);
  }
  return inputs;
}
function offPipelineInputs(root, mdAbsList) {
  const inputs = [];
  for (const mdAbs of mdAbsList) {
    inputs.push(mdAbs);
    const siblings = siblingPaths(relative(root, mdAbs).replace(/\\/g, "/"));
    inputs.push(join2(root, siblings.yaml));
    inputs.push(join2(root, siblings.fragment));
    for (const f of discoverFreeFragments(mdAbs)) inputs.push(f.abs);
  }
  return inputs;
}
function normalizeConcurrency(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(Math.floor(n), 16);
}
async function runRenderJobs(jobs, { args, cwd, concurrency, log }) {
  if (!jobs.length) return 0;
  let next = 0;
  let failed = 0;
  const workers = Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      const code = await runRenderJob(job, { args, cwd, log, sharedOutput: false });
      if (code) failed++;
    }
  });
  await Promise.all(workers);
  return failed;
}
function runRenderJob(job, { args, cwd, log, sharedOutput = true }) {
  return new Promise((resolveJob) => {
    log(`[bootstrap] rendering ${job.label} (${job.reason})`);
    const renderArgs = [
      fileURLToPath(import.meta.url),
      "--only",
      job.only,
      "--storage",
      args.storage,
      "--view",
      args.view,
      "--simplify",
      args.simplify,
      "--profiles",
      args.profiles,
      "--dep-updates",
      args.depUpdates,
      "--ideation",
      args.ideation,
      "--docs",
      args.docs,
      "--plugin-root",
      args.pluginRoot,
      "--schema",
      args.schema,
      ...args.assetBase ? ["--asset-base", args.assetBase] : [],
      args.includeProjectContext ? "--include-project-context" : "--no-include-project-context",
      sharedOutput ? null : "--no-shared-output"
    ].filter(Boolean);
    const child = spawn(process.execPath, renderArgs, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (stdout.trim()) log(stdout.trim());
      if (stderr.trim()) log(stderr.trim());
      if (code !== 0) log(`[bootstrap] render failed for ${job.label}: exit ${code}`);
      resolveJob(code ?? 0);
    });
  });
}
function logBootstrap(logPath, line) {
  const entry = `[${(/* @__PURE__ */ new Date()).toISOString()}] ${line}`;
  try {
    if (existsSync2(logPath) && statSync2(logPath).size > 1024 * 1024) {
      renameSync(logPath, `${logPath}.1`);
    }
  } catch {
  }
  try {
    appendFileSync(logPath, `${entry}
`, "utf-8");
  } catch {
  }
  console.log(entry);
}
function toYaml(obj, indent = 0) {
  const pad = "  ".repeat(indent);
  if (obj === null || obj === void 0) return "null";
  if (typeof obj === "string") return JSON.stringify(obj);
  if (typeof obj === "number" || typeof obj === "boolean") return String(obj);
  if (Array.isArray(obj)) {
    if (!obj.length) return "[]";
    return obj.map((x) => `
${pad}- ${toYaml(x, indent + 1).replace(/^\s+/, "")}`).join("");
  }
  if (typeof obj === "object") {
    const keys = Object.keys(obj);
    if (!keys.length) return "{}";
    return keys.map((k) => `
${pad}${k}: ${toYaml(obj[k], indent + 1)}`).join("");
  }
  return String(obj);
}
main().catch((err) => {
  console.error("[render] fatal:", err.stack ?? err.message);
  process.exit(1);
});
