// Who runs a command: an agent of a run, or the session of the person.
//
// A launcher that starts each agent as its own process (the Codex driver, an orchestrate builder
// or validator) sets WF_ACTOR in the environment of that process. On a host whose sub-agents
// share the process of the session, a hook refuses the same commands for a sub-agent
// (hooks/pre-tool-use-all.mjs). The session of the person has no WF_ACTOR.
//
// An agent of a run writes nothing in the name of the person: no entry by the person, no steer,
// no approval, no rule of the project, no standing answer. It holds the question and waits.
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { agentFix, refuse } from './fix.mjs';

export const ACTOR_ENV = 'WF_ACTOR';

/** The name of the agent that runs this process, or null in the session of the person. */
export const callerActor = (env = process.env) => String(env[ACTOR_ENV] ?? '').trim() || null;

/** Refuse `what` (for example "write a steer") when an agent of a run runs the command. */
export function personOnly(what, env = process.env) {
  const actor = callerActor(env);
  if (!actor) return;
  throw refuse(`${actor} is an agent of a run: it does not ${what} in the name of the person`, agentFix('Hold the question for the person with decide hold and wait for the answer with decide wait. For a choice of your own, record it with --by stage or --by delegate. For another agent, post in the talk.'));
}

/**
 * What an entries file of decide add does in the name of the person, or null. A file that the
 * test cannot read yet (one the same command writes) is refused: write the file first.
 */
function personInFile(path, cwd) {
  let entries;
  try {
    entries = JSON.parse(readFileSync(isAbsolute(path) ? path : resolve(cwd ?? process.cwd(), path), 'utf8'));
  } catch {
    return 'record entries from a file that cannot be read before the command runs (write the file in an earlier call)';
  }
  const list = Array.isArray(entries) ? entries : [entries];
  if (list.some((e) => e?.by === 'person')) return 'record an entry by the person';
  if (list.some((e) => e?.kind === 'steer' || e?.kind === 'approval')) return 'write a steer or an approval';
  return null;
}

/** The commands of wf that only the session of the person runs, as one test of a shell command line. */
export function personOnlyCommand(command, { cwd } = {}) {
  const c = String(command ?? '');
  // A wf script by its name, or by a shell variable that an earlier command set (node $wf ...).
  if (!/\b(wf|campaign|orchestrate)\.mjs\b/.test(c) && !/\bnode(?:\.exe)?\s+["']?\$(?:env:)?\{?[A-Za-z_]/.test(c)) return null;
  if (/\bdecide\s+add\b/.test(c) && /--by[=\s]+["']?person\b/.test(c)) return 'record an entry by the person';
  if (/\bdecide\s+add\b/.test(c) && /--kind[=\s]+["']?(steer|approval)\b/.test(c)) return 'write a steer or an approval';
  // decide add --file: the entries are in the file, so the test reads it.
  const file = /\bdecide\s+add\b/.test(c) && c.match(/--file[=\s]+(?:"([^"]+)"|'([^']+)'|(\S+))/);
  if (file) {
    const what = personInFile(file[1] ?? file[2] ?? file[3], cwd);
    if (what) return what;
  }
  if (/\brule\s+(add|adopt|end)\b/.test(c)) return 'change a rule of the project';
  if (/\breport\s+decide\b/.test(c)) return 'decide what to build';
  if (/\bstanding\s+set\b/.test(c)) return 'set a standing answer';
  if (/\bconsent\s+grant\b/.test(c)) return 'grant consent';
  if (/\bcontract\s+approve\b|\bdigest\b|\bchange\s+(accept|refuse)\b/.test(c) && /\b(campaign|orchestrate)\.mjs\b/.test(c)) return 'record an approval';
  return null;
}
