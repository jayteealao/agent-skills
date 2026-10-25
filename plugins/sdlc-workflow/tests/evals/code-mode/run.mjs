#!/usr/bin/env node
// The runner of the code-mode eval. Each run makes a fresh fixture, gives one task to one host
// in one arm, saves the transcript, checks the end state and appends one row to results.jsonl.
//
// WARNING: a run starts `claude -p`, `codex exec` or pi, and spends the usage limits of that
// host. Without --yes this prints the list of runs and starts nothing.
//
//   node tests/evals/code-mode/run.mjs [--cells c,...] [--arms cli,api] [--tasks t,...]
//                                      [--runs 5] [--out <dir>] [--yes]
//
// Arms: cli gets the records reference; api gets the same reference plus _api.md.
// Cells: <host>-<model>-<shell>; the shell is the tool that the prompt names.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PLUGIN_ROOT, SLUG, makeFixture } from './fixture.mjs';
import { measure } from './measure.mjs';
import { TASKS } from './tasks.mjs';

export const CELLS = {
  'claude-sonnet-pwsh': { host: 'claude', model: 'sonnet', shell: 'PowerShell' },
  'claude-sonnet-bash': { host: 'claude', model: 'sonnet', shell: 'Bash' },
  'claude-haiku-pwsh': { host: 'claude', model: 'haiku', shell: 'PowerShell' },
  'claude-haiku-bash': { host: 'claude', model: 'haiku', shell: 'Bash' },
  'codex-default-pwsh': { host: 'codex', model: null, shell: 'PowerShell' },
  'codex-default-bash': { host: 'codex', model: null, shell: 'Bash' },
  'pi-default-pwsh': { host: 'pi', model: null, shell: 'PowerShell' },
  'pi-default-bash': { host: 'pi', model: null, shell: 'Bash' },
};
const ARMS = ['cli', 'api'];
const REFERENCE = join(PLUGIN_ROOT, 'skills', 'wf', 'reference');
const TIMEOUT_MS = 15 * 60_000;

function flags(argv) {
  const opt = {};
  for (let i = 0; i < argv.length; i += 1) {
    const name = argv[i].replace(/^--/, '');
    if (name === 'yes') opt.yes = true;
    else opt[name] = argv[(i += 1)];
  }
  return opt;
}

export function promptOf(task, arm, cell, root) {
  const wf = `node "${join(PLUGIN_ROOT, 'scripts', 'wf.mjs')}"`;
  return [
    `You work in the git repository at ${root}. It has one /wf workflow, ${SLUG}, in .ai/workflows/${SLUG}/.`,
    `The wf command line is: ${wf}. Run ${wf} help <command> for the forms of a command.`,
    `Read this reference before you start: ${join(REFERENCE, '_records.md')}.`,
    ...(arm === 'api' ? [`Read this reference too: ${join(REFERENCE, '_api.md')}. It says when to write a script for ${wf} run.`] : []),
    `Run each shell command with the ${cell.shell} tool.`,
    `Task: ${task.prompt}`,
    'When the task is done, give your final answer.',
  ].join('\n');
}

function command(cell, prompt, root) {
  if (cell.host === 'claude') return ['claude', ['-p', prompt, '--model', cell.model, '--output-format', 'stream-json', '--verbose', '--permission-mode', 'bypassPermissions', '--max-turns', '60']];
  if (cell.host === 'codex') return ['codex', ['exec', '--json', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-C', root, prompt]];
  // The pi command line: check its flags before a pi run.
  return ['pi', ['-p', prompt, '--mode', 'json']];
}

async function main() {
  const opt = flags(process.argv.slice(2));
  const cells = (opt.cells ? opt.cells.split(',') : Object.keys(CELLS)).map((c) => {
    if (!CELLS[c]) throw new Error(`no cell ${c}; the cells are: ${Object.keys(CELLS).join(', ')}`);
    return [c, CELLS[c]];
  });
  const arms = opt.arms ? opt.arms.split(',') : ARMS;
  const tasks = opt.tasks ? TASKS.filter((t) => opt.tasks.split(',').includes(t.id)) : TASKS;
  const runs = Number(opt.runs ?? 5);
  const out = resolve(opt.out ?? join(PLUGIN_ROOT, '.scratch', 'evals', 'code-mode'));
  const total = cells.length * arms.length * tasks.length * runs;
  process.stdout.write(`${total} run(s): ${cells.length} cell(s) × ${arms.length} arm(s) × ${tasks.length} task(s) × ${runs}\ncells: ${cells.map(([c]) => c).join(', ')}\nout: ${out}\n`);
  if (!opt.yes) { process.stdout.write('Nothing started. Add --yes after the person said yes to these runs and their usage.\n'); return 0; }
  if (arms.includes('api') && !existsSync(join(REFERENCE, '_api.md'))) throw new Error('the api arm needs skills/wf/reference/_api.md');
  mkdirSync(out, { recursive: true });
  for (const [name, cell] of cells) {
    for (const arm of arms) {
      for (const task of tasks) {
        for (let n = 1; n <= runs; n += 1) {
          const at = join(out, name, arm, task.id, String(n));
          const f = makeFixture(join(at, 'repo'));
          const prompt = promptOf(task, arm, cell, f.root);
          const [cmd, args] = command(cell, prompt, f.root);
          const t0 = Date.now();
          const r = spawnSync(cmd, args, { cwd: f.root, encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: 256 * 1024 * 1024, env: { ...process.env, SDLC_HOME: join(at, 'home') }, shell: process.platform === 'win32' });
          const wallMs = Date.now() - t0;
          writeFileSync(join(at, 'transcript.jsonl'), r.stdout ?? '');
          writeFileSync(join(at, 'stderr.txt'), r.stderr ?? '');
          const m = measure(cell.host, r.stdout ?? '');
          const c = task.check(f, m.answer);
          const row = { cell: name, arm, task: task.id, class: task.class, run: n, pass: c.pass, why: c.why, exit: r.status, ...m, answer: undefined, wallMs };
          appendFileSync(join(out, 'results.jsonl'), `${JSON.stringify(row)}\n`);
          process.stdout.write(`${c.pass ? 'pass' : 'fail'} ${name} ${arm} ${task.id} #${n}: ${m.calls} calls, ${m.tokens} tokens, ${Math.round(wallMs / 1000)} s\n`);
        }
      }
    }
  }
  return 0;
}

process.exitCode = await main().catch((e) => { process.stderr.write(`run: ${e.message}\n`); return 1; });
