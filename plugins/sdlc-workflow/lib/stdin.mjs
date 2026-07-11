export async function readStdin() {
  let text = '';
  process.stdin.setEncoding('utf-8');
  for await (const chunk of process.stdin) {
    text += chunk;
  }
  return text;
}

/**
 * Cross-host payload normalization.
 *
 * Claude Code delivers hook events with snake_case top-level keys
 * (`tool_input`, `tool_name`, `hook_event_name`); every hook in this plugin
 * reads that shape. Claude-compatible hosts that also load this plugin's
 * `hooks/hooks.json` — Grok Build and Cursor — send the SAME event on
 * camelCase keys (`toolInput`, `toolName`, `hookEventName`; see Grok's
 * user-guide/10-hooks.md and Cursor's hook schema). Without this alias step
 * `input.tool_input` reads `undefined` under those hosts, so each guard hits
 * its `if (!filePath) return` early-exit and silently no-ops — and because
 * PreToolUse hooks fail OPEN there, the leak/validation gates would allow what
 * they are meant to block. Aliasing restores them.
 *
 * Additive and host-agnostic: under Claude the camelCase keys are absent, so
 * this is a no-op; the snake_case key always wins when both are present.
 *
 * Scope: TOP-LEVEL keys only. The INNER `tool_input` schema is host-tool
 * specific (Claude `Write` = {file_path, content}; Grok's `search_replace`
 * tool has its own field names) and is deliberately NOT translated here —
 * that parity is a separate concern to resolve per host tool.
 */
export function normalizeHookPayload(input) {
  if (!input || typeof input !== 'object') return input;
  const aliases = [
    ['toolInput', 'tool_input'],
    ['toolName', 'tool_name'],
    ['hookEventName', 'hook_event_name'],
  ];
  for (const [camel, snake] of aliases) {
    if (input[snake] === undefined && input[camel] !== undefined) {
      input[snake] = input[camel];
    }
  }
  return input;
}

export async function readStdinJson({ emptyValue = {} } = {}) {
  const text = (await readStdin()).trim();
  if (!text) return emptyValue;
  try {
    return normalizeHookPayload(JSON.parse(text));
  } catch (err) {
    err.message = `invalid hook JSON on stdin: ${err.message}`;
    throw err;
  }
}
