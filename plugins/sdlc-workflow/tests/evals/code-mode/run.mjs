#!/usr/bin/env node
// The runner of the code-mode eval. Each run makes a fresh fixture, gives one task to one host
// in one arm, saves the transcript, checks the end state and appends one row to results.jsonl.
//
// WARNING: a run starts `claude -p`, `codex exec` or pi, and spends the usage limits of that
// host. Without --yes this prints the list of runs and starts nothing.
//
//   node tests/evals/code-mode/run.mjs [--cells c,...] [--arms cli] [--tasks t,...]
//                                      [--runs 5] [--out <dir>] [--yes]
//
// Arms: cli gets the command line and the records reference. mcp also gets the wf server, so the
// wf tools and the hooks run as they do for a user; it runs on Claude only. Both arms load the
// plugin of this tree and no other MCP server, so the two differ only by the wf tools.
// Cells: <host>-<model>-<shell>; the shell is the tool that the prompt names. A -sub cell hands
// the task to one sub-agent, so the calls are those of an agent and not of the main session.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PLUGIN_ROOT, SLUG, makeFixture } from './fixture.mjs';
import { measure } from './measure.mjs';
import { TASKS } from './tasks.mjs';

export const CELLS = {
  'claude-sonnet-pwsh': { host: 'claude', model: 'sonnet', shell: 'PowerShell' },
  'claude-sonnet-bash': { host: 'claude', model: 'sonnet', shell: 'Bash' },
  'claude-haiku-pwsh': { host: 'claude', model: 'haiku', shell: 'PowerShell' },
  'claude-haiku-bash': { host: 'claude', model: 'haiku', shell: 'Bash' },
  'claude-sonnet-sub': { host: 'claude', model: 'sonnet', shell: 'PowerShell', sub: true },
  'claude-haiku-sub': { host: 'claude', model: 'haiku', shell: 'PowerShell', sub: true },
  // A small control: fewer runs are enough.
  'claude-opus-pwsh': { host: 'claude', model: 'opus', shell: 'PowerShell' },
  'codex-default-pwsh': { host: 'codex', model: null, shell: 'PowerShell' },
  'codex-default-bash': { host: 'codex', model: null, shell: 'Bash' },
  'pi-default-pwsh': { host: 'pi', model: null, shell: 'PowerShell' },
  'pi-default-bash': { host: 'pi', model: null, shell: 'Bash' },
};
const ARMS = ['cli', 'mcp'];
/** The tools of the wf server when the plugin is loaded. */
const WF_SERVER = 'mcp__plugin_sdlc-workflow_wf';
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
  const how = arm === 'mcp'
    ? ['The wf tools (wf_context, wf_read, wf_query, wf_run, wf_step, wf_decide, wf_wait, wf_job, wf_act, wf_person) are loaded. wf_query { "op": "help" } gives the operations and their fields.']
    : [`The wf command line is: ${wf}. Run ${wf} help <command> for the forms of a command.`];
  const lines = [
    `You work in the git repository at ${root}. It has one /wf workflow, ${SLUG}, in .ai/workflows/${SLUG}/.`,
    ...how,
    `Read this reference before you start: ${join(REFERENCE, '_records.md')}.`,
    `Run each shell command with the ${cell.shell} tool.`,
    `Task: ${task.prompt}`,
    'When the task is done, give your final answer.',
  ];
  // A -sub cell: the main session only hands the task on, and reports what the agent answered.
  return cell.sub
    ? `Start one sub-agent with the Agent tool and give it this whole brief as its prompt. Do no part of the task yourself. When it ends, give its final answer as your own.\n\n${lines.join('\n')}`
    : lines.join('\n');
}

/**
 * The MCP config of the mcp arm: the wf server alone, by the name that the plugin gives it, so the
 * tools and the matchers of the hooks are those of a user. --strict-mcp-config drops the server
 * of a plugin, and every server of the machine, so the arm declares it here.
 */
export function mcpConfig() {
  return { mcpServers: { 'plugin_sdlc-workflow_wf': { type: 'stdio', command: 'node', args: [join(PLUGIN_ROOT, 'mcp', 'server.mjs')], env: { CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT } } } };
}

function command(cell, prompt, root, arm, at) {
  // No permission bypass: the agent may read and write files and run node, and nothing else. The mcp
  // arm loads the plugin and allows the tools of its server. wf_person asks the person, so in -p it is denied.
  if (cell.host === 'claude') {
    const tools = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash(node:*)', 'PowerShell(node:*)', ...(cell.sub ? ['Agent'] : []), ...(arm === 'mcp' ? [WF_SERVER] : [])];
    return ['claude', ['-p', prompt, '--model', cell.model, '--output-format', 'stream-json', '--verbose', '--max-turns', '60',
      // No MCP server of the machine in either arm; the mcp arm gets the wf server alone.
      '--plugin-dir', PLUGIN_ROOT, '--strict-mcp-config',
      ...(arm === 'mcp' ? ['--mcp-config', writeConfig(at)] : ['--disallowedTools', WF_SERVER]), '--allowedTools', tools.join(',')]];
  }
  if (arm === 'mcp') throw new Error(`the mcp arm runs on Claude only; ${cell.host} uses the command line`);
  if (cell.host === 'codex') return ['codex', ['exec', '--json', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-C', root, prompt]];
  // The pi command line: check its flags before a pi run.
  return ['pi', ['-p', prompt, '--mode', 'json']];
}

function writeConfig(at) {
  const file = join(at, 'mcp.json');
  writeFileSync(file, JSON.stringify(mcpConfig()));
  return file;
}

/**
 * The environment of a run: its own SDLC home, and no variable of a Claude Code session that
 * started the runner, so the host starts as a session of its own.
 */
function envOf(cell, at) {
  const env = { ...process.env, SDLC_HOME: join(at, 'home') };
  for (const k of Object.keys(env)) if (k === 'CLAUDECODE' || k.startsWith('CLAUDE_')) delete env[k];
  return env;
}

// claude is an executable, so its arguments go to it as they are. A shell joins the arguments
// into one line, which breaks a prompt with quotes; codex and pi may be .cmd files on Windows.
const needsShell = (cell) => process.platform === 'win32' && cell.host !== 'claude';

async function main() {
  const opt = flags(process.argv.slice(2));
  const cells = (opt.cells ? opt.cells.split(',') : Object.keys(CELLS)).map((c) => {
    if (!CELLS[c]) throw new Error(`no cell ${c}; the cells are: ${Object.keys(CELLS).join(', ')}`);
    return [c, CELLS[c]];
  });
  const arms = opt.arms ? opt.arms.split(',') : ARMS;
  for (const a of arms) if (!ARMS.includes(a)) throw new Error(`no arm ${a}; the arms are: ${ARMS.join(', ')}`);
  // The mcp arm is a Claude arm: a cell of another host runs the cli arm only.
  const armsOf = (cell) => arms.filter((a) => a !== 'mcp' || cell.host === 'claude');
  const tasks = opt.tasks ? TASKS.filter((t) => opt.tasks.split(',').includes(t.id)) : TASKS;
  const runs = Number(opt.runs ?? 5);
  const out = resolve(opt.out ?? join(PLUGIN_ROOT, '.scratch', 'evals', 'code-mode'));
  const total = cells.reduce((n, [, cell]) => n + armsOf(cell).length * tasks.length * runs, 0);
  process.stdout.write(`${total} run(s): ${cells.length} cell(s), arms ${arms.join('+')} (mcp on Claude only), ${tasks.length} task(s), ${runs} each\ncells: ${cells.map(([c]) => c).join(', ')}\nout: ${out}\n`);
  if (!opt.yes) { process.stdout.write('Nothing started. Add --yes after the person said yes to these runs and their usage.\n'); return 0; }
  // The rows of an older eval stay where they are: a new pass gets its own folder.
  if (existsSync(join(out, 'results.jsonl'))) throw new Error(`${out} holds the results of an earlier pass; give a new folder with --out`);
  mkdirSync(out, { recursive: true });
  for (const [name, cell] of cells) {
    for (const arm of armsOf(cell)) {
      for (const task of tasks) {
        for (let n = 1; n <= runs; n += 1) {
          const at = join(out, name, arm, task.id, String(n));
          const f = makeFixture(join(at, 'repo'));
          const prompt = promptOf(task, arm, cell, f.root);
          const [cmd, args] = command(cell, prompt, f.root, arm, at);
          const t0 = Date.now();
          const r = spawnSync(cmd, args, { cwd: f.root, encoding: 'utf8', input: '', timeout: TIMEOUT_MS, maxBuffer: 256 * 1024 * 1024, env: envOf(cell, at), shell: needsShell(cell) });
          const wallMs = Date.now() - t0;
          writeFileSync(join(at, 'transcript.jsonl'), r.stdout ?? '');
          writeFileSync(join(at, 'stderr.txt'), r.stderr ?? '');
          const m = measure(cell.host, r.stdout ?? '');
          // A cell whose host has no tool of the named shell measures nothing: it stops at once.
          if (cell.host === 'claude' && Array.isArray(m.tools) && !m.tools.includes(cell.shell)) {
            throw new Error(`${name}: the host has no ${cell.shell} tool; its tools are: ${m.tools.join(', ')}`);
          }
          // A usage limit ends every later run at once too: the eval stops, and the run is not recorded.
          if (m.error && /limit|rate|overloaded|credit/i.test(m.error)) throw new Error(`${name} ${arm} ${task.id} #${n}: ${m.error}; nothing more runs`);
          if (cell.host === 'claude' && !m.tools) throw new Error(`${name}: the transcript has no init event; see ${join(at, 'stderr.txt')}`);
          // An arm measures nothing when its tools are wrong: the cli arm has no wf tool, the mcp arm has them.
          const wfTools = m.tools ? m.tools.filter((t) => t.startsWith(WF_SERVER)).length : 0;
          if (cell.host === 'claude' && (arm === 'cli' ? wfTools > 0 : wfTools === 0)) throw new Error(`${name} ${arm}: the session had ${wfTools} wf tool(s); nothing more runs`);
          const other = m.tools ? m.tools.filter((t) => t.startsWith('mcp__') && !t.startsWith(WF_SERVER)) : [];
          if (other.length) throw new Error(`${name} ${arm}: the session had tools of another MCP server (${other.slice(0, 3).join(', ')}); nothing more runs`);
          const c = task.check(f, m.answer, { arm, sub: Boolean(cell.sub) });
          const row = { cell: name, arm, task: task.id, class: task.class, run: n, pass: c.pass, why: c.why, ...(c.forged ? { forged: c.forged } : {}), exit: r.status, ...m, answer: undefined, wallMs };
          appendFileSync(join(out, 'results.jsonl'), `${JSON.stringify(row)}\n`);
          process.stdout.write(`${c.pass ? 'pass' : 'fail'} ${name} ${arm} ${task.id} #${n}: ${m.calls} calls, ${m.tokens} tokens, ${Math.round(wallMs / 1000)} s\n`);
        }
      }
    }
  }
  return 0;
}

// Run only as a script: the tests and the probes import mcpConfig and promptOf.
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = await main().catch((e) => { process.stderr.write(`run: ${e.message}\n`); return 1; });
}
