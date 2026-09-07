import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  resolveActiveRuntimeRootSync
} from "./chunk-WIOD7AIL.mjs";
import {
  ensureHubEnabled,
  spawnHubEnsure
} from "./chunk-LZJA3HOL.mjs";
import {
  spawnDetachedNode
} from "./chunk-K6PBZI5W.mjs";
import {
  resolveEntrypoint
} from "./chunk-KRRL2TSM.mjs";
import {
  isEntry,
  runStandalone
} from "./chunk-ZVYCLTPL.mjs";
import {
  resolveProjectRoot
} from "./chunk-DOKC4AFB.mjs";
import {
  configPathFor
} from "./chunk-XLUSO7MY.mjs";
import {
  enqueue,
  queueDir
} from "./chunk-O3FUA7PQ.mjs";

// hooks/render-on-artifact-write.mjs
import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync, appendFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, resolve, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
var __filename = fileURLToPath(import.meta.url);
var __dirname = dirname(__filename);
var PLUGIN_ROOT = resolve(__dirname, "..");
var STAGE2_ENTRY = resolve(__dirname, "post-write-render.mjs");
var DEBOUNCE_MS = 2e3;
var ENSURE_DEBOUNCE_MS = 3e3;
function shouldSkipForPath(touchedAbs, viewRoot) {
  if (!touchedAbs) return true;
  if (touchedAbs.includes(`${viewRoot}/`) || touchedAbs.includes(`${viewRoot}\\`)) return true;
  const norm = touchedAbs.replace(/\\/g, "/");
  return !(norm.includes("/.ai/workflows/") || norm.includes("/.ai/simplify/") || norm.includes("/.ai/profiles/") || norm.includes("/.ai/dep-updates/") || norm.includes("/.ai/ideation/") || /\/\.ai\/docs\/[^/]+\/08b-docs-index\.(md|yaml|html\.fragment)$/.test(norm) || /\/(PRODUCT|DESIGN)\.md$/.test(norm) || /\/\.ai\/ship-plan\.md$/.test(norm));
}
function pickArtifactPaths(input) {
  if (!input?.tool_input) return [];
  const ti = input.tool_input;
  const list = [];
  if (ti.file_path) list.push(ti.file_path);
  if (ti.notebook_path) list.push(ti.notebook_path);
  if (Array.isArray(ti.edits)) {
    for (const e of ti.edits) if (e.file_path) list.push(e.file_path);
  }
  return list.filter(
    (p) => typeof p === "string" && (p.endsWith(".md") || p.endsWith(".yaml") || p.endsWith(".html.fragment"))
  );
}
function detectRenderBucket(touchedAbs) {
  const norm = touchedAbs.replace(/\\/g, "/");
  const m = norm.match(/\/\.ai\/workflows\/([^/]+)\//);
  if (m) return { bucket: m[1], kind: "incremental" };
  if (/\/\.ai\/docs\/[^/]+\/08b-docs-index\.(md|yaml|html\.fragment)$/.test(norm)) return { bucket: "docs", kind: "incremental" };
  if (/\/(PRODUCT|DESIGN)\.md$/.test(norm) || /\/\.ai\/ship-plan\.md$/.test(norm)) return { bucket: "project", kind: "incremental" };
  if (norm.includes("/.ai/simplify/")) return { bucket: "simplify", kind: "offpipeline" };
  if (norm.includes("/.ai/profiles/")) return { bucket: "profiles", kind: "offpipeline" };
  if (norm.includes("/.ai/dep-updates/")) return { bucket: "dep-updates", kind: "offpipeline" };
  if (norm.includes("/.ai/ideation/")) return { bucket: "ideation", kind: "offpipeline" };
  return null;
}
function shouldSpawnEnsure(viewRoot) {
  const stamp = join(queueDir(viewRoot), ".ensure-stamp");
  try {
    if (Date.now() - Number(readFileSync(stamp, "utf-8")) < ENSURE_DEBOUNCE_MS) return false;
  } catch {
  }
  try {
    writeFileSync(stamp, String(Date.now()), "utf-8");
  } catch {
  }
  return true;
}
function ensureHubBestEffort(cwd, viewRoot, viewConfig) {
  if (!ensureHubEnabled(viewConfig)) return;
  if (!shouldSpawnEnsure(viewRoot)) return;
  spawnHubEnsure({ pluginRoot: PLUGIN_ROOT, projectRoot: cwd, viewDir: viewRoot });
}
function readViewConfig(projectRoot) {
  try {
    const raw = JSON.parse(readFileSync(configPathFor(projectRoot), "utf-8"));
    return raw && typeof raw === "object" && raw.view && typeof raw.view === "object" ? raw.view : {};
  } catch {
    return {};
  }
}
function legacyInlineDispatch(cwd, viewRoot, buckets) {
  if (!buckets.length) return;
  mkdirSync(viewRoot, { recursive: true });
  const touchFile = join(viewRoot, ".render-pending");
  const now = Date.now();
  writeFileSync(touchFile, String(now), "utf-8");
  spawnDetachedNode(
    STAGE2_ENTRY,
    ["--debounce-stage2", String(now), buckets.join(",")],
    { cwd, env: { ...process.env, SDLC_DEBOUNCE_ORIGIN_TS: String(now) } }
  );
}
async function run(input) {
  if (!input || typeof input !== "object") return;
  const cwd = resolveProjectRoot(input.cwd ?? process.cwd());
  const viewRoot = resolve(cwd, ".ai/_view");
  const suppressFile = join(viewRoot, ".render-suppress");
  if (existsSync(suppressFile)) return;
  const touchedPaths = pickArtifactPaths(input);
  if (!touchedPaths.length) return;
  const relevant = touchedPaths.filter((p) => !shouldSkipForPath(resolve(cwd, p), viewRoot));
  if (!relevant.length) return;
  const byBucket = /* @__PURE__ */ new Map();
  for (const p of relevant) {
    const d = detectRenderBucket(resolve(cwd, p));
    if (!d) continue;
    if (!byBucket.has(d.bucket)) byBucket.set(d.bucket, { kind: d.kind, bucket: d.bucket, paths: [] });
    byBucket.get(d.bucket).paths.push(p);
  }
  if (!byBucket.size) return;
  const view = readViewConfig(cwd);
  const dispatch = view.renderDispatch ?? "hub";
  if (dispatch === "inline") {
    const incremental = [...byBucket.values()].filter((b) => b.kind === "incremental").map((b) => b.bucket);
    legacyInlineDispatch(cwd, viewRoot, incremental);
    return;
  }
  mkdirSync(viewRoot, { recursive: true });
  for (const { kind, bucket, paths } of byBucket.values()) {
    enqueue(viewRoot, {
      repoRoot: cwd,
      kind,
      bucket,
      paths,
      enqueuedBy: { host: process.env.SDLC_HOST || "claude", pid: process.pid }
    }, { maxPending: view.renderQueue?.maxPending });
  }
  ensureHubBestEffort(cwd, viewRoot, view);
}
async function debounceStage2() {
  const argv = process.argv;
  const originTs = Number(argv[3] ?? 0);
  const bucketCsv = String(argv[4] ?? "");
  const projectRoot = resolveProjectRoot(process.cwd());
  const viewRoot = resolve(projectRoot, ".ai/_view");
  const touchFile = join(viewRoot, ".render-pending");
  await new Promise((r) => setTimeout(r, DEBOUNCE_MS));
  try {
    const current = Number(readFileSync(touchFile, "utf-8"));
    if (current > originTs) process.exit(0);
  } catch {
  }
  const buckets = bucketCsv ? bucketCsv.split(",").filter(Boolean) : [];
  const renderRoot = resolveActiveRuntimeRootSync() ?? PLUGIN_ROOT;
  const renderArgs = [resolveEntrypoint(renderRoot, "render-sunflower")];
  if (buckets.length === 1) {
    renderArgs.push("--only", `${buckets[0]}/**`);
  }
  renderArgs.push("--plugin-root", renderRoot);
  const child = spawn(process.execPath, renderArgs, {
    cwd: projectRoot,
    stdio: "pipe",
    env: process.env,
    // stage-2 now runs with no console (windowsHide), so this console-app
    // child would otherwise get a fresh window of its own — suppress it too.
    windowsHide: true
  });
  let stderr = "";
  child.stderr.on("data", (d) => {
    stderr += d.toString();
  });
  child.on("close", (code) => {
    if (code !== 0) {
      const log = join(viewRoot, ".render-errors.log");
      try {
        appendFileSync(log, `[${(/* @__PURE__ */ new Date()).toISOString()}] exit ${code}
${stderr}

`);
      } catch {
      }
    }
    process.exit(0);
  });
}
if (process.argv[2] === "--debounce-stage2") {
  debounceStage2().catch(() => process.exit(0));
} else if (isEntry("render-on-artifact-write", "post-write-render")) {
  runStandalone("post-write-render", run);
}

export {
  run
};
