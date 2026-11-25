// The ten tools of the wf MCP server: their schemas, and the call of each. A call names an
// operation of wf.mjs (`op`) and gives its arguments by name, as the form in `wf.mjs help` names
// them: `{ "op": "step done", "slug": "demo", "slice": "api", "n": 3, "sha": "HEAD" }`. Within
// a tool, the first word of the operation may be left out (`"op": "done"` in wf_step).
import { allOps, callOf } from '../lib/ops/forms.mjs';
import { invoke } from '../lib/ops/invoke.mjs';
import { READ_TOOLS, TOOLS, opsOfTool, refusal, registry } from '../lib/ops/registry.mjs';

const ABOUT = {
  wf_context: 'Where a workflow stands and what to do next. Call it first. Give the /wf words as `argv` (["implement", "demo", "api"]) to route them, or `slug` (and `stage`, `slice`) for the brief of a stage.',
  wf_read: 'Read records, decisions, findings and messages of one workflow. `items` is a list of reads, each `{ op, ...fields }`; each succeeds or fails alone.',
  wf_query: 'Every other read of wf, read-only: help and describe, status reads, profiles, rules, design reads, git facts. A writing operation runs here only with its read flag (`check: true`).',
  wf_run: 'Write the records of this computer: records, findings, the board, slices, progress, talk and messages, design content, settings. One operation per call.',
  wf_step: 'The steps of a slice: start, done, check, stop, retry, complete. `done_next` records step n and starts step n + 1 in one call.',
  wf_decide: 'Record an answer or a decision of a stage, hold a question for the person, drop, end or tidy decisions. An entry by the person, a steer or an approval goes to wf_person.',
  wf_wait: 'Wait for an answer (decide wait), a message (talk wait) or the next change of a run (progress watch). It returns within its time and says how to call again.',
  wf_job: 'A long run: a suite (profile run, receipt), a check (step check is in wf_step), a design capture or check, a talk job, a drive.',
  wf_act: 'Effects outside the records of this computer: the records repo, GitHub, worktrees, the design server, setup, close and ship. Each call may need the permission of the person.',
  wf_person: 'What only the person does: consent, approvals, rules of the project, standing answers, an answer by the person. Call it only for the person\'s own choice: the person is asked.',
};

const opsOf = (tool) => opsOfTool(tool).concat(tool === 'wf_person' ? ['decide add'] : []);

/** The input schema of a tool: `op` and the common fields; the other fields are the arguments of the form. */
function schemaOf(tool) {
  const common = {
    slug: { type: 'string', description: 'the workflow' },
    slice: { type: 'string' },
    checkout: { type: 'string', description: 'the folder of the git checkout of the work, when it is not the project folder (a worktree)' },
  };
  if (tool === 'wf_context') return { type: 'object', properties: { argv: { type: 'array', items: { type: 'string' }, description: 'the words after /wf' }, slug: common.slug, stage: { type: 'string' }, slice: common.slice, op: { type: 'string', enum: opsOf(tool) } } };
  if (tool === 'wf_read') return { type: 'object', required: ['items'], properties: { slug: common.slug, items: { type: 'array', items: { type: 'object', required: ['op'], properties: { op: { type: 'string', enum: opsOf(tool) } } } } } };
  const ops = opsOf(tool);
  return {
    type: 'object',
    required: ['op'],
    additionalProperties: true,
    properties: {
      op: { type: 'string', enum: ops, description: 'the operation; the other fields are the arguments of its form, by the names of wf.mjs help (`n`, `sha`, `answer`, `key`)' },
      ...common,
      ...(tool === 'wf_step' ? { n: { type: ['integer', 'string'] }, title: { type: 'string' }, next_title: { type: 'string', description: 'done_next: the title of step n + 1' } } : {}),
    },
  };
}

export function toolList() {
  return TOOLS.map((name) => ({
    name,
    description: `${ABOUT[name]} Operations: ${opsOf(name).join(', ')}. The fields of an operation: wf_query { "op": "help", "command": "<first word>" }.`,
    inputSchema: schemaOf(name),
    annotations: {
      readOnlyHint: READ_TOOLS.has(name),
      destructiveHint: name === 'wf_act',
      openWorldHint: name === 'wf_act',
      idempotentHint: READ_TOOLS.has(name),
    },
    _meta: { ...(name === 'wf_person' ? { 'anthropic/requiresUserInteraction': true } : {}), 'anthropic/alwaysLoad': true },
  }));
}

/** The full name of an operation within a tool: `done` in wf_step is `step done`. */
export function fullOp(tool, op) {
  const ops = opsOf(tool);
  if (ops.includes(op)) return op;
  const hits = ops.filter((o) => o.split(' ').slice(1).join(' ') === op || o.endsWith(` ${op}`));
  return hits.length === 1 ? hits[0] : op;
}

/** A fix command of wf.mjs as the tool call that does the same. */
export function callOfCommand(command) {
  const m = /\bwf\.mjs\s+(.*)$/.exec(String(command ?? ''));
  if (!m) return null;
  const words = [...m[1].matchAll(/"([^"]*)"|(\S+)/g)].map((x) => x[1] ?? x[2]);
  const c = callOf(words);
  if (!c) return null;
  const row = registry().get(c.op);
  const { root, ...fields } = c.fields;
  return row ? { tool: row.tool, arguments: { op: c.op, ...fields } } : null;
}

const result = (r) => {
  if (r.ok) return { ok: true, ...(r.exit ? { exit: r.exit } : {}), data: r.data, warnings: r.warnings ?? [], next: r.next ?? [] };
  const call = callOfCommand(r.error?.command);
  return { ok: false, error: { message: r.error?.message ?? 'failed', who: r.error?.who ?? 'agent', ...(r.error?.do ? { fix: r.error.do } : {}), ...(r.error?.command ? { command: r.error.command } : {}), ...(call ? { call } : {}) } };
};

const fail = (message, more = {}) => ({ ok: false, error: { message, who: 'agent', ...more } });

/**
 * Run one tool call. `ctx` gives `{ root, caller, env }`: the project, who calls (`person` only
 * for wf_person), and extra env of the worker.
 */
export async function callTool(name, args = {}, ctx = {}) {
  if (!TOOLS.includes(name)) return fail(`no tool ${name}`);
  const { root } = ctx;
  const caller = name === 'wf_person' ? 'person' : (ctx.caller ?? 'agent');
  const run = (op, fields, extra = {}) => invoke({ op, fields, root, checkout: args.checkout ?? root, caller, env: { ...(ctx.env ?? {}), ...extra } }).then(result);

  if (name === 'wf_context') {
    const read = { SDLC_MCP_READ: '1' };
    if (args.op) return run(fullOp(name, args.op), strip(args), read);
    if (args.argv) return run('dispatch', { token: args.argv.map(String), host: 'claude' }, read);
    if (args.slug && args.stage) return run('brief', { slug: args.slug, stage: args.stage, slice: args.slice }, read);
    return run('status', { slug: args.slug, brief: Boolean(args.slug) }, read);
  }
  if (name === 'wf_read') {
    const items = Array.isArray(args.items) ? args.items : [];
    if (!items.length) return fail('wf_read needs items: [{ op, ...fields }]');
    const out = [];
    for (const item of items) {
      const op = fullOp(name, item.op);
      const why = refusal(name, op, item);
      out.push(why ? fail(why) : await run(op, { ...(args.slug && !item.slug ? { slug: args.slug } : {}), ...strip(item) }));
    }
    return { ok: out.every((x) => x.ok), data: out };
  }
  if (name === 'wf_step' && args.op === 'done_next') {
    const { n, next_title: nextTitle, ...rest } = strip(args);
    const done = await run('step done', { ...rest, n });
    if (!done.ok) return done;
    const start = await run('step start', { slug: rest.slug, slice: rest.slice, n: Number(n) + 1, ...(nextTitle ? { title: nextTitle } : {}) });
    return start.ok ? { ok: true, data: { done: done.data, start: start.data }, warnings: [...done.warnings, ...start.warnings] } : { ...start, done: done.data };
  }
  if (!args.op) return fail(`${name} needs op; its operations are: ${opsOf(name).join(', ')}`);
  const op = fullOp(name, args.op);
  const why = name === 'wf_person' && op === 'decide add' ? null : refusal(name, op, args);
  if (why) return fail(why);
  return run(op, strip(args), READ_TOOLS.has(name) ? { SDLC_MCP_READ: '1' } : {});
}

/** The fields of a call that are arguments of the form: no op, no checkout. */
function strip(args) {
  const { op, checkout, items, ...fields } = args;
  for (const [k, v] of Object.entries(fields)) if (typeof v === 'number') fields[k] = String(v);
  return fields;
}

export { allOps };
