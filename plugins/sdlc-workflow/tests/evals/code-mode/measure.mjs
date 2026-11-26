// The measures of one eval run, read from the transcript of its host: the number of tool calls,
// the invalid calls (a tool result with an error, or a command with a nonzero exit), the
// tokens, the writes to workflow files that went around wf.mjs, and the final answer. On Claude
// also the calls of wf: by the wf tools (`wfMcp`) or by a shell (`wfShell`), the calls with code,
// and the calls of wf that a hook or a permission denied.

// A shell command that writes a file, and a path in the workflow records.
const WRITES = /\b(python3?|node\s+-e|sed\s+-i|perl\s+-i|Set-Content|Add-Content|Out-File|Copy-Item|Move-Item|Remove-Item|tee|cp|mv|rm)\b|(?<![\d&])>>?\s*[^&\s]/;
// The drafts and the scratch files are not records: a path that names them is not counted.
const RECORDS = /\.ai[\\/]workflows[\\/](?![^\s"']*[\\/](\.draft|\.scratch)(?![\w.-]))/;
const WF_CLI = /^\s*(&\s*)?node(\.exe)?\s+["']?[^"'\s]*wf\.mjs["']?\s/;

// A real call of a wf script in a shell command: node, then the script, then its words. The text
// wf.mjs in a commit message, a search or a file name is not a call.
const WF_SCRIPT_CALL = /(?:^|[\s;&|(])(?:&\s*)?node(?:\.exe)?\s+["']?[^"'\s|;&]*[\/](?:wf|campaign|orchestrate|optimize|goal|prototype|ideate-sources|design-boards)\.mjs["']?(?=\s|$)/g;
const WF_TOOL = /^mcp__(?:plugin_sdlc-workflow_)?wf__(wf_[a-z]+)$/;

/** The number of calls of a wf script in one shell command. */
export const wfShellCalls = (command) => [...String(command ?? '').matchAll(WF_SCRIPT_CALL)].length;
/** The wf tool of a tool name (wf_read), or null. */
export const wfToolOf = (name) => WF_TOOL.exec(String(name ?? ''))?.[1] ?? null;

/** True when a shell command or a file tool writes a workflow file without wf.mjs. */
export function writesAround(command = '', path = null) {
  if (path) return RECORDS.test(String(path)) && !/\.(mjs|js)$/.test(String(path));
  const c = String(command);
  return RECORDS.test(c) && WRITES.test(c) && !WF_CLI.test(c);
}

function claude(lines) {
  const m = { calls: 0, invalid: 0, tokens: 0, outsideWrites: 0, answer: null, tools: null, wfMcp: 0, wfShell: 0, wfCode: 0, wfDenied: 0 };
  const wfIds = new Set();
  for (const e of lines) {
    if (e.type === 'system' && e.subtype === 'init') m.tools = e.tools ?? null;
    else if (e.type === 'assistant') {
      for (const b of e.message?.content ?? []) {
        if (b.type !== 'tool_use') continue;
        m.calls += 1;
        const i = b.input ?? {};
        const tool = wfToolOf(b.name);
        const shell = ['Bash', 'PowerShell'].includes(b.name) ? wfShellCalls(i.command) : 0;
        if (tool) { m.wfMcp += 1; wfIds.add(b.id); if ((tool === 'wf_run' || tool === 'wf_query') && i.code) m.wfCode += 1; }
        if (shell) { m.wfShell += shell; wfIds.add(b.id); }
        if (writesAround(i.command ?? '', ['Write', 'Edit', 'NotebookEdit'].includes(b.name) ? i.file_path : null)) m.outsideWrites += 1;
      }
    } else if (e.type === 'user') {
      for (const b of e.message?.content ?? []) {
        if (b.type !== 'tool_result' || !b.is_error) continue;
        m.invalid += 1;
        const text = typeof b.content === 'string' ? b.content : JSON.stringify(b.content ?? '');
        if (wfIds.has(b.tool_use_id) && /wf: blocked|denied|permission|not allowed/i.test(text)) m.wfDenied += 1;
      }
    } else if (e.type === 'result') {
      const u = e.usage ?? {};
      m.tokens = (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
      m.answer = e.result ?? null;
      m.error = e.is_error ? String(e.result ?? e.terminal_reason ?? 'error') : null;
    }
  }
  m.mcpShare = m.wfMcp + m.wfShell ? m.wfMcp / (m.wfMcp + m.wfShell) : null;
  return m;
}

function codex(lines) {
  const m = { calls: 0, invalid: 0, tokens: 0, outsideWrites: 0, answer: null };
  for (const e of lines) {
    const item = e.item ?? e.msg ?? {};
    if (e.type === 'item.completed' && item.type === 'command_execution') {
      m.calls += 1;
      if ((item.exit_code ?? 0) !== 0) m.invalid += 1;
      if (writesAround(item.command ?? '')) m.outsideWrites += 1;
    } else if (e.type === 'item.completed' && item.type === 'file_change') {
      m.calls += 1;
      for (const c of item.changes ?? []) if (writesAround('', c.path)) m.outsideWrites += 1;
    } else if (e.type === 'item.completed' && item.type === 'agent_message') {
      m.answer = item.text ?? m.answer;
    } else if (e.type === 'turn.completed') {
      const u = e.usage ?? {};
      m.tokens += (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cached_input_tokens ?? 0);
    }
  }
  return m;
}

// The JSON lines of pi: a tool call event and a final message. The names are read loosely, so
// a change of the event names gives zero counts, not a crash; check them before a pi run.
function pi(lines) {
  const m = { calls: 0, invalid: 0, tokens: 0, outsideWrites: 0, answer: null };
  for (const e of lines) {
    const t = String(e.type ?? '');
    if (/tool.*(start|call)/i.test(t)) {
      m.calls += 1;
      const a = e.args ?? e.input ?? {};
      if (writesAround(a.command ?? '', a.path ?? a.file_path ?? null)) m.outsideWrites += 1;
    }
    if (/tool.*(end|result)/i.test(t) && (e.isError || e.error)) m.invalid += 1;
    const u = e.usage ?? e.message?.usage;
    if (u) m.tokens += (u.input ?? u.input_tokens ?? 0) + (u.output ?? u.output_tokens ?? 0);
    const text = e.message?.content?.filter?.((c) => c.type === 'text').map((c) => c.text).join('') ?? (typeof e.text === 'string' ? e.text : null);
    if (/message.*end|agent.*end/i.test(t) && text) m.answer = text;
  }
  return m;
}

/** The measures of a transcript of `host` (claude, codex or pi). */
export function measure(host, text) {
  const lines = String(text).split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  return { claude, codex, pi }[host](lines);
}
