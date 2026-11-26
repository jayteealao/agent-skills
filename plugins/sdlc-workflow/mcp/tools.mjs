// The ten tools of the wf MCP server: their schemas, and the call of each. A call names an
// operation of wf.mjs (`op`) and gives its arguments by name, as the form in `wf.mjs help` names
// them: `{ "op": "step done", "slug": "demo", "slice": "api", "n": 3, "sha": "HEAD" }`. Within
// a tool, the first word of the operation may be left out (`"op": "done"` in wf_step).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { allOps, callOf } from '../lib/ops/forms.mjs';
import { workflowDir } from '../lib/records-root.mjs';
import { TEXT_LIMIT, commandOf, invoke, invokeCode } from '../lib/ops/invoke.mjs';
import { jobFile, jobState, listJobs, startJob, stopJob, tailOf, writeJob } from '../lib/jobs.mjs';
import { cursorNow, readRunEvents, waitRunEvents } from '../lib/run-events.mjs';
import { existsSync } from 'node:fs';
import { writeFileAtomic } from '../lib/atomic-write.mjs';
import { READS, WRITES, libraryHelp } from '../lib/ops/code-host.mjs';
import { READ_TOOLS, TOOLS, opsOfTool, refusal, registry } from '../lib/ops/registry.mjs';

const ABOUT = {
  wf_context: 'Where a workflow stands and what to do next. Call it first. Give the /wf words as `argv` (["implement", "demo", "api"]) to route them, or `slug` (and `stage`, `slice`) for the brief of a stage.',
  wf_read: 'Read records, decisions, findings and messages of one workflow in one call. `items` is a list of reads, each `{ op, ...fields }` or a short form: `{ record, section?, field? }`, `{ decisions: { slice?, kind? } }`, `{ comments: { key } }`, `{ findings: { open? } }`. Each item succeeds or fails alone; they run together.',
  wf_query: 'Every other read of wf, read-only: help and describe, status reads, profiles, rules, design reads, git facts. A writing operation runs here only with its read flag (`check: true`).',
  wf_run: 'Write the records of this computer: records, findings, the board, slices, progress, talk and messages, design content, settings. One operation per call. Content goes inline, with no file: `record put` takes `records: { "04-plan-api.md": "<the whole record>" }`, `record edit` takes `text` in place of `from`, `findings add` takes `found: [...]`, `board add` takes `entries` and `board apply` takes `change`.',
  wf_step: 'The steps of a slice: start, done, check, stop, retry, complete. `done_next` records step n and starts step n + 1 in one call. `steps: [{ op, n, title?, sha?, "no-change"? }, ...]` (with `slug` and `slice`, no `op`) runs several in order in one call, and stops at the first that fails.',
  wf_decide: 'Record an answer or a decision of a stage, hold a question for the person, drop, end or tidy decisions. `add_many` with `entries: [{ kind, key, question, answer, by }]` records several in one change. An entry by the person, a steer or an approval goes to wf_person.',
  wf_wait: 'Wait for an answer (decide wait), a message (talk wait), the end of a job (`{ "for": "job", "job": "<id>" }`), or the next event of a run: `{ "for": "run", "slug", "cursor" }` ends at the next journal line, message or job end after the cursor. It returns within its time; `next` is the call to make again, with the cursor, so no event is missed. progress watch reads where a run stands, once.',
  wf_job: 'A long run: a suite (profile run, receipt), a design capture or check, a drive, the long steps of optimize, orchestrate and goal. It starts a job that runs on in its own process and returns its id at once; the same call while the job runs returns that job, never a second one. Wait for its end with wf_wait { for: "job", job }. `op: "status" | "logs" | "stop" | "list"` with `job` reads or stops a job. `wait: true` runs the operation in the call instead (up to 10 minutes). A check of a step is step check in wf_step.',
  wf_act: 'Effects outside the records of this computer: the records repo, GitHub, worktrees, the design server, setup, close and ship. Each call may need the permission of the person.',
  wf_person: 'What only the person does: consent, approvals, rules of the project, standing answers, an answer by the person. Call it only for the person\'s own choice: the person is asked.',
};

export const INLINE = {
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

const opsOf = (tool) => opsOfTool(tool).concat(tool === 'wf_person' ? ['decide add'] : [], tool === 'wf_job' ? ['status', 'logs', 'stop', 'list'] : []);

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
    ...(code || tool === 'wf_wait' || tool === 'wf_step' ? {} : { required: ['op'] }),
    additionalProperties: true,
    properties: {
      op: { type: 'string', enum: ops, description: 'the operation; the other fields are the arguments of its form, by the names of wf.mjs help (`n`, `sha`, `answer`, `key`)' },
      ...(code ? { code: { type: 'string', description: 'in place of op: the body of an async function of wf and open' } } : {}),
      ...(tool === 'wf_run' ? { dryRun: { type: 'boolean', description: 'with code: run it and keep no change' } } : {}),
      ...common,
      ...(tool === 'wf_wait' ? { for: { type: 'string', enum: ['run', 'job'], description: 'in place of op: run, the next event of the run (a journal line, a message, a job end); job, the end of the job `job`' }, job: { type: 'string', description: 'for job: the id of the job' }, cursor: { type: 'string', description: 'for run: the cursor of the last call' }, as: { type: 'string', description: 'your name in the run (verify:api): only the messages for you' }, seconds: { type: 'integer' } } : {}),
      ...(tool === 'wf_job' ? { job: { type: 'string', description: 'status, logs, stop: the id of the job' }, wait: { type: 'boolean', description: 'run the operation in the call, not as a job' }, lines: { type: 'integer', description: 'logs: the lines from the end' } } : {}),
      ...(tool === 'wf_step' ? { n: { type: ['integer', 'string'] }, title: { type: 'string' }, next_title: { type: 'string', description: 'done_next: the title of step n + 1' }, steps: { type: 'array', items: { type: 'object', required: ['op'], properties: { op: { type: 'string' }, n: { type: ['integer', 'string'] } } }, description: 'in place of op: several steps of the slice, in order: [{ "op": "start", "n": 4, "title": "Docs" }, { "op": "done", "n": 4, "no-change": true }]' } } : {}),
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
  // The server serves one project: a call does not name another root, in itself or in an item.
  const same = (r) => r === undefined || r === null || r === '' || (root && resolve(String(r)).toLowerCase() === resolve(root).toLowerCase());
  const items = Array.isArray(args.items) ? args.items : [];
  if (!same(args.root) || items.some((i) => i && !same(i.root))) {
    return fail(`this server runs the project ${root}: a call does not name another root`, { fix: 'Leave root out. Work of another project runs in a session of that project.' });
  }
  // The host said that an agent calls (a row of the hook): the arguments do not make it the session or the person.
  if (ctx.identity?.agent_id) {
    if (name === 'wf_person') return fail('an agent does not call wf_person: it acts in the name of the person', { fix: 'Hold the question with wf_decide { "op": "hold" } and wait with wf_wait { "op": "decide wait" }.' });
    if (args.as === 'person' || args.as === 'session') return fail(`an agent does not call as "${args.as}"`, { fix: 'Give its own name: <stage>:<slice> (verify:api), or driver.' });
  }
  // Only wf_person runs as the person. A caller that names itself the person in any other tool
  // runs as an agent, so the person-only guards of the handlers still refuse it.
  const caller = name === 'wf_person' ? 'person' : (ctx.caller && ctx.caller !== 'person' ? ctx.caller : 'agent');
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
    if (args.slug && args.stage) {
      // The brief, with its calls ready to send: the slug, the slice and the stage filled in.
      const r = await run('brief', { slug: args.slug, stage: args.stage, slice: args.slice }, read);
      if (!r.ok || typeof r.data !== 'string') return r;
      // render.mjs reads INLINE of this module, so it loads here and not at the top.
      const { readyCalls } = await import('../lib/ops/render.mjs');
      const { text, calls } = readyCalls(r.data, { slug: args.slug, slice: args.slice, stage: args.stage });
      return { ...r, data: text, calls };
    }
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
  if (name === 'wf_step' && !args.op && Array.isArray(args.steps)) {
    if (!args.steps.length) return fail('steps is empty: give [{ op, n, ... }, ...]');
    const done = [];
    const warnings = [];
    for (const [i, item] of args.steps.entries()) {
      const op = fullOp(name, String(item?.op ?? ''));
      const why = item?.op ? refusal(name, op, item) : 'each step needs op (start, done, check, stop, retry, complete)';
      if (why) return { ...fail(`step ${i + 1} of steps: ${why}`), done };
      const r = await run(op, strip({ slug: args.slug, slice: args.slice, ...item, op: undefined }));
      if (!r.ok) return { ...r, error: { ...r.error, message: `step ${i + 1} of steps (${op} ${item.n ?? ''}): ${r.error?.message}` }, done };
      done.push(r.data);
      warnings.push(...(r.warnings ?? []));
    }
    return { ok: true, data: done, warnings, next: [] };
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
  if (name === 'wf_wait' && args.for === 'run') return runWait(args, ctx);
  if (name === 'wf_wait' && args.for === 'job') return jobWait(args, ctx);
  if (name === 'wf_job' && JOB_VERBS.includes(String(args.op ?? '').replace(/^job /, ''))) return jobVerb(String(args.op).replace(/^job /, ''), args, ctx);
  if (!args.op) return fail(`${name} needs op${name === 'wf_query' || name === 'wf_run' ? ' or code' : ''}; its operations are: ${opsOf(name).join(', ')}`);
  const op = fullOp(name, args.op);
  const why = name === 'wf_person' && op === 'decide add' ? null : refusal(name, op, args);
  if (why) return fail(why);
  // A job runs on in its own process and returns at once; `wait: true` runs it in the call.
  // `talk job` starts its own job, so it runs in the call.
  if (name === 'wf_job' && !args.wait && op !== 'talk job') return startOpJob(op, args, ctx, caller);
  if (name === 'wf_wait') return waitCall(op, args, run);
  if (name === 'wf_query' && op === 'help') return helpCall(args, run);
  const { wait, ...rest } = args;
  return run(op, strip(rest), READ_TOOLS.has(name) ? { SDLC_MCP_READ: '1' } : {});
}

/**
 * The next events of a run after `cursor`: lines of the driver journal, messages and job ends.
 * The reader keeps no state and never takes the place of a watch of the session.
 */
async function runWait(args, ctx) {
  if (!args.slug) return fail('wf_wait for: run needs slug');
  if (ctx.tasks) {
    const id = ['run', String(args.slug), args.cursor ?? cursorNow(ctx.root, String(args.slug)), ...(args.as ? [String(args.as)] : [])].join('~');
    return { ok: true, task: taskOf(id, ctx.root) };
  }
  const seconds = Math.min(Number(args.seconds) || WAIT_MAX_SECONDS, WAIT_MAX_SECONDS);
  try {
    const r = await waitRunEvents(ctx.root, String(args.slug), { cursor: args.cursor ?? null, as: args.as ?? null, seconds });
    const again = { for: 'run', slug: args.slug, cursor: r.cursor, ...(args.as ? { as: args.as } : {}) };
    return { ok: true, data: r, warnings: [], next: [{ tool: 'wf_wait', arguments: again, why: r.events.length ? 'handle the events, then call again for the next ones' : 'nothing yet: call again now' }] };
  } catch (e) { return fail(e.message); }
}

/** Wait for the end of a job, of a workflow or of the server. It returns within its time; `next` is the same call. */
async function jobWait(args, ctx) {
  if (!args.job) return fail('wf_wait for: job needs job, the id that wf_job gave');
  const slug = jobSlug(args);
  const seconds = Math.min(Number(args.seconds) || WAIT_MAX_SECONDS, WAIT_MAX_SECONDS);
  const end = Date.now() + seconds * 1000;
  for (;;) {
    let j;
    try { j = jobState(ctx.root, slug, String(args.job)); } catch (e) { return fail(e.message); }
    if (!j) return fail(`no job ${args.job}${slug === SERVER_JOBS ? '' : ` in ${slug}`}`, { fix: 'List the jobs with wf_job { "op": "list" }.' });
    // The wait succeeded: the job ended. Its exit is in the data, and a failed job also warns.
    if (j.state !== 'running') return { ok: true, data: jobView(j, 20), warnings: j.exit ? [`the job ended with exit ${j.exit}`] : [], next: [] };
    if (Date.now() >= end) return { ok: true, data: { ...jobView(j), state: 'running' }, warnings: [], next: [{ tool: 'wf_wait', arguments: { for: 'job', job: j.id, ...(slug === SERVER_JOBS ? {} : { slug }) }, why: 'the job still runs: call again now' }] };
    await new Promise((r) => setTimeout(r, 1000));
  }
}

/**
 * The help of the tools: the CLI help of the command, and for each operation that the words name,
 * its tool, its fields and the call. `command` may be one word (step) or the operation (profile run).
 */
async function helpCall(args, run) {
  const words = String(args.command ?? '').trim();
  const r = await run('help', strip({ ...args, command: words.split(/\s+/)[0] || undefined }), { SDLC_MCP_READ: '1' });
  if (!words) return r;
  const { renderCall } = await import('../lib/ops/render.mjs');
  const calls = [];
  for (const [op, row] of registry()) {
    if (op !== words && !op.startsWith(`${words} `) && op.split(' ')[0] !== words) continue;
    const form = allOps().get(op);
    const required = form.positionals.filter((p) => p.name && p.name !== 'root' && !p.optional && !p.fixed).map((p) => p.name);
    const optional = [...form.positionals.filter((p) => p.name && p.name !== 'root' && p.optional && !p.fixed).map((p) => p.name), ...form.flags.filter((x) => x.name !== 'json').map((x) => (x.boolean ? `${x.name} (true)` : x.name))];
    let call = null;
    try { call = renderCall(op, Object.fromEntries(required.map((n) => [n, `<${n}>`]))); } catch { /* a form with no call */ }
    calls.push({ op, tool: row.tool, required, optional, call });
  }
  if (!calls.length && !r.ok) return r;
  return { ...r, ok: true, data: typeof r.data === 'string' ? r.data : r.data ?? null, calls, warnings: r.ok ? r.warnings ?? [] : [], next: [] };
}

/** The longest wait of one call: under the limit of a call of the server (10 minutes). */
export const WAIT_MAX_SECONDS = 540;

/**
 * A wait holds no state in the server: a wait that ends with nothing returns the same call as
 * `next`, with the cursor of what it saw in `after`. The call is all that the agent keeps, so a
 * wait goes on after a compaction and sees each message after the cursor once.
 */
async function waitCall(op, args, run) {
  const fields = strip(args);
  if (fields.seconds !== undefined) fields.seconds = String(Math.min(Number(fields.seconds) || WAIT_MAX_SECONDS, WAIT_MAX_SECONDS));
  else if (op === 'talk wait' || op === 'decide wait') fields.seconds = String(WAIT_MAX_SECONDS);
  // A watch prints until the run ends: a call reads it once.
  if (op === 'progress watch') fields.once = true;
  const r = await run(op, fields);
  if (r.ok && r.data && typeof r.data === 'object' && r.data.state === 'waiting') {
    const again = { op, ...strip(args), ...(r.data.cursor ? { after: r.data.cursor } : {}) };
    r.next = [{ tool: 'wf_wait', arguments: again, why: 'nothing yet: call again now; the cursor keeps the place, so no message is missed' }];
  }
  return r;
}

// The jobs of the server are recorded with the run of their workflow; a job of no workflow goes
// with the jobs of the server.
const JOB_VERBS = ['status', 'logs', 'stop', 'list'];
export const SERVER_JOBS = 'mcp-jobs';
const jobSlug = (args) => (typeof args.slug === 'string' && args.slug ? args.slug : SERVER_JOBS);
const jobView = (j, tail = 0) => ({
  job: j.id, name: j.name, op: j.op ?? null, state: j.state, ...(j.state === 'done' ? { exit: j.exit ?? null } : {}),
  ...(j.stopped ? { stopped: true } : {}), ...(j.timedOut ? { timedOut: true } : {}), startedAt: j.startedAt, ...(j.endedAt ? { endedAt: j.endedAt } : {}), log: j.log,
  ...(tail ? { tail: tailOf(j.log, tail).tail } : {}),
});

/** Start an operation as a detached job. The same call while it runs returns that job. */
function startOpJob(op, args, ctx, caller) {
  const { root } = ctx;
  const { wait, slug: _s, ...rest } = args;
  const fields = strip({ ...rest, ...(allOps().get(op)?.positionals.some((p) => p.name === 'slug') && args.slug ? { slug: args.slug } : {}) });
  const inl = inlineFields(root, op, fields);
  if (inl.error) return fail(inl.error);
  const c = commandOf(op, inl.fields, root);
  if (c.error) return fail(c.error.message, c.error.fix ? { fix: c.error.fix } : {});
  const slug = jobSlug(args);
  const checkout = args.checkout ?? root;
  const sorted = Object.fromEntries(Object.entries(fields).sort(([a], [b]) => a.localeCompare(b)));
  const key = `${op} ${JSON.stringify(sorted)} @ ${checkout}`;
  // Only the variables of the caller go into the record: never the whole env.
  const env = { SDLC_MCP: '1', ...(ctx.env ?? {}), ...(caller === 'person' ? {} : { WF_ACTOR: String(caller ?? 'unknown') || 'unknown' }) };
  let j;
  try {
    j = startJob(root, slug, { argv: [process.execPath, ...c.words], env, unset: caller === 'person' ? ['WF_ACTOR'] : null, key, by: String(caller ?? 'agent'), name: op.replace(/\s+/g, '-'), cwd: checkout });
  } catch (e) { return fail(e.message); }
  if (j.id && !j.existing) writeJob(jobFile(root, slug, j.id), { op });
  const as = String(caller ?? 'agent');
  if (ctx.tasks && j.id) return { ok: true, task: taskOf(`job~${slug}~${j.id}`, root) };
  return {
    ok: true,
    data: { ...(j.id ? jobView({ ...j, op }) : { state: j.state }), ...(j.existing ? { existing: true, note: 'the same job already runs: this is that job' } : {}) },
    warnings: [],
    next: j.id ? [
      { tool: 'wf_wait', arguments: { for: 'job', job: j.id, ...(slug === SERVER_JOBS ? {} : { slug }) }, why: 'wait for the end of the job' },
      ...(slug === SERVER_JOBS ? [] : [{ tool: 'wf_wait', arguments: { op: 'talk wait', slug, as, job: j.id }, why: 'or wait for the end of the job and the messages of the run' }]),
      { tool: 'wf_job', arguments: { op: 'status', slug, job: j.id } },
    ] : [{ tool: 'wf_job', arguments: { op: 'list', slug } }],
  };
}

/**
 * A Task, read from disk: `job~<slug>~<id>` is a job, `run~<slug>~<cursor>[~<as>]` the next
 * events of a run after the cursor. Returns `{ id, status, createdAt, result? }`, or null.
 */
export function taskOf(id, root) {
  const [kind, slug, ref, as] = String(id ?? '').split('~');
  if (!slug || !ref) return null;
  if (kind === 'job') {
    let j;
    try { j = jobState(root, slug, ref); } catch { return null; }
    const view = { id, createdAt: j.startedAt, pollMs: 5000 };
    if (existsSync(`${jobFile(root, slug, ref)}.task-cancel`)) return { ...view, status: 'cancelled' };
    if (j.state === 'running') return { ...view, status: 'working' };
    if (j.state === 'lost') return { ...view, status: 'failed', result: fail(`the job ${ref} was lost: its runner is gone and wrote no end`) };
    return { ...view, status: 'completed', result: { ok: j.exit === 0, data: jobView(j, 40), warnings: [], next: [] } };
  }
  if (kind === 'run') {
    let r;
    try { r = readRunEvents(root, slug, ref, { as: as ?? null }); } catch { return null; }
    const view = { id, createdAt: new Date().toISOString(), pollMs: 2000 };
    if (!r.events.length) return { ...view, status: 'working' };
    const again = { for: 'run', slug, cursor: r.cursor, ...(as ? { as } : {}) };
    return { ...view, status: 'completed', result: { ok: true, data: { state: 'events', ...r }, warnings: [], next: [{ tool: 'wf_wait', arguments: again, why: 'handle the events, then call again for the next ones' }] } };
  }
  return null;
}

/** Cancel a Task. A job Task ends as a Task only: wf_job stop stops the job. */
export function taskCancel(id, root) {
  const [kind, slug, ref] = String(id ?? '').split('~');
  if (kind === 'job') {
    try { jobState(root, slug, ref); } catch { return false; }
    writeFileAtomic(`${jobFile(root, slug, ref)}.task-cancel`, `${new Date().toISOString()}\n`);
    return true;
  }
  return kind === 'run' && Boolean(slug && ref);
}

/** status, logs, stop and list of the jobs of a workflow. */
function jobVerb(verb, args, ctx) {
  const { root } = ctx;
  const slug = jobSlug(args);
  try {
    if (verb === 'list') return { ok: true, data: listJobs(root, slug).slice(0, Number(args.limit ?? 20)).map((j) => jobView(j)), warnings: [], next: [] };
    if (!args.job) return fail(`job ${verb} needs job: the id that the start returned`, { fix: `Call wf_job { "op": "list", "slug": "${slug}" } for the ids.` });
    if (verb === 'status') return { ok: true, data: jobView(jobState(root, slug, String(args.job)), 10), warnings: [], next: [] };
    if (verb === 'logs') {
      const j = jobState(root, slug, String(args.job));
      const t = tailOf(j.log, Math.min(Number(args.lines ?? 200), 2000));
      return { ok: true, data: { job: j.id, state: j.state, size: t.size, tail: t.tail.slice(-TEXT_LIMIT) }, warnings: [], next: [] };
    }
    const stopped = stopJob(root, slug, String(args.job));
    return { ok: true, data: stopped ? jobView(stopped) : { job: String(args.job), note: 'the job was not running' }, warnings: [], next: [] };
  } catch (e) { return fail(e.message); }
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
