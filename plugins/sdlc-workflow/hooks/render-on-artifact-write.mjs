#!/usr/bin/env node
/**
 * hooks/render-on-artifact-write.mjs — PostToolUse hook entry point.
 *
 * Fires after Write|Edit|MultiEdit|NotebookEdit. Filters to artifact paths
 * under .ai/workflows/, .ai/simplify/, .ai/profiles/, wf-docs indexes,
 * and project context.
 * Debounces with a 2s
 * touch-file. Renders incrementally via `node scripts/render-sunflower.mjs
 * --only <slug-glob>`. Errors land in .ai/_view/.render-errors.log; the hook
 * always exits 0 so a stale view never blocks a slash command.
 *
 * Suppression:
 *   - CLAUDE_PLUGIN_INSTALL=1 in env → no-op (bulk extraction is noisy)
 *   - .ai/_view/.render-suppress exists → no-op (per-project pause)
 *   - touched path is inside .ai/_view/ → no-op (avoid render→write loops)
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync, appendFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnDetachedNode } from '../lib/detach.mjs';
import { resolveEntrypoint } from '../lib/entrypoint.mjs';
import { resolveActiveRuntimeRootSync } from '../lib/runtime-store.mjs';
import { resolveProjectRoot } from '../lib/project-root.mjs';
import { configPathFor } from '../lib/config.mjs';
import { enqueue, queueDir } from '../lib/render-queue.mjs';
import { ensureHubEnabled, spawnHubEnsure } from '../lib/ensure-hub.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_ROOT = resolve(__dirname, '..');
const DEBOUNCE_MS = 2000;
// Bound how often a burst of writes re-spawns the (idempotent) hub-ensure helper.
const ENSURE_DEBOUNCE_MS = 3000;

function readInput() {
  try {
    const text = readFileSync(0, 'utf-8');
    if (!text) return null;
    return JSON.parse(text);
  } catch { return null; }
}

function exitClean() { process.exit(0); }

function shouldSkipForPath(touchedAbs, viewRoot) {
  if (!touchedAbs) return true;
  if (touchedAbs.includes(`${viewRoot}/`) || touchedAbs.includes(`${viewRoot}\\`)) return true;
  const norm = touchedAbs.replace(/\\/g, '/');
  return !(
    norm.includes('/.ai/workflows/')    ||
    norm.includes('/.ai/simplify/')     ||
    norm.includes('/.ai/profiles/')     ||
    norm.includes('/.ai/dep-updates/')  ||
    norm.includes('/.ai/ideation/')     ||
    /\/\.ai\/docs\/[^/]+\/08b-docs-index\.(md|yaml|html\.fragment)$/.test(norm) ||
    /\/(PRODUCT|DESIGN)\.md$/.test(norm) ||
    /\/\.ai\/ship-plan\.md$/.test(norm)
  );
}

function pickArtifactPaths(input) {
  if (!input?.tool_input) return [];
  const ti = input.tool_input;
  const list = [];
  if (ti.file_path)  list.push(ti.file_path);
  if (ti.notebook_path) list.push(ti.notebook_path);
  if (Array.isArray(ti.edits)) {
    for (const e of ti.edits) if (e.file_path) list.push(e.file_path);
  }
  return list.filter((p) =>
    typeof p === 'string' && (
      p.endsWith('.md') || p.endsWith('.yaml') || p.endsWith('.html.fragment')
    ),
  );
}

// Classify a touched artifact path into a render bucket + kind.
//   { bucket, kind } | null
//   kind 'incremental' → a slug / docs / project bucket (the inline path renders
//                        these; the hub path enqueues them).
//   kind 'offpipeline' → simplify / profiles / dep-updates / ideation. The view
//                        bucket name matches the source dir, so `--only
//                        <bucket>/**` targets it (the v9.68.0 OFF_PIPELINE_BUCKET
//                        fix). The legacy inline path defers these to bootstrap;
//                        the hub path enqueues them like any other bucket.
function detectRenderBucket(touchedAbs) {
  const norm = touchedAbs.replace(/\\/g, '/');
  const m = norm.match(/\/\.ai\/workflows\/([^/]+)\//);
  if (m) return { bucket: m[1], kind: 'incremental' };
  if (/\/\.ai\/docs\/[^/]+\/08b-docs-index\.(md|yaml|html\.fragment)$/.test(norm)) return { bucket: 'docs', kind: 'incremental' };
  if (/\/(PRODUCT|DESIGN)\.md$/.test(norm) || /\/\.ai\/ship-plan\.md$/.test(norm)) return { bucket: 'project', kind: 'incremental' };
  if (norm.includes('/.ai/simplify/'))    return { bucket: 'simplify', kind: 'offpipeline' };
  if (norm.includes('/.ai/profiles/'))    return { bucket: 'profiles', kind: 'offpipeline' };
  if (norm.includes('/.ai/dep-updates/')) return { bucket: 'dep-updates', kind: 'offpipeline' };
  if (norm.includes('/.ai/ideation/'))    return { bucket: 'ideation', kind: 'offpipeline' };
  return null;
}

// Bound burst spawns of the (idempotent) hub-ensure helper: only spawn if the
// last spawn was more than ENSURE_DEBOUNCE_MS ago. Stamp file lives in the queue
// dir (hook-skipped, git-ignored) and is not a `.json` record.
function shouldSpawnEnsure(viewRoot) {
  const stamp = join(queueDir(viewRoot), '.ensure-stamp');
  try {
    if (Date.now() - Number(readFileSync(stamp, 'utf-8')) < ENSURE_DEBOUNCE_MS) return false;
  } catch { /* no stamp → spawn */ }
  try { writeFileSync(stamp, String(Date.now()), 'utf-8'); } catch { /* best-effort */ }
  return true;
}

// Best-effort, non-blocking: ask the detached hub-ensure helper to start/adopt
// the hub + register this repo + record status, OFF the hook's critical path.
// The enable-guard + spawn are shared with SessionStart (lib/ensure-hub.mjs);
// the per-burst debounce is local to this hot write path.
function ensureHubBestEffort(cwd, viewRoot, viewConfig) {
  if (!ensureHubEnabled(viewConfig)) return;
  if (!shouldSpawnEnsure(viewRoot)) return;
  spawnHubEnsure({ pluginRoot: PLUGIN_ROOT, projectRoot: cwd, viewDir: viewRoot });
}

// Lightweight read of the `view` config sub-object for the hot write path. The
// hook needs only a few view.* scalars (renderDispatch, ensureHubOnWrite,
// renderQueue.maxPending), so it skips the full loadConfig — whose Ajv schema
// compile runs on every cold-spawned hook invocation. Schema VALIDATION is
// post-write-verify's job, not this per-write path's.
function readViewConfig(projectRoot) {
  try {
    const raw = JSON.parse(readFileSync(configPathFor(projectRoot), 'utf-8'));
    return raw && typeof raw === 'object' && raw.view && typeof raw.view === 'object' ? raw.view : {};
  } catch {
    return {};
  }
}

// Legacy 'inline' dispatch — the pre-RENDER-DISPATCH behaviour, kept verbatim as
// the rollback / A-B switch. Renders incremental buckets only (off-pipeline
// defers to bootstrap, exactly as before): touch-file debounce, then a detached
// render-sunflower. `buckets` are incremental-kind bucket names.
function legacyInlineDispatch(cwd, viewRoot, buckets) {
  if (!buckets.length) exitClean();
  mkdirSync(viewRoot, { recursive: true });
  const touchFile = join(viewRoot, '.render-pending');
  const now = Date.now();
  writeFileSync(touchFile, String(now), 'utf-8');
  spawnDetachedNode(
    __filename,
    ['--debounce-stage2', String(now), buckets.join(',')],
    { cwd, env: { ...process.env, SDLC_DEBOUNCE_ORIGIN_TS: String(now) } },
  );
  exitClean();
}

async function main() {
  // Bulk-install suppression
  if (process.env.CLAUDE_PLUGIN_INSTALL === '1') exitClean();

  const input = readInput();
  if (!input) exitClean();

  // input.cwd is the SESSION's working directory — it can sit in a repo
  // subfolder (an agent cd'd into a data dir or even a workflow slug dir).
  // Anchoring viewRoot there minted stray `<subfolder>/.ai/_view` trees, so
  // climb to the real project root before resolving anything.
  const cwd = resolveProjectRoot(input.cwd ?? process.cwd());
  const viewRoot = resolve(cwd, '.ai/_view');
  const suppressFile = join(viewRoot, '.render-suppress');
  if (existsSync(suppressFile)) exitClean();

  const touchedPaths = pickArtifactPaths(input);
  if (!touchedPaths.length) exitClean();

  // All paths inside view tree? skip
  const relevant = touchedPaths.filter((p) => !shouldSkipForPath(resolve(cwd, p), viewRoot));
  if (!relevant.length) exitClean();

  // Classify each touched path into a render bucket (+ kind), grouped by bucket.
  // detectRenderBucket assigns kind 1:1 with the bucket, so the bucket name is a
  // sufficient key (the first touch fixes the kind).
  const byBucket = new Map();   // bucket → { kind, bucket, paths[] }
  for (const p of relevant) {
    const d = detectRenderBucket(resolve(cwd, p));
    if (!d) continue;
    if (!byBucket.has(d.bucket)) byBucket.set(d.bucket, { kind: d.kind, bucket: d.bucket, paths: [] });
    byBucket.get(d.bucket).paths.push(p);
  }
  if (!byBucket.size) exitClean();

  const view = readViewConfig(cwd);
  const dispatch = view.renderDispatch ?? 'hub';

  // 'inline' (rollback / A-B): the pre-RENDER-DISPATCH path. Incremental buckets
  // only; off-pipeline defers to bootstrap, exactly as before.
  if (dispatch === 'inline') {
    const incremental = [...byBucket.values()].filter((b) => b.kind === 'incremental').map((b) => b.bucket);
    legacyInlineDispatch(cwd, viewRoot, incremental);   // exits (already unique by bucket)
    return;
  }

  // 'hub' (default): REPORT each affected bucket to the durable per-repo queue;
  // the serving daemon drains + renders it through the shared bounded engine. One
  // record per bucket so the hub coalesces by bucket. The hook does NOT
  // render and does NOT debounce — the hub's tick + coalescing batch the work.
  mkdirSync(viewRoot, { recursive: true });
  for (const { kind, bucket, paths } of byBucket.values()) {
    enqueue(viewRoot, {
      repoRoot: cwd,
      kind,
      bucket,
      paths,
      enqueuedBy: { host: 'claude', pid: process.pid },
    }, { maxPending: view.renderQueue?.maxPending });
  }

  // Off the critical path: ensure the hub is up + register this repo + record
  // status, so the queued change renders (now, or at the hub's startup catch-up).
  ensureHubBestEffort(cwd, viewRoot, view);

  exitClean();
}

async function debounceStage2() {
  const argv = process.argv;
  const originTs = Number(argv[3] ?? 0);
  const bucketCsv = String(argv[4] ?? '');
  // Stage 1 already spawns us with cwd = project root, so this is a no-op on
  // that path — it only guards a manual/legacy invocation from a subfolder.
  const projectRoot = resolveProjectRoot(process.cwd());
  const viewRoot = resolve(projectRoot, '.ai/_view');
  const touchFile = join(viewRoot, '.render-pending');

  await new Promise((r) => setTimeout(r, DEBOUNCE_MS));

  // If another write arrived after us, bail — that child will re-trigger.
  try {
    const current = Number(readFileSync(touchFile, 'utf-8'));
    if (current > originTs) process.exit(0);
  } catch { /* ignore */ }

  const buckets = bucketCsv ? bucketCsv.split(',').filter(Boolean) : [];

  // Resolve the renderer through the active machine runtime (PID runtimeRoot →
  // active-runtime.json), falling back to the plugin cache only when none
  // resolves — so even this legacy inline fallback stamps the ACTIVE buildId,
  // never the plugin-cache build. Same active-runtime seam the hub's heal
  // controller uses (resolveRenderEntrypoint); see NATIVE-INTEROP "Rendering Is
  // Owned by the Hub" §4 — the fallback render must never resolve from plugin cache.
  const renderRoot = resolveActiveRuntimeRootSync() ?? PLUGIN_ROOT;
  const renderArgs = [resolveEntrypoint(renderRoot, 'render-sunflower')];
  if (buckets.length === 1) {
    renderArgs.push('--only', `${buckets[0]}/**`);
  }
  renderArgs.push('--plugin-root', renderRoot);

  const child = spawn(process.execPath, renderArgs, {
    cwd: projectRoot,
    stdio: 'pipe',
    env: process.env,
    // stage-2 now runs with no console (windowsHide), so this console-app
    // child would otherwise get a fresh window of its own — suppress it too.
    windowsHide: true,
  });

  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d.toString(); });
  child.on('close', (code) => {
    if (code !== 0) {
      const log = join(viewRoot, '.render-errors.log');
      try {
        appendFileSync(log, `[${new Date().toISOString()}] exit ${code}\n${stderr}\n\n`);
      } catch { /* ignore */ }
    }
    process.exit(0);
  });
}

if (process.argv[2] === '--debounce-stage2') {
  debounceStage2().catch(() => process.exit(0));
} else {
  main().catch(() => process.exit(0));
}
