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

import { execFileSync } from 'node:child_process';
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

  // (2) Ensure the shared hub adoption-first AND confirm it came up — bounded
  //     within the SessionStart budget. The hub is spawned detached and survives
  //     this hook; we only wait for hub-ensure's readiness verdict.
  const hubReady = ensureHubConfirmed(layout.runtimeRoot, projectRoot);

  // (3) Once-only activation: record the baseline the FIRST time it is seen AND
  //     the shared hub is confirmed healthy. The native-interop contract requires
  //     the record only after successful activation, so a new baseline whose hub
  //     never confirmed is left unrecorded — the next trusted SessionStart retries.
  if (hubReady) {
    try {
      const baseline = computeBaseline(layout);
      if (needsActivation(readActivation(layout.pluginData), baseline)) {
        writeActivationAtomic(layout.pluginData, baseline);
      }
    } catch { /* activation record is host-local provenance; never block on it */ }
  }

  // (4) Native Codex orientation — always emits, regardless of hub readiness.
  try {
    const text = orient(projectRoot);
    if (text) emitAdditionalContext('SessionStart', text);
  } catch { /* fail-open */ }
}

// How long SessionStart will wait for the hub to confirm healthy. Bounded well
// under the 30s SessionStart budget (hooks.json) — the common adopt case resolves
// in well under a second; this ceiling only bites a contended cold start (covers
// the cross-host startup lock's own 15s wait + the health confirm).
const HUB_CONFIRM_TIMEOUT_MS = 20000;

/**
 * Ensure the shared hub adoption-first and confirm it came up, BOUNDED so it can
 * never exceed the SessionStart budget. hub-ensure spawns the hub itself detached
 * (it survives this hook); here we run hub-ensure SYNCHRONOUSLY with --confirm so
 * its exit code reports readiness: 0 = adopted/started healthy, non-zero = not
 * confirmed. Returns whether the hub is confirmed ready.
 *
 * Seams:
 *   SDLC_DISABLE_HUB_ENSURE=1 → do not start/adopt a hub at all → not confirmed
 *                               (escape hatch + hermetic test).
 *   SDLC_ASSUME_HUB_READY=1   → treat the hub as confirmed without spawning, for
 *                               a self-managed hub or to exercise activation in tests.
 */
function ensureHubConfirmed(runtimeRoot, projectRoot) {
  if (process.env.SDLC_ASSUME_HUB_READY === '1') return true;
  if (process.env.SDLC_DISABLE_HUB_ENSURE === '1') return false;
  try {
    execFileSync(
      process.execPath,
      [
        bundledEntry(runtimeRoot, 'hub-ensure'),
        '--confirm',
        '--plugin-root', runtimeRoot,
        '--project-root', projectRoot,
        '--view', join(projectRoot, '.ai', '_view'),
      ],
      { stdio: 'ignore', windowsHide: true, timeout: HUB_CONFIRM_TIMEOUT_MS },
    );
    return true;   // exit 0 → hub confirmed healthy
  } catch {
    // non-zero exit (not confirmed), timeout, or spawn failure → treat as not
    // ready. The detached hub bring-up may still complete; the next trusted
    // SessionStart will confirm and record activation.
    return false;
  }
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
