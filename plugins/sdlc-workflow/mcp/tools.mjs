// The ten tools of the wf MCP server: their schemas, and the call of each. A call names an
// operation of wf.mjs (`op`) and gives its arguments by name, as the form in `wf.mjs help` names
// them: `{ "op": "step done", "slug": "demo", "slice": "api", "n": 3, "sha": "HEAD" }`. Within
// a tool, the first word of the operation may be left out (`"op": "done"` in wf_step).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { allOps, callOf } from '../lib/ops/forms.mjs';
import { workflowDir } from '../lib/records-root.mjs';
import { invoke, invokeCode } from '../lib/ops/invoke.mjs';
import { READS, WRITES, libraryHelp } from '../lib/ops/code-host.mjs';
import { READ_TOOLS, TOOLS, opsOfTool, refusal, registry } from '../lib/ops/registry.mjs';

const ABOUT = {
  wf_context: 'Where a workflow stands and what to do next. Call it first. Give the /wf words as `argv` (["implement", "demo", "api"]) to route them, or `slug` (and `stage`, `slice`) for the brief of a stage.',
  wf_read: 'Read records, decisions, findings and messages of one workflow in one call. `items` is a list of reads, each `{ op, ...fields }` or a short form: `{ record, section?, field? }`, `{ decisions: { slice?, kind? } }`, `{ comments: { key } }`, `{ findings: { open? } }`. Each item succeeds or fails alone; they run together.',
  wf_query: 'Every other read of wf, read-only: help and describe, status reads, profiles, rules, design reads, git facts. A writing operation runs here only with its read flag (`check: true`).',
  wf_run: 'Write the records of this computer: records, findings, the board, slices, progress, talk and messages, design content, settings. One operation per call. Content goes inline, with no file: `record put` takes `records: { "04-plan-api.md": "<the whole record>" }`, `record edit` takes `text` in place of `from`, `findings add` takes `found: [...]`, `board add` takes `entries` and `board apply` takes `change`.',
  wf_step: 'The steps of a slice: start, done, check, stop, retry, complete. `done_next` records step n and starts step n + 1 in one call.',
  wf_decide: 'Record an answer or a decision of a stage, hold a question for the person, drop, end or tidy decisions. `add_many` with `entries: [{ kind, key, question, answer, by }]` records several in one change. An entry by the person, a steer or an approval goes to wf_person.',
  wf_wait: 'Wait for an answer (decide wait), a message (talk wait) or the next change of a run (progress watch). It returns within its time and says how to call again.',
  wf_job: 'A long run: a suite (profile run, receipt), a check (step check is in wf_step), a design capture or check, a talk job, a drive.',
  wf_act: 'Effects outside the records of this computer: the records repo, GitHub, worktrees, the design server, setup, close and ship. Each call may need the permission of the person.',
  wf_person: 'What only the person does: consent, approvals, rules of the project, standing answers, an answer by the person. Call it only for the person\'s own choice: the person is asked.',
};

const INLINE = {
  'record edit': [['text', 'from', 'md']],
  'findings add': [['found', 'found-json', 'json']],
  'decide add': [['entries', 'file', 'json']],
  'board add': [['entries', 'file', 'json']],
  'board apply': [['change', 'file', 'json']],
  'board prose': [['content', 'file', 'md']],
};
const RECORD_NAME = /^[0-9][0-9a-z]*-[a-z0-9][a-z0-9.-]*$/i;

/**
 * Turn inline content into the files that the form reads: `records` of `record put` become drafts
 * of the workflow, the other inline fields become files under `<wf-dir>/.draft/.inline/`, and
 * the fields of the form name them. Returns `{ fields, files, error }`; the caller removes `files`.
 */
export function inlineFields(root, op, fields) {
  const out = { ...fields };
  const files = [];
  const pairs = INLINE[op] ?? [];
  const has = (k) => out[k] !== undefined && out[k] !== null;
  if (!(op === 'record put' && has('records')) && !pairs.some(([k]) => has(k))) return { fields: out, files };
  if (!out.slug) return { error: `${op} with inline content needs slug` };
  const dir = join(workflowDir(root, String(out.slug)), '.draft');
  if (op === 'record put' && has('records')) {
    if (typeof out.records !== 'object' || Array.isArray(out.records)) return { error: 'records is a map: { "<record name>": "<the whole record, frontmatter and body>" }' };
    const names = [];
    for (const [raw, text] of Object.entries(out.records)) {
      const name = raw.endsWith('.md') ? raw : `${raw}.md`;
      if (!RECORD_NAME.test(name.slice(0, -3)) || name.includes('..')) return { error: `${raw} is no record name: give a name such as 04-plan-api.md` };
      if (typeof text !== 'string' || !text.trim()) return { error: `the text of ${name} is empty` };
      names.push([name, text]);
    }
    mkdirSync(dir, { recursive: true });
    for (const [name, text] of names) writeFileSync(join(dir, name), text.endsWith('\n') ? text : `${text}\n`);
    out.draft = names.map(([n]) => n);
    delete out.records;
  }
  for (const [k, target, ext] of pairs) {
    if (!has(k)) continue;
    if (has(target)) return { error: `${op}: give ${k} or ${target}, not both` };
    const text = typeof out[k] === 'string' ? out[k] : JSON.stringify(out[k], null, 2);
    mkdirSync(join(dir, '.inline'), { recursive: true });
    const file = join(dir, '.inline', `${process.pid}-${Date.now().toString(36)}-${files.length}.${ext}`);
    writeFileSync(file, text);
    files.push(file);
    out[target] = file;
    delete out[k];
  }
  return { fields: out, files };
}

/** A short item of wf_read as the operation and its fields. */
function readItem(item) {
  if (item.op) return item;
  const { record, decisions, comments, findings, ...rest } = item;
  if (record) return { op: 'record get', name: record, ...rest };
  if (decisions) return { op: 'decide list', ...(decisions === true ? {} : decisions), ...rest };
  if (comments) {
    const { keys, ...more } = comments === true ? {} : comments;
    return { op: 'design comments', ...(keys ? { key: keys } : {}), ...more, ...rest };
  }
  if (findings) return { op: 'findings list', ...(findings === true ? {} : findings), ...rest };
  return item;
}

const opsOf = (tool) => opsOfTool(tool).concat(tool === 'wf_person' ? ['decide add'] : []);

/**
 * The code mode text of wf_query and wf_run: what the code is, the functions it may call, and
 * examples. Inside 4,096 characters with the rest of the description.
 */
function codeAbout(tool) {
  const run = tool === 'wf_run';
  const calls = libraryHelp(null, run ? [...READS, ...WRITES] : READS).filter((c) => c !== 'open(slug)');
  const examples = run
    ? ["for (const f of wf.findings.list({ open: true }).filter((f) => f.file === 'src/a.ts')) wf.findings.set(f.id, { status: 'fixed' })",
      "wf.records.set('03-slice', 'slices[api].status', 'complete'); return wf.steps.where('api')"]
    : ["return wf.findings.list({ open: true }).map((f) => [f.id, f.severity, f.file])",
      "return Object.fromEntries(wf.records.list().filter((n) => n.startsWith('06-verify-')).map((n) => [n, wf.records.fields(n, ['result'])]))"];
  return ` Or give \`code\` in place of \`op\`: the body of an async function of \`wf\` (the workflow of \`slug\`) and \`open(slug)\` (another workflow), whose \`return\` is the result. Many reads${run ? ' and writes' : ''} in one call, with loops and filters. ${run ? 'All or nothing: a throw, a timeout (60 s) or `dryRun: true` keeps no change; a kept change makes one commit for each workflow.' : 'It writes nothing.'} The code has no file, process or require; it may reach the network. \`wf.help(name)\` gives the form of a function. Functions: ${calls.join('; ')}. Examples: ${examples.map((e) => `\`${e}\``).join(' · ')}.`;
}

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
  const code = tool === 'wf_query' || tool === 'wf_run';
  return {
    type: 'object',
    ...(code ? {} : { required: ['op'] }),
    additionalProperties: true,
    properties: {
      op: { type: 'string', enum: ops, description: 'the operation; the other fields are the arguments of its form, by the names of wf.mjs help (`n`, `sha`, `answer`, `key`)' },
      ...(code ? { code: { type: 'string', description: 'in place of op: the body of an async function of wf and open' } } : {}),
      ...(tool === 'wf_run' ? { dryRun: { type: 'boolean', description: 'with code: run it and keep no change' } } : {}),
      ...common,
      ...(tool === 'wf_step' ? { n: { type: ['integer', 'string'] }, title: { type: 'string' }, next_title: { type: 'string', description: 'done_next: the title of step n + 1' } } : {}),
    },
  };
}

export function toolList() {
  return TOOLS.map((name) => ({
    name,
    description: `${ABOUT[name]} Operations: ${opsOf(name).join(', ')}. The fields of an operation: wf_query { "op": "help", "command": "<first word>" }.${name === 'wf_query' || name === 'wf_run' ? codeAbout(name) : ''}`,
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
  const run = async (op, fields, extra = {}) => {
    const inl = inlineFields(root, op, fields);
    if (inl.error) return fail(inl.error);
    try {
      return result(await invoke({ op, fields: inl.fields, root, checkout: args.checkout ?? root, caller, env: { ...(ctx.env ?? {}), ...extra } }));
    } finally {
      for (const file of inl.files) rmSync(file, { force: true });
    }
  };

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
    // The reads run together, four at a time: each is its own worker, and a read changes nothing.
    const out = new Array(items.length);
    let next = 0;
    const one = async () => {
      while (next < items.length) {
        const i = next++;
        const item = readItem(items[i] ?? {});
        if (!item.op) { out[i] = fail('an item of wf_read needs op, or record, decisions, comments or findings'); continue; }
        const op = fullOp(name, item.op);
        const why = refusal(name, op, item);
        const takesSlug = allOps().get(op)?.positionals.some((p) => p.name === 'slug');
        out[i] = why ? fail(why) : await run(op, { ...(args.slug && !item.slug && takesSlug ? { slug: args.slug } : {}), ...strip(item) }, { SDLC_MCP_READ: '1' });
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, items.length) }, one));
    return { ok: out.every((x) => x.ok), data: out };
  }
  if (name === 'wf_decide' && args.op === 'add_many') {
    if (!Array.isArray(args.entries) || !args.entries.length) return fail('add_many needs entries: [{ kind, key, question, answer, by }]');
    return run('decide add', { slug: args.slug, entries: args.entries });
  }
  if (name === 'wf_step' && args.op === 'done_next') {
    const { n, next_title: nextTitle, ...rest } = strip(args);
    const done = await run('step done', { ...rest, n });
    if (!done.ok) return done;
    const start = await run('step start', { slug: rest.slug, slice: rest.slice, n: Number(n) + 1, ...(nextTitle ? { title: nextTitle } : {}) });
    return start.ok ? { ok: true, data: { done: done.data, start: start.data }, warnings: [...done.warnings, ...start.warnings] } : { ...start, done: done.data };
  }
  if ((name === 'wf_query' || name === 'wf_run') && typeof args.code === 'string') {
    if (args.op) return fail(`${name}: give op or code, not both`);
    const r = await invokeCode({ root, checkout: args.checkout ?? root, caller, slug: args.slug ?? null, code: args.code, mode: name === 'wf_run' ? 'run' : 'query', dryRun: Boolean(args.dryRun), env: ctx.env ?? {} });
    if (r.ok) return { ok: true, data: r.value, ops: r.ops, ...(name === 'wf_run' ? { changed: r.changed, applied: r.applied } : {}), ...(r.kept ? { kept: r.kept } : {}), warnings: r.kept ? [`another writer changed ${r.kept.join(', ')} while the code ran: the file keeps that change, and what this code wrote to it stays too`] : [] };
    return fail(r.error ?? 'the code failed', { kept: false, ops: r.ops ?? 0 });
  }
  if (!args.op) return fail(`${name} needs op${name === 'wf_query' || name === 'wf_run' ? ' or code' : ''}; its operations are: ${opsOf(name).join(', ')}`);
  const op = fullOp(name, args.op);
  const why = name === 'wf_person' && op === 'decide add' ? null : refusal(name, op, args);
  if (why) return fail(why);
  return run(op, strip(args), READ_TOOLS.has(name) ? { SDLC_MCP_READ: '1' } : {});
}

/** The fields of a call that are arguments of the form: no op, no checkout. */
function strip(args) {
  const { op, checkout, items, ...fields } = args;
  for (const [k, v] of Object.entries(fields)) if (typeof v === 'number') fields[k] = String(v);
  // Inline content keeps its shape: inlineFields writes it to a file.
  for (const k of ['records', 'found', 'entries', 'change']) if (args[k] !== undefined) fields[k] = args[k];
  return fields;
}

export { allOps };
