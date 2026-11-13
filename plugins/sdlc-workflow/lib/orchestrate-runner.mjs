// lib/orchestrate-runner.mjs — how /wf orchestrate launches an agent that is not a subagent of
// the lead's own host: a Claude Code, Codex or pi agent, through `hc` (herdr core) when it is
// installed, and through the non-interactive command of the program when it is not.
//
// Every `hc` call of the plugin is in this file. The rules come from the manual that
// `hc --skill` prints: an agent runs interactively and in the background, the first task goes in
// `hc run`, a wait is `hc wait`, Codex runs with --no-daemon, and the result of an agent is a
// file, never its screen.

import { spawnSync } from 'node:child_process';

import { agentFix, personFix, refuse } from './fix.mjs';

const str = (v) => String(v ?? '').trim();

/** The agent programs that a run can launch, and the vendor names that each one can serve. */
export const PROGRAMS = Object.freeze(['claude', 'codex', 'pi']);
/** The label that marks each terminal of a run. */
export const RUN_LABEL = 'wf.run';
export const ROLE_LABEL = 'wf.role';
const WAIT_SECONDS = 180;

/** One process, with no shell. `run` is injectable for the tests. */
export function exec(program, args, { cwd = process.cwd(), timeoutMs = 60_000, input = undefined } = {}) {
  const r = spawnSync(program, args, { cwd, encoding: 'utf8', windowsHide: true, timeout: timeoutMs, input, maxBuffer: 64 * 1024 * 1024, shell: false });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', error: r.error ?? null };
}

/** True when `program --version` (or the given args) runs on this machine. */
export function onPath(program, { run = exec, args = ['--version'] } = {}) {
  const r = run(process.platform === 'win32' ? 'cmd.exe' : program, process.platform === 'win32' ? ['/d', '/s', '/c', program, ...args] : args, { timeoutMs: 20_000 });
  return !r.error && r.status === 0;
}

/**
 * The roster of this machine: `hc`, each agent program that runs, and each model of the tier
 * data that one of those programs can run.
 */
export function rosterOf(tiers, { run = exec, host = null, check = false } = {}) {
  const hc = onPath('hc', { run });
  const programs = Object.fromEntries(PROGRAMS.map((p) => [p, onPath(p, { run })]));
  const agents = [];
  // With `check`, each provider of pi is asked once whether its sign-in is ready. A ready
  // sign-in can still have no balance: only a dispatch shows that.
  const providerState = new Map();
  const signIn = (provider) => {
    if (!check || !provider) return null;
    if (!providerState.has(provider)) {
      const args = ['auth', 'check', '--provider', provider, '--json'];
      const r = run(process.platform === 'win32' ? 'cmd.exe' : 'pi', process.platform === 'win32' ? ['/d', '/s', '/c', 'pi', ...args] : args, { timeoutMs: 30_000 });
      const out = hcJson(r);
      providerState.set(provider, out?.status === 'ready' ? null : out?.reason ?? out?.status ?? 'unknown');
    }
    return providerState.get(provider);
  };
  for (const [id, m] of Object.entries(tiers?.models ?? {})) {
    if (m.tier === 'refused') continue;
    for (const [program, how] of Object.entries(m.runs ?? {})) {
      if (!programs[program]) continue;
      agents.push({ id: `${program}:${id}`, program, model: id, tier: m.tier, vendor: m.vendor ?? null, 'judge-only': Boolean(m['judge-only']), launch: hc ? 'hc' : 'direct', ...(how?.provider ? { provider: how.provider } : {}), ...(how?.model ? { 'run-as': how.model } : {}), ...(program === 'pi' && signIn(how?.provider) ? { 'not-ready': signIn(how.provider) } : {}) });
    }
    if (host && m.host?.[host]) agents.push({ id: `host:${id}`, program: 'host', model: id, tier: m.tier, vendor: m.vendor ?? null, 'judge-only': Boolean(m['judge-only']), launch: 'host-subagent', alias: m.host[host] });
  }
  return { hc, programs, host, agents };
}

/** The name of the terminal of one unit: unique among the live terminals, 1 to 32 characters. */
export function terminalName(slug, role, n) {
  const base = `${str(slug).replace(/[^a-z0-9_-]/gi, '-').toLowerCase().slice(0, 14)}-${str(role).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8)}-${n}`;
  return base.replace(/^-+/, '').slice(0, 32);
}

/** The first message of an agent: it names the task file, so no task text passes through a shell. */
export const firstMessage = (taskFile) => `Read the file ${taskFile} now and do exactly what it says. It is your whole task. Start no other work.`;

/**
 * The command line of an agent program, as a list of arguments.
 * `interactive` is the form for `hc`; the other form runs once and exits.
 * Each agent writes inside the checkout with no prompt, and nothing outside it.
 */
export function agentArgv({ program, model, provider = null, effort = 'high', message, interactive, dirs = [] }) {
  // `dirs` are folders outside the checkout that this one agent may also use: the holdout,
  // for the roles that read or write it. pi has no sandbox, so it takes no such flag.
  const extra = dirs.flatMap((d) => ['--add-dir', d]);
  if (program === 'codex') {
    const base = ['--model', model, '--sandbox', 'workspace-write', '--ask-for-approval', 'never', ...extra, '-c', `model_reasoning_effort="${effort}"`];
    return interactive ? ['codex', '--no-daemon', ...base, message] : ['codex', 'exec', ...base, message];
  }
  if (program === 'pi') {
    const base = [...(provider ? ['--provider', provider] : []), '--model', model, '--thinking', effort];
    return interactive ? ['pi', ...base, message] : ['pi', ...base, '--print', message];
  }
  if (program === 'claude') {
    // `auto` and not `acceptEdits`: with `acceptEdits` the agent stops at each shell command and
    // asks a person, so it never ends a unit. `auto` is the choice of the person (2026-11-13).
    // It is the program's own judgement of each action, and not a sandbox.
    const base = ['--model', model, '--permission-mode', 'auto', ...extra, '--effort', effort];
    return interactive ? ['claude', ...base, message] : ['claude', ...base, '--print', message];
  }
  throw refuse(`${program} is not an agent program of a run: the programs are ${PROGRAMS.join(', ')}`, agentFix('Pick an agent of the roster.'));
}

const hcJson = (r) => { try { return JSON.parse(r.stdout); } catch { return null; } };
const hcError = (r) => { try { return JSON.parse(r.stderr)?.error?.message ?? r.stderr.trim(); } catch { return (r.stderr || r.stdout).trim(); } };

/**
 * Launch one agent. With `hc`, the agent runs interactively in a background terminal that
 * outlives the lead, and the call returns at once: `{ launch: 'hc', terminal, sent }`.
 * Without `hc`, the program runs once and the call returns when it ends: `{ launch: 'direct', status }`.
 */
export function launch({ hc, slug, role, n, cwd, program, model, provider, effort, taskFile, dirs = [] }, { run = exec, directTimeoutMs = 4 * 60 * 60_000 } = {}) {
  const message = firstMessage(taskFile);
  if (!hc) {
    const [bin, ...args] = agentArgv({ program, model, provider, effort, message, interactive: false, dirs });
    const r = run(process.platform === 'win32' ? 'cmd.exe' : bin, process.platform === 'win32' ? ['/d', '/s', '/c', bin, ...args] : args, { cwd, timeoutMs: directTimeoutMs });
    return { launch: 'direct', status: r.error ? 'error' : r.status === 0 ? 'done' : 'error', code: r.status, tail: (r.stderr || r.stdout).slice(-600) };
  }
  const name = terminalName(slug, role, n);
  const argv = agentArgv({ program, model, provider, effort, message, interactive: true, dirs });
  const r = run('hc', ['run', '--bg', '--json', '--name', name, '--cwd', cwd, '--label', `${RUN_LABEL}=${slug}`, '--label', `${ROLE_LABEL}=${role}`, '--outlive-parent', '--', ...argv], { cwd, timeoutMs: 120_000 });
  const out = hcJson(r);
  if (r.error || r.status !== 0 || !out) {
    throw refuse(`hc run did not start the agent: ${hcError(r) || 'no output'}`, agentFix('Read the error. When a terminal of this name is live already, the unit has an agent: run wait for the unit, and do not start a second one.'));
  }
  // The task is an argument of the agent program, so the program has it from its start.
  // `first_message` is there only when hc itself sent a task (a template launch).
  const sent = out.first_message?.sent ?? null;
  return { launch: 'hc', terminal: name, address: out.address ?? null, ...(sent === false ? { 'not-sent': out.first_message?.reason ?? 'unknown' } : {}) };
}

/** The observed state of one terminal of `hc`: `{ state, status }`, or null when it is gone. */
export function terminalOf(name, { run = exec } = {}) {
  const r = run('hc', ['get', name, '--json'], { timeoutMs: 30_000 });
  const out = hcJson(r);
  if (!out) return null;
  const t = out.terminal ?? out;
  // `status` is { app, msg, state } for an agent program, and null for a plain program.
  return { state: t.state ?? null, status: t.status?.state ?? null, note: t.status?.msg ?? null, address: t.address ?? null, labels: t.labels ?? {}, name: t.name ?? null, turn: t.turn ?? 0 };
}

/**
 * Wait for one terminal with `hc wait`. A timeout is a check-in, not a failure: the result
 * says `working`, and the caller waits again.
 */
export function waitFor(name, { run = exec, seconds = WAIT_SECONDS } = {}) {
  // `ended` says that the wait ended, not the program: `reason` and `status` say why.
  const w = hcJson(run('hc', ['wait', name, '--json', '--timeout', String(seconds)], { timeoutMs: (seconds + 30) * 1000 }));
  const t = terminalOf(name, { run });
  if (!t) return { terminal: name, status: 'gone' };
  if (t.state === 'finished' || w?.exit_code != null) return { terminal: name, status: 'exited', code: w?.exit_code ?? null };
  // An agent program with no status yet has not started: a start dialog can hold it.
  if (t.status == null) return { terminal: name, status: 'starting' };
  // After a timeout the terminal itself says whether the agent still works.
  const status = (!w || w.reason === 'timeout' ? t.status : w.status ?? t.status) ?? 'working';
  // An agent that is idle before its first turn ended has not started the task yet.
  if (status === 'idle' && !((w?.turn ?? t.turn) > 0)) return { terminal: name, status: 'working', idle: true, note: 'the agent is idle and no turn is counted: it has not started, or it ended its first turn' };
  return { terminal: name, status, ...(t.note ? { note: t.note } : {}) };
}

/** The last lines of the screen of a terminal, for the journal after a failure or a block. */
export function screenOf(name, { run = exec, lines = 60 } = {}) {
  const r = run('hc', ['read', '--lines', String(lines), name], { timeoutMs: 30_000 });
  return (r.stdout || '').slice(-4000);
}

/**
 * Send text to a live agent, and check that its turn started. The text can land in the input
 * of the agent with no submit: when the agent is still idle on the same turn after a short
 * wait, the script presses Enter once. Never with --force: a blocked agent asks a person.
 */
export function sendText(name, text, { run = exec, settleSeconds = 4 } = {}) {
  const before = terminalOf(name, { run });
  const r = run('hc', ['send', name, text, '--json'], { timeoutMs: 120_000 });
  if (r.error || r.status !== 0) {
    throw refuse(`hc send did not reach ${name}: ${hcError(r) || 'no output'}`, agentFix('Run wait for the unit and read its status. A blocked agent asks a person: read its screen, and do not send with --force.'));
  }
  const started = () => {
    run('hc', ['wait', name, '--json', '--timeout', String(settleSeconds)], { timeoutMs: (settleSeconds + 30) * 1000 });
    const t = terminalOf(name, { run });
    return !t || t.status !== 'idle' || t.turn !== (before?.turn ?? 0);
  };
  if (started()) return { terminal: name, sent: true };
  run('hc', ['keys', name, 'enter', '--json'], { timeoutMs: 30_000 });
  return { terminal: name, sent: true, 'pressed-enter': true, ...(started() ? {} : { 'not-started': 'The agent is still idle. Read its screen before you send again: the text may be in its input.' }) };
}

/** Send one more turn to a live agent: a fix unit for the builder that did the first unit. */
export const sendTurn = (name, taskFile, opts = {}) => sendText(name, firstMessage(taskFile), opts);

/** End one terminal of this run and remove it. Only a terminal that carries the label of the run. */
export function endTerminal(slug, name, { run = exec } = {}) {
  const mine = terminalsOf(slug, { run }).some((t) => t.name === name);
  if (!mine) throw refuse(`${name} is not a terminal of the run ${slug}`, personFix('End this terminal yourself when it should end: the run cleans up only the terminals that it started.'));
  run('hc', ['kill', name, '--json'], { timeoutMs: 30_000 });
  run('hc', ['rm', name, '--json'], { timeoutMs: 30_000 });
  return { terminal: name, ended: true };
}

/** The terminals that carry the label of a run, live and finished. */
export function terminalsOf(slug, { run = exec } = {}) {
  const r = run('hc', ['ls', '--all', '--json'], { timeoutMs: 30_000 });
  const out = hcJson(r);
  // `hc ls` prints no labels, so each named terminal is read with `hc get`.
  const found = [];
  for (const t of out?.terminals ?? []) {
    if (!t.name) continue;
    const full = terminalOf(t.name, { run });
    if (full?.labels?.[RUN_LABEL] !== slug) continue;
    found.push({ name: t.name, address: t.address, role: full.labels[ROLE_LABEL] ?? null, state: full.state, status: full.status, agent: t.agent ?? null });
  }
  return found;
}
