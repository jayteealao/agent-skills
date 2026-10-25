/**
 * The wf library: the record operations of the CLI as functions, for a script that
 * `wf.mjs run <root> <script.mjs>` runs. The CLI and the library call the same functions
 * (lib/wf-ops.mjs, lib/wf-status.mjs, lib/decisions.mjs, lib/findings.mjs, lib/board-ops.mjs)
 * and the same step after a change (lib/after-change.mjs), so neither door has a rule that the
 * other door lacks. `wf.mjs describe` prints the functions of this header.
 *
 * API:
 *   wf.records.get(name)
 *             the frontmatter and the body of one record, or null. `index` names 00-index.md
 *             Example: const { frontmatter } = wf.records.get('index')
 *   wf.records.getMany(names)
 *             several records in one call, by their file names
 *             Example: const docs = wf.records.getMany(['06-verify-api', '06-verify-ui'])
 *   wf.records.fields(name, keys)
 *             only the frontmatter fields `keys` of a record; `a.b` reads a field of a map
 *             Example: wf.records.fields('06-verify-api', ['result', 'convergence'])
 *   wf.records.list()
 *             the names of the records of the workflow
 *             Example: wf.records.list().filter((n) => n.startsWith('06-verify-'))
 *   wf.records.set(name, path, value)
 *             change one field with a path form of record set; `list+` appends, `list-` removes
 *             Example: wf.records.set('03-slice', 'slices[api].status', 'in-progress')
 *   wf.records.put(name, { frontmatter, body })
 *             write a whole record with the checks of record put
 *             Example: wf.records.put('07-review', { frontmatter, body: '# Review\n' })
 *   wf.records.draft(name)
 *             write the record as a draft in the local .draft/ folder, and return its path
 *             Example: const path = wf.records.draft('04-plan-api')
 *   wf.decisions.add(entry)
 *             record one answer or decision as decide add does; an answer settles its question
 *             Example: wf.decisions.add({ kind: 'answer', key: 'auth', question: 'Which auth?', answer: 'OAuth', by: 'person' })
 *   wf.decisions.addMany(entries)
 *             record several answers or decisions
 *             Example: wf.decisions.addMany(answers)
 *   wf.decisions.list({ all, slice, packet, by, kind })
 *             the live decisions in a scope; `all` gives every entry, also the superseded ones
 *             Example: wf.decisions.list({ slice: 'api' })
 *   wf.decisions.answered(keys)
 *             for each key, the decision that answers it, or null
 *             Example: wf.decisions.answered(['auth', 'storage'])
 *   wf.findings.list({ source, slice, open })
 *             the findings of the ledger; `open` keeps the findings that are not closed
 *             Example: wf.findings.list({ open: true })
 *   wf.findings.add(found, { source, slice, dimensions, run })
 *             merge one run of findings into the ledger
 *             Example: wf.findings.add([{ dimension: 'correctness', severity: 'HIGH', issue: 'x' }], { source: 'review' })
 *   wf.findings.set(id, { status, reason })
 *             change the status of one finding
 *             Example: wf.findings.set('COR-1', { status: 'fixed' })
 *   wf.status.summary()
 *             where the workflow stands, as status --brief prints it (async)
 *             Example: const s = await wf.status.summary()
 *   wf.steps.where(slice)
 *             the steps of the plan of a slice: done, current, next (read only)
 *             Example: wf.steps.where('api').next
 *   wf.board.items({ thread })
 *             the items of the brainstorm board
 *             Example: wf.board.items({ thread: 't1' })
 *   wf.board.add(kind, entries)
 *             add items, threads or areas to the board
 *             Example: wf.board.add('item', { key: 'i9', thread: 't1', text: 'x' })
 *   wf.board.move(keys, to, { newThread })
 *             move items to a thread, or to a new thread
 *             Example: wf.board.move(['i1', 'i2'], null, { newThread: { key: 't9', name: 'Sync' } })
 *   wf.board.regroup(threads, area)
 *             put threads in an area
 *             Example: wf.board.regroup(['t1', 't2'], 'a1')
 *   wf.board.remove(keys)
 *             remove items from the board
 *             Example: wf.board.remove(['i4'])
 *   open(slug)
 *             the same object for another workflow of the project
 *             Example: const other = open('add-tags')
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterChange } from './after-change.mjs';
import { boardAdd, boardItems, boardMove, boardRegroup, boardRemove } from './board-ops.mjs';
import { answeredBy, decisionsOf, liveDecisions } from './decisions.mjs';
import { OPEN_STATUSES, mergeRun, readLedger, setStatus, writeLedger } from './findings.mjs';
import { noteAnswer } from './github-layer.mjs';
import { parseSetArg } from './record-path.mjs';
import { putChecked } from './record-put.mjs';
import { DRAFT_DIR, draftPath, listDocs, readDoc } from './records.mjs';
import { localWorkflowsRoot, workflowDir } from './records-root.mjs';
import { lastSlice, whereOf } from './steps.mjs';
import { decideAdd, noRecord, pick, recordName, setRecordPaths } from './wf-ops.mjs';
import { statusBrief, stepGit } from './wf-status.mjs';
import { stringify as stringifyYaml } from './yaml.mjs';

/** The run log of the scripts, in the local folder of each workflow; it stays on this machine. */
export const API_LOG = '.api-log.jsonl';

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

// ---------------------------------------------------------------- the snapshot of a run

// The evidence folders hold run output, and the drafts are local: no API call writes them.
const skipped = (name) => name === DRAFT_DIR || /evidence$/.test(name);

function filesOf(dir, rel = '', into = new Map()) {
  if (!existsSync(join(dir, rel))) return into;
  for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (skipped(e.name)) continue;
    if (e.isDirectory()) filesOf(dir, r, into);
    else if (e.isFile()) into.set(r, readFileSync(join(dir, r)));
  }
  return into;
}

/** Put the files of a workflow folder back as the snapshot has them. Returns true when a file changed. */
function restore(dir, snap) {
  let changed = false;
  for (const r of filesOf(dir).keys()) if (!snap.has(r)) { rmSync(join(dir, r), { force: true }); changed = true; }
  for (const [r, bytes] of snap) {
    const file = join(dir, r);
    if (existsSync(file) && statSync(file).isFile() && readFileSync(file).equals(bytes)) continue;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, bytes);
    changed = true;
  }
  return changed;
}

function differs(dir, snap) {
  const now = filesOf(dir);
  if (now.size !== snap.size) return true;
  for (const [r, bytes] of now) if (!snap.get(r)?.equals(bytes)) return true;
  return false;
}

// ---------------------------------------------------------------- the API object

/**
 * The API of one workflow. `hooks.before(slug, dir)` runs before each write, and
 * `hooks.log(entry)` gets one entry for each operation; `wf.mjs run` uses them for the
 * snapshot and the run log. Without hooks, each write applies at once.
 */
export function openWorkflow(root, slug, hooks = {}) {
  const projectRoot = resolve(root);
  const dir = workflowDir(projectRoot, slug);
  if (!slug || !existsSync(dir)) throw new Error(`wf: no workflow folder ${dir}`);
  const log = (op, record = null, keys = [], write = false) => hooks.log?.({ slug, op, record, keys, write });
  const read = (op, record, keys, fn) => { const r = fn(); log(op, record, keys); return r; };
  const write = (op, record, keys, fn) => {
    hooks.before?.(slug, dir);
    try {
      const r = fn();
      log(op, record, keys, true);
      return r;
    } catch (e) {
      e.wfOp = `${op}${record ? ` ${record}` : ''}`;
      throw e;
    }
  };
  const doc = (name) => readDoc(dir, recordName(name)) ?? null;

  const records = {
    get: (name) => read('records.get', recordName(name), [], () => doc(name)),
    getMany: (names) => read('records.getMany', null, names.map(recordName), () => Object.fromEntries(names.map((n) => [recordName(n), doc(n)]))),
    fields: (name, keys) => read('records.fields', recordName(name), keys, () => {
      const d = doc(name);
      if (!d) throw new Error(noRecord(name, slug, dir));
      return pick(d.frontmatter ?? {}, keys);
    }),
    list: () => read('records.list', null, [], () => listDocs(dir)),
    set: (name, path, value) => write('records.set', recordName(name), [String(path)], () => {
      // `list+` and `list-` are the append and the remove of `list+=v` and `list-=v`; the
      // placeholder value is replaced, so the value is never read as YAML.
      const change = parseSetArg(`${path}=x`);
      change.value = value === undefined ? null : value;
      return setRecordPaths(dir, recordName(name), [change], { slug }).frontmatter;
    }),
    put: (name, { frontmatter, body = '' }) => write('records.put', recordName(name), Object.keys(frontmatter ?? {}), () => {
      const n = recordName(name);
      const tmp = mkdtempSync(join(tmpdir(), 'wf-put-'));
      try {
        const path = join(tmp, n);
        writeFileSync(path, `---\n${stringifyYaml(frontmatter ?? {})}\n---\n${body}`);
        const r = putChecked(dir, path);
        if (r.errors.length) throw new Error(`record put: refused ${r.name}: ${r.errors.join('; ')}`);
        return { name: r.name, file: r.file };
      } finally { rmSync(tmp, { recursive: true, force: true }); }
    }),
    draft: (name) => read('records.draft', recordName(name), [], () => {
      const d = doc(name);
      if (!d) throw new Error(noRecord(name, slug, dir));
      const path = draftPath(join(localWorkflowsRoot(projectRoot), slug), recordName(name));
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `---\n${stringifyYaml(d.frontmatter ?? {})}\n---\n${d.body ?? ''}`);
      return path;
    }),
  };

  const answers = [];
  const decisions = {
    add: (entry) => write('decisions.add', 'decisions.yaml', [entry?.key].filter(Boolean), () => {
      const r = decideAdd(dir, entry ?? {});
      if (r.entry.answer && r.entry.kind !== 'steer') answers.push({ question: r.entry.question ?? null, answer: r.entry.answer, by: r.entry.by ?? null });
      return r;
    }),
    addMany: (entries) => entries.map((e) => decisions.add(e)),
    list: ({ all = false, slice, packet, files, by = null, kind = null } = {}) => read('decisions.list', 'decisions.yaml', [], () => {
      const list = decisionsOf(dir);
      return all ? list : liveDecisions(list, { slice, packet, files }, { by, kind });
    }),
    answered: (keys) => read('decisions.answered', 'decisions.yaml', [keys].flat(), () => {
      const list = decisionsOf(dir);
      return Object.fromEntries([keys].flat().map((k) => [k, answeredBy(list, k, {}) ?? null]));
    }),
  };

  const findings = {
    list: ({ source = null, slice = null, open = false } = {}) => read('findings.list', 'findings.yaml', [], () => readLedger(dir).findings
      .filter((f) => (!source || f.source === source) && (slice == null || f.slice === slice) && (!open || OPEN_STATUSES.has(f.status)))),
    add: (found, { source = 'review', slice = null, dimensions = [], run = null } = {}) => write('findings.add', 'findings.yaml', [], () => {
      const r = mergeRun(readLedger(dir), found, { source, slice, dimensions, run });
      writeLedger(dir, r.ledger);
      return { added: r.added, resurfaced: r.resurfaced, resolved: r.resolved, verdict: r.verdict };
    }),
    set: (id, { status, reason = null } = {}) => write('findings.set', 'findings.yaml', [id], () => {
      const ledger = readLedger(dir);
      const e = setStatus(ledger, id, status, reason);
      writeLedger(dir, ledger);
      return e;
    }),
  };

  const status = { summary: async () => { const r = await statusBrief(projectRoot, slug); log('status.summary'); return r; } };

  const steps = {
    where: (slice = null) => read('steps.where', slice, [], () => {
      const target = slice ?? lastSlice(dir);
      return target ? whereOf(dir, target, stepGit(projectRoot, dir)) : { slice: null };
    }),
  };

  const board = {
    items: ({ thread = null } = {}) => read('board.items', 'board', [], () => boardItems(dir, { thread })),
    add: (kind, entries) => write('board.add', 'board', [kind], () => boardAdd(dir, kind, entries)),
    move: (keys, to, { newThread = null } = {}) => write('board.move', 'board', keys, () => boardMove(dir, keys, to, { newThread })),
    regroup: (threads, area) => write('board.regroup', 'board', threads, () => boardRegroup(dir, threads, area)),
    remove: (keys) => write('board.remove', 'board', keys, () => boardRemove(dir, keys)),
  };

  return { slug, dir, records, decisions, findings, status, steps, board, answersOf: () => answers.slice() };
}

// ---------------------------------------------------------------- a run of one script

/**
 * Run the default export of a script, `async ({ wf, open, args }) => value`, with all or
 * nothing: the first write to each workflow takes a snapshot of its folder; when the script
 * throws, or with `dryRun`, every folder goes back to its snapshot. When the script returns,
 * `afterChange` runs once for each workflow that changed: one commit each. Each operation gets
 * a line in the run log. Returns `{ ok, value, error, failedOp, ops, changed, applied }`.
 */
export async function runScript(root, fn, { slug = null, script = null, args = [], dryRun = false, warn } = {}) {
  const projectRoot = resolve(root);
  const snaps = new Map();
  const ops = [];
  const opened = new Map();
  const hooks = {
    before: (s, dir) => { if (!snaps.has(s)) snaps.set(s, { dir, files: filesOf(dir) }); },
    log: (e) => ops.push({ at: nowIso(), script: script ? basename(script) : null, ...e }),
  };
  const open = (s) => {
    if (!opened.has(s)) opened.set(s, openWorkflow(projectRoot, s, hooks));
    return opened.get(s);
  };
  let value;
  let error = null;
  let failedOp = null;
  try {
    value = await fn({ wf: slug ? open(slug) : null, open, args });
  } catch (e) {
    error = e;
    failedOp = e?.wfOp ?? null;
  }
  const apply = !error && !dryRun;
  const changed = [];
  for (const [s, { dir, files }] of snaps) {
    if (!apply) { restore(dir, files); continue; }
    if (differs(dir, files)) changed.push(s);
  }
  for (const s of changed) {
    for (const a of opened.get(s)?.answersOf() ?? []) {
      try { noteAnswer(projectRoot, s, a); } catch { /* the layer queue is not the change */ }
    }
    afterChange(projectRoot, s, { label: `${s}: wf run ${script ? basename(script) : 'script'}`, ...(warn ? { warn } : {}) });
  }
  // The log names the fields of each operation, not their values.
  const bySlug = new Map();
  for (const o of ops) bySlug.set(o.slug, [...(bySlug.get(o.slug) ?? []), o]);
  for (const [s, list] of bySlug) {
    const file = join(localWorkflowsRoot(projectRoot), s, API_LOG);
    try {
      mkdirSync(dirname(file), { recursive: true });
      appendFileSync(file, list.map((o) => JSON.stringify({ ...o, applied: apply })).join('\n').concat('\n'));
    } catch { /* the log is not the change */ }
  }
  return { ok: !error, value, error, failedOp, ops, changed, applied: apply };
}
