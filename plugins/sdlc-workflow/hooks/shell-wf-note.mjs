#!/usr/bin/env node
/**
 * PreToolUse(Bash|PowerShell): a shell call of wf.mjs or a sibling script, on Claude, gets a note
 * with the call of the wf MCP server that does the same. The call still runs: this check never
 * blocks. Each such call adds one line to mcp-shell-calls.jsonl of the state folder (~/.sdlc), so the share of shell
 * calls can be counted.
 *
 * Exports `run(input)` for the folded `pre-tool-use-all` entry.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isEntry, runStandalone } from '../lib/hook-runner.mjs';
import { noteBeforeToolCall } from '../lib/hook-utils.mjs';
import { sdlcHomeDir } from '../lib/home.mjs';
import { serverAlive } from '../lib/mcp-callers.mjs';

export const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);
const SCRIPT_CALL = /\bnode(?:\.exe)?\s+["']?[^"'\s]*[\\/](?:wf|campaign|orchestrate|optimize|goal|prototype|ideate-sources|design-boards)\.mjs["']?[^|;&>\r\n]*/;

export const shellCallsFile = (env = process.env) => env.SDLC_MCP_SHELL_CALLS || join(sdlcHomeDir(), 'mcp-shell-calls.jsonl');

/** The tool call of the first call of a wf script in a shell command, or null. */
export async function toolCallOf(command) {
  const m = SCRIPT_CALL.exec(String(command ?? ''));
  if (!m) return null;
  const { parseCliLine, renderCall } = await import('../lib/ops/render.mjs');
  // A single-quoted token is one word, as a double-quoted one is.
  const line = m[0].replace(/'([^']*)'/g, '"$1"').trim();
  const c = parseCliLine(line);
  return { op: c?.op ?? null, call: c ? renderCall(c.op, c.fields) : null };
}

export async function run(input, env = process.env) {
  if (!SHELL_TOOLS.has(String(input?.tool_name ?? ''))) return;
  // With no live server of this session, the shell is the right way to call wf: no note.
  if (!serverAlive(input?.session_id, env)) return;
  const found = await toolCallOf(input?.tool_input?.command);
  if (!found) return;
  try {
    const file = shellCallsFile(env);
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), op: found.op, agent: input?.agent_type ?? (input?.agent_id ? 'agent' : null), session: input?.session_id ?? null })}\n`);
  } catch { /* the count is a measure, never a gate */ }
  noteBeforeToolCall(found.call
    ? `wf: the wf tools do this call without a shell: \`${found.call}\`. Make the next call of wf that way; the shell form is for when the server is down.`
    : 'wf: the wf tools (wf_context, wf_read, wf_run, …) make the calls of wf without a shell. Use them; the shell form is for when the server is down.');
}

if (isEntry('shell-wf-note')) runStandalone('shell-wf-note', run);
