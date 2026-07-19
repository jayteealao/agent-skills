#!/usr/bin/env node
// hooks/permission-request.mjs — Codex PermissionRequest adapter.
//
// Auto-ALLOWS a strict allowlist — `node <script>.mjs` invocations of this
// plugin's own bundled runtime entrypoints (the hooks and skills spawn these
// constantly: hub-ensure, pre-write-validate, post-write-verify, render …) —
// to cut approval-prompt fatigue. Everything else gets NO OPINION (silent
// exit 0), which leaves the normal approval flow untouched; this hook never
// denies. Every auto-allow is logged to ${PLUGIN_DATA}/permission-auto-allow.log
// (CODEX-REMEDIATION-PLAN H4).

import { appendFileSync, mkdirSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { homedir } from 'node:os';

import { emitPermissionRequestDecision, parseHookArgs, readEvent, resolveLayout } from './_adapter.mjs';

/** Extract the command being approved from the (partially undocumented) event. */
export function commandFromEvent(event) {
  const ti = event?.tool_input ?? {};
  const raw = ti.command ?? event?.command ?? null;
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') return splitCommand(raw);
  return null;
}

/** Minimal shell-ish tokenizer: enough to recognize `node "<path>" …`. */
function splitCommand(s) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(s))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

/**
 * True only for `node <script>.mjs [...]` where the script resolves inside one
 * of the plugin's own runtime roots. Deliberately narrow: no shell operators
 * in the node token, script must be an .mjs under an allowed root.
 */
export function isAllowedRuntimeInvocation(argv, allowedRoots) {
  if (!Array.isArray(argv) || argv.length < 2) return false;
  const exe = String(argv[0]).replace(/\\/g, '/');
  if (!/(^|\/)node(\.exe)?$/i.test(exe) && exe !== 'node') return false;
  const script = String(argv[1]);
  if (!/\.mjs$/i.test(script)) return false;
  const norm = normalize(script);
  if (!isAbsolute(script) && !norm.includes('/')) return false;
  return allowedRoots.some((root) => norm.startsWith(normalize(root) + '/'));
}

function normalize(p) {
  return resolve(String(p)).replace(/\\/g, '/').toLowerCase();
}

function main() {
  const args = parseHookArgs();
  const layout = resolveLayout(args);
  const event = readEvent();
  if (!event) return;

  const argv = commandFromEvent(event);
  if (!argv) return;

  const allowedRoots = [
    join(layout.runtimeRoot, 'dist'), // bundled runtime entrypoints
    join(homedir(), '.sdlc', 'runtime'), // machine runtime store (hub-adopted)
  ];
  if (!isAllowedRuntimeInvocation(argv, allowedRoots)) return; // no opinion

  emitPermissionRequestDecision('allow', 'sdlc-workflow runtime invocation (plugin allowlist)');
  try {
    mkdirSync(layout.pluginData, { recursive: true });
    appendFileSync(
      join(layout.pluginData, 'permission-auto-allow.log'),
      `${new Date().toISOString()}\t${argv.join(' ')}\n`,
      'utf-8',
    );
  } catch { /* logging is best-effort; the allow already stands */ }
}

// Only run main when executed as a hook (not when imported by tests).
if (process.argv[1] && /permission-request\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  try { main(); } finally { process.exit(0); }
}
