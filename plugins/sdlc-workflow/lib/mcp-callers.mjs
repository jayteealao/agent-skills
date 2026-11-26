// Who calls the wf MCP server, as the host tells its hooks.
//
// The server sees only the arguments of a call, which the agent writes. The PreToolUse hook sees
// the host's own data: `agent_id` and `agent_type` for a sub-agent or a Workflow agent, none for
// the main session. Before the call it writes one row, named by the `tool_use_id` of the call; the
// server joins the row by `_meta["claudecode/toolUseId"]`, reads it once and deletes it. A call
// with no row comes from a host with no such hook, or a key that changed: its caller is `unknown`.
//
// The folder is under the home of the user, outside every project, so the code of wf_run (which
// runs with no file writes) cannot write a row. An agent with a shell can still write files of the
// user: this guards against mistakes, not against a hostile agent.
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { writeFileAtomic } from './atomic-write.mjs';
import { sdlcHomeDir } from './home.mjs';

/** Rows older than this are litter: a call that was denied, or asked and never answered. */
const ROW_TTL_MS = 24 * 3600_000;

export const callersDir = (env = process.env) => env.SDLC_MCP_CALLERS_DIR || join(sdlcHomeDir(), 'mcp-callers');

const fileOf = (id, env) => {
  const safe = String(id ?? '').replace(/[^A-Za-z0-9_-]/g, '');
  return safe ? join(callersDir(env), `${safe}.json`) : null;
};

/** Write the row of one call. Called by the hook; never throws. */
export function writeCaller(input, env = process.env) {
  try {
    const file = fileOf(input?.tool_use_id, env);
    if (!file) return false;
    mkdirSync(callersDir(env), { recursive: true });
    const row = {
      tool_use_id: input.tool_use_id,
      agent_id: input.agent_id ?? null,
      agent_type: input.agent_type ?? null,
      cwd: input.cwd ?? null,
      session_id: input.session_id ?? null,
      at: new Date().toISOString(),
    };
    writeFileAtomic(file, `${JSON.stringify(row)}\n`);
    pruneCallers(env);
    return true;
  } catch {
    return false;
  }
}

/** Read the row of one call and delete it: a row serves one call. Null with no row. */
export function takeCaller(id, env = process.env) {
  const file = fileOf(id, env);
  if (!file) return null;
  let row = null;
  try { row = JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
  try { rmSync(file, { force: true }); } catch { /* the row is read; a second read finds it gone or stale */ }
  return row && row.tool_use_id === id ? row : null;
}

/** The caller name of a row: `session` for the main session, `agent:<type>` for an agent, else `unknown`. */
export function callerOf(row) {
  if (!row) return 'unknown';
  if (row.agent_id) return `agent:${String(row.agent_type || 'agent').replace(/[^A-Za-z0-9_.:-]/g, '')}`;
  return 'session';
}

function pruneCallers(env) {
  const dir = callersDir(env);
  const now = Date.now();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    try { if (now - statSync(join(dir, f)).mtimeMs > ROW_TTL_MS) rmSync(join(dir, f), { force: true }); } catch { /* gone */ }
  }
}

// The heartbeat of the server of a session. The server writes it while it runs; the shell note of
// the hook is left out when it is stale, because the CLI is then the right way to call wf.
export const BEAT_MS = 30_000;
const beatFile = (session, env) => join(callersDir(env), 'beats', `${String(session ?? '').replace(/[^A-Za-z0-9_-]/g, '') || 'none'}.beat`);

/** Write the beat of the server of a session. Never throws. */
export function writeBeat(session, env = process.env) {
  try { writeFileAtomic(beatFile(session, env), `${process.pid}\n`); return true; } catch { return false; }
}

/** True when the server of the session wrote its beat in the last three beats. */
export function serverAlive(session, env = process.env, now = Date.now()) {
  try { return now - statSync(beatFile(session, env)).mtimeMs < 3 * BEAT_MS; } catch { return false; }
}
