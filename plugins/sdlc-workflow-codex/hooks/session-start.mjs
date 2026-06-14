#!/usr/bin/env node
// hooks/session-start.mjs — Codex SessionStart adapter.
//
// NATIVE-INTEROP "Native Codex Hooks → SessionStart" + "One Shared Hub". On a
// trusted SessionStart (startup|resume|clear|compact) it:
//   1. resolves the project root and the once-only activation record;
//   2. ensures the machine-wide shared hub adoption-first — detached, OFF the
//      hook's critical path — by spawning the bundled hub-ensure (which adopts a
//      healthy compatible hub under the cross-host lock, or starts one from the
//      machine runtime store, and registers this repo so the hub renders it);
//   3. records activation atomically the FIRST time a given plugin/runtime/hook
//      baseline is seen (so repeated SessionStarts don't repeat activation work);
//   4. emits native Codex orientation (active workflows + next $-skill actions).
//
// Rendering is owned by the hub (Resolution 7): registration + the hub's
// reconcile/heal loop render this repo's views; this hook never renders inline.
// Always exits 0 — orientation must never block a session.

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  bundledEntry,
  computeBaseline,
  emitAdditionalContext,
  findProjectRoot,
  needsActivation,
  parseHookArgs,
  readActivation,
  readEvent,
  resolveLayout,
  writeActivationAtomic,
} from './_adapter.mjs';

const TERMINAL = new Set(['closed', 'shipped', 'abandoned', 'archived', 'complete', 'done', 'retro-complete']);

function main() {
  const args = parseHookArgs();
  const layout = resolveLayout(args);
  const event = readEvent() ?? {};
  const projectRoot = findProjectRoot(event.cwd);

  // (2) Ensure the shared hub adoption-first, detached + off the critical path.
  ensureHubDetached(layout.runtimeRoot, projectRoot);

  // (3) Once-only activation: write the record the first time this baseline is seen.
  try {
    const baseline = computeBaseline(layout);
    if (needsActivation(readActivation(layout.pluginData), baseline)) {
      writeActivationAtomic(layout.pluginData, baseline);
    }
  } catch { /* activation record is host-local provenance; never block on it */ }

  // (4) Native Codex orientation.
  try {
    const text = orient(projectRoot);
    if (text) emitAdditionalContext('SessionStart', text);
  } catch { /* fail-open */ }
}

function ensureHubDetached(runtimeRoot, projectRoot) {
  // Escape hatch (also the test seam): skip starting/adopting the hub.
  if (process.env.SDLC_DISABLE_HUB_ENSURE === '1') return;
  try {
    const child = spawn(
      process.execPath,
      [
        bundledEntry(runtimeRoot, 'hub-ensure'),
        '--plugin-root', runtimeRoot,
        '--project-root', projectRoot,
        '--view', join(projectRoot, '.ai', '_view'),
      ],
      { detached: true, stdio: 'ignore', windowsHide: true },
    );
    child.unref();
  } catch { /* fail-open — a missing hub must never break orientation */ }
}

/** Build the orientation string from active .ai/workflows indexes. */
function orient(projectRoot) {
  const dir = join(projectRoot, '.ai', 'workflows');
  if (!existsSync(dir)) return '';
  const summaries = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (!name.isDirectory()) continue;
    const index = join(dir, name.name, '00-index.md');
    if (!existsSync(index)) continue;
    const fm = readFrontmatter(index);
    if (!fm) continue;
    const status = (fm.status || fm['stage-status'] || '').toLowerCase();
    if (TERMINAL.has(status)) continue;
    summaries.push(formatSummary(name.name, fm));
  }
  if (!summaries.length) return '';
  return summaries.length === 1
    ? summaries[0]
    : `Active SDLC workflows (${summaries.length}):\n\n${summaries.join('\n\n')}`;
}

function formatSummary(slug, fm) {
  let s = `Active SDLC workflow: ${slug}`;
  if (fm.title) s += ` — ${fm.title}`;
  if (fm['current-stage']) s += `\n  Stage: ${fm['current-stage']}`;
  if (fm['stage-status']) s += ` (${fm['stage-status']})`;
  const next = toCodexInvocation(fm['recommended-next-invocation'] || fm['next-invocation'], fm['recommended-next-command'] || fm['next-command'], slug);
  if (next) s += `\n  Next: ${next}`;
  return s;
}

/**
 * Map an existing artifact's recommended-next field to native Codex skill
 * invocation. Legacy artifacts carry Claude slash-command syntax (`/wf-meta
 * status foo`); Codex skills are invoked as `$wf-meta status foo`. A bare
 * command name becomes `$<command> <slug>`.
 */
function toCodexInvocation(invocation, command, slug) {
  if (typeof invocation === 'string' && invocation.trim()) {
    return invocation.trim().replace(/^\//, '$');
  }
  if (typeof command === 'string' && command.trim()) {
    return `$${command.trim().replace(/^\//, '')} ${slug}`;
  }
  return null;
}

/** Minimal YAML-frontmatter scalar read (orientation only — no full YAML parse). */
function readFrontmatter(file) {
  try {
    const text = readFileSync(file, 'utf-8');
    const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
    if (!m) return null;
    const out = {};
    for (const line of m[1].split(/\r?\n/)) {
      const kv = /^\s*([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
      if (kv) out[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim();
    }
    return out;
  } catch {
    return null;
  }
}

try { main(); } finally { process.exit(0); }
