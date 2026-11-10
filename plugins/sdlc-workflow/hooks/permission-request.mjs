#!/usr/bin/env node
// hooks/permission-request.mjs — Codex PermissionRequest adapter.
//
// Auto-ALLOWS a strict allowlist — `node <script>.mjs` invocations of this
// plugin's own scripts (the hooks and skills spawn these constantly:
// seed-memory, pre-write-validate, post-write-verify, campaign …) — to cut
// approval-prompt fatigue. A script is the plugin's when it is a direct child
// of <plugin root>/hooks/, <plugin root>/scripts/ or
// <plugin root>/skills/<skill>/scripts/; the release and version-stamp scripts are
// left out. Everything else gets NO OPINION (silent
// exit 0), which leaves the normal approval flow untouched; this hook never
// denies. Every auto-allow is logged to ${PLUGIN_DATA}/permission-auto-allow.log,
// so each one can be audited.

import { appendFileSync, mkdirSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

import { emitPermissionRequestDecision, parseHookArgs, readEvent, resolveLayout } from './_adapter.mjs';

/**
 * True when a shell command string can run more than its first command: an operator
 * (`;` `&` `|`), a redirection, a substitution, a second line, or a bare `(`, which
 * PowerShell evaluates as a subexpression (`(…)`, `@(…)`). Single quotes stop all
 * expansion; inside double quotes `$` and a backtick still expand, so they count.
 *
 * One scan from left to right keeps the quote state, so an apostrophe inside double
 * quotes is text and never pairs with a later single quote. A quote that does not
 * close counts, and so does anything whose quoting differs between bash and
 * PowerShell: a backslash before a quote, bash's `$'…'`, and the typographic quotes
 * that PowerShell reads as quotes.
 */
export function hasShellOperator(command) {
  const s = String(command);
  if (/[\u2018\u2019\u201A\u201B\u201C\u201D\u201E]/.test(s)) return true;
  let quote = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote === "'") {
      if (c === "'") quote = null;
    } else if (quote === '"') {
      if (c === '"') quote = null;
      else if (c === '$' || c === '`' || (c === '\\' && s[i + 1] === '"')) return true;
    } else if (c === "'" || c === '"') {
      quote = c;
    } else if (/[;&|<>`\n\r(]/.test(c)) {
      return true;
    } else if ((c === '\\' && /['"]/.test(s[i + 1] ?? '')) || (c === '$' && s[i + 1] === "'")) {
      return true;
    }
  }
  return quote !== null;
}

/**
 * Extract the command being approved from the (partially undocumented) event. A command
 * string with a shell operator gets null (no opinion): only the first command of
 * `node <runtime>.mjs && <anything>` is the plugin's, so the whole line is never allowed.
 */
export function commandFromEvent(event) {
  const ti = event?.tool_input ?? {};
  const raw = ti.command ?? event?.command ?? null;
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') return hasShellOperator(raw) ? null : splitCommand(raw);
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

const PLUGIN_SCRIPT = /^(hooks\/[^/]+|scripts\/[^/]+|skills\/[^/]+\/scripts\/[^/]+)\.mjs$/;

// Scripts that publish a release or rewrite the version carriers. They always go
// through the normal approval prompt.
const NEVER_AUTO_ALLOWED = new Set(['scripts/release.mjs', 'scripts/stamp-version.mjs']);

/**
 * True only for `node <script>.mjs [...]` where the script resolves to a direct
 * child of hooks/, scripts/ or skills/<skill>/scripts/ under the plugin root, and
 * is not one of the scripts that publish or rewrite versions.
 * Deliberately narrow: no shell operators in the node token, no deeper path.
 */
export function isAllowedRuntimeInvocation(argv, pluginRoot) {
  if (!Array.isArray(argv) || argv.length < 2) return false;
  const exe = String(argv[0]).replace(/\\/g, '/');
  if (!/(^|\/)node(\.exe)?$/i.test(exe) && exe !== 'node') return false;
  const script = String(argv[1]);
  if (!/\.mjs$/i.test(script)) return false;
  const norm = normalize(script);
  if (!isAbsolute(script) && !norm.includes('/')) return false;
  const root = normalize(pluginRoot) + '/';
  if (!norm.startsWith(root)) return false;
  const rel = norm.slice(root.length);
  return PLUGIN_SCRIPT.test(rel) && !NEVER_AUTO_ALLOWED.has(rel);
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

  if (!isAllowedRuntimeInvocation(argv, layout.pluginRoot)) return; // no opinion

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
