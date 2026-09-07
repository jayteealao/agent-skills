#!/usr/bin/env node
/**
 * hooks/cost-ledger.mjs — Stop hook: append this turn's exact token usage to
 * `.ai/workflows/<slug>/cost.jsonl` (WIDE-VIEW-REPAIR-PLAN §10).
 *
 * Behavior:
 * - Exit 0 for all outcomes; a parse or write failure logs through
 *   lib/error-log.mjs and writes no row (a wrong number is never visible, a
 *   missing row is a turn gap in `/wf status`).
 * - Honor `hooks.costLedger: false` in .ai/sdlc-config.json.
 * - Read only the bytes appended since the per-session cursor; the cursor lives
 *   in `<cursorDir>/cost-cursor/<session_id>.json`.
 * - Write a row only when the turn has usage AND a slug is known — written this
 *   turn under `.ai/workflows/<slug>/`, or inherited from the session's last
 *   attributed turn (that is how a gate-question turn is attributed).
 * - Write ONLY cost.jsonl. Never touch 00-index.md.
 *
 * Hosts (one entrypoint, three payload shapes):
 * - Claude Code: hooks/hooks.json runs dist/cost-ledger.mjs; stdin carries
 *   `{ session_id, transcript_path, cwd }`; sub-agent transcripts sit at
 *   `<dirname(transcript_path)>/<session_id>/subagents/agent-<id>.jsonl`.
 * - Codex: hooks/codex.hooks.json runs the thin adapter hooks/stop-cost.mjs,
 *   which spawns dist/cost-ledger.mjs with `sdlc_plugin_data` in the payload;
 *   the cursor lives under PLUGIN_DATA. When the event names no
 *   `transcript_path`, the rollout is located by session id under
 *   `$CODEX_HOME/sessions/` (the file name carries the session id).
 * - pi (pi-code): the Claude-shaped payload whose `transcript_path` is a pi
 *   session file; the parser is chosen from the file's first line.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { loadConfig } from '../lib/config.mjs';
import { logError } from '../lib/error-log.mjs';
import { readStdinJson } from '../lib/stdin.mjs';
import { projectRootFromInput } from '../lib/hook-utils.mjs';
import { sdlcHomeDir } from '../lib/registry.mjs';
import { appendCostRow, collectTurn, readCursor, writeCursor } from '../lib/cost-ledger.mjs';

/** `--plugin-root X --plugin-data Y` (the Codex wiring); absent under Claude Code. */
export function parseHookArgs(argv = process.argv.slice(2)) {
  const out = { pluginRoot: null, pluginData: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--plugin-root' && argv[i + 1]) out.pluginRoot = argv[++i];
    else if (argv[i] === '--plugin-data' && argv[i + 1]) out.pluginData = argv[++i];
  }
  return out;
}

/** Codex: newest `rollout-*<sessionId>*.jsonl` under `$CODEX_HOME/sessions/YYYY/MM/DD/`. */
export function findCodexRollout(sessionId, codexHome = process.env.CODEX_HOME || join(homedir(), '.codex')) {
  const root = join(codexHome, 'sessions');
  if (!sessionId || !existsSync(root)) return null;
  let best = null;
  const walk = (dir, depth) => {
    let names = [];
    try { names = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const d of names) {
      const p = join(dir, d.name);
      if (d.isDirectory()) { if (depth < 3) walk(p, depth + 1); continue; }
      if (!d.name.startsWith('rollout-') || !d.name.endsWith('.jsonl') || !d.name.includes(sessionId)) continue;
      const m = statSync(p).mtimeMs;
      if (!best || m > best.mtime) best = { path: p, mtime: m };
    }
  };
  walk(root, 0);
  return best?.path ?? null;
}

function hostName(transcriptHost, env) {
  if (transcriptHost === 'pi' || transcriptHost === 'codex') return transcriptHost;
  return env.SDLC_HOST === 'codex' ? 'codex' : 'claude';
}

/**
 * One Stop: collect the turn, write the row when attributable, save the cursor.
 * @returns {{ wrote:boolean, reason:string, ledger?:string }}
 */
export async function runCostLedger({ input, cursorDir, env = process.env, now = () => new Date() }) {
  const sessionId = input?.session_id;
  if (!sessionId) return { wrote: false, reason: 'no session_id' };
  const projectRoot = projectRootFromInput(input);
  const config = await loadConfig(projectRoot);
  if (config.hooks?.costLedger === false) return { wrote: false, reason: 'disabled' };

  let transcript = typeof input.transcript_path === 'string' && input.transcript_path ? input.transcript_path : null;
  if (!transcript) transcript = findCodexRollout(sessionId, env.CODEX_HOME || undefined);
  if (!transcript || !existsSync(transcript)) return { wrote: false, reason: 'no transcript' };

  const cursor = readCursor(cursorDir, sessionId);
  const turn = collectTurn({ transcriptPath: transcript, subagentsDir: join(dirname(transcript), sessionId, 'subagents'), cursor });
  cursor.turn = (cursor.turn ?? 0) + 1;

  let wrote = false;
  let ledger;
  if (turn.hadUsage && turn.attributed?.slug) {
    const a = turn.attributed;
    const root = a.root && isAbsolute(a.root) ? a.root : resolve(projectRoot, a.root ?? join('.ai', 'workflows'));
    ledger = appendCostRow(join(root, a.slug), {
      ts: now().toISOString(),
      host: hostName(turn.host, env),
      session: sessionId,
      turn: cursor.turn,
      key: a.key ?? null,
      slug: a.slug,
      slice: a.slice ?? null,
      main: turn.main,
      subagents: turn.subagents,
      external: [],
    });
    wrote = true;
  }
  writeCursor(cursorDir, sessionId, cursor);
  return { wrote, reason: wrote ? 'row' : (turn.hadUsage ? 'no slug' : 'no usage'), ledger };
}

async function main() {
  if (process.env.CLAUDE_PLUGIN_INSTALL === '1') return;
  // A consult child session (SDLC_DISPATCH_ACTIVE) is read-only and owns no slug.
  if (process.env.SDLC_DISPATCH_ACTIVE === '1') return;
  const args = parseHookArgs();
  const input = await readStdinJson();
  if (!input || typeof input !== 'object') return;
  // Cursor home: the Codex adapter (hooks/stop-cost.mjs) passes PLUGIN_DATA in
  // the payload; a direct `--plugin-data` argv works too; else SDLC_HOME.
  const pluginData = (typeof input.sdlc_plugin_data === 'string' && input.sdlc_plugin_data) || args.pluginData;
  const cursorDir = pluginData ? join(resolve(pluginData), 'cost-cursor') : join(sdlcHomeDir(), 'cost-cursor');
  let projectRoot = process.cwd();
  try {
    projectRoot = projectRootFromInput(input);
    await runCostLedger({ input, cursorDir });
  } catch (err) {
    try { await logError('cost-ledger', err, { projectRoot, context: { session: input.session_id ?? null } }); } catch { /* ignore */ }
  }
}

const isMain = process.argv[1] && (import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  || fileURLToPath(import.meta.url) === resolve(process.argv[1]));
if (isMain) {
  main().finally(() => process.exit(0));
}
