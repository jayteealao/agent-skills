#!/usr/bin/env node
// The live counts of the calls of wf: how many went through the wf tools and how many through a
// shell, read from the Claude transcripts of this computer. It counts real calls only: node, then a
// wf script, then its words (measure.mjs, wfShellCalls). A commit message or a search that names
// wf.mjs is no call. It reads the transcripts and writes nothing.
//
//   node tests/evals/code-mode/live-counts.mjs [--dir <projects folder>] [--since 2026-11-26]
//                                             [--until 2026-12-01] [--json]
//
// The folder is ~/.claude/projects unless --dir names another. An agent is a line with
// isSidechain, or a file under subagents/: its calls are counted apart from the main session.
import { createReadStream, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { wfShellCalls, wfToolOf } from './measure.mjs';

const SCRIPT_SEGMENT = /\bnode(?:\.exe)?\s+["']?[^"'\s|;&]*[\\/](?:wf|campaign|orchestrate|optimize|goal|prototype|ideate-sources|design-boards)\.mjs["']?[^|;&>\r\n]*/g;

function flags(argv) {
  const opt = {};
  for (let i = 0; i < argv.length; i += 1) {
    const name = argv[i].replace(/^--/, '');
    if (name === 'json') opt.json = true;
    else opt[name] = argv[(i += 1)];
  }
  return opt;
}

/** The .jsonl files under the projects folder, with no walk outside it. */
function transcripts(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.jsonl'))
    .map((e) => join(e.parentPath ?? e.path, e.name));
}

const empty = () => ({ mcp: 0, shell: 0, byTool: {}, byShellOp: {}, sessions: new Set() });
const bump = (o, k, n = 1) => { o[k] = (o[k] ?? 0) + n; };

/** Add the calls of wf of one transcript to the counts. */
export async function countFile(file, counts, { since = null, until = null, parseCliLine = null } = {}) {
  const sub = /[\\/]subagents[\\/]/.test(file);
  const vars = new Set();
  const rl = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.includes('tool_use')) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.type !== 'assistant') continue;
    const at = String(e.timestamp ?? '');
    if ((since && at < since) || (until && at >= until)) continue;
    const who = sub || e.isSidechain ? counts.agent : counts.main;
    for (const b of e.message?.content ?? []) {
      if (b.type !== 'tool_use') continue;
      const tool = wfToolOf(b.name);
      if (tool) {
        who.mcp += 1;
        bump(who.byTool, b.input?.op ? `${tool} ${b.input.op}` : tool);
        who.sessions.add(e.sessionId ?? file);
        continue;
      }
      if (!['Bash', 'PowerShell'].includes(b.name)) continue;
      const n = wfShellCalls(b.input?.command, vars);
      if (!n) continue;
      who.shell += n;
      who.sessions.add(e.sessionId ?? file);
      for (const m of String(b.input?.command ?? '').matchAll(SCRIPT_SEGMENT)) {
        const c = parseCliLine ? parseCliLine(m[0].replace(/'([^']*)'/g, '"$1"').trim()) : null;
        bump(who.byShellOp, c?.op ?? '(not parsed)');
      }
    }
  }
}

export async function liveCounts({ dir = join(homedir(), '.claude', 'projects'), since = null, until = null } = {}) {
  const { parseCliLine } = await import('../../../lib/ops/render.mjs');
  const counts = { main: empty(), agent: empty() };
  // A file last written before --since holds no line after it.
  const from = since ? Date.parse(since) : null;
  for (const f of transcripts(dir)) {
    if (from && statSync(f).mtimeMs < from) continue;
    await countFile(f, counts, { since, until, parseCliLine });
  }
  const view = (c) => {
    const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 10);
    return { mcp: c.mcp, shell: c.shell, toolShare: c.mcp + c.shell ? c.mcp / (c.mcp + c.shell) : null, sessions: c.sessions.size, topTools: top(c.byTool), topShellOps: top(c.byShellOp) };
  };
  const all = { mcp: counts.main.mcp + counts.agent.mcp, shell: counts.main.shell + counts.agent.shell };
  return { dir, since, until, main: view(counts.main), agent: view(counts.agent), all: { ...all, toolShare: all.mcp + all.shell ? all.mcp / (all.mcp + all.shell) : null } };
}

async function main() {
  const opt = flags(process.argv.slice(2));
  const r = await liveCounts({ dir: opt.dir, since: opt.since ?? null, until: opt.until ?? null });
  if (opt.json) { process.stdout.write(`${JSON.stringify(r, null, 2)}\n`); return; }
  const pct = (x) => (x == null ? '-' : `${Math.round(x * 100)}%`);
  const out = [`${r.dir}${r.since ? ` from ${r.since}` : ''}${r.until ? ` to ${r.until}` : ''}`, '', '| caller | wf tools | shell | tools share | sessions |', '|---|---|---|---|---|'];
  for (const k of ['main', 'agent']) out.push(`| ${k} | ${r[k].mcp} | ${r[k].shell} | ${pct(r[k].toolShare)} | ${r[k].sessions} |`);
  out.push(`| all | ${r.all.mcp} | ${r.all.shell} | ${pct(r.all.toolShare)} | |`, '');
  for (const k of ['main', 'agent']) {
    out.push(`${k}, top tools: ${r[k].topTools.map(([t, n]) => `${t} ${n}`).join(', ') || 'none'}`);
    out.push(`${k}, top shell operations: ${r[k].topShellOps.map(([t, n]) => `${t} ${n}`).join(', ') || 'none'}`);
  }
  process.stdout.write(`${out.join('\n')}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
