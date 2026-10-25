#!/usr/bin/env node
// The report of the code-mode eval: for each cell and arm, the success rate of the bulk tasks
// and of the control tasks, and the mean calls, tokens, invalid calls, writes around wf.mjs and
// wall time. Then the decision rule for each cell and for all cells together:
//
//   The library goes into the stage references when the api arm on the bulk tasks has a higher
//   success rate, or the same success rate with at least 30% fewer calls or tokens, and it does
//   not lose success on the control tasks.
//
//   node tests/evals/code-mode/report.mjs [<results.jsonl>] [--json]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT } from './fixture.mjs';

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const rate = (rows) => (rows.length ? rows.filter((r) => r.pass).length / rows.length : null);

export function summarize(rows) {
  const s = (list) => ({
    runs: list.length,
    bulk: rate(list.filter((r) => r.class !== 'control')),
    control: rate(list.filter((r) => r.class === 'control')),
    calls: mean(list.filter((r) => r.class !== 'control').map((r) => r.calls)),
    tokens: mean(list.filter((r) => r.class !== 'control').map((r) => r.tokens)),
    invalid: mean(list.map((r) => r.invalid)),
    outsideWrites: mean(list.map((r) => r.outsideWrites)),
    wallMs: mean(list.map((r) => r.wallMs)),
  });
  return { cli: s(rows.filter((r) => r.arm === 'cli')), api: s(rows.filter((r) => r.arm === 'api')) };
}

/** The decision rule on the summary of one cell, or of all cells. */
export function verdict({ cli, api }) {
  if (!cli.runs || !api.runs) return { pass: null, why: 'an arm has no runs' };
  const fewer = (a, b) => a != null && b != null && b > 0 && a <= 0.7 * b;
  const better = api.bulk > cli.bulk;
  const same = api.bulk === cli.bulk && (fewer(api.calls, cli.calls) || fewer(api.tokens, cli.tokens));
  const control = cli.control == null || api.control == null || api.control >= cli.control;
  const pass = (better || same) && control;
  const why = better ? 'a higher bulk success rate' : same ? 'the same bulk success rate with at least 30% fewer calls or tokens' : 'no gain on the bulk tasks';
  return { pass, why: control ? why : `${why}, but a loss on the control tasks` };
}

function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--')) ?? join(PLUGIN_ROOT, '.scratch', 'evals', 'code-mode', 'results.jsonl');
  const rows = readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  const cells = [...new Set(rows.map((r) => r.cell))];
  const report = Object.fromEntries(cells.map((c) => {
    const sum = summarize(rows.filter((r) => r.cell === c));
    return [c, { ...sum, verdict: verdict(sum) }];
  }));
  const all = summarize(rows);
  report.all = { ...all, verdict: verdict(all) };
  if (args.includes('--json')) { process.stdout.write(`${JSON.stringify(report, null, 2)}\n`); return; }
  const pct = (x) => (x == null ? '-' : `${Math.round(x * 100)}%`);
  const num = (x) => (x == null ? '-' : String(Math.round(x)));
  const lines = ['| cell | arm | runs | bulk | control | calls | tokens | invalid | around wf.mjs | wall s |', '|---|---|---|---|---|---|---|---|---|---|'];
  for (const [c, r] of Object.entries(report)) {
    for (const arm of ['cli', 'api']) {
      const a = r[arm];
      lines.push(`| ${c} | ${arm} | ${a.runs} | ${pct(a.bulk)} | ${pct(a.control)} | ${num(a.calls)} | ${num(a.tokens)} | ${a.invalid?.toFixed(1) ?? '-'} | ${a.outsideWrites?.toFixed(1) ?? '-'} | ${a.wallMs == null ? '-' : Math.round(a.wallMs / 1000)} |`);
    }
  }
  lines.push('', ...Object.entries(report).map(([c, r]) => `${c}: ${r.verdict.pass === null ? 'no verdict' : r.verdict.pass ? 'PASS' : 'FAIL'} (${r.verdict.why})`));
  process.stdout.write(`${lines.join('\n')}\n`);
}

main();
