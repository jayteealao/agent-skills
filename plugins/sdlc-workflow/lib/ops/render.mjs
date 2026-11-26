// The call of an operation as a host makes it: on Claude the call of a tool of the wf MCP server,
// on Codex and pi the command line. The references, the prompts of the drivers and the briefs
// show the call this way, so a Claude agent is never shown a shell command of wf alone.
//
//   renderOp('claude', 'step done', { slug: 'demo', slice: 'api', n: 3 })
//     → wf_step { "op": "step done", "slug": "demo", "slice": "api", "n": 3 }
//   renderOp('codex', 'step done', { slug: 'demo', slice: 'api', n: 3 })
//     → node "<skill-dir>/scripts/wf.mjs" step done "<root>" demo api 3
import { SIBLINGS, allOps, argvOf, callOf } from './forms.mjs';
import { registry } from './registry.mjs';
import { INLINE } from '../../mcp/tools.mjs';

// Over MCP, content goes inline: the field that names a file of the CLI becomes the field of the content.
const INLINE_HINT = { md: '<the text>', json: '<the JSON>' };

const ORDER = { slug: 0, slice: 1, stage: 2 };
export const MCP_HOSTS = new Set(['claude']);

const quote = (w) => (/^[A-Za-z0-9_./:@=,+-]+$/.test(w) && !w.startsWith('<') ? w : `"${w.replace(/"/g, '\\"')}"`);

/** The command line of an operation, as the references write it. */
export function renderCli(op, fields = {}) {
  const o = allOps().get(op);
  if (!o) throw new Error(`no operation ${op}`);
  const f = { ...fields };
  if (o.positionals.some((p) => p.name === 'root') && f.root === undefined) f.root = '<root>';
  const argv = argvOf(op, f);
  const sibling = SIBLINGS.includes(o.words[0]);
  const script = sibling ? `${o.words[0]}.mjs` : 'wf.mjs';
  return `node "<skill-dir>/scripts/${script}" ${(sibling ? argv.slice(1) : argv).map(quote).join(' ')}`;
}

/** The tool call of an operation: `wf_read { "slug": …, "items": [{ "op": … }] }` for a read of wf_read. */
export function renderCall(op, fields = {}) {
  const row = registry().get(op);
  if (!row) throw new Error(`no operation ${op}`);
  // The server adds --json and the root itself.
  const { root, json, ...named } = fields;
  const given = { ...named };
  for (const [inline, file, kind] of INLINE[op] ?? []) {
    if (given[file] === undefined) continue;
    delete given[file];
    given[inline] = INLINE_HINT[kind];
  }
  // The slug and the slice first, as a person reads a call.
  const rest = Object.fromEntries(Object.entries(given).sort(([a], [b]) => (ORDER[a] ?? 9) - (ORDER[b] ?? 9)));
  const body = (o) => `{ ${Object.entries(o).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')} }`;
  if (row.tool === 'wf_read') {
    const { slug, ...item } = rest;
    return `wf_read { ${slug !== undefined ? `"slug": ${JSON.stringify(slug)}, ` : ''}"items": [${body({ op, ...item })}] }`;
  }
  return `${row.tool} ${body({ op, ...rest })}`;
}

/** The call of an operation as `host` makes it. */
export function renderOp(host, op, fields = {}) {
  return MCP_HOSTS.has(host) ? renderCall(op, fields) : renderCli(op, fields);
}

const SCRIPT = /^(?:node\s+)?(?:"[^"]*[\\/])?(wf|campaign|orchestrate|optimize|goal|prototype|ideate-sources|design-boards)\.mjs"?\s+(.*)$/;
const words = (line) => [...line.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]);

/**
 * The operation and fields of a command line as the references write it, or null. Placeholders
 * stay as they are (`<slug>`); `<root>` is the project of the server and is left out.
 */
export function parseCliLine(line) {
  const m = SCRIPT.exec(String(line).trim());
  if (!m) return null;
  const argv = words(m[2]);
  const c = callOf(m[1] === 'wf' ? argv : [m[1], ...argv]);
  if (!c || !registry().has(c.op)) return null;
  const { root, ...fields } = c.fields;
  for (const [k, v] of Object.entries(fields)) if (Array.isArray(v) && v.length === 1) fields[k] = v[0];
  return { op: c.op, fields };
}

const CLI_SPAN = /`([^`\n]*\b(?:wf|campaign|orchestrate|optimize|goal|prototype|ideate-sources|design-boards)\.mjs\b[^`\n]*)`/g;
const TOOL_SPAN = /`wf_(?:context|read|query|run|step|decide|wait|job|act|person)\b[^`\n]*`/;

/**
 * The CLI forms of a text that a person or an agent would read alone: a span that is a whole
 * operation of wf, with no tool call before it on its line. A pair "`<call>` (CLI: `<line>`)" and
 * a line that gives the tool call first pass. Returns `[{ line, text, op }]`.
 */
export function cliAlone(text) {
  const out = [];
  String(text).split('\n').forEach((line, i) => {
    for (const m of line.matchAll(CLI_SPAN)) {
      if (line.slice(Math.max(0, m.index - 6), m.index) === '(CLI: ') continue;
      const c = parseCliLine(m[1]);
      if (!c) continue;
      if (TOOL_SPAN.test(line.slice(0, m.index))) continue;
      out.push({ line: i + 1, text: m[1], op: c.op });
    }
  });
  return out;
}

/**
 * The operations of wf in a compact form, for a script that cannot import this module (the yolo
 * driver gets it when it is staged): `{ "<op>": { t: tool, p: [[name, optional, variadic, afterDash]],
 * b: [boolean flags], i: { fileFlag: inlineField } } }`. The words of a form that the call fills
 * itself are left out of `p` as `null` names.
 */
export function opsTable() {
  const out = {};
  for (const [name, row] of registry()) {
    const o = allOps().get(name);
    out[name] = {
      t: row.tool,
      p: o.positionals.map((q) => [q.fixed ? null : q.name, q.optional ? 1 : 0, q.variadic ? 1 : 0, q.afterDash ? 1 : 0]),
      b: o.flags.filter((f) => f.boolean).map((f) => f.name),
      ...(INLINE[name] ? { i: Object.fromEntries(INLINE[name].map(([inline, file]) => [file, inline])) } : {}),
    };
  }
  return out;
}

const PAIR = /`(wf_[a-z]+ \{.*?\})` \(CLI: `[^`]*`\)/g;

/**
 * The ready calls of a brief: each tool call of the text with the slug, the slice and the stage of
 * the brief filled in, so that it can be sent as it stands. Returns the text with the holes filled
 * and the list of the calls, each once, in the order of the text.
 */
export function readyCalls(text, { slug, slice, stage } = {}) {
  const fill = (s) => s
    .replace(/"<slug>"/g, slug ? JSON.stringify(slug) : '"<slug>"')
    .replace(/"<slice>"/g, slice ? JSON.stringify(slice) : '"<slice>"')
    .replace(/"<stage>"/g, stage ? JSON.stringify(stage) : '"<stage>"');
  const out = String(text ?? '').replace(PAIR, (whole, call) => whole.replace(call, fill(call)));
  const calls = [];
  for (const m of out.matchAll(PAIR)) {
    if (calls.includes(m[1])) continue;
    calls.push(m[1]);
  }
  return { text: out, calls };
}
