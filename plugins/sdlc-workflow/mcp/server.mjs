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
import { callTool, taskOf, taskCancel, toolList } from './tools.mjs';

const PLUGIN_ROOT = fileURLToPath(new URL('..', import.meta.url));
const VERSION = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'package.json'), 'utf8')).version;
const MODERN = '2026-07-28';
export const TASKS = 'io.modelcontextprotocol/tasks';
const LEGACY = ['2025-11-25', '2025-06-18', '2025-03-26'];
const TEXT_LIMIT = 40_000;
const INSTRUCTIONS = 'The wf tools run the records of /wf. Start with wf_context. Read with wf_read and wf_query, write records with wf_run, steps with wf_step, answers with wf_decide. wf_act acts outside the records; wf_person is only for the person\'s own choice. The CLI form of each operation is in wf_query { "op": "help" }.';

const root = () => resolveProjectRoot(process.env.CLAUDE_PROJECT_DIR || process.cwd());
const log = (...a) => process.stderr.write(`wf-mcp: ${a.join(' ')}\n`);
const send = (o) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...o })}\n`);

/** The tool result: the same JSON as text and as structured content, cut at the text limit. */
export function toolResult(r) {
  let text = JSON.stringify(r);
  let structured = r;
  if (text.length > TEXT_LIMIT) {
    structured = { ...r, data: typeof r.data === 'string' ? `${r.data.slice(0, TEXT_LIMIT - 200)}\n…` : null, truncated: true, warnings: [...(r.warnings ?? []), `the result had ${text.length} characters; ask for less (a section, a field, a filter)`] };
    text = JSON.stringify(structured);
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
        const r = await callTool(name, m.params?.arguments ?? {}, { root: root(), tasks });
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
