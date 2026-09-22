#!/usr/bin/env node
// scripts/mod-probe.mjs — `npm run mod:probe` (MOD-DESKTOP-PLAN.md §6).
//
// Reads the mod's probe journal, `<SDLC_HOME|~/.sdlc>/mod-probe.jsonl`, and
// prints one row per host and surface: whether the module bound its host
// there, how many commands registered, how many `/wf` turns it saw, how the
// post-stage compactions ended, and which capability calls failed.
//
// The journal is the only way to tell whether the mod runs on a host whose
// transcript nobody reads — Claude Code Desktop above all, where the engine
// runs through the SDK and the band never draws.
//
//   node scripts/mod-probe.mjs                the table
//   node scripts/mod-probe.mjs --json         the verdicts as JSON
//   node scripts/mod-probe.mjs --rows         every row, newest last
//   node scripts/mod-probe.mjs --since 24h    only rows newer than that
//   node scripts/mod-probe.mjs --clear        empty the journal
//   node scripts/mod-probe.mjs --path         print the journal's path
//
// Exit 0 when every host and surface seen in the window bound the host and
// registered every command; exit 1 when one did not, or when the journal is
// absent or empty (nothing has run yet, which is itself the answer).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { PROBE_FILE, rowsOf, sinceOf, verdictOf } from '../hooks/mod/probe.ts';

function parseArgs(argv) {
  const out = { json: false, rows: false, clear: false, path: false, sinceMs: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--rows') out.rows = true;
    else if (a === '--clear') out.clear = true;
    else if (a === '--path') out.path = true;
    else if (a === '--since') out.sinceMs = sinceMsOf(argv[++i]);
    else if (a.startsWith('--since=')) out.sinceMs = sinceMsOf(a.slice('--since='.length));
  }
  return out;
}

/** `24h`, `7d`, `90m` as a millisecond floor, or null when the text does not parse. */
function sinceMsOf(text) {
  const match = /^(\d+)([mhd])$/u.exec((text ?? '').trim());
  if (!match) return null;
  const size = { m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]];
  return Date.now() - Number(match[1]) * size;
}

/** The journal's path: `SDLC_HOME` when set, else `~/.sdlc`. */
export function probePath() {
  const override = process.env.SDLC_HOME;
  const home = override && override.trim() ? override.trim() : join(homedir(), '.sdlc');
  return join(home, PROBE_FILE);
}

function pad(text, width) {
  return String(text).padEnd(width);
}

function formatTable(verdicts) {
  const head = ['host', 'surface', 'status', 'sessions', 'commands', 'turns', 'compactions', 'last seen'];
  const body = verdicts.map((v) => [
    v.host,
    v.surface,
    v.status,
    String(v.sessions),
    v.commands ?? '—',
    v.actions === v.turns ? String(v.turns) : `${v.actions}/${v.turns}`,
    v.compactions === '' ? '—' : v.compactions,
    v.lastAt.replace('T', ' ').replace('Z', ''),
  ]);
  const widths = head.map((_, i) => Math.max(head[i].length, ...body.map((row) => row[i].length)));
  const lines = [head.map((cell, i) => pad(cell, widths[i])).join('  ').trimEnd()];
  for (const row of body) lines.push(row.map((cell, i) => pad(cell, widths[i])).join('  ').trimEnd());
  for (const v of verdicts) {
    for (const failure of v.failures) lines.push(`  ${v.host}/${v.surface} call failed — ${failure}`);
  }
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const path = probePath();
  if (args.path) {
    console.log(path);
    return 0;
  }
  if (args.clear) {
    writeFileSync(path, '', 'utf8');
    console.log(`[mod-probe] cleared ${path}`);
    return 0;
  }
  if (!existsSync(path)) {
    console.log(`[mod-probe] no journal at ${path} — the mod has not run with the probe on.`);
    return 1;
  }
  const all = rowsOf(readFileSync(path, 'utf8'));
  const rows = sinceOf(all, args.sinceMs);
  if (args.rows) {
    for (const row of rows) console.log(JSON.stringify(row));
    return rows.length === 0 ? 1 : 0;
  }
  const verdicts = verdictOf(rows);
  if (args.json) {
    console.log(JSON.stringify({ path, rows: rows.length, verdicts }, null, 2));
  } else if (verdicts.length === 0) {
    console.log(`[mod-probe] ${path} holds no rows in the window.`);
  } else {
    console.log(formatTable(verdicts));
    console.log('');
    console.log(`[mod-probe] ${rows.length} row(s) · ${path}`);
  }
  if (verdicts.length === 0) return 1;
  const bad = verdicts.filter((v) => v.status !== 'ok' || v.commandsOk === false);
  return bad.length === 0 ? 0 : 1;
}

process.exit(main());
