#!/usr/bin/env node
/**
 * scripts/campaign.mjs — the disk side of /wf campaign, the serial walk over the
 * packets of one list.
 * skills/wf/scripts/campaign.mjs runs this script.
 *
 *   check   <source-dir|board-file>                 the list check of section 4.2 (exit 1 on an error)
 *   write   <source-dir|board-file> [--dry-run]     write the packet files, then work/index.md last
 *   archive <source-dir|board-file> [--dry-run]     move the closed part of the board to archive/board.json
 *   status  <root> <source> [--end]                 the list, the current packet and its next step, the packets that need design,
 *                                                   the questions to ask now (ask), the ones that wait (askLater), and then
 *   next    <root> <source> [--end] [--how-far n|next|all --since t] [--run-decisions a] [--trunk t]
 *                                                   the one next action of the walk; it changes nothing
 *   plan    <root> <source> [--full]                the whole walk before it starts: forms, stops, slices, a cost range
 *   skip    <root> <source> <packet-key> --reason r  the person's skip: the walk goes on with a later packet
 *   unskip  <root> <source> <packet-key>             take the skip back
 *   ahead   <root> <source> <packet-key>...          the person let these packets run ahead of the skipped ones
 *   digest  <root> <source> <packet-key> [--answer a]  mark the delegate digest of a packet as answered
 *   open    <root> <source> <packet-key>             write the workflow folder of a build packet (section 5)
 *   land    <root> <source> [<packet-key>] [--trunk t]  put the walk's checkout on the list branch packets/<source>
 *                                                   (stacked PRs: on the layer of the packet, a gh-stack branch)
 *   start   <root> <source> <packet-key> [--trunk t] set base-branch of the packet; a migrated packet commits, rebases and merges first
 *   built   <root> <source> <packet-key> [--no-push] state built after a clean yolo run; push, and open the draft PR once
 *   reopen  <root> <source> <packet-key>             state open again after a fix slice is added to a built packet
 *   done    <root> <source> <packet-key> [--trunk t] [--no-push]  close the packet: merge the trunk, move its end branch,
 *                                                   base-branch back to the trunk, push (stacked: gh stack sync and submit)
 *   close   <root> <source> <packet-key> done|dropped  close a routed packet, or drop a packet (packet file and board)
 *   slice-order <checkout> <slug> add --slice s --after t [--why w]   a plan's order as a depends-on edge
 *   migrate <root> <source> report|apply|regroup|finish [--trunk t] [--dry-run]  the migration of an old campaign (section 12);
 *                                                   regroup gives each shared kept decision one home
 *   remove-worktree <root> <source> <path> [--allow-ignored] [--unit <key>]  the guarded remove of an old campaign worktree (12.7)
 *
 * Every command prints one JSON object on stdout. The list has no ledger: its state is
 * the `state` field of each packet file (work/<packet-slug>.md).
 */
import { isMainModule } from '../lib/proc.mjs';
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from '../lib/yaml.mjs';
import { DECISIONS_FILE, HOW_FAR_KEY, HOW_FAR_QUESTION, RUN_DECISIONS_KEY, RUN_DECISIONS_QUESTION, addDecision, answeredBy, appendEntry, decisionsOf, runDelegatedIn, storeText } from '../lib/decisions.mjs';

import { checkList, writeList, readWorkFiles, listBranch, endBranch, BUILD_FORMS, PACKET_STATES, DEFAULT_FILES, IDEATE_FILES } from '../lib/packets.mjs';
import { archiveBoard, docCheck, mergeArchive } from '../lib/brainstorm-archive.mjs';
import { ROSTER_DOC, closesCycle, rosterOf, rosterWalkOrder, setFrontmatterValue, setRosterEntry } from '../lib/roster-edit.mjs';
import { ignoredAtRisk, loadManifest, recordsOut, recordsPending, saveManifest, withRecordsLock } from '../lib/campaign-records.mjs';
import { appendSquash, commitIdentity } from '../lib/steps.mjs';
import { safeParseFrontmatter } from '../lib/frontmatter.mjs';
import { needsPictures } from '../lib/design-boards.mjs';
import { missingDesignFiles } from '../lib/design-surface.mjs';
import { designNeeded, designSettled, namesScreens } from '../lib/design-lane.mjs';
import { validateBrainstormBoard } from '../lib/schema-validator.mjs';
import { linkedProject, realPathOf, recordsRel, workflowDir, workflowRel, workflowsRoot } from '../lib/records-root.mjs';
import { commitRecords } from '../lib/records-sync.mjs';
import { INDEX_HEADER, INDEX_NAME, META_FILE, hasDoc, readDoc, setFields as setRecordFields, writeDoc } from '../lib/records.mjs';
import { baseCheck, defaultRun, prShapeOf, readShipPlan } from '../lib/last-mile.mjs';
import { STALE_FLOOR_MS, parseJsonLines } from '../lib/live-events.mjs';
import { readLedger } from '../lib/findings.mjs';
import { lastRunEndAt } from '../lib/stop-request.mjs';
import { aggregateCost, readCostRows, rebookedEntries } from '../lib/cost-ledger.mjs';
import { agentFix, failureOf, fixLines, personFix, refuse, withFix } from '../lib/fix.mjs';

/** The sub-commands of this script: a fix names only these. */
export const COMMANDS = Object.freeze(['check', 'write', 'archive', 'status', 'next', 'plan', 'skip', 'unskip', 'ahead', 'digest', 'open', 'land', 'start', 'built', 'reopen', 'done', 'close', 'accept', 'slice-order', 'migrate', 'remove-worktree']);

const USAGE ='Usage: campaign.mjs <check|write|archive> <source-dir|board-file> | <status|next|plan|digest|open|land|start|built|reopen|done|close|accept|skip|unskip|ahead|migrate|remove-worktree> <projectRoot> <source> ... | slice-order <checkout> <slug> add ...';
// A usage error names its repair like every other failure.
const USAGE_FIX = fixLines(agentFix('Run the command again with a sub-command and the arguments that the usage line names.')).join('\n');

// scripts/ sits one level under the plugin root. The commands that `next` prints run the skill's
// wrappers, as the walk does.
const PLUGIN_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CAMPAIGN_CLI = join(PLUGIN_ROOT, 'skills', 'wf', 'scripts', 'campaign.mjs');
const WF_CLI = join(PLUGIN_ROOT, 'skills', 'wf', 'scripts', 'wf.mjs');

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const sourceDir = workflowDir;
const workDir = (root, src) => join(sourceDir(root, src), 'work');
const oldCampDir = (root, src) => join(workDir(root, src), 'campaign');
const archivedCampDir = (root, src) => join(workDir(root, src), 'archive', 'campaign');
const wfDir = workflowDir;
const posix = (p) => String(p).split('\\').join('/');

function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

function readFm(file) {
  if (!existsSync(file)) return null;
  return safeParseFrontmatter(readFileSync(file, 'utf8')).data ?? {};
}

/** The frontmatter of one workflow record, in either layout: {} when it does not parse, null when it is absent. */
function recordFm(dir, name) {
  const doc = readDoc(dir, name);
  return doc ? (doc.frontmatter ?? {}) : null;
}

function dump(data) {
  return stringify(data);
}

/**
 * One git command. `raw` keeps the leading spaces of stdout, which carry meaning in
 * `git status --porcelain` (` M path`); only the trailing newlines go.
 */
function git(cwd, args, { raw = false } = {}) {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const out = r.stdout ?? '';
  return { status: r.status, stdout: raw ? out.replace(/[\r\n]+$/, '') : out.trim(), stderr: (r.stderr ?? '').trim() };
}

const commitOf = (cwd, ref) => {
  const r = git(cwd, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  return r.status === 0 ? r.stdout : null;
};
const isAncestor = (cwd, a, b) => git(cwd, ['merge-base', '--is-ancestor', a, b]).status === 0;

// The walk's own commits and merges. A repo's commit-msg hook can refuse git's default
// subject (too long, no type), so each one has a short conventional subject, and the
// names go into the body.
const SUBJECTS = Object.freeze({
  snapshot: 'chore: save the uncommitted work of an old unit',
  squash: 'chore: put the work of an old unit in one commit',
  unitMerge: 'chore: merge the work of an old unit',
  trunkMerge: 'chore: merge the trunk into the list branch',
});
const message = (subject, body) => ['-m', subject, '-m', body];

/** A merge that stopped, then aborted: a conflict when git left unmerged files, else a refused commit (a commit-msg hook, for example). */
function abortMerge(cwd, mg) {
  const unmerged = git(cwd, ['diff', '--name-only', '--diff-filter=U']).stdout.split(/\r?\n/).filter(Boolean);
  git(cwd, ['merge', '--abort']);
  return { conflict: unmerged.length > 0, unmerged, text: mg.stderr || mg.stdout };
}
const currentBranch = (cwd) => git(cwd, ['branch', '--show-current']).stdout || null;
const hasRemote = (cwd, name = 'origin') => git(cwd, ['remote']).stdout.split(/\r?\n/).includes(name);

/** The trunk: --trunk, the remote's HEAD, or main, or master. */
function trunkOf(root, f = {}) {
  if (f.trunk) return String(f.trunk);
  const head = git(root, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
  if (head.status === 0 && head.stdout) return head.stdout.replace(/^origin\//, '');
  for (const t of ['main', 'master']) if (commitOf(root, `refs/heads/${t}`)) return t;
  return 'main';
}

/** The trunk ref to merge from: origin/<trunk> after a fetch when a remote exists, else the local trunk. */
function trunkRef(root, trunk) {
  if (hasRemote(root)) {
    git(root, ['fetch', '--quiet', 'origin', trunk]);
    if (commitOf(root, `refs/remotes/origin/${trunk}`)) return `origin/${trunk}`;
  }
  return trunk;
}

/** Files that git sees as changed in a checkout, outside `.ai/`. */
function dirtyOutsideAi(cwd) {
  const r = git(cwd, ['status', '--porcelain'], { raw: true });
  if (r.status !== 0) return null;
  return r.stdout.split(/\r?\n/).filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, '')).filter((p) => !posix(p).startsWith('.ai/'));
}

const gh = (root, args) => defaultRun('gh', args, { cwd: root });
/** The PR shape of the walk, from the ship plan: `single` (one PR for the list) or `stacked`. */
const shapeOf = (root) => prShapeOf(readShipPlan(root));

function appendHistory(dir, text, stage = 'campaign') {
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, 'index-history.jsonl'), `${JSON.stringify({ at: nowIso(), kind: 'note', text, stage })}\n`);
}

/** Set top-level frontmatter keys of a packet file; returns false when the file has no frontmatter. */
function setFields(file, fields) {
  let text = readFileSync(file, 'utf8');
  for (const [k, v] of Object.entries(fields)) {
    const next = setFrontmatterValue(text, k, v);
    if (next === null) return false;
    text = next;
  }
  writeFileSync(file, text);
  return true;
}

// ---------------------------------------------------------------- the board and the list

/** The source folder and the board file of an argument: a board path, or a folder with one board. */
export function resolveBoard(arg) {
  const abs = resolve(arg);
  if (abs.endsWith('.json')) return { dir: dirname(abs), boardFile: basename(abs) };
  for (const name of [DEFAULT_FILES.board, IDEATE_FILES.board]) {
    if (existsSync(join(abs, name))) return { dir: abs, boardFile: name };
  }
  return { dir: abs, boardFile: DEFAULT_FILES.board };
}

function boardFileOf(dir) {
  return resolveBoard(dir).boardFile;
}

function gitIgnoredCheck(projectRoot) {
  if (git(projectRoot, ['rev-parse', '--is-inside-work-tree']).status !== 0) return null;
  const cache = new Map();
  return (path) => {
    if (cache.has(path)) return cache.get(path);
    const ignored = spawnSync('git', ['check-ignore', '-q', '--', path], { cwd: projectRoot, encoding: 'utf8', windowsHide: true }).status === 0;
    cache.set(path, ignored);
    return ignored;
  };
}

const projectRootOfSource = (dir) => resolve(dir, '..', '..', '..');

/** The board that `arg` names, and the project root of its source. A linked project keeps the board in the clone. */
function boardAt(arg) {
  const abs = resolve(arg);
  return { ...resolveBoard(realPathOf(abs)), root: projectRootOfSource(abs.endsWith('.json') ? dirname(abs) : abs) };
}

function checkCmd(arg) {
  const { dir, boardFile, root } = boardAt(arg);
  const board = readJson(join(dir, boardFile));
  if (!board) return { ok: false, error: `no ${boardFile} in ${dir}`, fix: noBoardFix() };
  const res = checkList(board, { isIgnored: gitIgnoredCheck(root) });
  if (!res.errors.length) return { ok: true, ...res };
  return { ok: false, ...res, error: res.errors[0], fix: boardErrorsFix('check', arg) };
}

/** A board that fails the list check or the schema: the agent repairs the entries that `errors` names. */
const boardErrorsFix = (cmd, arg) => agentFix(
  'Repair the board at each entry of errors (a choice that only the person can make goes to the person first), then run the command again.',
  sourceLine('check', resolve(arg)), cmd === 'check' ? null : sourceLine(cmd, resolve(arg)),
);

function writeCmd(arg, f) {
  const { dir, boardFile, root } = boardAt(arg);
  if (!existsSync(join(dir, boardFile))) return { ok: false, error: `no ${boardFile} in ${dir}`, fix: noBoardFix() };
  const r = writeList(dir, { isIgnored: gitIgnoredCheck(root), dryRun: Boolean(f['dry-run']), boardFile });
  if (r.ok) return r;
  return { ...r, error: r.error ?? r.errors?.[0] ?? 'the list does not pass its check', fix: boardErrorsFix('write', arg) };
}

/** Move the closed part of the board to archive/board.json, and check the caps of the lead document. */
export function archiveCommand(dir, boardFile, { dryRun = false, now = null } = {}) {
  const boardPath = join(dir, boardFile);
  const board = JSON.parse(readFileSync(boardPath, 'utf8'));
  const { board: kept, archived, count } = archiveBoard(board);
  const lead = readDoc(dir, DEFAULT_FILES.lead);
  const warnings = lead ? docCheck(lead.body ?? '') : [];
  const result = { ok: true, moved: { items: archived.items.length, log: archived.log.length, stories: archived.stories.length }, warnings, dryRun };
  if (!count || dryRun) return result;
  const archiveDir = join(dir, 'archive');
  const archivePath = join(archiveDir, 'board.json');
  const prior = existsSync(archivePath) ? JSON.parse(readFileSync(archivePath, 'utf8')) : null;
  mkdirSync(archiveDir, { recursive: true });
  writeFileSync(archivePath, `${JSON.stringify(mergeArchive(prior, archived), null, 2)}\n`);
  const at = (now ?? new Date()).toISOString();
  kept.archived = [...(board.archived ?? []), { session: board.sessions ?? null, at, file: 'archive/board.json', ...result.moved }];
  writeFileSync(boardPath, `${JSON.stringify(kept, null, 2)}\n`);
  return result;
}

/** The packets of a list, in order, from their packet files. */
function readList(root, src) {
  const wd = workDir(root, src);
  const index = readFm(join(wd, 'index.md'));
  const { packets } = readWorkFiles(wd);
  const all = [...packets.values()].map((p) => ({ ...p.data, file: p.file, path: join(wd, p.file) }))
    .sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9));
  return { index, packets: all };
}

function packetOf(root, src, key) {
  const { index, packets } = readList(root, src);
  if (index?.type !== 'list') throw refuse(`${src} has no list: run campaign.mjs write first`, noListFix(src));
  const packet = key ? packets.find((p) => p.key === key || p['packet-slug'] === key) : null;
  if (!packet) throw refuse(`${key} is not a packet of the list ${src}`, agentFix('Name a packet of the list by its key: status lists the packets.', campaignLine(root, 'status', src)));
  return { index, packets, packet };
}

function setPacketState(packet, state) {
  if (!PACKET_STATES.includes(state)) throw new Error(`unknown packet state ${state}`); /* defect */
  // `next` counts the packets that reached done in this call by `done-at`.
  setFields(packet.path, state === 'done' ? { state, 'done-at': nowIso() } : { state });
}

/** The reason the design of a workflow is not settled, or null (design/_lane.md, "Design is settled"). */
export function designBlock(root, slug) {
  const dir = wfDir(root, slug);
  const index = recordFm(dir, INDEX_NAME);
  if (!index) return null;
  if (!designNeeded(index, hasDoc(dir, '02b-design.md'))) return null;
  const contract = recordFm(dir, '02c-craft.md');
  const missing = missingDesignFiles(root, dir, contract);
  if (!designSettled(index, contract, missing)) {
    if (missing?.length) return `the approval of the ${namesScreens(contract) ? 'screens' : 'boards'} does not stand: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ` and ${missing.length - 3} more` : ''}`;
    return `the design is not settled; run /wf design ${slug} with the person`;
  }
  const skipped = index.progress && typeof index.progress === 'object' && index.progress.design === 'skipped';
  if (!skipped && needsPictures(index) && !String(contract?.boards ?? '').trim() && !namesScreens(contract)) {
    return `02c-craft.md names no screens (ux-impact ${index['ux-impact']}); run /wf design ${slug} amend`;
  }
  return null;
}

const plainCell = (s) => String(s ?? '').replace(/[`*_]/g, '').trim();

/**
 * The decision fidelity of a packet (section 8). `table` is false when 07-review.md has no
 * table, `missing` lists the carried keys with no row, and `rows` the rows that the person
 * has not approved. It fails closed: a verdict that is not `honored` needs an approval, and
 * only a live `approval` entry of the key in the decision store is an approval. The Approval
 * column of the review is not read, because the review writes it.
 */
export function decisionFidelity(root, slug, carriedKeys = []) {
  const dir = wfDir(root, slug);
  const review = readDoc(dir, '07-review.md');
  const none = { table: false, missing: [], rows: [] };
  if (!review) return none;
  const text = review.body ?? '';
  const at = text.search(/^## Decision Fidelity\s*$/m);
  if (at < 0) return carriedKeys.length ? none : { table: true, missing: [], rows: [] };
  const section = text.slice(at).split(/\n## /)[0];
  const decisions = decisionsOf(dir);
  const approved = (key) => decisions.some((e) => !e['superseded-by'] && e.kind === 'approval' && e.key === key && e.answer === 'approved');
  const seen = new Set();
  const rows = [];
  for (const line of section.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    const key = plainCell(cells[1]);
    if (!key || /^:?-+:?$/.test(key) || /^key$/i.test(key)) continue;
    seen.add(key);
    const verdict = plainCell(cells[2]).toLowerCase();
    if (/^honored\b/.test(verdict)) continue;
    if (!approved(key)) rows.push({ key, verdict: verdict || 'no verdict', evidence: cells[3] ?? '' });
  }
  return { table: true, missing: carriedKeys.map(String).filter((k) => !seen.has(k)), rows };
}

/** The roster slices of a workflow that are not finished, from 00-index.md `slices[]`. */
export function openSlices(root, slug) {
  const slices = recordFm(wfDir(root, slug), INDEX_NAME)?.slices;
  if (!Array.isArray(slices)) return [];
  return slices.filter((s) => s && ['defined', 'in-progress', 'planned', 'not-started'].includes(String(s.status ?? ''))).map((s) => String(s.slug ?? s.slice ?? ''));
}

const tryOutRecorded = (root, slug) => decisionsOf(wfDir(root, slug))
  .some((e) => !e['superseded-by'] && e.kind === 'try-out' && e.answer === 'works');

/** The next step of the walk for a packet (6.1). */
function nextStep(root, src, packet) {
  const slug = packet['packet-slug'];
  if (packet.state === 'done' || packet.state === 'dropped') return { step: 'none' };
  if (!BUILD_FORMS.includes(packet.form)) return { step: 'route', route: routeOf(src, packet) };
  if (packet.state === 'written') return { step: 'open' };
  const block = designBlock(root, slug);
  if (block) return { step: 'design', reason: block, route: `/wf design ${slug}` };
  if (packet.state === 'open') {
    // The questions that the person left to the build wait in open-questions; step 9 asks them first.
    const held = (recordFm(wfDir(root, slug), INDEX_NAME)?.['open-questions'] ?? [])
      .filter((q) => q && typeof q === 'object' && q.stage === 'slice' && q.key)
      .map((q) => ({ key: q.key, question: q.question ?? q.key }));
    const questions = held.length ? { questions: held } : {};
    if (!hasDoc(wfDir(root, slug), ROSTER_DOC)) return { step: 'slice', ...questions };
    return { step: 'yolo', ...questions };
  }
  // built. A fix slice that is not built yet sends the packet back to the driver (6.1 step 13).
  const unbuilt = openSlices(root, slug);
  if (unbuilt.length) return { step: 'yolo', reason: `the slice(s) ${unbuilt.join(', ')} are not complete: run the driver again` };
  const fid = decisionFidelity(root, slug, (packet['carried-decisions'] ?? []).map((d) => d.key));
  if (!fid.table) return { step: 'fidelity', reason: '07-review.md has no ## Decision Fidelity table: run the review again' };
  if (fid.missing.length) return { step: 'fidelity', reason: `the ## Decision Fidelity table has no row for ${fid.missing.join(', ')}: run the review again`, missing: fid.missing };
  if (fid.rows.length) return { step: 'fidelity', rows: fid.rows };
  if (packet['try-out'] === 'yes' && !tryOutRecorded(root, slug)) return { step: 'try-out' };
  return { step: 'done' };
}

/**
 * True when a built packet waits only on the person, and its run settles the decisions of the
 * person by the recommended option (the `run-decisions` steer): the walk can start the next packet.
 */
function canWait(root, packet, step) {
  if (packet.state !== 'built') return false;
  if (!((step.step === 'fidelity' && Array.isArray(step.rows) && step.rows.length && !step.reason) || step.step === 'try-out')) return false;
  return runDelegatedIn(wfDir(root, packet['packet-slug']));
}

// ---------------------------------------------------------------- the questions of the walk, and when to ask them

/** The key of the approval entry that marks the delegate digest of a packet as answered, up to its own id. */
export const DIGEST_KEY = 'delegate-digest';
const idNum = (id) => Number(String(id ?? '').replace(/^D-/, '')) || 0;

/**
 * The delegate decisions of a workflow that the person has not seen in a digest: each live entry
 * `by: delegate` written after the newest live `delegate-digest` approval. A reversal supersedes
 * its delegate entry, so it leaves the digest.
 */
export function openDigest(dir) {
  const list = decisionsOf(dir);
  const live = (e) => !e['superseded-by'];
  const seen = list.filter((e) => live(e) && e.kind === 'approval' && e.key === DIGEST_KEY).reduce((m, e) => Math.max(m, idNum(e.id)), 0);
  return list.filter((e) => live(e) && e.by === 'delegate' && idNum(e.id) > seen).map((e) => ({
    id: e.id, key: e.key ?? null, question: e.question ?? null, answer: e.answer, slice: e.scope?.slice ?? null, stage: e.stage ?? null,
  }));
}

/** True when the workflow of a packet is shipped or closed: its digest is no longer a question of the walk. */
function shippedOrClosed(root, slug) {
  const index = recordFm(wfDir(root, slug), INDEX_NAME);
  if (!index) return false;
  return ['complete', 'closed'].includes(String(index.status ?? '')) || (index.progress && typeof index.progress === 'object' && index.progress.ship === 'complete');
}

const KIND_ORDER = ['fidelity', 'try-out', 'digest'];

/**
 * The questions of the person, split into `ask` (ask them now, in one call of the question tool)
 * and `askLater` (each with its `why`), and `then`: when a fix or a clear of an answer runs.
 * Now is: a driver runs in this checkout, the walk itself stops on a question of the current
 * packet, or the call ends (`--end`). The questions of a packet whose own run has not ended wait.
 */
export function walkQuestions(root, packets, current, waiting, { end = false } = {}) {
  const running = runningDriver(root, packets);
  const byKey = new Map(packets.map((p) => [p.key, p]));
  const entries = [];
  const personEntry = (p, step) => {
    const base = { key: p.key, slug: p['packet-slug'] };
    if (step.step === 'fidelity' && Array.isArray(step.rows) && step.rows.length && !step.reason) {
      const carried = new Map((p['carried-decisions'] ?? []).map((d) => [String(d.key), d.text ?? null]));
      return { ...base, kind: 'fidelity', rows: step.rows.map((r) => ({ key: r.key, decision: carried.get(String(r.key)) ?? null, verdict: r.verdict, evidence: r.evidence })) };
    }
    if (step.step === 'try-out') {
      let text = '';
      try { text = readFileSync(p.path, 'utf8'); } catch { text = ''; }
      return { ...base, kind: 'try-out', title: p.title ?? null, 'ux-impact': p['ux-impact'] ?? null, acceptance: sectionList(text, 'Acceptance criteria'), file: posix(relative(root, p.path)) };
    }
    return null;
  };
  const own = current ? personEntry(current.packet, current.step) : null;
  if (own) entries.push(own);
  for (const w of waiting) {
    const e = byKey.get(w.key) && personEntry(byKey.get(w.key), w);
    if (e) entries.push(e);
  }
  for (const p of packets) {
    // A skipped packet asks nothing until the person takes the skip back.
    if (!BUILD_FORMS.includes(p.form) || !['built', 'done'].includes(p.state) || (p.skipped && p.state !== 'done')) continue;
    if (shippedOrClosed(root, p['packet-slug'])) continue;
    const open = openDigest(wfDir(root, p['packet-slug']));
    if (open.length) entries.push({ key: p.key, slug: p['packet-slug'], kind: 'digest', entries: open });
  }
  const orderOf = (key) => byKey.get(key)?.order ?? 1e9;
  entries.sort((a, b) => (orderOf(a.key) - orderOf(b.key)) || (KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)));
  const now = end || Boolean(running) || Boolean(own);
  const notStarted = current && ['open', 'slice', 'yolo'].includes(current.step.step);
  const later = notStarted
    ? `the driver of ${current.packet['packet-slug']} has not started`
    : 'no driver runs: ask when the next driver runs, or at the end of the call';
  const ask = [];
  const askLater = [];
  for (const e of entries) {
    if (running && e.slug === running) askLater.push({ ...e, why: `the run of ${running} has not ended` });
    else if (now) ask.push(e);
    else askLater.push({ ...e, why: later });
  }
  const when = running ? 'after-run' : 'now';
  return { ask, askLater, then: { fix: when, clear: when, running } };
}

function routeOf(src, packet) {
  const slug = packet['packet-slug'];
  switch (packet.form) {
    case 'investigate': return `/wf intake investigate ${slug}`;
    case 'discover': return `/wf intake discover ${slug}`;
    case 'rca': return `/wf intake rca ${slug}`;
    case 'task': return `/wf intake task ${slug}`;
    default: return `/wf intake ${workflowRel(src)}/work/${packet.file}`;
  }
}

function statusCmd(root, src, f = {}) {
  const dir = sourceDir(root, src);
  if (!existsSync(dir)) return { ok: false, error: `no source folder ${workflowRel(src)}`, fix: agentFix('Name the source by the slug of its brainstorm folder: status lists the workflows.', wfLine(root, 'status')) };
  const { index, packets } = readList(root, src);
  const oldLedger = existsSync(join(oldCampDir(root, src), 'ledger.json'));
  if (oldLedger && index?.type !== 'list') {
    return { ok: true, source: src, migrate: true, reason: 'an old campaign ledger and no list: migrate first (section 12.2)', next: `campaign.mjs migrate <root> ${src} report` };
  }
  if (index?.type !== 'list') return { ok: false, source: src, error: `${src} has no list. Write it at brainstorm done (campaign.mjs write).`, fix: noListFix(src) };
  if (oldLedger) {
    // The regroup wrote the list, and migrate finish did not run: the old ledger, worktrees and strays are still there.
    return { ok: true, source: src, migrate: 'finish', reason: 'the list is written and the old ledger is still in work/campaign/: finish the migration (section 12.2 steps 8 to 10)', next: `campaign.mjs migrate <root> ${src} finish` };
  }
  const branch = listBranch(src);
  const rows = packets.map((p) => ({
    key: p.key, slug: p['packet-slug'], form: p.form, state: p.state, order: p.order, 'try-out': p['try-out'] ?? null,
    ...(p.migrated ? { migrated: true } : {}), ...(p.skipped ? { skipped: p.skipped } : {}), ...(p['ahead-of']?.length ? { 'ahead-of': p['ahead-of'] } : {}),
  }));
  const { current, waiting, held } = walkPick(root, src, packets);
  const skipped = packets.filter((p) => p.skipped && !['done', 'dropped'].includes(p.state)).map((p) => ({ key: p.key, slug: p['packet-slug'], state: p.state, reason: p.skipped.reason ?? null }));
  const needDesign = packets
    .filter((p) => BUILD_FORMS.includes(p.form) && !['done', 'dropped'].includes(p.state))
    .map((p) => {
      const opened = hasDoc(wfDir(root, p['packet-slug']), INDEX_NAME);
      const why = opened ? designBlock(root, p['packet-slug']) : ((p['ux-impact'] ?? 'none') !== 'none' ? 'not opened yet; the design stage runs after open' : null);
      return why ? { key: p.key, slug: p['packet-slug'], reason: why } : null;
    })
    .filter(Boolean);
  const { ask, askLater, then } = walkQuestions(root, packets, current, waiting, { end: Boolean(f.end) });
  return {
    ok: true,
    source: src,
    branch,
    onListBranch: currentBranch(root) === branch,
    packets: rows,
    current: current ? { key: current.packet.key, slug: current.packet['packet-slug'], state: current.packet.state, ...current.step, ...(current.ahead ? { 'ahead-of': current.ahead } : {}) } : null,
    ...(waiting.length ? { waiting } : {}),
    ...(skipped.length ? { skipped } : {}),
    ...(held.length ? { held: held.map((h) => ({ key: h.packet.key, slug: h.packet['packet-slug'], waitsFor: h.blockers })) } : {}),
    ask,
    askLater,
    then,
    needDesign,
    finished: packets.every((p) => ['done', 'dropped'].includes(p.state)),
  };
}

/**
 * The packet the walk works on now, in list order (6.1). A packet that is done or dropped is
 * behind the walk. A packet that the person skipped keeps its state and is passed. In delegate
 * mode, a built packet that waits only on the person (its fidelity rows or its try-out) does not
 * hold the walk: the next packet starts, and the walk asks the waiting questions while that run
 * works; the waiting packet stays built. Only the flat shape: a stacked layer starts from the
 * layer below it when that layer is done. A skipped built packet holds nothing either: its work
 * is on the list branch. Any other earlier packet that is not done holds a later packet, unless
 * the person let that packet run ahead of it (`ahead-of`). A held packet is a question for the
 * person (`held`), never a guess.
 */
function walkPick(root, src, packets) {
  const stacked = shapeOf(root) === 'stacked';
  const live = packets.filter((x) => !['done', 'dropped'].includes(x.state));
  const waiting = [];
  const held = [];
  const passes = new Set();
  let current = null;
  for (const p of live) {
    if (p.skipped) {
      if (p.state === 'built' && !stacked) passes.add(p.key);
      continue;
    }
    const step = nextStep(root, src, p);
    if (!stacked && canWait(root, p, step)) { waiting.push({ key: p.key, slug: p['packet-slug'], ...step }); passes.add(p.key); continue; }
    const blockers = live.filter((e) => (e.order ?? 0) < (p.order ?? 0) && !passes.has(e.key)).map((e) => e.key);
    const ahead = Array.isArray(p['ahead-of']) ? p['ahead-of'].map(String) : [];
    if (blockers.every((k) => ahead.includes(k))) {
      current = { packet: p, step, ...(blockers.length ? { ahead: blockers } : {}) };
      break;
    }
    held.push({ packet: p, step, blockers });
  }
  if (!current && waiting.length && !held.length) {
    // Every open packet waits on the person: the first of them is the current packet.
    const first = packets.find((p) => p.key === waiting[0].key);
    current = { packet: first, step: nextStep(root, src, first) };
    waiting.shift();
  }
  return { current, waiting, held };
}

/**
 * Mark the delegate digest of a packet as answered (step 10): one `delegate-digest` approval in
 * the store of the packet. Record each reversal with `decide add --by person` first. A later
 * delegate entry, of a fix run, opens a new digest.
 */
function digestCmd(root, src, [key], f) {
  const { packet } = packetOf(root, src, key);
  const dir = wfDir(root, packet['packet-slug']);
  const open = openDigest(dir);
  if (!open.length) return { ok: true, key: packet.key, slug: packet['packet-slug'], changed: false, reason: 'no delegate decision waits for the person' };
  const answer = String(f.answer ?? '').trim() || 'None, keep them all';
  const { entry } = addDecision(dir, {
    kind: 'approval', key: DIGEST_KEY, answer, by: 'person', stage: 'campaign',
    question: String(f.question ?? '').trim() || 'Reverse any of these?',
  });
  return { ok: true, key: packet.key, slug: packet['packet-slug'], changed: true, decision: entry.id, covered: open.map((e) => e.id) };
}

// ---------------------------------------------------------------- open (section 5)

function indexRow(root, slug, branch) {
  const file = join(workflowsRoot(root), 'INDEX.md');
  const lines = existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/).filter((l, i, a) => l || i < a.length - 1) : [INDEX_HEADER];
  if (lines.some((l) => l.split('\t')[0] === slug)) return false;
  const head = lines[0]?.startsWith('#') ? [lines[0]] : [];
  const rows = lines.slice(head.length).filter(Boolean);
  rows.push([slug, 'active', 'feature', branch, nowIso()].join('\t'));
  rows.sort((a, b) => a.split('\t')[0].localeCompare(b.split('\t')[0]));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${[...head, ...rows].join('\n')}\n`);
  return true;
}

function sectionList(text, heading) {
  const m = new RegExp(`^## ${heading}\\s*$`, 'm').exec(text);
  if (!m) return [];
  const body = text.slice(m.index + m[0].length).split(/\n## /)[0];
  return body.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith('- ') && l !== '- None.').map((l) => l.slice(2));
}

function sectionText(text, heading) {
  const m = new RegExp(`^## ${heading}\\s*$`, 'm').exec(text);
  if (!m) return '';
  const body = text.slice(m.index + m[0].length).split(/\n## /)[0].trim();
  return body === '- None.' ? '' : body;
}

/**
 * The records of a fresh packet folder (section 5), from the packet file and the list index:
 * { '00-index.md', '01-intake.md', '02-shape.md': { frontmatter, body }, 'decisions.yaml': text }.
 */
export function packetFolderRecords({ src, packet, packetText, list, trunk, now }) {
  const slug = packet['packet-slug'];
  const originPacket = `${workflowRel(src)}/work/${packet.file}`;
  const decisions = packet['carried-decisions'] ?? [];
  const boardFile = list?.board ?? DEFAULT_FILES.board;
  const goal = sectionText(packetText, 'Goal');
  const inScope = sectionList(packetText, 'In scope');
  const outScope = sectionList(packetText, 'Out of scope');
  const acs = sectionList(packetText, 'Acceptance criteria');
  const constraints = sectionList(packetText, 'Constraints');
  const risks = sectionList(packetText, 'Risks');
  const measures = sectionList(packetText, 'Measures');
  // The open items that the person left to the build at brainstorm done: `ask` waits in
  // open-questions until the walk asks it before the slice; `decide` is a steer to the build.
  const leftToBuild = Array.isArray(packet['left-to-build']) ? packet['left-to-build'].filter((q) => q?.key && q?.text) : [];
  const askItems = leftToBuild.filter((q) => q.how === 'ask');
  const decideItems = leftToBuild.filter((q) => q.how === 'decide');
  const askText = (q) => (q.kind === 'tension' ? `Which way does this go: ${q.text}` : q.kind === 'assumption' ? `Is this true: ${q.text}` : q.text);
  const ux = packet['ux-impact'] ?? 'none';
  const stack = { ...(list?.stack ?? {}), 'user-confirmed': true };
  const index = {
    schema: 'sdlc/v1',
    type: 'index',
    slug,
    title: packet.title ?? slug,
    status: 'active',
    'current-stage': 'intake',
    'stage-number': 1,
    'created-at': now,
    'updated-at': now,
    'workflow-type': 'feature',
    'selected-slice': '',
    'branch-strategy': 'dedicated',
    branch: listBranch(src),
    'base-branch': trunk,
    'review-scope': 'slug-wide',
    'review-scope-confirmed': true,
    'pr-url': '',
    'pr-number': 0,
    'open-questions': askItems.map((q) => ({ key: q.key, question: askText(q), stage: 'slice', 'held-at': now })),
    tags: [],
    stack,
    'ux-impact': ux,
    'ux-impact-confirmed': true,
    ...(ux === 'none' ? { 'design-skip-reason': 'ux-impact none' } : {}),
    'origin-packet': originPacket,
    'origin-items': decisions.map((d) => d.key),
    ...(packet.amends || packet['target-slug'] ? { amends: packet['target-slug'] ?? packet.amends } : {}),
    // The person confirmed each risk at brainstorm done, and the walk runs no shape phase, so a
    // risk is carried to the slug-wide review. An `open` risk would block the ship gate.
    'intent-risks': risks.length
      ? risks.map((r, i) => ({
        id: `RIM-${i + 1}`, risk: r, severity: 'medium', status: 'carried', 'adjudicated-by': '02-shape.md#unknowns--open-questions',
        decision: 'confirmed by the person at brainstorm done; the slug-wide review checks it', 'po-ratified': true,
      }))
      : 'none-declared',
    charter: 'none-declared',
    'next-command': ux === 'none' ? 'wf-slice' : 'wf-design',
    'next-invocation': ux === 'none' ? `/wf campaign ${src}` : `/wf design ${slug}`,
    'workflow-files': ['00-index.md', '01-intake.md', '02-shape.md', DECISIONS_FILE],
    progress: {
      intake: 'complete', design: ux === 'none' ? 'skipped' : 'not-started', slice: 'not-started',
      plan: 'not-started', implement: 'not-started', verify: 'not-started', review: 'not-started',
      ship: 'not-started', retro: 'not-started',
    },
  };
  const cite = (d) => `source: ${workflowRel(src)}/${boardFile}#${d.key}`;
  const intake = {
    schema: 'sdlc/v1', type: 'intake', slug, status: 'complete', 'stage-number': 1, 'created-at': now, 'updated-at': now, tags: [],
    refs: { index: '00-index.md', next: '02-shape.md' }, 'next-command': 'wf-slice', 'next-invocation': `/wf campaign ${src}`,
    'recommended-routes': [{ invocation: `/wf campaign ${src}`, reason: 'the campaign walk slices and builds this packet', default: true }],
  };
  const intakeBody = [
    '# Intake', '',
    `Written by \`campaign.mjs open\` from the packet [${packet.file}](../${src}/work/${packet.file}). The brainstorm wrote the scope with the person; nobody re-words it.`, '',
    '## Restated Request', '', goal || packet.title || slug, '',
    '## Intended Outcome', '', goal || '- See Success Criteria.', '',
    '## Known Constraints', '',
    ...(constraints.length || decisions.length
      ? [...constraints.map((c) => `- ${c}`), ...decisions.map((d) => `- **${d.key}** — ${d.text} (${cite(d)})`)]
      : ['- None.']),
    '',
    '## Risks if Misunderstood', '',
    ...(risks.length ? risks.map((r, i) => `- **RIM-${i + 1}** — ${r}`) : ['- none-declared: the packet records no risk.']),
    '- charter: none-declared: the carried decisions are the commitments of the packet.', '',
    '## Success Criteria', '',
    ...(acs.length ? acs.map((a) => `- ${a}`) : ['- None.']),
    '',
    '## Out of Scope for Now', '',
    ...(outScope.length ? outScope.map((o) => `- ${o}`) : ['- None.']),
    '',
  ].join('\n');
  const shape = {
    schema: 'sdlc/v1', type: 'shape', slug, status: 'complete', 'stage-number': 2, 'created-at': now, 'updated-at': now,
    'docs-needed': false, 'docs-types': [], 'augmentations-needed': [], 'charter-scenario': 'none — a campaign packet; the acceptance criteria carry the scenario',
    'files-in-scope': [], tags: [], refs: { index: '00-index.md', intake: '01-intake.md', next: '03-slice.md' },
    'next-command': ux === 'none' ? 'wf-slice' : 'wf-design', 'next-invocation': ux === 'none' ? `/wf campaign ${src}` : `/wf design ${slug}`,
    'recommended-routes': [{ invocation: ux === 'none' ? `/wf campaign ${src}` : `/wf design ${slug}`, reason: ux === 'none' ? 'the walk slices the packet' : 'the packet needs the design stage first', default: true }],
  };
  const shapeBody = [
    '# Shape', '',
    `Written by \`campaign.mjs open\` from the packet [${packet.file}](../${src}/work/${packet.file}).`, '',
    '## Problem Statement', '', goal || packet.title || slug, '',
    '## Desired Behavior', '', ...(inScope.length ? inScope.map((s) => `- ${s}`) : ['- See Acceptance Criteria.']), '',
    '## Acceptance Criteria', '', ...(acs.length ? acs.map((a) => `- ${a}`) : ['- None.']), '',
    ...(measures.length ? ['## Measures', '', ...measures.map((m) => `- ${m}`), ''] : []),
    '## Out of Scope', '', ...(outScope.length ? outScope.map((o) => `- ${o}`) : ['- None.']), '',
    '## Unknowns / Open Questions', '',
    ...risks.map((r, i) => `- **RIM-${i + 1}** (carried to the slug-wide review) — ${r}`),
    ...askItems.map((q) => `- **${q.key}** (the walk asks the person before the slice) — ${q.text}`),
    ...decideItems.map((q) => `- **${q.key}** (left to the build: choose the option that best fits the acceptance criteria, and record the choice as an assumption) — ${q.text}`),
    ...(risks.length || leftToBuild.length ? [] : ['- None.']), '',
    '## Intake Fidelity', '',
    '| Intake directive | Disposition | How | Authority |',
    '|---|---|---|---|',
    ...decisions.map((d) => `| **${d.key}** — ${String(d.text).replace(/\|/g, '\\|')} | honored | carried word for word into this packet | the brainstorm board, ${d.key} |`),
    ...constraints.map((c) => `| ${c.replace(/\|/g, '\\|')} | honored | a constraint of the packet | the brainstorm |`),
    '',
    '## Definition of Done', '', 'Every acceptance criterion passes verify, the slug-wide review clears, and the decision fidelity table has no unapproved row.', '',
  ].join('\n');
  // The brainstorm recorded the decisions of this packet with the person. The walk adds the
  // fidelity approvals and the try-out to the same store.
  const store = [];
  for (const d of decisions) {
    appendEntry(store, { kind: 'answer', key: d.key, answer: d.text, by: 'person', stage: 'brainstorm', source: `${src}/${boardFile}#${d.key}` }, { now });
  }
  for (const q of decideItems) {
    appendEntry(store, {
      kind: 'steer', key: q.key, question: q.text, by: 'person', stage: 'brainstorm', source: `${src}/${boardFile}#${q.key}`,
      answer: 'The person left this to the build. Choose the option that best fits the acceptance criteria, and record the choice as an assumption.',
    }, { now });
  }
  return {
    [INDEX_NAME]: { frontmatter: index, body: '' },
    '01-intake.md': { frontmatter: intake, body: intakeBody },
    '02-shape.md': { frontmatter: shape, body: shapeBody },
    [DECISIONS_FILE]: storeText(store),
  };
}

/** The files of a fresh packet folder as Markdown text: packetFolderRecords, with each record rendered. */
export function packetFolderFiles(args) {
  return Object.fromEntries(Object.entries(packetFolderRecords(args)).map(([name, r]) => [
    name, typeof r === 'string' ? r : `---\n${dump(r.frontmatter)}\n---\n${r.body ? `\n${r.body}` : ''}`,
  ]));
}

function openCmd(root, src, [key], f) {
  const { index: list, packet } = packetOf(root, src, key);
  if (!BUILD_FORMS.includes(packet.form)) return { ok: false, error: `${packet.key} is a ${packet.form} packet; the walk routes it to its own command`, route: routeOf(src, packet), fix: routeFix(src, packet) };
  if (packet.state !== 'written') return { ok: true, opened: false, key: packet.key, state: packet.state, reason: 'already open' };
  const slug = packet['packet-slug'];
  const dir = wfDir(root, slug);
  const trunk = trunkOf(root, f);
  const originPacket = `${workflowRel(src)}/work/${packet.file}`;
  if (hasDoc(dir, INDEX_NAME)) {
    // A prepared unit of the old campaign (Secbot): its intake and shape stay; the packet adopts the folder (12.4).
    setRecordFields(dir, INDEX_NAME, {
      'origin-packet': originPacket, branch: listBranch(src), 'base-branch': trunk, 'branch-strategy': 'dedicated',
      'workflow-type': 'feature', 'review-scope': 'slug-wide', 'review-scope-confirmed': true, 'updated-at': nowIso(),
    });
    appendHistory(dir, `campaign: the packet ${packet.key} of ${src} adopted this folder`);
    setPacketState(packet, 'open');
    indexRow(root, slug, listBranch(src));
    return { ok: true, opened: true, adopted: true, key: packet.key, slug };
  }
  const boardFile = boardFileOf(sourceDir(root, src));
  const records = packetFolderRecords({ src, packet, packetText: readFileSync(packet.path, 'utf8'), list: { ...list, board: boardFile }, trunk, now: nowIso() });
  mkdirSync(dir, { recursive: true });
  const wrote = new Set();
  for (const [name, r] of Object.entries(records)) {
    if (typeof r === 'string') { writeFileSync(join(dir, name), r); wrote.add(name); continue; }
    wrote.add(writeDoc(dir, name, r).file);
    if (name === INDEX_NAME) wrote.add(META_FILE);
  }
  appendHistory(dir, `campaign: opened from the packet ${packet.key} of ${src}`, 'intake');
  setPacketState(packet, 'open');
  indexRow(root, slug, listBranch(src));
  return { ok: true, opened: true, key: packet.key, slug, wrote: [...wrote].map((n) => posix(relative(root, join(dir, n)))) };
}

// ---------------------------------------------------------------- land, start, built, done (6.1, 6.2)

function landCmd(root, src, [key], f) {
  if (shapeOf(root) === 'stacked') return landStacked(root, src, key, f);
  const branch = listBranch(src);
  if (currentBranch(root) === branch) return { ok: true, branch, switched: false };
  const trunk = trunkOf(root, f);
  const exists = commitOf(root, `refs/heads/${branch}`);
  if (!exists) {
    // A branch is cut only from a base that matches its remote.
    const bc = baseCheck(root, trunk);
    if (bc.stop) return { ok: false, branch, base: bc, error: bc.reason, fix: bc.fix };
  }
  // Do not stash and do not force: git refuses a switch that would overwrite a change.
  const r = exists ? git(root, ['switch', branch]) : git(root, ['switch', '-c', branch, trunk]);
  if (r.status !== 0) return { ok: false, branch, error: `git switch failed: ${r.stderr}. Ask the person; do not stash and do not force.`, fix: gitFix(`The checkout cannot move to ${branch}.`, 'run land again') };
  return { ok: true, branch, switched: true, created: !exists, from: exists ? null : trunk };
}

/**
 * The stacked shape: each build packet is one layer of a gh-stack stack, and the layer is its end
 * branch. The first layer starts from the trunk (`gh stack init`), a later one from the layer of
 * the build packet before (`gh stack add`).
 */
function landStacked(root, src, key, f) {
  if (!key) return { ok: false, error: 'the stacked shape lands on the layer of a packet: pass the packet key', fix: agentFix('Run land again with the key of the packet whose layer the walk needs.', campaignLine(root, 'land', src, '<packet-key>')) };
  const { packets, packet } = packetOf(root, src, key);
  const layer = endBranch(src, packet.key);
  if (currentBranch(root) === layer) return { ok: true, branch: layer, switched: false, shape: 'stacked' };
  if (commitOf(root, `refs/heads/${layer}`)) {
    const r = git(root, ['switch', layer]);
    if (r.status !== 0) return { ok: false, branch: layer, error: `git switch failed: ${r.stderr}. Ask the person; do not stash and do not force.`, fix: gitFix(`The checkout cannot move to ${layer}.`, 'run land again') };
    return { ok: true, branch: layer, switched: true, shape: 'stacked' };
  }
  const below = packets.filter((p) => (p.order ?? 0) < (packet.order ?? 0) && BUILD_FORMS.includes(p.form) && p.state === 'done').pop();
  const from = below ? endBranch(src, below.key) : trunkOf(root, f);
  if (!below) {
    const bc = baseCheck(root, from);
    if (bc.stop) return { ok: false, branch: layer, base: bc, error: bc.reason, fix: bc.fix };
  }
  const sw = git(root, ['switch', from]);
  if (sw.status !== 0) return { ok: false, branch: layer, error: `git switch ${from} failed: ${sw.stderr}. Ask the person; do not stash and do not force.`, fix: gitFix(`The checkout cannot move to ${from}.`, 'run land again') };
  const r = gh(root, below ? ['stack', 'add', layer] : ['stack', 'init', layer]);
  if (r.status !== 0) return { ok: false, branch: layer, error: `gh stack ${below ? 'add' : 'init'} ${layer} failed: ${r.stderr || r.stdout}`, fix: personFix(`gh stack ${below ? 'add' : 'init'} failed: check that gh is signed in (gh auth status) and that the gh-stack extension is installed, then run land again.`) };
  return { ok: true, branch: layer, switched: true, created: true, from, shape: 'stacked' };
}

/**
 * Push the work so that CI runs at the end of each packet, and open the PR as a draft once. The
 * single shape pushes the list branch and opens one draft PR for it; the stacked shape runs
 * `gh stack submit`, which opens one draft PR per layer.
 */
function publish(root, src, trunk, f) {
  if (f['no-push']) return { skipped: 'no-push' };
  if (!hasRemote(root)) return { skipped: 'no remote' };
  if (shapeOf(root) === 'stacked') {
    const s = gh(root, ['stack', 'submit', '--auto', '--remote', 'origin']);
    return s.status === 0 ? { submitted: true } : { submitted: false, error: s.stderr || s.stdout };
  }
  const branch = listBranch(src);
  const push = git(root, ['push', '--quiet', '-u', 'origin', branch]);
  if (push.status !== 0) return { pushed: false, error: push.stderr };
  const listFile = join(workDir(root, src), 'index.md');
  const list = readFm(listFile) ?? {};
  // A stored PR that merged or closed earlier no longer shows the list branch: open a new draft.
  // When gh cannot say, trust the stored number.
  if (list['pr-number']) {
    const v = gh(root, ['pr', 'view', String(list['pr-number']), '--json', 'state']);
    let state = '';
    try { state = v.status === 0 ? String(JSON.parse(v.stdout).state ?? '').toUpperCase() : ''; } catch { state = ''; }
    if (!state || state === 'OPEN') return { pushed: true, pr: list['pr-number'] };
  }
  let pr = null;
  try { pr = JSON.parse(gh(root, ['pr', 'list', '--head', branch, '--state', 'open', '--json', 'number,url']).stdout || '[]')[0] ?? null; } catch { pr = null; }
  let opened = false;
  if (!pr) {
    const title = String(list.title ?? '').trim() || branch;
    const body = 'Work in progress. This PR stays a draft until the last part is done; each push runs CI.';
    const c = gh(root, ['pr', 'create', '--draft', '--base', trunk, '--head', branch, '--title', title, '--body', body]);
    if (c.status !== 0) return { pushed: true, draft: false, error: c.stderr || c.stdout };
    const url = c.stdout.split(/\s+/).find((w) => /^https?:\/\//.test(w)) ?? null;
    pr = { number: Number(/\/pull\/(\d+)/.exec(url ?? '')?.[1]) || null, url };
    opened = true;
  }
  if (pr.number) setFields(listFile, { 'pr-number': pr.number, 'pr-url': pr.url });
  return { pushed: true, pr: pr.number, url: pr.url, opened };
}

/** The branch the walk must stand on for a packet: the list branch, or the layer of the packet. */
function requireWalkBranch(root, src, packet) {
  if (shapeOf(root) !== 'stacked') return requireListBranch(root, src);
  const layer = endBranch(src, packet.key);
  const cur = currentBranch(root);
  if (cur !== layer) throw refuse(`the walk's checkout is on ${cur ?? 'a detached HEAD'}, not on the layer ${layer}: run campaign.mjs land ${src} ${packet.key} first`, agentFix(`Run land: it puts the checkout on the layer ${layer}. Then run the command again.`, campaignLine(root, 'land', src, packet.key)));
  return layer;
}

function requireListBranch(root, src) {
  const branch = listBranch(src);
  const cur = currentBranch(root);
  if (cur !== branch) throw refuse(`the walk's checkout is on ${cur ?? 'a detached HEAD'}, not on the list branch ${branch}: run campaign.mjs land first`, agentFix(`Run land: it puts the checkout on the list branch ${branch}. Then run the command again.`, campaignLine(root, 'land', src)));
  return branch;
}

/** An untracked file of this size or more stays out of the migration snapshot. */
const SNAPSHOT_MAX_BYTES = 1024 * 1024;

/**
 * Stage the uncommitted work of an old unit for the snapshot commit: every change to a tracked
 * file, and each untracked file outside `.scratch/` and `.ai/` under 1 MB. Returns the count of
 * staged files and the untracked files left out, each with its reason. The files left out stay
 * in the worktree, untracked.
 */
function stageSnapshot(wt) {
  const u = git(wt, ['add', '-u', '--', '.']);
  if (u.status !== 0) return { ok: false, error: `git add -u failed in ${wt}: ${u.stderr}` }; /* internal */
  // The records are not code: a tracked .ai/ change stays out of the commit.
  git(wt, ['reset', '-q', '--', '.ai']);
  const others = git(wt, ['ls-files', '--others', '--exclude-standard', '-z']);
  if (others.status !== 0) return { ok: false, error: `git ls-files failed in ${wt}: ${others.stderr}` }; /* internal */
  const add = [];
  const leftOut = [];
  for (const rel of others.stdout.split('\0').filter(Boolean)) {
    const parts = rel.split('/');
    if (parts[0] === '.ai') continue;
    if (parts.includes('.scratch')) { leftOut.push({ path: rel, reason: 'scratch' }); continue; }
    let st;
    try { st = lstatSync(join(wt, rel)); } catch { continue; }
    // git lists a nested repo as its folder.
    if (st.isDirectory()) { leftOut.push({ path: rel, reason: 'a nested repo' }); continue; }
    if (st.size >= SNAPSHOT_MAX_BYTES) { leftOut.push({ path: rel, reason: '1 MB or more', bytes: st.size }); continue; }
    add.push(rel);
  }
  for (let i = 0; i < add.length; i += 100) {
    const r = git(wt, ['--literal-pathspecs', 'add', '--', ...add.slice(i, i + 100)]);
    if (r.status !== 0) return { ok: false, error: `git add failed in ${wt}: ${r.stderr}` }; /* internal */
  }
  const staged = git(wt, ['diff', '--cached', '--name-only', '-z']).stdout.split('\0').filter(Boolean);
  return { ok: true, any: staged.length > 0, files: staged.length, leftOut };
}

/**
 * The squash commit at HEAD of `wt` took the place of the commits `fork..backup`. Record it in
 * the step ledger of the workflow, so every step whose commit it holds stays done. Returns the
 * number of commits recorded, or null when the workflow has no record folder.
 */
function recordSquash(root, wt, slug, fork, backup) {
  const dir = wfDir(root, slug);
  if (!existsSync(dir)) return null;
  const commits = git(wt, ['rev-list', `${fork}..${backup}`]).stdout.split(/\r?\n/).filter(Boolean);
  const sha = commitOf(wt, 'HEAD');
  if (!sha || !commits.length) return null;
  try {
    appendSquash(dir, { sha, commits, branch: currentBranch(wt), ...commitIdentity(wt, sha) });
  } catch { return null; }
  return { squash: sha, commits: commits.length };
}

/** 12.3: commit the unit's code, rebase it when the earlier waves were squashed, merge it into the list branch. */
function landMigrated(root, src, packet) {
  const m = packet.migrated ?? {};
  const branch = m['from-branch'];
  if (!branch) return { ok: true, skipped: 'no unit branch' };
  if (m.merged) return { ok: true, skipped: 'already merged' };
  const wt = m.worktree && existsSync(m.worktree) ? m.worktree : null;
  const steps = [];
  // A unit already on top of the list branch (an earlier start, or the person's rebase by hand) needs no rebase.
  const list = listBranch(src);
  const waveBase = m['wave-base'];
  const needsRebase = m.land === 'squashed' && Boolean(waveBase) && !(wt && isAncestor(wt, list, 'HEAD'));
  if (needsRebase) {
    if (!wt) return { ok: false, error: `the unit ${packet.key} needs a rebase, and its worktree ${m.worktree ?? '(none)'} is gone. Ask the person.`, fix: personFix(`The unit ${packet.key} needs a rebase onto ${list}, and its worktree is gone: the person brings the work of ${branch} onto ${list} by hand, then runs start again.`) };
    // Before the snapshot: a unit with no commit beyond the wave base has its work in the wave base, or has no work yet.
    if (!Number(git(wt, ['rev-list', '--count', `${waveBase}..HEAD`]).stdout || 0)) {
      return { ok: false, error: `${branch} has no commit beyond the wave base ${waveBase}. Its work is in the wave base, which is not in the trunk, or it has no work yet. A rebase would bring nothing. Ask the person how to bring the work of ${packet.key} to ${list}.`, fix: personFix(`${branch} has nothing to rebase: the person says how the work of ${packet.key} comes to ${list} (merge the wave base first, or drop the packet).`) };
    }
  }
  if (wt) {
    const dirty = dirtyOutsideAi(wt) ?? [];
    if (dirty.length) {
      const staged = stageSnapshot(wt);
      if (!staged.ok) return { ok: false, error: staged.error, fix: gitFix(`git cannot stage the uncommitted files of ${wt}.`, 'run start again') };
      const leftOut = staged.leftOut.length ? { leftOut: staged.leftOut } : {};
      if (staged.any) {
        const c = git(wt, ['commit', ...message(SUBJECTS.snapshot, `The campaign migration saved the uncommitted files of the work packet ${packet['packet-slug']}.`)]);
        if (c.status !== 0 && !/nothing to commit/.test(c.stdout + c.stderr)) return { ok: false, ...leftOut, error: `the snapshot commit failed in ${wt}: ${c.stderr || c.stdout}. The files are staged. Ask the person to commit them by hand with a message that the repo accepts, then start again.`, fix: personFix(`The repo refused the snapshot commit in ${wt}: the person commits the staged files by hand with a message that the repo accepts, then runs start again.`) };
      }
      steps.push({ snapshot: staged.files, ...leftOut });
    }
  }
  if (needsRebase) {
    // The snapshot leaves tracked .ai/ changes in the tree, and git refuses to rebase a dirty tree:
    // stop before the one-commit step, so nothing changes.
    const unstaged = git(wt, ['diff', '--name-only']).stdout.split(/\r?\n/).filter(Boolean);
    if (unstaged.length) return { ok: false, unstaged: unstaged.slice(0, 20), error: `${unstaged.length} tracked file(s) in ${wt} have uncommitted changes (${unstaged.slice(0, 3).join(', ')}), and git does not rebase a tree with changes. Ask the person to commit or stash them in ${wt}, then start again.`, fix: personFix(`${wt} has uncommitted changes to tracked files: the person commits or stashes them there, then runs start again.`) };
    const ahead = Number(git(wt, ['rev-list', '--count', `${waveBase}..HEAD`]).stdout || 0);
    if (ahead > 1) {
      // One commit, so the rebase can stop on a conflict once, not once per commit. The old commits stay on a backup branch.
      const backup = `campaign/${src}/backup--${packet['packet-slug']}`;
      const bk = git(wt, ['branch', '-f', backup, 'HEAD']);
      if (bk.status !== 0) return { ok: false, error: `git branch ${backup} failed: ${bk.stderr}`, fix: gitFix(`git cannot make the backup branch ${backup} in ${wt}.`, 'run start again') };
      const fork = git(wt, ['merge-base', waveBase, 'HEAD']).stdout;
      git(wt, ['reset', '-q', '--soft', fork]);
      const c = git(wt, ['commit', '-q', ...message(SUBJECTS.squash, `The work packet ${packet['packet-slug']}, in one commit for the campaign migration. The old commits are on ${backup}.`)]);
      if (c.status !== 0) {
        git(wt, ['reset', '-q', '--soft', backup]);
        return { ok: false, error: `the one-commit step failed in ${wt}: ${c.stderr || c.stdout}. Nothing changed. Ask the person to rebase by hand in ${wt} (git rebase --onto ${list} ${waveBase}), then start again.`, fix: rebaseByHand(wt, list, waveBase) };
      }
      const ledger = recordSquash(root, wt, packet['packet-slug'], fork, backup);
      steps.push({ squashed: ahead, backup, ...(ledger ? { stepLedger: ledger } : {}) });
    }
    const r = git(wt, ['rebase', '--onto', list, waveBase]);
    if (r.status !== 0) {
      // A conflict leaves unmerged files; any other stop is a refusal.
      const unmerged = git(wt, ['diff', '--name-only', '--diff-filter=U']).stdout.split(/\r?\n/).filter(Boolean);
      git(wt, ['rebase', '--abort']);
      if (!unmerged.length) return { ok: false, refused: 'rebase', error: `git refused the rebase of ${branch} onto ${list}, with no conflict: ${r.stderr || r.stdout}. Ask the person to rebase by hand in ${wt} (git rebase --onto ${list} ${waveBase}), then start again.`, fix: rebaseByHand(wt, list, waveBase) };
      return { ok: false, conflict: 'rebase', error: `the rebase of ${branch} onto ${list} stopped on a conflict: ${r.stderr || r.stdout}. Ask the person to rebase by hand in ${wt} (git rebase --onto ${list} ${waveBase}), then start again.`, fix: rebaseByHand(wt, list, waveBase) };
    }
    steps.push({ rebased: true });
  }
  const mg = git(root, ['merge', '--no-ff', ...message(SUBJECTS.unitMerge, `Merge ${branch} into ${list} for the work packet ${packet['packet-slug']}.`), branch]);
  if (mg.status !== 0) {
    const stop = abortMerge(root, mg);
    if (stop.conflict) return { ok: false, conflict: 'merge', unmerged: stop.unmerged, error: `the merge of ${branch} into ${list} stopped on a conflict in ${stop.unmerged.join(', ')}. Ask the person to merge by hand, then start again.`, fix: mergeByHand(branch, list, 'start') };
    return { ok: false, refused: 'merge', error: `git refused the merge commit of ${branch} into ${list}, with no conflict: ${stop.text}. A commit-msg hook can refuse it. Ask the person to merge by hand with a message that the repo accepts, then start again.`, fix: mergeByHand(branch, list, 'start', true) };
  }
  steps.push({ merged: branch });
  setFields(packet.path, { migrated: { ...m, merged: true } });
  return { ok: true, steps };
}

/**
 * The review base of a packet (6.2): the newest end branch of a done or built build packet that
 * `head` holds, else the trunk. In list order that is the end branch of the build packet before.
 * A built packet counts: in delegate mode it can wait on the person while this packet starts. A
 * skipped packet that is not built has no end branch, so a packet that runs ahead of it reviews
 * from the packet before the skipped one. When the skipped packet runs later, the newest end
 * branch is the one of the packet that ran ahead: it reviews only its own work.
 */
function reviewBase(root, src, packets, packet, trunk, head = 'HEAD') {
  let best = null;
  for (const p of packets) {
    if (p.key === packet?.key || !BUILD_FORMS.includes(p.form) || !['done', 'built'].includes(p.state)) continue;
    const end = endBranch(src, p.key);
    if (!commitOf(root, `refs/heads/${end}`) || !isAncestor(root, end, head)) continue;
    if (!best || isAncestor(root, best, end)) best = end;
  }
  return best ?? trunk;
}

/**
 * The code files that commits on the list branch changed after the newest done or built end
 * branch, outside `.ai/`, leaving out the trunk merges: the work of a packet that is not built.
 */
function inFlightFiles(root, src, packets, trunk) {
  const list = `refs/heads/${listBranch(src)}`;
  if (!commitOf(root, list)) return [];
  const base = reviewBase(root, src, packets, null, trunk, list);
  if (!commitOf(root, base)) return [];
  const not = [trunk, `origin/${trunk}`].filter((r) => commitOf(root, r)).map((r) => `^${r}`);
  const r = git(root, ['log', '--no-merges', '--format=', '--name-only', `${base}..${list}`, ...not, '--', '.', ':(exclude).ai']);
  return r.status === 0 ? [...new Set(r.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))] : [];
}

/** Why `start` must run for a packet before its slice or its run, or null: start would change nothing. */
function startNeeded(root, src, packets, packet, trunk) {
  if (packet.migrated?.['from-branch'] && !packet.migrated.merged) return `the work of the old unit ${packet.migrated['from-branch']} is not on the list branch yet`;
  const index = recordFm(wfDir(root, packet['packet-slug']), INDEX_NAME);
  if (!index) return null;
  const base = reviewBase(root, src, packets, packet, trunk);
  if (index['base-branch'] !== base) return `base-branch is ${index['base-branch'] ?? 'not set'}; start sets it to ${base}`;
  if (index.branch !== listBranch(src)) return `branch is ${index.branch ?? 'not set'}; start sets it to ${listBranch(src)}`;
  return null;
}

function startCmd(root, src, [key], f) {
  const { packets, packet } = packetOf(root, src, key);
  if (!BUILD_FORMS.includes(packet.form)) return { ok: false, error: `${packet.key} is not a build packet`, fix: routeFix(src, packet) };
  if (packet.state === 'written') return { ok: false, error: `${packet.key} is not open: run campaign.mjs open first`, fix: agentFix(`Run open: it writes the workflow folder of ${packet.key}. Then run start again.`, campaignLine(root, 'open', src, packet.key), campaignLine(root, 'start', src, packet.key)) };
  if (['done', 'dropped'].includes(packet.state)) return { ok: false, error: `${packet.key} is ${packet.state}`, fix: nextFix(root, src, `${packet.key} is ${packet.state}: nothing starts it. Run next for the next step of the list.`) };
  requireWalkBranch(root, src, packet);
  const trunk = trunkOf(root, f);
  let migration = null;
  if (packet.migrated) {
    migration = landMigrated(root, src, packet);
    if (!migration.ok) return { ok: false, key: packet.key, ...migration, fix: migration.fix };
  }
  const base = reviewBase(root, src, packets, packet, trunk);
  const wdir = wfDir(root, packet['packet-slug']);
  if (!hasDoc(wdir, INDEX_NAME)) return { ok: false, error: `${posix(relative(root, join(wdir, INDEX_NAME)))} does not exist: run campaign.mjs open`, fix: personFix(`The packet ${packet.key} is open, and its workflow folder has no index: the person restores ${posix(relative(root, join(wdir, INDEX_NAME)))} from git, or says to drop the packet.`) };
  setRecordFields(wdir, INDEX_NAME, { 'base-branch': base, branch: listBranch(src), 'updated-at': nowIso() });
  return { ok: true, key: packet.key, slug: packet['packet-slug'], base, ...(migration ? { migration } : {}) };
}

function builtCmd(root, src, [key], f = {}) {
  const { packet } = packetOf(root, src, key);
  if (packet.state !== 'open' && packet.state !== 'built') return { ok: false, error: `${packet.key} is ${packet.state}, not open`, fix: nextFix(root, src, `${packet.key} is ${packet.state}: built marks an open packet after a clean run. Run next for its step now.`) };
  setPacketState(packet, 'built');
  // The flat shape: the end branch marks the built work, so a packet that starts while this one
  // waits reviews from it. done moves it again.
  let endAt = null;
  const end = endBranch(src, packet.key);
  if (shapeOf(root) !== 'stacked' && currentBranch(root) !== end && git(root, ['branch', '-f', end, 'HEAD']).status === 0) endAt = end;
  return { ok: true, key: packet.key, state: 'built', ...(endAt ? { endBranch: endAt } : {}), publish: publish(root, src, trunkOf(root, f), f) };
}

/**
 * Open a built packet again, until the driver builds it once more. The walk does not use it: a
 * repair form, for a built packet that gets new work by hand.
 */
function reopenCmd(root, src, [key]) {
  const { packet } = packetOf(root, src, key);
  if (packet.state === 'open') return { ok: true, key: packet.key, state: 'open', changed: false };
  if (packet.state !== 'built') return { ok: false, error: `${packet.key} is ${packet.state}; only a built packet opens again`, fix: nextFix(root, src, `${packet.key} is ${packet.state}, and only a built packet opens again. Run next for its step now.`) };
  setPacketState(packet, 'open');
  return { ok: true, key: packet.key, state: 'open', changed: true };
}

/**
 * The packet slug of a later open build packet whose driver journal shows a run that has not
 * ended and wrote within the liveness floor, or null.
 */
function liveLaterDriver(root, packets, packet) {
  for (const p of packets) {
    if ((p.order ?? 0) <= (packet.order ?? 0) || !BUILD_FORMS.includes(p.form) || p.state !== 'open') continue;
    if (driverLive(root, p['packet-slug'])) return p['packet-slug'];
  }
  return null;
}

/** True when the driver journal of a workflow shows a run that has not ended and wrote within the liveness floor. */
function driverLive(root, slug) {
  const file = join(wfDir(root, slug), '.driver-journal.jsonl');
  let text;
  let mtimeMs;
  try { text = readFileSync(file, 'utf8'); mtimeMs = statSync(file).mtimeMs; } catch { return false; }
  const last = parseJsonLines(text).lines.at(-1);
  return Boolean(last) && last.event !== 'run-end' && Date.now() - mtimeMs < STALE_FLOOR_MS;
}

/** The slug of the build packet whose driver runs in this checkout now, or null: the next run of the walk, or a fix run. */
function runningDriver(root, packets) {
  for (const p of packets) {
    if (BUILD_FORMS.includes(p.form) && ['open', 'built'].includes(p.state) && driverLive(root, p['packet-slug'])) return p['packet-slug'];
  }
  return null;
}

function doneCmd(root, src, [key], f) {
  const { packets, packet } = packetOf(root, src, key);
  if (packet.state !== 'built') return { ok: false, error: `${packet.key} is ${packet.state}; done needs a built packet (a clean yolo run, then campaign.mjs built)`, fix: nextFix(root, src, `${packet.key} is ${packet.state}, and done needs a built packet. Run next for its step now.`) };
  const slug = packet['packet-slug'];
  const unbuilt = openSlices(root, slug);
  if (unbuilt.length) return { ok: false, error: `the slice(s) ${unbuilt.join(', ')} of ${slug} are not complete: run the driver again`, unbuilt, fix: nextFix(root, src, `The slices ${unbuilt.join(', ')} of ${slug} are not complete: run next, which launches the driver for them.`) };
  const fid = decisionFidelity(root, slug, (packet['carried-decisions'] ?? []).map((d) => d.key));
  if (!fid.table) return { ok: false, error: `${slug}/07-review.md has no ## Decision Fidelity table`, fix: agentFix(`Run the review of ${slug}: it writes the ## Decision Fidelity table in 07-review.md. Then run done again.`) };
  if (fid.missing.length) return { ok: false, error: `the ## Decision Fidelity table of ${slug} has no row for ${fid.missing.join(', ')}`, missing: fid.missing, fix: agentFix(`Add a row for each of ${fid.missing.join(', ')} to the ## Decision Fidelity table of ${slug}/07-review.md, as the review writes it. Then run done again.`) };
  if (fid.rows.length) return { ok: false, error: `${fid.rows.length} fidelity row(s) are not honored and not approved`, rows: fid.rows, fix: personFix(`Show the person each fidelity row that is not honored: the person approves it, or asks for a fix run. Then run done again.`) };
  if (packet['try-out'] === 'yes' && !tryOutRecorded(root, slug)) return { ok: false, error: `the try-out of ${packet.key} is not recorded: run wf.mjs decide add ${root} ${slug} --kind try-out --key try-out --answer works`, fix: personFix(`The person tries ${packet.key} out and says whether it works; the answer is recorded with wf.mjs decide add --kind try-out --key try-out. Then run done again.`) };
  requireWalkBranch(root, src, packet);
  // The merge and the branch moves of done need a still checkout: a later packet's driver that
  // still runs edits and commits in it.
  const live = liveLaterDriver(root, packets, packet);
  if (live) return { ok: false, busy: true, running: live, error: `the driver of ${live} still runs in this checkout: run done after its run ends`, fix: waitFix(live, 'run done again') };
  const dirty = dirtyOutsideAi(root);
  if (dirty?.length) return { ok: false, busy: true, dirty: dirty.slice(0, 20), error: `${dirty.length} uncommitted change(s) outside .ai/ in the checkout: run done after the running driver ends, or commit them`, fix: personFix(`The checkout has ${dirty.length} uncommitted change(s) outside .ai/ (dirty lists them): when no driver runs, the person commits them or says what to do with them. Then run done again.`) };
  const trunk = trunkOf(root, f);
  if (shapeOf(root) === 'stacked') {
    // The layer is the end branch. gh stack sync rebases the stack onto the trunk and pushes it
    // with --force-with-lease; no trunk merge enters a layer.
    const sync = f['no-push'] || !hasRemote(root) ? null : gh(root, ['stack', 'sync', '--remote', 'origin']);
    if (sync && sync.status === 3) return { ok: false, conflict: 'stack', error: `gh stack sync stopped on a rebase conflict: run gh stack rebase, resolve the files, git add them, and gh stack rebase --continue. Then run done again. ${sync.stderr}`, fix: personFix('The stack has a rebase conflict: the person runs gh stack rebase, settles the files, adds them, and runs gh stack rebase --continue. Then run done again.') };
    if (sync && sync.status !== 0) return { ok: false, error: `gh stack sync failed: ${sync.stderr || sync.stdout}`, fix: personFix('gh stack sync failed: check that gh is signed in (gh auth status) and that the gh-stack extension is installed, then run done again.') };
    if (hasDoc(wfDir(root, slug), INDEX_NAME)) setRecordFields(wfDir(root, slug), INDEX_NAME, { 'updated-at': nowIso() });
    setPacketState(packet, 'done');
    return { ok: true, key: packet.key, state: 'done', endBranch: endBranch(src, packet.key), shape: 'stacked', synced: Boolean(sync), publish: publish(root, src, trunk, f) };
  }
  const from = trunkRef(root, trunk);
  let merged = false;
  if (!isAncestor(root, from, 'HEAD')) {
    const mg = git(root, ['merge', ...message(SUBJECTS.trunkMerge, `Merge ${from} into ${listBranch(src)} at the end of the work packet ${slug}.`), from]);
    if (mg.status !== 0) {
      const stop = abortMerge(root, mg);
      if (stop.conflict) return { ok: false, conflict: 'trunk', unmerged: stop.unmerged, error: `the merge of ${from} into ${listBranch(src)} stopped on a conflict in ${stop.unmerged.join(', ')}. Ask the person to merge by hand, then run done again.`, fix: mergeByHand(from, listBranch(src), 'done') };
      return { ok: false, refused: 'trunk', error: `git refused the merge commit of ${from} into ${listBranch(src)}, with no conflict: ${stop.text}. A commit-msg hook can refuse it. Ask the person to merge by hand with a message that the repo accepts, then run done again.`, fix: mergeByHand(from, listBranch(src), 'done', true) };
    }
    merged = true;
  }
  const end = endBranch(src, packet.key);
  // A later packet started while this one waited: its work is on HEAD, so the end branch stays at
  // the commit where this packet was built.
  const later = packets.some((p) => (p.order ?? 0) > (packet.order ?? 0) && BUILD_FORMS.includes(p.form) && ['open', 'built'].includes(p.state));
  if (!(later && commitOf(root, `refs/heads/${end}`))) {
    const b = git(root, ['branch', '-f', end, 'HEAD']);
    if (b.status !== 0) return { ok: false, error: `git branch -f ${end} failed: ${b.stderr}`, fix: gitFix(`git cannot move the end branch ${end}.`, 'run done again') };
  }
  if (hasDoc(wfDir(root, slug), INDEX_NAME)) setRecordFields(wfDir(root, slug), INDEX_NAME, { 'base-branch': trunk, 'updated-at': nowIso() });
  setPacketState(packet, 'done');
  let removed = null;
  if (packet.migrated?.worktree && existsSync(packet.migrated.worktree)) removed = removeWorktree(root, src, packet.migrated.worktree, { unitKey: packet.migrated['unit-key'] ?? packet.key });
  return { ok: true, key: packet.key, state: 'done', endBranch: end, trunkMerged: merged, publish: publish(root, src, trunk, f), ...(removed ? { worktree: removed } : {}) };
}

/**
 * Close a packet outside the build walk (6.1 step 5): a routed packet whose own workflow is
 * complete becomes `done`, and a packet the person drops becomes `dropped`. The packet file
 * and the board packet both change; a dropped packet holds no kept decision on the next check.
 */
function closeCmd(root, src, [key, to]) {
  if (!['done', 'dropped'].includes(to)) throw refuse('close: the state is done or dropped', agentFix('Run close again with done (a routed packet whose workflow is complete) or dropped (a packet that the person drops) as its last word.'));
  const { packet } = packetOf(root, src, key);
  if (['done', 'dropped'].includes(packet.state)) return { ok: true, key: packet.key, state: packet.state, changed: false };
  if (to === 'done' && BUILD_FORMS.includes(packet.form)) return { ok: false, error: `${packet.key} is a build packet: it is done through built and done, after its yolo run and its fidelity read`, fix: nextFix(root, src, `${packet.key} is a build packet: run next, which leads it through built and done.`) };
  setPacketState(packet, to);
  const { path: boardPath, board } = boardOf(root, src);
  const onBoard = board?.work?.find((w) => w.key === packet.key);
  if (onBoard) {
    onBoard.state = to;
    writeFileSync(boardPath, `${JSON.stringify(board, null, 2)}\n`);
  }
  // A dropped migrated packet keeps its unit branch; its old worktree goes, with the guarded remove.
  const wt = to === 'dropped' && packet.migrated?.worktree && existsSync(packet.migrated.worktree) ? packet.migrated.worktree : null;
  const worktree = wt ? removeWorktree(root, src, wt, { unitKey: packet.migrated['unit-key'] ?? packet.key }) : null;
  return { ok: true, key: packet.key, state: to, changed: true, board: Boolean(onBoard), ...(worktree ? { worktree } : {}) };
}

// ---------------------------------------------------------------- skip, unskip, ahead

const STACKED_SKIP = 'the stacked shape builds each layer on the layer below it, so no packet can run ahead of another. Finish or drop the packet, or set pr-shape: single in .ai/ship-plan.md before the first packet starts';
const stackedSkipFix = (keys) => personFix(`In the stacked shape no packet runs ahead of another: the person finishes or drops ${keys}, or sets pr-shape: single in .ai/ship-plan.md before the first packet starts.`);

/** Remove top-level keys from the frontmatter of a packet file. */
function removeFields(file, keys) {
  const text = readFileSync(file, 'utf8');
  const m = /^(---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))/.exec(text);
  if (!m) return false;
  const nl = m[1].endsWith('\r\n') ? '\r\n' : '\n';
  const lines = m[2].split(/\r?\n/);
  for (const key of keys) {
    const k = lines.findIndex((l) => l.startsWith(`${key}:`));
    if (k < 0) continue;
    let c = k + 1;
    while (c < lines.length && lines[c].trim() && (/^\s/.test(lines[c]) || /^- /.test(lines[c]))) c++;
    lines.splice(k, c - k);
  }
  writeFileSync(file, `${m[1]}${lines.join(nl)}${m[3]}${text.slice(m[0].length)}`);
  return true;
}

/**
 * The person's skip (in chat): the walk goes on with a later packet. The packet keeps its state.
 * A later packet runs only when the person lets it run ahead (`ahead`). The flat shape only.
 * Refused while the packet's driver runs, and while the list branch holds work of this packet
 * that is not built: a packet that ran ahead would carry that work into its review.
 */
function skipCmd(root, src, [key], f) {
  const { packets, packet } = packetOf(root, src, key);
  const slug = packet['packet-slug'];
  const reason = String(f.reason ?? '').trim();
  if (!reason) return { ok: false, error: 'skip needs --reason "<the person\'s words>"', fix: agentFix('Run skip again with the words of the person who asked for the skip.', campaignLine(root, 'skip', src, packet.key, '--reason', '"<the person\'s words>"')) };
  if (['done', 'dropped'].includes(packet.state)) return { ok: false, error: `${packet.key} is ${packet.state}: nothing waits on it`, fix: nextFix(root, src, `${packet.key} is ${packet.state}, so there is nothing to skip. Run next for the next step of the list.`) };
  if (packet.skipped) return { ok: true, key: packet.key, slug, state: packet.state, skipped: packet.skipped, changed: false };
  if (shapeOf(root) === 'stacked') return { ok: false, error: `skip: ${STACKED_SKIP}`, fix: stackedSkipFix(packet.key) };
  if (driverLive(root, slug)) return { ok: false, busy: true, error: `the driver of ${slug} runs: skip it after its run ends`, fix: waitFix(slug, 'run skip again') };
  if (packet.state === 'open' && walkPick(root, src, packets).current?.packet.key === packet.key) {
    const files = inFlightFiles(root, src, packets, trunkOf(root, f));
    if (files.length) {
      return {
        ok: false, files: files.slice(0, 20),
        error: `the list branch holds work of ${packet.key} that is not built: ${files.length} file(s), ${files.slice(0, 3).join(', ')}. A packet that runs ahead would carry that work into its review. Finish ${packet.key}, or drop it and revert its commits by hand, before a later packet runs`,
        fix: personFix(`The list branch holds work of ${packet.key} that is not built: the person says to finish ${packet.key} first, or drops it and reverts its commits by hand. A skip cannot leave that work in the review of a later packet.`),
      };
    }
  }
  const skipped = { reason, by: 'person', at: nowIso() };
  setFields(packet.path, { skipped });
  return { ok: true, key: packet.key, slug, state: packet.state, skipped, changed: true };
}

/**
 * Take a skip back. Refused while a later packet that runs ahead of this one has work on the
 * list branch that is not built: this packet would start on top of it.
 */
function unskipCmd(root, src, [key], f) {
  const { packets, packet } = packetOf(root, src, key);
  if (!packet.skipped) return { ok: true, key: packet.key, state: packet.state, changed: false };
  const { current } = walkPick(root, src, packets);
  if (current && current.packet.state === 'open' && (current.packet.order ?? 0) > (packet.order ?? 0)) {
    const files = inFlightFiles(root, src, packets, trunkOf(root, f));
    if (files.length) return { ok: false, running: current.packet.key, error: `${current.packet.key} runs ahead of ${packet.key}, and its work is not built yet. Take the skip back after campaign.mjs built ${current.packet.key}`, fix: agentFix(`Go on with the walk until ${current.packet.key} is built (next names its steps), then run unskip again.`, campaignLine(root, 'next', src), campaignLine(root, 'unskip', src, packet.key)) };
  }
  removeFields(packet.path, ['skipped']);
  return { ok: true, key: packet.key, state: packet.state, changed: true };
}

/**
 * The person's answer to "which may run ahead": each named packet may run before every earlier
 * packet that holds it now, except the other packets of the same answer, which run first in
 * list order. Recorded as `ahead-of` on the packet. A packet that nothing holds is refused.
 */
function aheadCmd(root, src, keys) {
  if (!keys.length) return { ok: false, error: 'ahead: name each packet that the person lets run ahead', fix: agentFix('Run ahead again with the key of each packet that the person lets run ahead.', campaignLine(root, 'ahead', src, '<packet-key>...')) };
  if (shapeOf(root) === 'stacked') return { ok: false, error: `ahead: ${STACKED_SKIP}`, fix: stackedSkipFix(keys.join(', ')) };
  const { packets } = readList(root, src);
  const named = keys.map((k) => packetOf(root, src, k).packet);
  const { held } = walkPick(root, src, packets);
  const allowed = new Set(named.map((p) => p.key));
  const recorded = [];
  for (const p of named) {
    const h = held.find((x) => x.packet.key === p.key);
    if (!h) return { ok: false, error: `${p.key} does not wait for a skipped packet: nothing to answer`, held: held.map((x) => x.packet.key), fix: agentFix(`Name only packets that wait for a skipped packet (held lists them${held.length ? `: ${held.map((x) => x.packet.key).join(', ')}` : ''}), and run ahead again.`) };
    const of = [...new Set([...(Array.isArray(p['ahead-of']) ? p['ahead-of'].map(String) : []), ...h.blockers.filter((b) => !allowed.has(b))])];
    setFields(p.path, { 'ahead-of': of });
    recorded.push({ key: p.key, 'ahead-of': of });
  }
  return { ok: true, recorded };
}

// ---------------------------------------------------------------- next (one action of the walk)

const shellQuote = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
const campaignLine = (root, cmd, src, ...rest) => [`node "${CAMPAIGN_CLI}"`, cmd, shellQuote(root), src, ...rest].join(' ');
const wfLine = (root, cmd, ...rest) => [`node "${WF_CLI}"`, ...cmd.split(' '), shellQuote(root), ...rest].join(' ');
const sourceLine = (cmd, dir, ...rest) => [`node "${CAMPAIGN_CLI}"`, cmd, shellQuote(dir), ...rest].join(' ');

// ---------------------------------------------------------------- the fixes of the failures

/** A command of the walk out of its order: `next` names the step that the packet needs now. */
const nextFix = (root, src, doText = 'Run next: it names the step that the list needs now.') => agentFix(doText, campaignLine(root, 'next', src));
/** A packet that is not a build packet runs its own command with the person. */
const routeFix = (src, packet) => personFix(`Type \`${routeOf(src, packet)}\`: a ${packet.form} packet runs its own command with the person.`);
/** A git or gh step that stopped: the person reads what it says and settles it. */
const gitFix = (what, then) => personFix(`${what} Read what git says, settle it in the checkout without a stash or a force, then ${then}.`);
/** A driver that still runs: wait for its end. */
const waitFix = (slug, then) => agentFix(`Wait for the run of ${slug} to end, then ${then}.`);
/** A list that is not written yet: the person ends the brainstorm, and brainstorm done writes it. */
const noListFix = (src) => personFix(`The list of ${src} is written when the person ends its brainstorm: ask the person to end the brainstorm ${src}, or check that ${src} is the source of the list.`);
/** A rebase of a migrated unit that git stopped: the person rebases by hand. */
const rebaseByHand = (wt, list, waveBase) => personFix(`The person rebases by hand in ${wt} (git rebase --onto ${list} ${waveBase}) and settles any conflict, then runs start again.`);
/** A merge that stopped on a conflict, or that a commit hook refused: the person merges by hand. */
const mergeByHand = (from, into, cmd, hook = false) => personFix(hook
  ? `The repo refused the merge commit of ${from} into ${into} (a commit-msg hook can): the person merges by hand with a message that the repo accepts, then runs ${cmd} again.`
  : `The merge of ${from} into ${into} has conflicts: the person merges by hand and settles them, then runs ${cmd} again.`);
/** A migrated board that fails the schema: nothing was written, and the board on disk holds the field. */
const boardSchemaFix = (root, src, phase) => agentFix(`The migration wrote nothing. Repair the field of the board on disk that each entry of errors names, then run migrate ${phase} again.`, campaignLine(root, 'migrate', src, phase));
/** A board that is not where the command looked. */
const noBoardFix = () => agentFix('Pass the folder of the brainstorm that holds the board (its workflow folder), or the board file itself.');

/** The last line of the driver journal of a workflow, or null. */
function lastJournalLine(root, slug) {
  try { return parseJsonLines(readFileSync(join(wfDir(root, slug), '.driver-journal.jsonl'), 'utf8')).lines.at(-1) ?? null; } catch { return null; }
}

/** The fidelity and try-out findings that the walk put in the ledger after the last run of the packet ended. */
function freshFixes(root, slug) {
  const dir = wfDir(root, slug);
  const ended = lastRunEndAt(join(dir, '.driver-journal.jsonl')) ?? 0;
  return readLedger(dir).findings.filter((e) => e.status === 'open' && ['intent-fidelity', 'try-out'].includes(e.dimension)
    && (Date.parse(e['last-seen-at'] ?? '') || 0) > ended).map((e) => e.id);
}

/** True when the checkout stands on the branch the walk needs for a packet. */
function onWalkBranch(root, src, packet) {
  return currentBranch(root) === (shapeOf(root) === 'stacked' ? endBranch(src, packet.key) : listBranch(src));
}

/** The how-far answer as a count of packets: 1 for the next only, Infinity for the whole list, null when not given. */
function howFarOf(v) {
  if (v === undefined || v === null || v === true) return null;
  const s = String(v).trim().toLowerCase();
  if (s === 'next' || s === 'one') return 1;
  if (s === 'all' || s === 'whole') return Infinity;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/**
 * The one next action of the walk, from the disk: `{ ok, action, why, command?, args?, ask?,
 * tell?, then }`. `command` is the exact command line to run; `ask` holds entries of `status`
 * `ask`; `tell` is the text for the person at a stop; `then.next` runs `next` again. It changes
 * nothing. The how-far answer of the call comes back in `--how-far` and `--since`, and the
 * run-decisions answer in `--run-decisions`. A how-far answer that the decision store of the
 * source does not hold yet comes with `recordHowFar`, the command that records it; `ask-how-far`
 * returns the last recorded answer as `howFar`.
 */
/** The file in the folder of a list that names the orchestrate run that owns the list (scripts/orchestrate.mjs). */
const OWNER_FILE = 'orchestrate-owner.json';
const ownerOf = (root, src) => readJson(join(sourceDir(root, src), OWNER_FILE));

/**
 * The hand-back of an orchestrate run: each work packet that the run passed becomes done, with
 * the validation records of the run as its proof in place of the fidelity rows and the try-out.
 * Only the hand-back of the owner asks for it: the owner file names the packets.
 */
function acceptCmd(root, src) {
  const owner = ownerOf(root, src);
  if (!owner?.['handing-back']) {
    throw refuse(`${src}: no hand-back of an orchestrate run is ready`, agentFix('Only the hand-back of an orchestrate run accepts work packets this way. A work packet of the walk is done through built and done.', campaignLine(root, 'next', src)));
  }
  const { packets } = readList(root, src);
  const { path: boardPath, board } = boardOf(root, src);
  const accepted = [];
  for (const key of Array.isArray(owner.accept) ? owner.accept : []) {
    const packet = packets.find((p) => p.key === key);
    if (!packet || ['done', 'dropped'].includes(packet.state)) continue;
    setPacketState(packet, 'done');
    const onBoard = board?.work?.find((w) => w.key === key);
    if (onBoard) onBoard.state = 'done';
    accepted.push(key);
  }
  if (board && accepted.length) writeFileSync(boardPath, `${JSON.stringify(board, null, 2)}
`);
  appendHistory(sourceDir(root, src), `The orchestrate run ${owner.owner} handed the list back. Done by its validation records (${owner.evidence ?? 'no evidence page'}): ${accepted.join(', ') || 'none'}.`);
  rmSync(join(sourceDir(root, src), OWNER_FILE), { force: true });
  return { ok: true, source: src, accepted, owner: owner.owner, evidence: owner.evidence ?? null, then: { next: campaignLine(root, 'next', src) } };
}

function nextCmd(root, src, f = {}) {
  const owner = ownerOf(root, src);
  if (owner?.owner) {
    return { ok: false, error: `the list ${src} is owned by the orchestrate run ${owner.owner}`, fix: personFix(`The run ${owner.owner} builds this list. To go on with the walk, tell that run to hand the list back: /wf orchestrate ${owner.owner} hand back.`) };
  }
  const end = Boolean(f.end);
  const st = statusCmd(root, src, { end });
  if (!st.ok) return st;
  if (st.migrate) {
    const phase = st.migrate === 'finish' ? 'finish' : 'report';
    return { ok: true, source: src, action: 'migrate', phase, why: st.reason, command: campaignLine(root, 'migrate', src, phase), then: { next: campaignLine(root, 'next', src) } };
  }
  const howFar = howFarOf(f['how-far']);
  if (howFar === undefined) return { ok: false, error: `--how-far is next, all or a number, not ${f['how-far']}`, fix: agentFix('Run next again with the person\'s answer as --how-far next, all, or a whole number of packets.', campaignLine(root, 'next', src, '--how-far', '<next|all|N>', ...(f.since ? ['--since', String(f.since)] : []))) };
  const since = f.since ? String(f.since) : null;
  const carry = [
    ...(f['how-far'] ? ['--how-far', String(f['how-far'])] : []), ...(since ? ['--since', since] : []),
    ...(f['run-decisions'] ? ['--run-decisions', shellQuote(f['run-decisions'])] : []), ...(f.trunk ? ['--trunk', String(f.trunk)] : []),
  ];
  const nextLine = campaignLine(root, 'next', src, ...carry, ...(end ? ['--end'] : []));
  // The how-far answer goes to the decision store of the source under its stable key, as the
  // run-decisions answer does: `recordHowFar` is the command that records it, while the store
  // holds another answer or none.
  let lastHowFar = null;
  try { lastHowFar = answeredBy(decisionsOf(sourceDir(root, src)), HOW_FAR_KEY); } catch { lastHowFar = null; }
  const howFarText = f['how-far'] && f['how-far'] !== true ? String(f['how-far']).trim() : null;
  const recordHowFar = howFarText && howFarText.toLowerCase() !== String(lastHowFar?.answer ?? '').trim().toLowerCase()
    ? wfLine(root, 'decide add', src, '--kind answer --key', HOW_FAR_KEY, '--question', shellQuote(HOW_FAR_QUESTION), '--answer', shellQuote(howFarText))
    : null;
  const out = (o) => ({ ok: true, source: src, ...(st.skipped ? { skipped: st.skipped } : {}), ...(recordHowFar ? { recordHowFar } : {}), ...o, then: { next: nextLine, ...(o.then ?? {}) } });
  const { packets } = readList(root, src);
  const byKey = new Map(packets.map((p) => [p.key, p]));
  const trunk = trunkOf(root, f);
  const stacked = shapeOf(root) === 'stacked';
  const pk = (p) => ({ key: p.key, slug: p['packet-slug'] });
  const land = (p, why) => out({ action: 'land', ...pk(p), why, command: campaignLine(root, 'land', src, p.key, ...(f.trunk ? ['--trunk', f.trunk] : [])) });

  // A driver runs in this checkout: ask what waits, else wait for its end.
  if (st.then.running) {
    if (st.ask.length) return out({ action: 'ask', why: `the driver of ${st.then.running} runs: ask the questions that wait now`, ask: st.ask, then: st.then });
    return out({ action: 'wait', slug: st.then.running, why: `the driver of ${st.then.running} runs: wait for its run to end` });
  }
  // Open each written build packet, in list order.
  const written = end ? null : packets.find((p) => BUILD_FORMS.includes(p.form) && p.state === 'written');
  if (written) return out({ action: 'open', ...pk(written), why: `${written.key} is written: open writes its workflow folder`, command: campaignLine(root, 'open', src, written.key, ...(f.trunk ? ['--trunk', f.trunk] : [])) });
  // Once per call: the plan, then how far to go.
  if (!end && howFar === null) {
    const at = nowIso();
    const lastAnswer = packets.map((p) => {
      try { return answeredBy(decisionsOf(wfDir(root, p['packet-slug'])), RUN_DECISIONS_KEY); } catch { return null; }
    }).filter(Boolean).sort((a, b) => String(a.at ?? '').localeCompare(String(b.at ?? ''))).at(-1);
    return out({
      action: 'ask-how-far', why: 'a new call: show the plan, then ask how far to go and how the runs settle the person\'s decisions',
      command: campaignLine(root, 'plan', src), shipReady: wfLine(root, 'ship ready', src), since: at,
      runDecisions: lastAnswer ? { answer: lastAnswer.answer } : null, howFar: lastHowFar ? { answer: lastHowFar.answer } : null, needDesign: st.needDesign,
      then: { next: campaignLine(root, 'next', src, '--how-far', '<next|all|N>', '--since', at, '--run-decisions', '"<answer>"', ...(f.trunk ? ['--trunk', f.trunk] : [])) },
    });
  }
  const cur = st.current ? byKey.get(st.current.key) : null;
  const step = st.current;
  // A clean run of the current packet ended: built first, before any other step.
  if (cur && cur.state === 'open' && step.step === 'yolo') {
    const last = lastJournalLine(root, cur['packet-slug']);
    if (last?.event === 'run-end' && !last.stoppedAt && !openSlices(root, cur['packet-slug']).length) {
      if (!onWalkBranch(root, src, cur)) return land(cur, 'built marks the end branch at HEAD of the walk branch');
      return out({ action: 'built', ...pk(cur), why: `the run of ${cur['packet-slug']} reached its endpoint`, command: campaignLine(root, 'built', src, cur.key) });
    }
  }
  // A fix that the person asked for runs before the walk starts any further packet.
  // A done packet counts too: a reversal of its delegate digest is a fix.
  for (const p of packets) {
    if (!BUILD_FORMS.includes(p.form) || !['built', 'done'].includes(p.state) || (p.skipped && p.state !== 'done')) continue;
    if (p.state === 'done' && shippedOrClosed(root, p['packet-slug'])) continue;
    const fixes = freshFixes(root, p['packet-slug']);
    if (!fixes.length) continue;
    if (!onWalkBranch(root, src, p)) return land(p, 'the fix run works on the walk branch');
    return out({ action: 'fix-run', ...pk(p), why: `the findings ${fixes.join(', ')} of ${p['packet-slug']} wait for a fix run`, findings: fixes, args: { slug: p['packet-slug'], reviewFindings: true } });
  }
  const doneThisCall = since ? packets.filter((p) => p.state === 'done' && String(p['done-at'] ?? '') >= since).map((p) => p.key) : [];
  if (end || st.finished || (howFar !== null && doneThisCall.length >= howFar)) {
    const fin = end ? st : statusCmd(root, src, { end: true });
    if (fin.finished) {
      return out({
        action: 'hand-off', why: 'every packet is done or dropped', ask: fin.ask, then: { ...fin.then, next: campaignLine(root, 'next', src, '--end') },
        tell: stacked ? 'Ship each layer as its own PR, bottom first, or merge the whole stack with gh stack merge.' : `Type \`/wf ship packets/${src}\``,
      });
    }
    return out({
      action: 'end', why: end ? 'the call ends' : `${doneThisCall.length} packet(s) reached done in this call, as far as the person asked`,
      ask: fin.ask, then: { ...fin.then, next: campaignLine(root, 'next', src, '--end') }, doneThisCall,
      nextPacket: fin.current ? { key: fin.current.key, slug: fin.current.slug, step: fin.current.step } : null, needDesign: fin.needDesign,
      tell: `Type \`/wf campaign ${src}\``,
    });
  }
  if (!cur) {
    if (st.held?.length && !stacked) {
      const entry = {
        kind: 'ahead',
        skipped: (st.skipped ?? []),
        candidates: st.held.map((h) => {
          const p = byKey.get(h.key);
          return { key: p.key, slug: p['packet-slug'], title: p.title ?? null, order: p.order, form: p.form, 'why-here': p['why-here'] ?? null, waitsFor: h.waitsFor };
        }),
      };
      return out({ action: 'ask', why: 'every packet that may run waits for a skipped packet: the person says which may run ahead', ask: [entry], then: { record: campaignLine(root, 'ahead', src, '<key>...') } });
    }
    return out({
      action: 'end', why: stacked && st.held?.length ? `every packet left waits for a skipped packet, and ${STACKED_SKIP}` : 'every packet left is skipped',
      ask: [], doneThisCall, tell: `Each packet left is skipped. Take a skip back with campaign.mjs unskip, then type \`/wf campaign ${src}\``,
    });
  }
  const ahead = step['ahead-of'] ? { 'ahead-of': step['ahead-of'] } : {};
  switch (step.step) {
    case 'route': {
      const index = recordFm(wfDir(root, cur['packet-slug']), INDEX_NAME);
      if (['complete', 'closed'].includes(String(index?.status ?? ''))) {
        return out({ action: 'close', ...pk(cur), ...ahead, why: `the workflow ${cur['packet-slug']} is ${index.status}`, command: campaignLine(root, 'close', src, cur.key, 'done') });
      }
      return out({ action: 'route-stop', ...pk(cur), ...ahead, form: cur.form, route: step.route, why: `a ${cur.form} packet runs its own command with the person`, tell: `Type \`${step.route}\`` });
    }
    case 'open':
      return out({ action: 'open', ...pk(cur), why: `${cur.key} is written`, command: campaignLine(root, 'open', src, cur.key) });
    case 'design': {
      const direction = cur['design-form'] === 'design-direction';
      return out({
        action: 'design-stop', ...pk(cur), ...ahead, why: step.reason, route: step.route,
        tell: direction ? `Type \`/wf design direction from ${src}\` first, then \`${step.route}\`` : `Type \`${step.route}\``,
      });
    }
    default: break;
  }
  if (!onWalkBranch(root, src, cur)) return land(cur, `the checkout is on ${currentBranch(root) ?? 'a detached HEAD'}`);
  const slug = cur['packet-slug'];
  if (step.step === 'slice' || (step.step === 'yolo' && cur.state === 'open')) {
    const why = startNeeded(root, src, packets, cur, trunk);
    if (why) return out({ action: 'start', ...pk(cur), ...ahead, why, command: campaignLine(root, 'start', src, cur.key, ...(f.trunk ? ['--trunk', f.trunk] : [])) });
    if (step.questions?.length) {
      return out({ action: 'ask-carried', ...pk(cur), why: 'the person left these questions to this build: ask them before the slice', ask: [{ kind: 'carried', ...pk(cur), questions: step.questions }] });
    }
    if (step.step === 'slice') return out({ action: 'slice', ...pk(cur), ...ahead, why: `${slug} has no slice roster`, args: { slug } });
  }
  if (step.step === 'yolo' || (step.step === 'fidelity' && step.reason)) {
    const last = lastJournalLine(root, slug);
    const args = { slug };
    if (last?.event === 'run-end' && last.stoppedAt) {
      return out({ action: 'driver-stop', ...pk(cur), why: `the run of ${slug} stopped at ${last.stoppedAt}`, stoppedAt: last.stoppedAt, reason: last.reason ?? null, args, tell: `The run of ${slug} stopped at ${last.stoppedAt}${last.reason ? `: ${last.reason}` : ''}.` });
    }
    const steer = f['run-decisions'] ? String(f['run-decisions']) : null;
    let have = null;
    try { have = answeredBy(decisionsOf(wfDir(root, slug)), RUN_DECISIONS_KEY)?.answer ?? null; } catch { have = null; }
    const record = steer && steer !== have
      ? wfLine(root, 'decide add', slug, '--kind steer --key', RUN_DECISIONS_KEY, '--question', shellQuote(RUN_DECISIONS_QUESTION), '--answer', shellQuote(steer))
      : null;
    return out({ action: 'launch-driver', ...pk(cur), ...ahead, why: step.reason ?? `${slug} is sliced: the driver builds it`, ...(record ? { command: record } : {}), args });
  }
  if (step.step === 'fidelity' || step.step === 'try-out') {
    return out({ action: 'ask', ...pk(cur), why: step.step === 'fidelity' ? `${slug} has fidelity rows that the person has not approved` : `${slug} waits for its try-out`, ask: st.ask, then: st.then });
  }
  if (step.step === 'done') return out({ action: 'done', ...pk(cur), why: `${cur.key} is built and clear`, command: campaignLine(root, 'done', src, cur.key, ...(f.trunk ? ['--trunk', f.trunk] : [])) });
  // A step that the walk does not know is a defect of the plugin.
  throw new Error(`next: no action for the step ${step.step} of ${cur.key}`); /* defect */
}

// ---------------------------------------------------------------- plan (a dry run of the walk)

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
const range = (xs) => ({ low: Math.round(Math.min(...xs)), median: Math.round(median(xs)), high: Math.round(Math.max(...xs)) });

/** The token columns of a cost, output and fresh input first; cache reads come apart. */
export const COST_COLUMNS = Object.freeze(['output', 'input', 'cacheWrite', 'cacheRead']);

/**
 * The sanity bound of one sample: all tokens of a past run over its complete slices. A slice
 * above it would need more than a thousand turns that each read a full context of a million
 * tokens; a figure past it is a fault of the rows, never a cost, so it is not shown.
 */
export const SLICE_TOKEN_BOUND = 1_000_000_000;

/**
 * The tokens per complete slice of the past runs of this project, per column. Each workflow
 * folder with rows in its cost ledger and complete slices in its roster gives one sample: its
 * totals (aggregateCost) over its complete slices. A folder whose rows book a sub-agent again
 * (rebookedEntries), or whose sample passes SLICE_TOKEN_BOUND, is left out with its reason. The
 * ledger holds tokens, never currency. No sample gives no number.
 */
export function costBasis(root, { exclude = [] } = {}) {
  let names = [];
  try { names = readdirSync(workflowsRoot(root), { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => d.name); } catch { names = []; }
  const samples = [];
  const excluded = [];
  for (const name of names) {
    if (exclude.includes(name)) continue;
    const dir = wfDir(root, name);
    const rows = readCostRows(dir);
    if (!rows.length) continue;
    const slices = (recordFm(dir, INDEX_NAME)?.slices ?? []).filter((s) => s && s.status === 'complete').length;
    if (!slices) continue;
    const rebooked = rebookedEntries(rows);
    if (rebooked) {
      excluded.push({ slug: name, reason: `${rebooked} sub-agent entries book again a usage that an earlier row booked; scripts/cost-rebuild.mjs repairs the rows from the transcripts` });
      continue;
    }
    const t = aggregateCost(rows).total;
    const per = Object.fromEntries(COST_COLUMNS.map((c) => [c, t[c] / slices]));
    const all = COST_COLUMNS.reduce((n, c) => n + per[c], 0);
    if (!all) continue;
    if (all > SLICE_TOKEN_BOUND) {
      excluded.push({ slug: name, reason: `${Math.round(all).toLocaleString('en-US')} tokens per slice is above the bound of ${SLICE_TOKEN_BOUND.toLocaleString('en-US')}` });
      continue;
    }
    samples.push({ slug: name, slices, per });
  }
  const left = excluded.length ? { excluded } : {};
  if (!samples.length) {
    const note = excluded.length
      ? `the cost rows of this project cannot be summed: ${excluded.length} past run(s) have rows that book a usage again or pass the bound, and no other run has cost rows and complete slices`
      : 'no past run of this project has cost rows and complete slices: no cost estimate';
    return { runs: 0, perSlice: null, note, ...left };
  }
  return {
    runs: samples.length, slices: samples.reduce((n, s) => n + s.slices, 0), unit: 'tokens',
    perSlice: Object.fromEntries(COST_COLUMNS.map((c) => [c, range(samples.map((s) => s.per[c]))])),
    from: samples.map((s) => s.slug), ...left,
  };
}

/** The cost range of `n` slices, per column, from the low and the high sample. */
const costOf = (cost, n) => (cost.perSlice && n ? Object.fromEntries(COST_COLUMNS.map((c) => [c, { low: n * cost.perSlice[c].low, high: n * cost.perSlice[c].high }])) : null);

/** The packets that the compact plan shows in full: the next ones that will run. */
export const PLAN_NEXT = 5;

/**
 * The whole walk before it starts, in list order: forms, states, design, stops, slices and a cost
 * range. It changes nothing. The default is compact: the totals, each kind of stop with its count
 * and the keys of the packets that stop, the next PLAN_NEXT packets in full, and one short line
 * for each other packet. `--full` gives every packet in full.
 */
function planCmd(root, src, f = {}) {
  const st = statusCmd(root, src, {});
  if (!st.ok) return st;
  if (st.migrate) return { ok: false, source: src, error: `${src} has an old campaign: migrate it first`, migrate: st.migrate, fix: nextFix(root, src, `${src} has an old campaign: run next, which names the step of its migration. Then run plan again.`) };
  const { packets } = readList(root, src);
  const cost = costBasis(root, { exclude: [src] });
  const rows = packets.map((p) => {
    const slug = p['packet-slug'];
    const dir = wfDir(root, slug);
    const build = BUILD_FORMS.includes(p.form);
    const index = build ? recordFm(dir, INDEX_NAME) : null;
    const closed = ['done', 'dropped'].includes(p.state);
    let design = 'none';
    let designWhy = null;
    if (build && index) {
      const block = designBlock(root, slug);
      if (block) { design = 'needed'; designWhy = block; } else if (designNeeded(index, hasDoc(dir, '02b-design.md'))) design = 'settled';
    } else if (build && ((p['ux-impact'] ?? 'none') !== 'none' || (p['design-form'] ?? 'none') !== 'none')) {
      design = 'needed'; designWhy = 'the design stage runs after open';
    }
    const carried = index
      ? (index['open-questions'] ?? []).filter((q) => q && typeof q === 'object' && q.stage === 'slice' && q.key).length
      : (Array.isArray(p['left-to-build']) ? p['left-to-build'].filter((q) => q?.how === 'ask').length : 0);
    const stops = [];
    if (!closed) {
      if (!build) stops.push({ kind: 'route', route: routeOf(src, p) });
      if (design === 'needed') stops.push({ kind: 'design', why: designWhy, route: p['design-form'] === 'design-direction' ? `/wf design direction from ${src}` : `/wf design ${slug}` });
      if (carried) stops.push({ kind: 'carried', count: carried });
      if (build && p['try-out'] === 'yes' && !tryOutRecorded(root, slug)) stops.push({ kind: 'try-out' });
    }
    const sliced = Array.isArray(index?.slices) ? index.slices.length : null;
    const estimated = Number.isInteger(p['estimated-slices']) ? p['estimated-slices'] : null;
    const left = !build || closed ? 0 : (sliced !== null && hasDoc(dir, ROSTER_DOC) ? openSlices(root, slug).length : estimated);
    return {
      key: p.key, slug, title: p.title ?? null, order: p.order, form: p.form, state: p.state,
      ...(p.skipped ? { skipped: p.skipped } : {}), design, ...(designWhy ? { designWhy } : {}),
      stops, estimatedSlices: estimated, ...(sliced !== null ? { slices: sliced } : {}), slicesLeft: left ?? null,
      ...(build && !closed ? { cost: costOf(cost, left) } : {}),
    };
  });
  const open = rows.filter((r) => !['done', 'dropped'].includes(r.state));
  const stopsOf = (kind) => {
    const hit = open.filter((r) => r.stops.some((s) => s.kind === kind));
    return { count: hit.reduce((n, r) => n + r.stops.filter((s) => s.kind === kind).reduce((m, s) => m + (s.count ?? 1), 0), 0), packets: hit.map((r) => r.key).join(', ') };
  };
  const priced = open.filter((r) => r.cost);
  const totalCost = priced.length
    ? { ...Object.fromEntries(COST_COLUMNS.map((c) => [c, { low: priced.reduce((n, r) => n + r.cost[c].low, 0), high: priced.reduce((n, r) => n + r.cost[c].high, 0) }])), unit: 'tokens', packets: priced.length }
    : null;
  const totals = {
    packets: open.length, build: open.filter((r) => BUILD_FORMS.includes(r.form)).length,
    slicesLeft: open.reduce((n, r) => n + (r.slicesLeft ?? 0), 0),
    unestimated: open.filter((r) => BUILD_FORMS.includes(r.form) && r.slicesLeft === null).map((r) => r.key).join(', '),
    stops: Object.fromEntries(['route', 'design', 'carried', 'try-out'].map((k) => [k, stopsOf(k)])),
    cost: totalCost,
  };
  const basis = { ...cost, ...(cost.excluded ? { excluded: cost.excluded.length, excludedWhy: [...new Set(cost.excluded.map((e) => e.reason.replace(/^[\d,]+ /, '')))] } : {}) };
  delete basis.from;
  if (f.full) return { ok: true, source: src, shape: shapeOf(root), full: true, packets: rows, totals: { ...totals, costLine: costLine(totalCost) }, cost };
  // The next packets that will run: open, not skipped, in list order.
  const next = open.filter((r) => !r.skipped).slice(0, PLAN_NEXT).map((r) => ({
    ...r, title: r.title && r.title.length > PLAN_TITLE ? `${r.title.slice(0, PLAN_TITLE - 1)}…` : r.title,
    ...(r.cost !== undefined ? { cost: costLine(r.cost) } : {}),
  }));
  const shown = new Set(next.map((r) => r.key));
  const line = (r) => [r.key, r.form, r.state + (r.skipped ? ' (skipped)' : ''), `design ${r.design}`, r.slicesLeft === null ? 'slices ?' : `${r.slicesLeft} slices`].join(' · ');
  // The packets behind the walk are counts only; --full names them.
  const closed = Object.fromEntries(['done', 'dropped'].map((s) => [s, rows.filter((r) => r.state === s).length]));
  const capped = (list) => {
    const keys = list ? list.split(', ') : [];
    return keys.length > PLAN_KEYS ? `${keys.slice(0, PLAN_KEYS).join(', ')} and ${keys.length - PLAN_KEYS} more` : list;
  };
  return {
    ok: true, source: src, shape: shapeOf(root),
    totals: {
      ...totals, unestimated: capped(totals.unestimated),
      stops: Object.fromEntries(Object.entries(totals.stops).map(([k, v]) => [k, { count: v.count, packets: capped(v.packets) }])),
      costLine: costLine(totalCost),
    },
    cost: { ...basis, perSlice: basis.perSlice ? costLine(basis.perSlice, 'per slice') : null },
    closed,
    next,
    rest: open.filter((r) => !shown.has(r.key)).map(line),
    full: `node "${CAMPAIGN_CLI}" plan ${shellQuote(root)} ${src} --full`,
  };
}

/** The compact plan: the length of a title in full rows, and the keys named per kind of stop. */
export const PLAN_TITLE = 120;
export const PLAN_KEYS = 8;
/** The ceiling of the compact plan, as printed (2-space JSON), for a list of 60 packets. */
export const PLAN_CEILING = 12_000;

const short = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}G` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n)));
const span = (r) => (r.low === r.high ? short(r.low) : `${short(r.low)}–${short(r.high)}`);
/** One line of a cost: output and fresh input first, the cache columns apart. */
function costLine(c, label = '') {
  if (!c) return null;
  return `${label ? `${label}: ` : ''}output ${span(c.output)}, fresh input ${span(c.input)} tokens; cache write ${span(c.cacheWrite)}, cache read ${span(c.cacheRead)}`;
}

function sliceOrder(root, slug, [action], f) {
  const addLine = [`node "${CAMPAIGN_CLI}"`, 'slice-order', shellQuote(root), slug, 'add', '--slice', '<slice>', '--after', '<another slice>'].join(' ');
  if (action !== 'add') throw refuse('slice-order: the action is add', agentFix('Run slice-order with the action add.', addLine));
  const s = String(f.slice ?? '').trim();
  const t = String(f.after ?? '').trim();
  if (!s || !t || s === t) throw refuse('slice-order add: give --slice <slice> --after <another slice>', agentFix('Run slice-order add again with two different slices of the roster: --slice is the one that runs after --after.', addLine));
  const dir = workflowDir(root, slug);
  if (!hasDoc(dir, ROSTER_DOC)) return { ok: false, error: `slice-order: ${relative(root, join(dir, ROSTER_DOC))} does not exist`, fix: agentFix(`Run the slice stage of ${slug} first: it writes the roster. Then run slice-order again.`) };
  const roster = rosterOf(dir);
  const entry = roster.find((e) => e.slug === s);
  if (!entry || !roster.some((e) => e.slug === t)) return { ok: false, error: `slice-order: ${!entry ? s : t} is not a slice of the roster of ${slug}`, fix: agentFix(`Name slices of the roster of ${slug} (${roster.map((e) => e.slug).join(', ') || 'none yet'}), and run slice-order again.`) };
  if (entry.dependsOn.includes(t)) return { ok: true, slug, slice: s, after: t, added: false, walkOrder: rosterWalkOrder(roster).map((e) => e.slug) };
  if (closesCycle(roster, s, t)) return { ok: false, cycle: true, error: `slice-order: ${s} after ${t} closes a cycle, because ${t} already depends on ${s}`, fix: personFix(`The roster runs ${t} after ${s}, and this order asks for ${s} after ${t}: the person says which of the two runs first.`) };
  const deps = [...entry.dependsOn, t];
  const edited = setRosterEntry(dir, s, { 'depends-on': deps });
  const sliceName = `03-slice-${s}.md`;
  const sliceDoc = readDoc(dir, sliceName);
  if (sliceDoc?.frontmatter) {
    const have = sliceDoc.frontmatter['depends-on'];
    const l = Array.isArray(have) ? have.map(String) : [];
    if (!l.includes(t)) setRecordFields(dir, sliceName, { 'depends-on': [...l, t] });
  }
  const why = String(f.why ?? '').trim();
  appendFileSync(join(dir, 'index-history.jsonl'), `${JSON.stringify({ at: nowIso(), kind: 'note', text: `slice-order: '${s}' after '${t}'${why ? `: ${why}` : ''}`, stage: 'plan' })}\n`);
  const order = rosterWalkOrder(edited ?? rosterOf(dir)).map((e) => e.slug);
  const plan = readDoc(dir, '04-plan.md');
  if (plan?.frontmatter && JSON.stringify(plan.frontmatter['implementation-order']) !== JSON.stringify(order)) {
    setRecordFields(dir, '04-plan.md', { 'implementation-order': order });
  }
  return { ok: true, slug, slice: s, after: t, added: true, dependsOn: deps, walkOrder: order };
}

// ---------------------------------------------------------------- the guarded remove (12.7)

function worktreeList(root) {
  const r = git(root, ['worktree', 'list', '--porcelain']);
  const out = [];
  let cur = null;
  for (const line of r.stdout.split(/\r?\n/)) {
    if (line.startsWith('worktree ')) { cur = { path: line.slice(9) }; out.push(cur); } else if (!cur) continue;
    else if (line.startsWith('HEAD ')) cur.head = line.slice(5);
    else if (line.startsWith('branch ')) cur.branch = line.slice(7).replace(/^refs\/heads\//, '');
    else if (line === 'detached') cur.detached = true;
  }
  return out;
}

const samePath = (a, b) => posix(resolve(a)).toLowerCase() === posix(resolve(b)).toLowerCase();

/** An old campaign worktree of `src`: its branch is under campaign/<src>/, or it is a detached trial under .scratch/campaign/. */
export function isOldCampaignWorktree(entry, src) {
  if (entry.branch) return entry.branch.startsWith(`campaign/${src}/`);
  const p = posix(entry.path);
  return Boolean(entry.detached) && /\/\.scratch\/campaign\//.test(p) && p.includes(src);
}

/**
 * Every link under a folder, as a path; the walk does not go into a link or into `.git`.
 * `complete` is false when the walk stopped at the limit, so a link may be left.
 */
export function linksIn(dir, limit = 5000) {
  const found = [];
  const stack = [dir];
  while (stack.length) {
    if (found.length >= limit) return { links: found, complete: false };
    const d = stack.pop();
    let entries = [];
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.name === '.git') continue;
      const p = join(d, e.name);
      let st;
      try { st = lstatSync(p); } catch { continue; }
      if (st.isSymbolicLink()) found.push(p);
      else if (st.isDirectory()) stack.push(p);
    }
  }
  return { links: found, complete: true };
}

// Ignored paths that a worktree remove may delete: build output, and local tool files that
// the tools make again. `.env` is not here, because it can hold the only copy of a secret.
const REMOVABLE_IGNORED = ['build', 'dist', 'out', 'target', '.gradle', '.next', '.kotlin', '.cxx', '.idea', '.vscode', 'local.properties'];

/** Remove a link as a link: never follow it into the folder it points to. */
function removeLink(p) {
  try { unlinkSync(p); return; } catch { /* a junction on Windows: rmdir removes the link only */ }
  rmdirSync(p);
}

function manifestOf(root, src, unitKey) {
  for (const dir of [oldCampDir(root, src), archivedCampDir(root, src)]) {
    const file = join(dir, 'records', `${unitKey}.json`);
    if (existsSync(file)) return { file, manifest: loadManifest(file, unitKey) };
  }
  return null;
}

/**
 * The unit key of an old campaign worktree: the unit of the old ledger (or the archived one)
 * that ran in it. Several units can share a worktree; the one with a records manifest wins.
 */
function unitKeyOf(root, src, path) {
  const keys = [];
  for (const dir of [oldCampDir(root, src), archivedCampDir(root, src)]) {
    const ledger = readJson(join(dir, 'ledger.json'));
    for (const [key, u] of Object.entries(ledger?.units ?? {})) {
      if (u?.worktree?.path && samePath(u.worktree.path, path) && !keys.includes(key)) keys.push(key);
    }
  }
  return keys.find((k) => manifestOf(root, src, k)) ?? keys[0] ?? null;
}

export function removeWorktree(root, src, path, { unitKey = null, allowIgnored = false, linkLimit = 5000 } = {}) {
  const entry = worktreeList(root).find((w) => samePath(w.path, path));
  if (!entry) return { ok: false, path, error: `${path} is not a worktree of ${root}`, fix: agentFix(`Pass the path of a worktree of ${root}, as git worktree list prints it, and run remove-worktree again.`) };
  if (!isOldCampaignWorktree(entry, src)) return { ok: false, path, untouched: true, error: `${path} is not an old campaign worktree of ${src}; the migration does not touch it`, fix: agentFix(`Leave ${path} as it is: the migration removes only the old campaign worktrees of ${src}.`) };
  if (!existsSync(path)) {
    git(root, ['worktree', 'prune']);
    return { ok: true, path, removed: true, pruned: true };
  }
  const keep = (what) => personFix(`The worktree ${path} stays: ${what} The person checks it and removes the worktree by hand, or keeps it.`);
  const dirty = dirtyOutsideAi(path);
  if (dirty === null) return { ok: false, path, error: `git status failed in ${path}`, fix: keep('git cannot read its status.') };
  if (dirty.length) return { ok: false, path, error: `${dirty.length} uncommitted change(s) outside .ai/; the worktree stays. Ask the person.`, dirty: dirty.slice(0, 20), fix: keep(`it has ${dirty.length} uncommitted change(s) outside .ai/ (dirty lists them).`) };
  if (entry.detached && entry.head && !git(root, ['branch', '--all', '--contains', entry.head]).stdout) {
    return { ok: false, path, error: `the detached HEAD ${entry.head.slice(0, 12)} is on no branch; its commits would be lost. Ask the person.`, fix: keep(`its detached HEAD ${entry.head.slice(0, 12)} is on no branch, and a remove would lose its commits.`) };
  }
  if (existsSync(join(path, '.ai'))) {
    const m = unitKey ? manifestOf(root, src, unitKey) : null;
    const pending = recordsPending({ main: root, worktree: path, manifest: m?.manifest ?? { files: {} }, exclude: (rel) => rel === '.gitignore' });
    if (pending.length) return { ok: false, path, error: `${pending.length} record file(s) in the worktree exist nowhere else; the records sync did not bring them home. Ask the person.`, pending: pending.slice(0, 20), fix: keep(`${pending.length} record file(s) in it exist nowhere else (pending lists them).`) };
  }
  if (!allowIgnored) {
    const st = git(path, ['status', '--porcelain', '--ignored=matching'], { raw: true });
    const risk = ignoredAtRisk(st.stdout, REMOVABLE_IGNORED);
    if (risk.length) {
      return {
        ok: false, path, ignoredAtRisk: true, ignored: risk.slice(0, 20),
        error: 'git worktree remove deletes these ignored files without asking, and they are not build output. Show them to the person. On a yes, run remove-worktree again with --allow-ignored.',
        fix: personFix(`Show the person the ignored files of ${path} (ignored lists them): a remove deletes them. On the person's yes, remove-worktree runs again with --allow-ignored.`),
      };
    }
  }
  // CAUTION (12.7): remove each link as a link first, so no delete follows it into its target.
  const { links, complete } = linksIn(path, linkLimit);
  if (!complete) return { ok: false, path, error: `the worktree has more than ${linkLimit} links; a link after the limit could take the remove into its target. Ask the person.`, fix: keep(`it has more than ${linkLimit} links, and a delete could follow one into its target.`) };
  // A tracked link stays: deleting it makes the worktree dirty, and git then refuses the remove.
  // git removes a tracked link as a link.
  const own = untrackedLinks(path, links);
  for (const l of own) removeLink(l);
  const r = git(root, ['worktree', 'remove', path]);
  if (r.status !== 0) return { ok: false, path, linksRemoved: own.length, removedLinks: own.map((l) => posix(relative(path, l))), error: `git refused to remove ${path}: ${r.stderr}. These links were removed first: ${own.map((l) => posix(relative(path, l))).join(', ') || 'none'}. Ask the person; do not force.`, fix: keep('git refused to remove it (do not force the remove).') };
  return { ok: true, path, removed: true, linksRemoved: own.length };
}

/** The links (absolute paths) that git does not track in the worktree `wt`. Exported for the tests. */
export function untrackedLinks(wt, links) {
  const tracked = new Set(git(wt, ['ls-files', '-s', '-z']).stdout.split('\0').filter((l) => l.startsWith('120000 ')).map((l) => posix(l.slice(l.indexOf('\t') + 1))));
  return links.filter((l) => !tracked.has(posix(relative(wt, l))));
}

function removeWorktreeCmd(root, src, [path], f) {
  if (!path) throw refuse('remove-worktree: give the worktree path', agentFix('Run remove-worktree again with the path of the old campaign worktree.', campaignLine(root, 'remove-worktree', src, '"<worktree path>"')));
  const at = resolve(path);
  const unitKey = f.unit ? String(f.unit) : unitKeyOf(root, src, at);
  return removeWorktree(root, src, at, { unitKey, allowIgnored: Boolean(f['allow-ignored']) });
}

// ---------------------------------------------------------------- the migration (section 12)

// The old wave states in which units were driven and not yet shipped.
const STARTED_WAVE = new Set(['running', 'boundary', 'handoff', 'shipping', 'stopped']);
const STRAY_RE = /[{}<>]/;

/**
 * The age of the newest event of the old campaign: the ledger and its journals, and the
 * yolo journal of each unit in a started wave, in the main checkout and in the unit's
 * worktree. A long agent writes only its unit's journal, not the ledger.
 */
function journalAgeMs(root, src, ledger = null) {
  let newest = 0;
  const seen = (file) => { try { newest = Math.max(newest, statSync(file).mtimeMs); } catch { /* absent */ } };
  const dir = oldCampDir(root, src);
  for (const name of ['.campaign-journal.jsonl', 'ledger.json']) seen(join(dir, name));
  try {
    for (const name of readdirSync(dir)) if (name.endsWith('.jsonl')) seen(join(dir, name));
  } catch { /* absent */ }
  const started = new Set((ledger?.waves ?? []).filter((w) => STARTED_WAVE.has(w.state)).map((w) => w.n));
  for (const u of Object.values(ledger?.units ?? {})) {
    if (!started.has(u.wave)) continue;
    const slug = u.slug ?? u['work-slug'];
    if (!slug) continue;
    for (const base of [root, u.worktree?.path].filter(Boolean)) seen(join(workflowDir(base, slug), '.driver-journal.jsonl'));
  }
  return newest ? Date.now() - newest : Infinity;
}

function prMerged(root, branch) {
  const r = spawnSync('gh', ['pr', 'list', '--head', branch, '--state', 'merged', '--json', 'number', '--jq', '.[0].number'], { cwd: root, encoding: 'utf8', windowsHide: true });
  const n = Number((r.stdout ?? '').trim());
  return r.status === 0 && Number.isInteger(n) && n > 0 ? n : null;
}

/** How the earlier waves of a running wave reached the trunk: merged, squashed, or blocked (12.2 step 3). */
function landingOf(root, ledger, wave, trunk, isMerged = prMerged) {
  const base = wave.branch;
  if (!base || !commitOf(root, `refs/heads/${base}`)) return { land: 'blocked', reason: `the wave base ${base ?? '(none)'} does not exist` };
  // The wave base holds the earlier waves. It is in the trunk, or every earlier wave PR is merged.
  if (isAncestor(root, base, trunk)) return { land: 'merged', waveBase: base };
  const earlier = (ledger.waves ?? []).filter((w) => w.n < wave.n && w.branch);
  const open = earlier.filter((w) => !isMerged(root, w.branch));
  if (open.length) return { land: 'blocked', waveBase: base, reason: `wave PR(s) not merged: ${open.map((w) => `${w.n} (${w.branch})`).join(', ')}`, openWaves: open.map((w) => w.n) };
  return { land: 'squashed', waveBase: base };
}

/** The migration report of an old ledger (12.2 step 2), as data. */
export function migrationReport(root, src, f = {}, { isMerged = prMerged } = {}) {
  const ledger = readJson(join(oldCampDir(root, src), 'ledger.json'));
  if (!ledger?.units) return { ok: false, error: `no old campaign ledger in ${posix(relative(root, oldCampDir(root, src)))}`, fix: nextFix(root, src, `${src} has no old campaign to migrate: run next for the step of its list.`) };
  const trunk = ledger.trunk ?? trunkOf(root, f);
  const ageMs = journalAgeMs(root, src, ledger);
  const running = (ledger.waves ?? []).filter((w) => w.state === 'running');
  const live = running.length > 0 && ageMs < 30 * 60_000;
  const waveOf = (n) => (ledger.waves ?? []).find((w) => w.n === n);
  const units = Object.entries(ledger.units).map(([key, u]) => ({ key, ...u }));
  // A unit is shipped when it is, or when its wave shipped. A unit merged into a wave that did not ship is still in flight.
  const isShipped = (u) => u.state === 'shipped' || waveOf(u.wave)?.state === 'shipped';
  const shipped = units.filter(isShipped);
  const dropped = units.filter((u) => u.state === 'dropped');
  const inflight = units.filter((u) => !isShipped(u) && u.state !== 'dropped' && STARTED_WAVE.has(waveOf(u.wave)?.state));
  const notStarted = units.filter((u) => !shipped.includes(u) && !dropped.includes(u) && !inflight.includes(u));
  // Several units can drive one workflow slug (an absorbed extension): one packet per slug.
  const groups = new Map();
  for (const u of inflight) {
    const slug = u.slug ?? u['work-slug'] ?? u.key;
    if (!groups.has(slug)) groups.set(slug, []);
    groups.get(slug).push(u);
  }
  const packets = [...groups.entries()].map(([slug, us]) => {
    const lead = us.find((u) => u.key === slug || (u['work-slug'] ?? u.key) === slug) ?? us.find((u) => u.worktree) ?? us[0];
    const wt = us.map((u) => u.worktree).find(Boolean) ?? null;
    const branch = wt?.branch ?? `campaign/${src}/wave-${lead.wave}--${slug}`;
    const wave = waveOf(lead.wave);
    const landing = landingOf(root, ledger, wave, trunk, isMerged);
    const dirty = wt && existsSync(wt.path) ? dirtyOutsideAi(wt.path) ?? [] : [];
    const ahead = commitOf(root, `refs/heads/${branch}`) ? Number(git(root, ['rev-list', '--count', `${trunk}..${branch}`]).stdout || 0) : null;
    return {
      slug, lead: lead.key, units: us.map((u) => ({ key: u.key, state: u.state })), wave: lead.wave, branch,
      worktree: wt?.path ?? null, uncommitted: dirty.length, ahead, ...landing,
    };
  });
  const inflightPaths = new Set(packets.map((p) => p.worktree).filter(Boolean).map((p) => posix(resolve(p)).toLowerCase()));
  const worktrees = worktreeList(root).map((w) => {
    if (!isOldCampaignWorktree(w, src)) return { path: w.path, branch: w.branch ?? null, old: false };
    return { path: w.path, branch: w.branch ?? null, detached: Boolean(w.detached), old: true, inflight: inflightPaths.has(posix(resolve(w.path)).toLowerCase()) };
  });
  const strays = [];
  const wfRoot = workflowsRoot(root);
  try { for (const name of readdirSync(wfRoot)) if (STRAY_RE.test(name)) strays.push(name); } catch { /* none */ }
  const homes = [
    ...packets.map((p) => ({ key: p.lead, slug: p.slug, dir: p.worktree && existsSync(p.worktree) ? wfDir(p.worktree, p.slug) : wfDir(root, p.slug) })),
    ...notStarted.filter((u) => u.slug).map((u) => ({ key: u.key, slug: u.slug, dir: wfDir(root, u.slug) })),
  ];
  return {
    ok: true, source: src, trunk, records: ledger.records ?? null, linked: linkedProject(root), live, ledgerAgeMinutes: Number.isFinite(ageMs) ? Math.round(ageMs / 60_000) : null,
    prStack: ledger.stack?.enabled ? ledger.stack : null,
    waits: unitWaits(homes, units),
    shipped: shipped.map((u) => ({ key: u.key, slug: u.slug, wave: u.wave })),
    dropped: dropped.map((u) => u.key),
    inflight: packets,
    notStarted: notStarted.map((u) => ({ key: u.key, slug: u.slug, state: u.state, prepared: hasDoc(wfDir(root, u.slug ?? u.key), '01-intake.md'), designSettled: u.slug ? !designBlock(root, u.slug) && hasDoc(wfDir(root, u.slug), '02c-craft.md') : false })),
    worktrees,
    strays,
    blocked: packets.filter((p) => p.land === 'blocked'),
  };
}

/**
 * The live steers of each unit's workflow that name another unit, by its key or its slug.
 * The old waves ran units side by side, so a steer could make one unit wait for another.
 * The walk runs one packet at a time, and such a wait never clears by itself.
 */
function unitWaits(homes, units) {
  const names = units.flatMap((u) => [...new Set([u.key, u.slug].filter(Boolean))].map((name) => ({ unit: u.key, name })));
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const waits = [];
  for (const h of homes) {
    let list = [];
    try { list = decisionsOf(h.dir); } catch { continue; }
    for (const e of list) {
      if (e.kind !== 'steer' || e['superseded-by']) continue;
      const text = `${e.question ?? ''} ${e.answer ?? ''}`.trim();
      const named = [...new Set(names.filter((n) => n.unit !== h.key && new RegExp(`(^|[^a-z0-9-])${esc(n.name)}([^a-z0-9-]|$)`, 'i').test(text)).map((n) => n.unit))];
      if (named.length) waits.push({ unit: h.key, slug: h.slug, id: e.id, names: named, text: text.length > 400 ? `${text.slice(0, 400)}…` : text });
    }
  }
  return waits;
}

function renderMigration(rep) {
  const L = ['# Migration of the old campaign', '', `Written by \`campaign.mjs migrate report\` at ${nowIso()}. It changes no branch and deletes nothing (WF-PIECES-PLAN 12.2).`, ''];
  const records = rep.linked
    ? `linked as \`${rep.linked}\` in the records repo (the migration brings the worktree records into its clone, and each campaign command commits what it writes there and starts the push)`
    : rep.records === 'local' ? 'local (.ai/ is not tracked; the records sync brings them home)' : 'tracked';
  L.push(`- Trunk: \`${rep.trunk}\`. Records: ${records}.`);
  L.push(`- Old wave run live: ${rep.live ? `YES (last ledger event ${rep.ledgerAgeMinutes} minutes ago): stop it first` : 'no'}.`, '');
  L.push('## Shipped units (done packets)', '', ...(rep.shipped.length ? rep.shipped.map((u) => `- \`${u.key}\` (wave ${u.wave})`) : ['- None.']), '');
  L.push('## In-flight units (the first packets)', '');
  if (rep.inflight.length) {
    L.push('| Packet slug | Units | Branch | Worktree | Uncommitted | Ahead of trunk | Earlier waves |', '|---|---|---|---|---|---|---|');
    for (const p of rep.inflight) L.push(`| \`${p.slug}\` | ${p.units.map((u) => `${u.key} (${u.state})`).join(', ')} | \`${p.branch}\` | ${p.worktree ? `\`${posix(p.worktree)}\`` : '—'} | ${p.uncommitted} | ${p.ahead ?? '—'} | ${p.land}${p.reason ? `: ${p.reason}` : ''} |`);
  } else L.push('- None.');
  L.push('', '## Units not started (the regroup)', '', ...(rep.notStarted.length ? rep.notStarted.map((u) => `- \`${u.key}\` (${u.state}${u.prepared ? ', has intake and shape' : ''}${u.designSettled ? ', design settled' : ''})`) : ['- None.']), '');
  L.push('## Worktrees', '');
  for (const w of rep.worktrees) L.push(`- \`${posix(w.path)}\` ${w.branch ? `on \`${w.branch}\`` : '(detached)'}: ${!w.old ? 'not an old campaign worktree; untouched' : w.inflight ? 'an in-flight unit; removed at its packet done' : 'removed at migrate finish, with the guarded remove'}`);
  L.push('', '## Stray folders', '', ...(rep.strays.length ? rep.strays.map((s) => `- \`${workflowRel(s)}/\` moves to \`work/archive/stray/\``) : ['- None.']), '');
  L.push('## Steers that name another unit', '', 'The walk runs one packet at a time, so a wait for another unit never clears by itself. Settle each one in the regroup: put the packets in an order that meets it, move the waiting slices, or drop the wait.', '');
  L.push(...(rep.waits.length ? rep.waits.map((w) => `- \`${w.unit}\` ${w.id} names ${w.names.map((n) => `\`${n}\``).join(', ')}: ${w.text.replace(/\s+/g, ' ')}`) : ['- None.']), '');
  if (rep.prStack) L.push('## Stacked PRs', '', `The old campaign stacked its wave PRs (\`stack.enabled\`). The walk reads the PR shape from \`.ai/ship-plan.md\`: set \`pr-shape: stacked\` there to keep one PR for each work packet.`, '');
  return L.join('\n');
}

function boardOf(root, src) {
  const dir = sourceDir(root, src);
  const boardFile = boardFileOf(dir);
  return { path: join(dir, boardFile), board: readJson(join(dir, boardFile)), boardFile };
}

/** 12.2 steps 4 and 5: bring the records home, then turn the units into packets on the board. */
export function migrateApply(root, src, f = {}, deps = {}) {
  const rep = migrationReport(root, src, f, deps);
  if (!rep.ok) return rep;
  if (rep.live) return { ok: false, error: `an old wave run is live (last ledger event ${rep.ledgerAgeMinutes} minutes ago). Stop it first.`, fix: personFix(`An old wave run of ${src} is live: the person stops it, or waits for it to end, then runs migrate apply again.`) };
  if (rep.blocked.length) return { ok: false, error: 'the trunk does not hold the earlier waves of an in-flight unit. Merge the open wave PRs first.', blocked: rep.blocked, fix: personFix('The person merges the open wave PRs that blocked lists into the trunk, then runs migrate apply again.') };
  const { path: boardPath, board } = boardOf(root, src);
  if (!board) return { ok: false, error: `no board in ${workflowRel(src)}`, fix: personFix(`The brainstorm ${src} has no board file, and the migration needs it: the person restores the board of ${workflowRel(src)} from git, then the migration runs again.`) };

  // Step 4: the records of each in-flight worktree come home (local records only).
  const records = [];
  if (rep.records === 'local') {
    const recDir = join(oldCampDir(root, src), 'records');
    for (const p of rep.inflight) {
      if (!p.worktree || !existsSync(p.worktree)) continue;
      for (const u of p.units) {
        const file = join(recDir, `${u.key}.json`);
        if (!existsSync(file) && u.key !== p.lead) continue;
        const res = withRecordsLock(join(recDir, '.lock'), u.key, () => {
          const manifest = loadManifest(file, u.key);
          const conflictsDir = join(recDir, 'conflicts', u.key, nowIso().replace(/[-:]/g, ''));
          const out = recordsOut({ main: root, worktree: p.worktree, manifest, conflictsDir, exclude: (rel) => rel === '.gitignore', mainOnly: (rel) => rel.startsWith(`workflows/${src}/work/campaign/`) || rel.startsWith('design/') });
          saveManifest(file, manifest, nowIso());
          return out;
        });
        records.push({ slug: p.slug, unit: u.key, copied: res.copied.length, conflicts: res.conflicts });
        break;
      }
    }
  }

  // Step 5: the packets on the board. Done packets first, in-flight packets next, the rest after.
  const work = board.work ?? [];
  const byKeyMap = new Map(work.map((w) => [w.key, w]));
  const shippedKeys = new Set(rep.shipped.map((u) => u.key));
  const order = [];
  for (const w of work) if (shippedKeys.has(w.key)) { w.state = 'done'; order.push(w); }
  const absorbed = [];
  for (const p of rep.inflight) {
    const lead = byKeyMap.get(p.lead) ?? work.find((w) => (w.slug ?? w.key) === p.slug);
    if (!lead) continue;
    for (const u of p.units) {
      if (u.key === lead.key) continue;
      const other = byKeyMap.get(u.key);
      if (!other) continue;
      lead.items = [...new Set([...(lead.items ?? []), ...(other.items ?? [])])];
      other.items = [];
      other.state = 'dropped';
      other.was = `merged into ${lead.key} by the migration (one packet per workflow slug)`;
      absorbed.push(u.key);
    }
    lead.state = 'open';
    lead.slug = p.slug;
    if (!BUILD_FORMS.includes(lead.shape)) lead.shape = 'intake';
    lead.migrated = { 'unit-key': p.lead, 'from-branch': p.branch, worktree: p.worktree ? posix(p.worktree) : null, 'wave-base': p.waveBase ?? null, land: p.land };
    if (!lead['why-here']) lead['why-here'] = `in flight in wave ${p.wave} of the old campaign`;
    order.push(lead);
  }
  for (const w of [...work].sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9))) if (!order.includes(w)) order.push(w);
  order.forEach((w, i) => {
    w.order = i + 1;
    if (w.order > 1 && !String(w['why-here'] ?? '').trim()) w['why-here'] = shippedKeys.has(w.key) ? 'shipped in the old campaign' : 'the order of the old campaign';
  });
  for (const w of work) if (w.state === 'done' && !w['why-here'] && w.order > 1) w['why-here'] = 'shipped in the old campaign';
  // The ledger's `stack` is the old stacked-wave-PR setting, not the tech stack of the board:
  // it never enters the board. The report names it (`prStack`), for `pr-shape` in the ship plan.
  board.work = order;
  const shape = validateBrainstormBoard(board);
  if (!shape.valid) return { ok: false, error: 'the migrated board does not pass the board schema', errors: shape.errors.slice(0, 10), records, fix: boardSchemaFix(root, src, 'apply') };
  const backup = backupBoard(root, src, boardPath, 'apply');
  writeFileSync(boardPath, `${JSON.stringify(board, null, 2)}\n`);

  // Step 5: the index of each in-flight packet, in the main checkout.
  const indexes = [];
  for (const p of rep.inflight) {
    if (!hasDoc(wfDir(root, p.slug), INDEX_NAME)) { indexes.push({ slug: p.slug, error: 'no 00-index.md in the main checkout after the records sync' }); continue; }
    const lead = order.find((w) => w.slug === p.slug);
    setRecordFields(wfDir(root, p.slug), INDEX_NAME, {
      'origin-packet': `${workflowRel(src)}/work/${p.slug}.md`, branch: listBranch(src), 'base-branch': rep.trunk, 'branch-strategy': 'dedicated',
      'workflow-type': 'feature', 'review-scope': 'slug-wide', 'review-scope-confirmed': true,
      'migrated-from': p.branch, ...(p.waveBase ? { 'wave-base': p.waveBase } : {}), land: p.land, 'updated-at': nowIso(),
      ...(lead ? { 'origin-items': [...new Set(lead.items ?? [])] } : {}),
    });
    appendHistory(wfDir(root, p.slug), `campaign: migrated from the old unit branch ${p.branch} into the list ${src}`);
    indexes.push({ slug: p.slug, ok: true });
  }
  return { ok: true, source: src, records, absorbed, indexes, backup, order: order.map((w) => ({ key: w.key, order: w.order, state: w.state })), next: 'regroup the units that are not started with the person (12.4 or 12.6): migrate regroup first, then campaign.mjs write, then migrate finish' };
}

/** A copy of the board before the migration writes it, in the old ledger folder: migrate finish archives it with the ledger. */
function backupBoard(root, src, boardPath, phase) {
  const file = join(oldCampDir(root, src), `board.before-${phase}-${nowIso().replace(/[-:]/g, '')}.json`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, readFileSync(boardPath));
  return posix(relative(root, file));
}

/**
 * 12.4 step 1: give each kept decision that two or more packets hold one home, by one rule,
 * the earliest live owner. A done or open packet keeps the decision when it holds it: the
 * old campaign built it there. Otherwise the first not-started unit of the old ledger in list
 * order gets it. A packet that was no unit of the ledger (an old thread packet) keeps none.
 * A decision that only such packets hold is `unsettled`: the person gives it a home.
 */
export function migrateRegroup(root, src, f = {}) {
  const ledger = readJson(join(oldCampDir(root, src), 'ledger.json'));
  if (!ledger?.units) return { ok: false, error: `no old campaign ledger in ${posix(relative(root, oldCampDir(root, src)))}`, fix: nextFix(root, src, `${src} has no old campaign to migrate: run next for the step of its list.`) };
  const { path: boardPath, board } = boardOf(root, src);
  if (!board) return { ok: false, error: `no board in ${workflowRel(src)}`, fix: personFix(`The brainstorm ${src} has no board file, and the migration needs it: the person restores the board of ${workflowRel(src)} from git, then the migration runs again.`) };
  const units = new Set(Object.keys(ledger.units));
  const items = new Map((board.items ?? []).map((i) => [i.key, i]));
  const live = (board.work ?? []).filter((w) => w.state !== 'dropped');
  const started = (w) => w.state === 'done' || w.state === 'open';
  const byOrder = (a, b) => (a.order ?? 1e9) - (b.order ?? 1e9);
  const holders = new Map();
  for (const w of live) for (const k of new Set(w.items ?? [])) {
    if (!holders.has(k)) holders.set(k, []);
    holders.get(k).push(w);
  }
  const moves = [];
  const unsettled = [];
  for (const [k, owners] of holders) {
    const it = items.get(k);
    if (owners.length < 2 || it?.kind !== 'decision' || it.scope !== 'keep' || it['replaced-by']) continue;
    owners.sort(byOrder);
    const home = owners.find(started) ?? owners.find((w) => units.has(w.key)) ?? null;
    if (!home) { unsettled.push({ key: k, text: it.text, packets: owners.map((w) => w.key) }); continue; }
    moves.push({ key: k, home: home.key, from: owners.filter((w) => w !== home).map((w) => w.key) });
  }
  for (const m of moves) for (const key of m.from) {
    const w = live.find((x) => x.key === key);
    w.items = (w.items ?? []).filter((x) => x !== m.key);
  }
  const groups = {};
  for (const m of moves) for (const from of m.from) groups[`${m.home} <- ${from}`] = (groups[`${m.home} <- ${from}`] ?? 0) + 1;
  // The decisions each not-started build packet carries now: an empty packet is a merge or a drop for the person.
  const kept = (w) => (w.items ?? []).filter((k) => { const it = items.get(k); return it?.kind === 'decision' && it.scope === 'keep' && !it['replaced-by']; }).length;
  const packets = live.filter((w) => !started(w) && BUILD_FORMS.includes(w.shape ?? 'intake')).sort(byOrder).map((w) => ({ key: w.key, order: w.order, decisions: kept(w) }));
  const out = { ok: true, source: src, dryRun: Boolean(f['dry-run']), moved: moves.length, groups, unsettled, empty: packets.filter((p) => !p.decisions).map((p) => p.key), packets };
  if (f['dry-run'] || !moves.length) return out;
  const shape = validateBrainstormBoard(board);
  if (!shape.valid) return { ok: false, error: 'the regrouped board does not pass the board schema', errors: shape.errors.slice(0, 10), fix: boardSchemaFix(root, src, 'regroup') };
  out.backup = backupBoard(root, src, boardPath, 'regroup');
  writeFileSync(boardPath, `${JSON.stringify(board, null, 2)}\n`);
  return out;
}

/** 12.2 steps 8 to 10, after the list is written: archive the ledger, move the strays, remove the old worktrees. */
export function migrateFinish(root, src) {
  const idx = readFm(join(workDir(root, src), 'index.md'));
  if (idx?.type !== 'list') return { ok: false, error: 'write the list first (campaign.mjs write)', fix: agentFix('Write the list from the migrated board, then run migrate finish again.', sourceLine('write', sourceDir(root, src)), campaignLine(root, 'migrate', src, 'finish')) };
  const rep = existsSync(join(oldCampDir(root, src), 'ledger.json')) ? migrationReport(root, src) : null;
  const moved = [];
  if (existsSync(oldCampDir(root, src))) {
    const dest = archivedCampDir(root, src);
    mkdirSync(dirname(dest), { recursive: true });
    renameSync(oldCampDir(root, src), existsSync(dest) ? `${dest}-${nowIso().replace(/[-:]/g, '')}` : dest);
    moved.push('work/campaign → work/archive/campaign');
  }
  const strays = [];
  const wfRoot = workflowsRoot(root);
  try {
    for (const name of readdirSync(wfRoot)) {
      if (!STRAY_RE.test(name)) continue;
      const dest = join(workDir(root, src), 'archive', 'stray', name.replace(/[{}<>]/g, '_'));
      mkdirSync(dirname(dest), { recursive: true });
      const tracked = git(root, ['ls-files', '--', posix(relative(root, join(wfRoot, name)))]).stdout;
      if (tracked) git(root, ['mv', posix(relative(root, join(wfRoot, name))), posix(relative(root, dest))]);
      else renameSync(join(wfRoot, name), dest);
      strays.push({ from: workflowRel(name), to: posix(relative(root, dest)) });
    }
  } catch { /* none */ }
  // The worktree of an in-flight packet stays until its packet is done, unless the regroup dropped the packet.
  const dropped = new Set(readList(root, src).packets.filter((p) => p.state === 'dropped').map((p) => p['packet-slug']));
  const droppedPaths = new Set((rep?.inflight ?? []).filter((p) => p.worktree && dropped.has(p.slug)).map((p) => posix(resolve(p.worktree)).toLowerCase()));
  const removed = [];
  for (const w of rep?.worktrees ?? []) {
    if (!w.old || (w.inflight && !droppedPaths.has(posix(resolve(w.path)).toLowerCase()))) continue;
    removed.push(removeWorktree(root, src, w.path, { unitKey: unitKeyOf(root, src, w.path) }));
  }
  return { ok: true, source: src, moved, strays, worktrees: removed, refused: removed.filter((r) => !r.ok) };
}

function migrateCmd(root, src, [phase], f) {
  if (phase === 'report') {
    const rep = migrationReport(root, src, f);
    if (!rep.ok) return rep;
    writeFileSync(join(workDir(root, src), 'migration.md'), renderMigration(rep));
    return { ...rep, wrote: posix(relative(root, join(workDir(root, src), 'migration.md'))) };
  }
  if (phase === 'apply') return migrateApply(root, src, f);
  if (phase === 'regroup') return migrateRegroup(root, src, f);
  if (phase === 'finish') return migrateFinish(root, src);
  throw refuse('migrate: the phase is report, apply, regroup or finish', agentFix('Run migrate with its phase: report first; then apply, regroup and finish, in that order.', campaignLine(root, 'migrate', src, 'report')));
}

// ---------------------------------------------------------------- main

function flags(args) {
  const BOOLEAN = new Set(['dry-run', 'json', 'allow-ignored', 'no-push', 'end', 'full']);
  const pos = [];
  const f = {};
  for (let i = 0; i < args.length; i++) {
    const name = args[i].startsWith('--') ? args[i].slice(2) : null;
    if (name && BOOLEAN.has(name)) f[name] = true;
    else if (name) { f[name] = args[i + 1]; i++; } else pos.push(args[i]);
  }
  return { pos, f };
}

/** The commands that write no record: they make no commit in the clone. */
const READ_ONLY = new Set(['check', 'status', 'next', 'plan', 'remove-worktree']);

/**
 * A linked project keeps its records in the clone of the records repo. Commit what the command
 * wrote there; the commit starts the background push. A failed commit fails no command: the next
 * records commit or sync commits the files too.
 */
function commitWrites(cmd, pos) {
  const label = `campaign ${cmd}`;
  try {
    if (cmd === 'write' || cmd === 'archive') {
      const { dir, root } = boardAt(pos[0]);
      return commitRecords({ root, label }) ?? commitRecords({ project: recordsRel(dir)?.split('/')[0], label });
    }
    return commitRecords({ root: resolve(pos[0]), label });
  } catch { return null; }
}

function dispatch(cmd, argv) {
  const { pos, f } = flags(argv);
  const out = dispatchCmd(cmd, pos, f);
  if (out && pos[0] && !READ_ONLY.has(cmd) && !f['dry-run']) {
    const committed = commitWrites(cmd, pos);
    if (committed?.length) out.committed = committed;
  }
  return out;
}

function dispatchCmd(cmd, pos, f) {
  if (['check', 'write', 'archive'].includes(cmd)) {
    const [arg] = pos;
    if (!arg) return null;
    if (cmd === 'check') return checkCmd(arg);
    if (cmd === 'write') return writeCmd(arg, f);
    const { dir, boardFile } = boardAt(arg);
    if (!existsSync(join(dir, boardFile))) return { ok: false, error: `no ${boardFile} in ${dir}`, fix: noBoardFix() };
    return archiveCommand(dir, boardFile, { dryRun: Boolean(f['dry-run']) });
  }
  const [rootArg, second, ...rest] = pos;
  if (!rootArg || !second) return null;
  const root = resolve(rootArg);
  switch (cmd) {
    case 'status': return statusCmd(root, second, f);
    case 'next': return nextCmd(root, second, f);
    case 'plan': return planCmd(root, second, f);
    case 'skip': return skipCmd(root, second, rest, f);
    case 'unskip': return unskipCmd(root, second, rest, f);
    case 'ahead': return aheadCmd(root, second, rest);
    case 'digest': return digestCmd(root, second, rest, f);
    case 'open': return openCmd(root, second, rest, f);
    case 'land': return landCmd(root, second, rest, f);
    case 'start': return startCmd(root, second, rest, f);
    case 'built': return builtCmd(root, second, rest, f);
    case 'reopen': return reopenCmd(root, second, rest);
    case 'done': return doneCmd(root, second, rest, f);
    case 'close': return closeCmd(root, second, rest);
    case 'accept': return acceptCmd(root, second);
    // `slice-order <checkout> <slug> add`: the second argument is the slug.
    case 'slice-order': return sliceOrder(root, second, rest, f);
    case 'migrate': return migrateCmd(root, second, rest, f);
    case 'remove-worktree': return removeWorktreeCmd(root, second, rest, f);
    default: return null;
  }
}

/** One command in this process: its JSON result, or null for a usage error. */
export function run(argv) {
  const [cmd, ...rest] = argv;
  try {
    const out = cmd ? dispatch(cmd, rest) : null;
    return out === null ? null : withFix(out, 'campaign.mjs');
  } catch (e) {
    return failureOf(e, 'campaign.mjs');
  }
}

export function main(argv = process.argv.slice(2)) {
  const out = run(argv);
  if (out === null) { process.stderr.write(`${USAGE}\n${USAGE_FIX}\n`); return 2; }
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  return out.ok ? 0 : 1;
}

if (isMainModule(import.meta.url)) {
  process.exitCode = main();
}
