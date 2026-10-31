#!/usr/bin/env node
/**
 * scripts/prototype.mjs — the disk side of /wf loop prototype.
 * skills/wf/scripts/prototype.mjs runs this script.
 *
 *   start   <root> <slug> --idea t [--branch b] [--base b] [--worktree p]
 *                                    the poc/<slug> branch, its worktree, the workflow folder, the INDEX.md row
 *   status  <root> <slug>            the accepted pipeline, the open proofs, the report link, the problems
 *   check   <root> <slug>            the ledger against $defs.prototypeLedger and the ledger rules
 *   report  <root> <slug>            build report.html from the ledger and the proof media
 *   decide  <root> <slug> <D-NN>     commit one decision: explicit paths only, message poc(<slug>): accept <component>
 *   exit    <root> <slug> park|graduate|close
 *                                    record the person's exit; graduate prints the intake line
 *   cleanup <root> <slug>            remove the worktree after close; refuses while it holds a link
 *
 * <root> is the main checkout or the prototype worktree. Every command prints one
 * JSON object on stdout. The model runs the rounds and edits the ledger; this
 * script makes every git write. It never starts a round.
 *
 * CAUTION: this script never runs `git add -A`. A proof writes model weights,
 * downloads and virtual environments into the worktree, and `-A` commits them.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expand } from '../components/_components.mjs';
import {
  DOC_FILE, LEDGER_FILE, MAX_COMMIT_FILE_BYTES, REPORT_FILE, SCRATCH_DIR,
  branchFor, buildReport, commitPlan, ledgerProblems, mediaKind, newLedger, openProofs, reportProblems,
} from '../lib/prototype.mjs';
import { validatePrototypeLedger } from '../lib/schema-validator.mjs';
import { workflowRel, workflowsRoot } from '../lib/records-root.mjs';
import { INDEX_HEADER, INDEX_NAME, META_FILE, STATE_FILE, hasDoc, locate as recordPlace, readDoc, setFields, writeDoc } from '../lib/records.mjs';

const USAGE = 'Usage: prototype.mjs <start|status|check|report|decide|exit|cleanup> <projectRoot> <slug> ...';
const PLUGIN_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const toPosix = (p) => p.split('\\').join('/');
const wfRel = workflowRel;

function writeAtomic(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  for (let i = 0; ; i++) {
    try { renameSync(tmp, file); return; } catch (e) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code) || i >= 19) { rmSync(tmp, { force: true }); throw e; }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
}

function git(cwd, args) {
  const r = spawnSync('git', ['-c', 'core.longpaths=true', '-C', cwd, ...args], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}
const gitOk = (cwd, args, what) => {
  const r = git(cwd, args);
  if (!r.ok) throw new Error(`${what}: git ${args.join(' ')} failed: ${r.err || r.out}`);
  return r.out;
};

const samePath = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase();

/** The main checkout of the repo that `dir` belongs to: the first entry of `git worktree list`. */
function mainCheckout(dir) {
  const list = worktrees(dir);
  return list[0]?.path ?? dir;
}

function worktrees(dir) {
  const r = git(dir, ['worktree', 'list', '--porcelain']);
  if (!r.ok) return [];
  const out = [];
  let cur = null;
  for (const line of r.out.split(/\r?\n/)) {
    if (line.startsWith('worktree ')) { cur = { path: resolve(line.slice(9)), branch: null }; out.push(cur); }
    else if (line.startsWith('branch ') && cur) cur.branch = line.slice(7).replace(/^refs\/heads\//, '');
  }
  return out;
}

/** The worktree that holds the prototype of `slug`, found from the main checkout or from the worktree itself. */
function locate(root, slug) {
  const ledgerIn = (dir) => existsSync(join(dir, wfRel(slug), LEDGER_FILE));
  if (ledgerIn(root)) return root;
  const list = worktrees(root);
  const branch = indexRow(mainCheckout(root), slug)?.branch || branchFor(slug);
  const byBranch = list.find((w) => w.branch === branch && ledgerIn(w.path));
  if (byBranch) return byBranch.path;
  const any = list.find((w) => ledgerIn(w.path));
  return any?.path ?? null;
}

function needWorktree(root, slug) {
  const wt = locate(root, slug);
  if (!wt) throw new Error(`no prototype ${slug}: start one with /wf loop prototype <idea>`);
  return wt;
}

const ledgerPath = (wt, slug) => join(wt, wfRel(slug), LEDGER_FILE);
function readLedger(wt, slug) {
  const p = ledgerPath(wt, slug);
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch (e) { throw new Error(`${LEDGER_FILE} does not parse: ${e.message}`); }
}
const saveLedger = (wt, slug, ledger) => writeAtomic(ledgerPath(wt, slug), `${JSON.stringify(ledger, null, 2)}\n`);

// ---------------------------------------------------------------- INDEX.md


function indexRow(main, slug) {
  const p = join(workflowsRoot(main), 'INDEX.md');
  if (!existsSync(p)) return null;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const cols = line.split('\t');
    if (cols[0] === slug) return { slug, status: cols[1], type: cols[2], branch: cols[3], updatedAt: cols[4] };
  }
  return null;
}

/** Add or replace the prototype's row in the main checkout's INDEX.md, so /wf status finds the worktree. */
function upsertIndexRow(main, { slug, status, branch, at }) {
  const p = join(workflowsRoot(main), 'INDEX.md');
  const lines = existsSync(p) ? readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.length) : [INDEX_HEADER];
  const header = lines.filter((l) => l.startsWith('#'));
  const rows = lines.filter((l) => !l.startsWith('#') && l.split('\t')[0] !== slug);
  rows.push([slug, status, 'prototype', branch, at].join('\t'));
  rows.sort((a, b) => a.split('\t')[0].localeCompare(b.split('\t')[0]));
  writeAtomic(p, `${[...(header.length ? header : [INDEX_HEADER]), ...rows].join('\n')}\n`);
}

// ---------------------------------------------------------------- the files

function indexRecord({ slug, idea, branch, baseBranch, worktree, status, at, next }) {
  return {
    frontmatter: {
      schema: 'sdlc/v1',
      type: 'workflow-index',
      slug,
      title: `Prototype: ${idea}`,
      'workflow-type': 'prototype',
      'current-stage': 'prototype',
      status,
      'branch-strategy': 'dedicated',
      branch,
      'base-branch': baseBranch ?? null,
      worktree: toPosix(worktree),
      'open-questions': [],
      'next-command': 'wf-prototype',
      'next-invocation': next,
      progress: { prototype: status === 'open' ? 'in-progress' : status },
      'created-at': at,
      'updated-at': at,
    },
    body: [
      `# Prototype: ${idea}`,
      '',
      `The person steers this prototype one round at a time. The proof ledger is \`${LEDGER_FILE}\`; the accepted pipeline is \`${DOC_FILE}\`; the rolling report is \`${REPORT_FILE}\`.`,
      '',
    ].join('\n'),
  };
}

function docRecord({ slug, idea, at }) {
  return {
    frontmatter: {
      schema: 'sdlc/v1',
      type: 'prototype',
      slug,
      idea,
      status: 'open',
      ledger: LEDGER_FILE,
      report: REPORT_FILE,
      'created-at': at,
      'updated-at': at,
    },
    body: docBody(idea),
  };
}

function docBody(idea) {
  return [
    `# ${idea}`,
    '',
    '## The accepted pipeline',
    '',
    'No component is accepted yet.',
    '',
    '## Known limits',
    '',
    'None recorded yet.',
    '',
  ].join('\n');
}

function setIndexStatus(wt, slug, status, next) {
  const dir = join(wt, wfRel(slug));
  const index = readDoc(dir, INDEX_NAME)?.frontmatter;
  if (!index) return;
  const progress = index.progress && typeof index.progress === 'object' ? index.progress : {};
  setFields(dir, INDEX_NAME, {
    status,
    progress: { ...progress, prototype: status === 'open' ? 'in-progress' : status },
    'updated-at': nowIso(),
    ...(next ? { 'next-invocation': next } : {}),
  });
}

/**
 * The paths of a commit plan, with each record path of the old layout mapped to the record
 * file that holds it now: `00-index.md` is state.yaml and meta.yaml, `01-prototype.md` is
 * intake.yaml. A record still in the old layout keeps its path.
 */
function recordPaths(wt, slug, paths) {
  const rel = wfRel(slug);
  const dir = join(wt, rel);
  const out = [];
  for (const p of paths) {
    const name = p.startsWith(`${rel}/`) ? p.slice(rel.length + 1) : null;
    const place = name && !name.includes('/') ? recordPlace(name) : null;
    if (!place || existsSync(join(dir, name))) { out.push(p); continue; }
    const files = name === INDEX_NAME ? [STATE_FILE, META_FILE] : [place.file];
    for (const f of files) if (existsSync(join(dir, f))) out.push(`${rel}/${f}`);
  }
  return [...new Set(out)];
}

// ---------------------------------------------------------------- commands

function start(root, slug, f) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error(`slug ${slug}: use lower-case words joined by dashes`);
  const idea = String(f.idea ?? '').trim();
  if (!idea || idea === 'true') throw new Error('start needs --idea "<the open question, in the person\'s words>"');
  const top = git(root, ['rev-parse', '--show-toplevel']);
  if (!top.ok) throw new Error('not a git repository: a prototype runs in a worktree on its own branch');
  const main = mainCheckout(resolve(top.out));
  if (hasDoc(join(main, wfRel(slug)), INDEX_NAME)) throw new Error(`${workflowRel(slug)} exists in the main checkout: pick another slug`);
  const existing = locate(main, slug);
  if (existing) return { ok: true, resumed: true, slug, worktree: existing, ...summary(existing, slug) };

  const branch = String(f.branch && f.branch !== true ? f.branch : branchFor(slug));
  const baseBranch = f.base && f.base !== true ? String(f.base) : (git(main, ['rev-parse', '--abbrev-ref', 'HEAD']).out || null);
  const wt = f.worktree && f.worktree !== true ? resolve(main, String(f.worktree)) : join(dirname(main), `${basename(main)}.poc`, slug);
  if (existsSync(wt)) throw new Error(`the worktree path ${wt} exists: name another with --worktree`);

  const local = git(main, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]).ok;
  const remote = !local && git(main, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`]).ok;
  mkdirSync(dirname(wt), { recursive: true });
  if (local) gitOk(main, ['worktree', 'add', '-q', wt, branch], 'worktree add');
  else if (remote) gitOk(main, ['worktree', 'add', '-q', '-b', branch, wt, `origin/${branch}`], 'worktree add');
  else gitOk(main, ['worktree', 'add', '-q', '-b', branch, wt, baseBranch || 'HEAD'], 'worktree add');

  const at = nowIso();
  const dir = join(wt, wfRel(slug));
  mkdirSync(dir, { recursive: true });
  // Scratch is ignored by its own .gitignore, so the repo's ignore rules do not change.
  mkdirSync(join(wt, SCRATCH_DIR), { recursive: true });
  if (!existsSync(join(wt, '.scratch', '.gitignore'))) writeFileSync(join(wt, '.scratch', '.gitignore'), '*\n');
  const next = `/wf loop prototype ${slug} <request>`;
  if (!hasDoc(dir, INDEX_NAME)) writeDoc(dir, INDEX_NAME, indexRecord({ slug, idea, branch, baseBranch, worktree: wt, status: 'open', at, next }));
  if (!existsSync(ledgerPath(wt, slug))) saveLedger(wt, slug, newLedger({ slug, idea, branch, baseBranch, worktree: toPosix(wt), at }));
  if (!hasDoc(dir, DOC_FILE)) writeDoc(dir, DOC_FILE, docRecord({ slug, idea, at }));
  upsertIndexRow(main, { slug, status: 'open', branch, at });
  return { ok: true, resumed: false, slug, branch, reusedBranch: local || remote, baseBranch, worktree: wt, workflowDir: dir, scratch: join(wt, SCRATCH_DIR), next };
}

function problemsOf(wt, slug, ledger) {
  const schema = validatePrototypeLedger(ledger);
  const problems = schema.valid ? [] : schema.errors.map((e) => `${e.path || '/'}: ${e.message}`);
  problems.push(...ledgerProblems(ledger));
  for (const p of ledger.proofs ?? []) {
    for (const file of [...(p.files ?? []), ...(p.media ?? [])]) {
      if (!existsSync(join(wt, file))) problems.push(`proof ${p.id}: file ${file} does not exist in the worktree`);
    }
  }
  return problems;
}

function summary(wt, slug) {
  const ledger = readLedger(wt, slug);
  const rounds = ledger.rounds ?? [];
  const reportAbs = join(wt, wfRel(slug), REPORT_FILE);
  const tracked = new Set(git(wt, ['ls-files', '--', wfRel(slug)]).out.split(/\r?\n/).filter(Boolean));
  const recorded = [...new Set([...(ledger.proofs ?? []).flatMap((p) => p.files ?? []), ...rounds.flatMap((r) => r.files ?? [])])];
  return {
    status: ledger.status,
    branch: ledger.branch,
    rounds: rounds.length,
    lastRound: rounds[rounds.length - 1] ?? null,
    pipeline: ledger.pipeline ?? [],
    decisions: (ledger.decisions ?? []).map((d) => ({ id: d.id, component: d.component, generalized: d.generalized === true, commit: d.commit ?? null })),
    openProofs: openProofs(ledger).map((p) => ({ id: p.id, question: p.question, verdict: p.verdict })),
    report: { file: reportAbs, exists: existsSync(reportAbs), url: ledger.report?.url ?? null },
    uncommitted: recorded.filter((p) => !git(wt, ['ls-files', '--error-unmatch', '--', p]).ok).slice(0, 50),
    recordsTracked: tracked.size > 0,
    problems: problemsOf(wt, slug, ledger),
  };
}

function status(root, slug) {
  const wt = needWorktree(root, slug);
  return { ok: true, slug, worktree: wt, ...summary(wt, slug) };
}

function check(root, slug) {
  const wt = needWorktree(root, slug);
  const problems = problemsOf(wt, slug, readLedger(wt, slug));
  return { ok: problems.length === 0, slug, worktree: wt, problems };
}

function mediaReader(wt) {
  return (p) => {
    const abs = join(wt, p);
    if (!existsSync(abs)) return { exists: false };
    const kind = mediaKind(p);
    if (kind.kind !== 'image') return { exists: true };
    const buf = readFileSync(abs);
    return { exists: true, bytes: buf.length, dataUri: `data:${kind.mime};base64,${buf.toString('base64')}` };
  };
}

function buildAndWrite(wt, slug) {
  const ledger = readLedger(wt, slug);
  const doc = readDoc(join(wt, wfRel(slug)), DOC_FILE)?.body ?? '';
  const html = buildReport(ledger, {
    expand: (h) => expand(h, { componentsRoot: join(PLUGIN_ROOT, 'components'), maxDepth: 4 }),
    mediaFor: mediaReader(wt),
    doc,
  });
  const file = join(wt, wfRel(slug), REPORT_FILE);
  writeAtomic(file, html);
  const { bytes, problems } = reportProblems(html);
  const heaviest = (ledger.proofs ?? []).flatMap((p) => p.media ?? [])
    .filter((m) => existsSync(join(wt, m)))
    .map((m) => ({ path: m, bytes: statSync(join(wt, m)).size }))
    .sort((a, b) => b.bytes - a.bytes).slice(0, 5);
  return { file, bytes, problems, heaviest, url: ledger.report?.url ?? null };
}

function report(root, slug) {
  const wt = needWorktree(root, slug);
  const r = buildAndWrite(wt, slug);
  return { ok: r.problems.length === 0, slug, worktree: wt, ...r };
}

function decide(root, slug, decisionId, f) {
  if (!decisionId) throw new Error('decide needs the decision id, for example D-01');
  const wt = needWorktree(root, slug);
  const ledger = readLedger(wt, slug);
  const problems = problemsOf(wt, slug, ledger);
  if (problems.length) return { ok: false, slug, error: 'the ledger has problems: repair them before the commit', problems };
  const plan = commitPlan(ledger, decisionId, wfRel(slug));
  if (plan.error) return { ok: false, slug, error: plan.error };
  plan.paths = recordPaths(wt, slug, plan.paths);
  const built = buildAndWrite(wt, slug);

  const refused = [];
  for (const p of plan.paths) {
    const abs = join(wt, p);
    if (!existsSync(abs)) { refused.push(`${p}: does not exist`); continue; }
    if (git(wt, ['check-ignore', '-q', '--', p]).ok) refused.push(`${p}: git ignores it`);
    else if (statSync(abs).isFile() && statSync(abs).size > MAX_COMMIT_FILE_BYTES) refused.push(`${p}: ${statSync(abs).size} bytes, over ${MAX_COMMIT_FILE_BYTES}; a large file stays out of the commit`);
  }
  if (refused.length) return { ok: false, slug, error: 'some paths cannot be committed: remove them from the proof files, or fix them', refused };
  const before = git(wt, ['diff', '--cached', '--name-only']).out.split(/\r?\n/).filter(Boolean).map(toPosix);
  const extra = before.filter((p) => !plan.paths.includes(p));
  if (extra.length) return { ok: false, slug, error: 'the index already holds staged files that this decision does not name: unstage them first', staged: extra };

  gitOk(wt, ['add', '--', ...plan.paths], 'stage');
  const message = f.message && f.message !== true ? `${plan.message}\n\n${f.message}` : plan.message;
  const staged = git(wt, ['diff', '--cached', '--name-only']).out.split(/\r?\n/).filter(Boolean);
  if (!staged.length) return { ok: false, slug, error: 'nothing changed since the last commit: there is nothing to commit' };
  gitOk(wt, ['commit', '-q', '-m', message], 'commit');
  const sha = gitOk(wt, ['rev-parse', 'HEAD'], 'rev-parse');
  // The commit id goes into the ledger, which the next decide commit carries.
  const after = readLedger(wt, slug);
  const d = after.decisions.find((x) => x.id === decisionId);
  d.commit = sha;
  after['updated-at'] = nowIso();
  saveLedger(wt, slug, after);
  return { ok: true, slug, worktree: wt, commit: sha, message: plan.message, paths: staged, skipped: plan.skipped, warning: plan.warning, report: { bytes: built.bytes, problems: built.problems } };
}

function exitPrototype(root, slug, how) {
  if (!['park', 'graduate', 'close'].includes(how)) throw new Error('exit needs park, graduate, or close');
  const wt = needWorktree(root, slug);
  const ledger = readLedger(wt, slug);
  const statusOf = { park: 'parked', graduate: 'graduated', close: 'closed' }[how];
  ledger.status = statusOf;
  ledger['updated-at'] = nowIso();
  saveLedger(wt, slug, ledger);
  const next = how === 'graduate' ? `/wf intake ${ledger.idea} from ${slug}` : how === 'close' ? `/wf intake ${slug} close` : `/wf loop prototype ${slug} <request>`;
  setIndexStatus(wt, slug, statusOf, next);
  upsertIndexRow(mainCheckout(wt), { slug, status: statusOf, branch: ledger.branch, at: ledger['updated-at'] });
  const out = { ok: true, slug, status: statusOf, worktree: wt, branch: ledger.branch, next };
  if (how === 'graduate') out.brief = readDoc(join(wt, wfRel(slug)), DOC_FILE)?.path ?? join(wt, wfRel(slug), DOC_FILE);
  if (how === 'close') out.links = linksUnder(wt);
  return out;
}

/** A junction or a symbolic link under the worktree: a recursive delete can follow one into the main checkout. */
function linksUnder(dir, limit = 20, maxDirs = 20000) {
  const found = [];
  const stack = [dir];
  let seen = 0;
  while (stack.length && found.length < limit && seen < maxDirs) {
    const d = stack.pop();
    seen++;
    let entries = [];
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.name === '.git') continue;
      const p = join(d, e.name);
      let st;
      try { st = lstatSync(p); } catch { continue; }
      if (st.isSymbolicLink()) found.push(toPosix(relative(dir, p)));
      else if (st.isDirectory()) stack.push(p);
    }
  }
  return found;
}

function cleanup(root, slug) {
  const wt = needWorktree(root, slug);
  const main = mainCheckout(wt);
  if (samePath(wt, main)) throw new Error('the prototype runs in the main checkout: there is no worktree to remove');
  const ledger = readLedger(wt, slug);
  if (ledger.status !== 'closed') return { ok: false, slug, error: `the prototype is ${ledger.status}: the person closes it first (exit close)` };
  // CAUTION: `git worktree remove --force` deletes through a node_modules junction into the main checkout.
  const links = linksUnder(wt);
  if (links.length) return { ok: false, slug, links, error: `the worktree holds links (${links.slice(0, 3).join(', ')}). A recursive delete can follow a link. Remove the links, then run cleanup again.` };
  const r = git(main, ['worktree', 'remove', wt]);
  if (!r.ok) return { ok: false, slug, error: `git worktree remove failed: ${r.err}. The worktree may hold files that git does not track; look at them, then remove the folder yourself.` };
  return { ok: true, slug, removed: wt, kept: ledger.branch };
}

function flags(rest) {
  const pos = [];
  const f = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = rest[i + 1];
      if (v === undefined || v.startsWith('--')) f[k] = true;
      else { f[k] = v; i++; }
    } else pos.push(a);
  }
  return { pos, f };
}

export function main(argv = process.argv.slice(2)) {
  const [cmd, rootArg, slug, ...rest] = argv;
  if (!cmd || !rootArg || !slug) { process.stderr.write(`${USAGE}\n`); return 2; }
  const root = resolve(rootArg);
  const { pos, f } = flags(rest);
  let out;
  try {
    switch (cmd) {
      case 'start': out = start(root, slug, f); break;
      case 'status': out = status(root, slug); break;
      case 'check': out = check(root, slug); break;
      case 'report': out = report(root, slug); break;
      case 'decide': out = decide(root, slug, pos[0], f); break;
      case 'exit': out = exitPrototype(root, slug, pos[0]); break;
      case 'cleanup': out = cleanup(root, slug); break;
      default: out = null;
    }
  } catch (e) {
    out = { ok: false, error: e.message };
  }
  if (out === null) { process.stderr.write(`${USAGE}\n`); return 2; }
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  return out.ok ? 0 : 1;
}

export { PLUGIN_ROOT };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
