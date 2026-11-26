#!/usr/bin/env node
// The wf MCP server: stdio JSON-RPC, one JSON message per line, no dependencies. It speaks the
// `initialize` handshake (2025-11-25) and the 2026-07-28 form with `server/discover`. Its stdout
// carries only the protocol; logs go to stderr. Each call runs in a worker process
// (lib/ops/invoke.mjs), so the server holds no state that a restart loses.
import readline from 'node:readline';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainModule } from '../lib/proc.mjs';
import { resolveProjectRoot } from '../lib/project-root.mjs';
import { BEAT_MS, callerOf, takeCaller, writeBeat } from '../lib/mcp-callers.mjs';
import { callTool, taskOf, taskCancel, toolList } from './tools.mjs';

const PLUGIN_ROOT = fileURLToPath(new URL('..', import.meta.url));
const VERSION = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'package.json'), 'utf8')).version;
const MODERN = '2026-07-28';
export const TASKS = 'io.modelcontextprotocol/tasks';
const LEGACY = ['2025-11-25', '2025-06-18', '2025-03-26'];
const TEXT_LIMIT = 40_000;
// The call sheet: which tool fits which job, and the calls that agents make most, in their exact
// form. Claude Code loads it at the start of every session, also when the tools are deferred, and
// cuts it at 4,096 characters (tests/unit/mcp-ops.test.mjs). wf_query help holds the rest.
export const INSTRUCTIONS = [
  'The wf tools run /wf: use them, not a shell call of wf.mjs. An op is the words of the CLI ("step done"); a tool also takes its last words ("done"). Each result has `next`: the calls to make after it. A write of records or steps returns `after`, the state it changed: it needs no read back.',
  'Start: wf_context { "slug", "stage" } gives the brief and its ready calls; wf_context { "argv": ["<word>", …] } runs the /wf words.',
  'Read, several in one call: wf_read { "slug", "items": [{ "op": "record get", "name": ["index", "03-slice"] }, { "op": "decide list" }, { "op": "findings list", "open": true }] }. Read with code: wf_query { "slug", "code": "return wf.findings.list().filter((f) => f.severity === \'HIGH\')" }; wf.help(\'findings\') lists the functions.',
  'Write records: wf_run { "op": "record set", "slug", "name": "03-slice", "path": ["slices[s4].status=in-progress", "slices[s5].status=in-progress"] } (several paths, one call); wf_run { "op": "slice drop", "slug", "slice", "reason" }; wf_run { "op": "findings set", "slug", "id", "status", "commit" }; wf_run { "slug", "code": "…" } makes several writes with code.',
  'Steps of a slice, several in order: wf_step { "slug", "slice", "steps": [{ "op": "start", "n": 4, "title": "Docs" }, { "op": "done", "n": 4, "no-change": true }] }; wf_step { "op": "done_next", "slug", "slice", "n", "sha": "HEAD", "next_title" } ends step n (sha, or "no-change": true) and starts n + 1.',
  'Decisions: wf_decide { "op": "decide add", "slug", "key", "question", "answer", "by": "stage" } records a choice of your own; "entries": [{ "key", "question", "answer", "by" }, …] records several. A question for the person: wf_decide { "op": "decide hold", "slug", "key", "question", "options": "a|b", "recommended" }, then wf_wait { "op": "decide wait", "slug", "key" }.',
  'Long work: wf_job { "op": "profile run", "suite": "fast" } starts a job and returns its id; wf_wait { "for": "job", "job": "<id>" } waits for its end; wf_wait { "for": "run", "slug", "cursor" } waits for the next event of a run. Call a wait again with its `next` until it ends.',
  'Git, GitHub, servers and worktrees: wf_act. wf_person records a choice that the person made in this session, and the host asks the person to confirm it: an agent never calls it, it holds the question.',
  'Help: wf_query { "op": "help", "command": "<word or op>" } gives the tool, the fields and the call of each op. A call with a wrong field fails with the field it most likely means and the corrected `call`.',
].join('\n');

const root = () => resolveProjectRoot(process.env.CLAUDE_PROJECT_DIR || process.cwd());
const log = (...a) => process.stderr.write(`wf-mcp: ${a.join(' ')}\n`);
const send = (o) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...o })}\n`);

/** The tool result: the same JSON as text and as structured content, cut at the text limit. */
export function toolResult(r) {
  let text = JSON.stringify(r);
  let structured = r;
  if (text.length > TEXT_LIMIT) {
    // The start of the data stays: text as it is, an object as the start of its JSON text.
    // Quotes in the cut text are escaped again in the result, so the cut shrinks until it fits.
    const body = typeof r.data === 'string' ? r.data : JSON.stringify(r.data, null, 1);
    const said = `the result had ${text.length} characters, so data is the start of it as text; ask for less (a section, a field, a filter, or help of one command)`;
    for (let n = TEXT_LIMIT - 2000; ; n = Math.floor(n * 0.8)) {
      structured = { ...r, data: `${body.slice(0, n)}\n…`, truncated: true, warnings: [...(r.warnings ?? []), said] };
      text = JSON.stringify(structured);
      if (text.length <= TEXT_LIMIT || n < 1000) break;
    }
  }
  return { content: [{ type: 'text', text }], structuredContent: structured, isError: !r.ok };
}

/** The view of a Task: its state now, and the result of the call at its end. */
function taskView(t, projectRoot) {
  const now = t.id ? taskOf(t.id, projectRoot) ?? t : t;
  return { taskId: now.id, status: now.status, createdAt: now.createdAt, lastUpdatedAt: new Date().toISOString(), ttlMs: 24 * 3600_000, pollIntervalMs: now.pollMs ?? 2000, ...(now.result ? { result: toolResult(now.result) } : {}) };
}

export async function handle(m) {
  const meta = m.params?._meta ?? {};
  const modern = meta['io.modelcontextprotocol/protocolVersion'] === MODERN;
  const ok = (result) => ({ id: m.id, result: modern ? { resultType: 'complete', ...result } : result });
  const err = (code, message) => ({ id: m.id, error: { code, message } });
  switch (m.method) {
    case 'server/discover':
      return ok({ supportedVersions: [MODERN, ...LEGACY], capabilities: { tools: {}, extensions: { [TASKS]: {} } }, serverInfo: { name: 'wf', version: VERSION }, instructions: INSTRUCTIONS, ttlMs: 0, cacheScope: 'private' });
    case 'initialize': {
      const asked = m.params?.protocolVersion;
      return ok({ protocolVersion: LEGACY.includes(asked) ? asked : LEGACY[0], capabilities: { tools: {} }, serverInfo: { name: 'wf', version: VERSION }, instructions: INSTRUCTIONS });
    }
    case 'ping': return ok({});
    // Tasks are read from disk: a restart of the server loses none.
    case 'tasks/get': {
      const t = taskOf(m.params?.taskId, root());
      return t ? ok(taskView(t, root())) : err(-32602, `no task ${m.params?.taskId}`);
    }
    case 'tasks/cancel': return taskCancel(m.params?.taskId, root()) ? ok({}) : err(-32602, `no task ${m.params?.taskId}`);
    case 'tools/list': return ok({ tools: toolList(), ...(modern ? { ttlMs: 0, cacheScope: 'private' } : {}) });
    case 'tools/call': {
      const name = m.params?.name;
      try {
        // A client that runs Tasks gets a job or a run wait as a Task, which it reads with tasks/get.
        const tasks = modern && meta['io.modelcontextprotocol/clientCapabilities']?.extensions?.[TASKS] !== undefined;
        // Who calls, from the row that the PreToolUse hook wrote for this call (lib/mcp-callers.mjs).
        const identity = takeCaller(meta['claudecode/toolUseId']);
        const r = await callTool(name, m.params?.arguments ?? {}, { root: root(), tasks, caller: callerOf(identity), identity });
        if (r.task) return ok({ ...taskView(r.task, root()), ...(modern ? { resultType: 'task' } : {}) });
        return ok(toolResult(r));
      } catch (e) {
        log('call failed', name, e.stack ?? e.message);
        return ok(toolResult({ ok: false, error: { message: e.message, who: 'person', fix: 'Report this error: it is a defect of the wf server.' } }));
      }
    }
    default: return m.id === undefined ? null : err(-32601, `method not found: ${m.method}`);
  }
}

export function serve(input = process.stdin) {
  const rl = readline.createInterface({ input });
  // The beat of this session's server: the shell note of the hook needs a live server.
  const session = process.env.CLAUDE_CODE_SESSION_ID;
  if (session) {
    writeBeat(session);
    setInterval(() => writeBeat(session), BEAT_MS).unref();
  }
  rl.on('line', async (line) => {
    if (!line.trim()) return;
    let m;
    try { m = JSON.parse(line); } catch { send({ id: null, error: { code: -32700, message: 'parse error' } }); return; }
    if (m.id === undefined) return;
    const reply = await handle(m);
    if (reply) send(reply);
  });
  rl.on('close', () => process.exit(0));
}

if (isMainModule(import.meta.url)) serve();
