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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_ROOT = resolve(__dirname, '..');
const DEBOUNCE_MS = 2000;

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
    norm.includes('/.ai/workflows/') ||
    norm.includes('/.ai/simplify/')  ||
    norm.includes('/.ai/profiles/')  ||
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

function detectRenderBucket(touchedAbs, cwd) {
  const norm = touchedAbs.replace(/\\/g, '/');
  // Match .ai/workflows/<slug>/...
  const m = norm.match(/\/\.ai\/workflows\/([^/]+)\//);
  if (m) return m[1];
  if (/\/\.ai\/docs\/[^/]+\/08b-docs-index\.(md|yaml|html\.fragment)$/.test(norm)) return 'docs';
  if (/\/(PRODUCT|DESIGN)\.md$/.test(norm) || /\/\.ai\/ship-plan\.md$/.test(norm)) return 'project';
  return null;
}

async function main() {
  // Bulk-install suppression
  if (process.env.CLAUDE_PLUGIN_INSTALL === '1') exitClean();

  const input = readInput();
  if (!input) exitClean();

  const cwd = input.cwd ?? process.cwd();
  const viewRoot = resolve(cwd, '.ai/_view');
  const suppressFile = join(viewRoot, '.render-suppress');
  if (existsSync(suppressFile)) exitClean();

  const touchedPaths = pickArtifactPaths(input);
  if (!touchedPaths.length) exitClean();

  // All paths inside view tree? skip
  const relevant = touchedPaths.filter((p) => !shouldSkipForPath(resolve(cwd, p), viewRoot));
  if (!relevant.length) exitClean();

  // Build a slug-glob from the touched paths (union, deduped)
  const buckets = new Set();
  for (const p of relevant) {
    const bucket = detectRenderBucket(resolve(cwd, p), cwd);
    if (bucket) buckets.add(bucket);
  }
  // No recognized slug bucket (e.g. simplify/profiles writes) → skip the
  // incremental pass rather than spawning a full-site re-render. These
  // off-pipeline artifacts are picked up by the next bootstrap render.
  if (!buckets.size) exitClean();

  // Touch-file debounce
  mkdirSync(viewRoot, { recursive: true });
  const touchFile = join(viewRoot, '.render-pending');
  const now = Date.now();
  writeFileSync(touchFile, String(now), 'utf-8');

  // Detach a child that sleeps DEBOUNCE_MS, then re-checks. Routed through the
  // shared helper so it inherits windowsHide:true — a bare detached `node`
  // child gets its own console, which flashes a terminal window on Windows.
  spawnDetachedNode(
    __filename,
    ['--debounce-stage2', String(now), [...buckets].join(',')],
    {
      cwd,
      env: { ...process.env, SDLC_DEBOUNCE_ORIGIN_TS: String(now) },
    },
  );

  exitClean();
}

async function debounceStage2() {
  const argv = process.argv;
  const originTs = Number(argv[3] ?? 0);
  const bucketCsv = String(argv[4] ?? '');
  const viewRoot = resolve(process.cwd(), '.ai/_view');
  const touchFile = join(viewRoot, '.render-pending');

  await new Promise((r) => setTimeout(r, DEBOUNCE_MS));

  // If another write arrived after us, bail — that child will re-trigger.
  try {
    const current = Number(readFileSync(touchFile, 'utf-8'));
    if (current > originTs) process.exit(0);
  } catch { /* ignore */ }

  const buckets = bucketCsv ? bucketCsv.split(',').filter(Boolean) : [];

  const renderArgs = [resolveEntrypoint(PLUGIN_ROOT, 'render-sunflower')];
  if (buckets.length === 1) {
    renderArgs.push('--only', `${buckets[0]}/**`);
  }
  renderArgs.push('--plugin-root', PLUGIN_ROOT);

  const child = spawn(process.execPath, renderArgs, {
    cwd: process.cwd(),
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
