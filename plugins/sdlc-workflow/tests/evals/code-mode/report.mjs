#!/usr/bin/env node
// The report of the code-mode eval: for each cell and arm, the success rate of the batch tasks
// and of the control tasks, the mean calls, tokens, invalid calls, writes around wf.mjs and wall
// time, and in the mcp arm the share of the calls of wf that went through the wf tools. Then the
// decision rule for each Claude cell and for all of them together:
//
//   The wf tools pass when no task passes less often than with the CLI, the tokens of the control
//   tasks rise by at most 10%, the calls of the batch tasks fall by at least 30%, and the wf tools
//   make at least 95% of the calls of wf in the mcp arm, with no call of wf denied.
//
//   node tests/evals/code-mode/report.mjs [<results.jsonl>] [--json]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PLUGIN_ROOT } from './fixture.mjs';

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const rate = (rows) => (rows.length ? rows.filter((r) => r.pass).length / rows.length : null);
const sum = (xs) => xs.reduce((a, b) => a + (b ?? 0), 0);

/** The tasks that take many operations: here the tools and code mode must save calls. */
export const BATCH = new Set(['three-slices', 'five-answers', 'board-group', 'ten-findings', 'steps-loop', 'bulk-findings']);

export function summarize(rows) {
  const s = (list) => {
    const batch = list.filter((r) => BATCH.has(r.task));
    const control = list.filter((r) => r.class === 'control');
    const wfMcp = sum(list.map((r) => r.wfMcp));
    const wfShell = sum(list.map((r) => r.wfShell));
    return {
      runs: list.length,
      pass: rate(list),
      batch: rate(batch),
      control: rate(control),
      byTask: Object.fromEntries([...new Set(list.map((r) => r.task))].map((t) => [t, rate(list.filter((r) => r.task === t))])),
      batchCalls: mean(batch.map((r) => r.calls)),
      controlTokens: mean(control.map((r) => r.tokens)),
      calls: mean(list.map((r) => r.calls)),
      tokens: mean(list.map((r) => r.tokens)),
      invalid: mean(list.map((r) => r.invalid)),
      outsideWrites: mean(list.map((r) => r.outsideWrites)),
      wallMs: mean(list.map((r) => r.wallMs)),
      mcpShare: wfMcp + wfShell ? wfMcp / (wfMcp + wfShell) : null,
      code: sum(list.map((r) => r.wfCode)),
      denied: sum(list.map((r) => r.wfDenied)),
    };
  };
  return { cli: s(rows.filter((r) => r.arm === 'cli')), mcp: s(rows.filter((r) => r.arm === 'mcp')) };
}

/** The decision rule on the summary of one cell, or of all cells. */
export function verdict({ cli, mcp }) {
  if (!cli.runs || !mcp.runs) return { pass: null, why: 'an arm has no runs' };
  const why = [];
  const worse = Object.keys(cli.byTask).filter((t) => mcp.byTask[t] != null && mcp.byTask[t] < cli.byTask[t]);
  if (worse.length) why.push(`passes less often: ${worse.join(', ')}`);
  if (cli.controlTokens && mcp.controlTokens > 1.1 * cli.controlTokens) why.push(`control tokens rose ${Math.round((mcp.controlTokens / cli.controlTokens - 1) * 100)}%`);
  if (cli.batchCalls && !(mcp.batchCalls <= 0.7 * cli.batchCalls)) why.push(`batch calls fell only ${Math.round((1 - mcp.batchCalls / cli.batchCalls) * 100)}%`);
  if (mcp.mcpShare == null || mcp.mcpShare < 0.95) why.push(`the wf tools made ${mcp.mcpShare == null ? 'no' : `${Math.round(mcp.mcpShare * 100)}% of the`} calls of wf`);
  if (mcp.denied) why.push(`${mcp.denied} call(s) of wf denied`);
  return { pass: !why.length, why: why.length ? why.join('; ') : 'every rule holds' };
}

function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--')) ?? join(PLUGIN_ROOT, '.scratch', 'evals', 'code-mode', 'results.jsonl');
  const rows = readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  // The rule compares the arms on Claude, the only host with the wf tools.
  const claude = rows.filter((r) => String(r.cell).startsWith('claude-'));
  const cells = [...new Set(rows.map((r) => r.cell))];
  const report = Object.fromEntries(cells.map((c) => {
    const s = summarize(rows.filter((r) => r.cell === c));
    return [c, { ...s, verdict: c.startsWith('claude-') ? verdict(s) : { pass: null, why: 'the command line only' } }];
  }));
  const all = summarize(claude);
  report['all-claude'] = { ...all, verdict: verdict(all) };
  if (args.includes('--json')) { process.stdout.write(`${JSON.stringify(report, null, 2)}\n`); return; }
  const pct = (x) => (x == null ? '-' : `${Math.round(x * 100)}%`);
  const num = (x) => (x == null ? '-' : String(Math.round(x)));
  const lines = ['| cell | arm | runs | pass | batch | control | batch calls | tokens | invalid | around wf.mjs | tools share | code | denied | wall s |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const [c, r] of Object.entries(report)) {
    for (const arm of ['cli', 'mcp']) {
      const a = r[arm];
      if (!a.runs) continue;
      lines.push(`| ${c} | ${arm} | ${a.runs} | ${pct(a.pass)} | ${pct(a.batch)} | ${pct(a.control)} | ${num(a.batchCalls)} | ${num(a.tokens)} | ${a.invalid?.toFixed(1) ?? '-'} | ${a.outsideWrites?.toFixed(1) ?? '-'} | ${pct(a.mcpShare)} | ${a.code} | ${a.denied} | ${a.wallMs == null ? '-' : Math.round(a.wallMs / 1000)} |`);
    }
  }
  lines.push('', ...Object.entries(report).map(([c, r]) => `${c}: ${r.verdict.pass === null ? 'no verdict' : r.verdict.pass ? 'PASS' : 'FAIL'} (${r.verdict.why})`));
  process.stdout.write(`${lines.join('\n')}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
