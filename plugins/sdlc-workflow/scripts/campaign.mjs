#!/usr/bin/env node
/**
 * scripts/campaign.mjs — the disk side of /wf campaign, the serial walk over the
 * packets of one list (WF-PIECES-PLAN section 6.4).
 * skills/wf/scripts/campaign.mjs runs this script.
 *
 *   check   <source-dir|board-file>                 the list check of section 4.2 (exit 1 on an error)
 *   write   <source-dir|board-file> [--dry-run]     write the packet files, then work/index.md last
 *   archive <source-dir|board-file> [--dry-run]     move the closed part of the board to archive/board.json
 *   status  <root> <source>                         the list, the current packet and its next step, the packets that need design
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
 *   remove-worktree <root> <source> <path> [--allow-ignored]  the guarded remove of an old campaign worktree (12.7)
 *
 * Every command prints one JSON object on stdout. The list has no ledger: its state is
 * the `state` field of each packet file (work/<packet-slug>.md).
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from '../lib/yaml.mjs';
import { DECISIONS_FILE, appendEntry, decisionsOf, storeText } from '../lib/decisions.mjs';

import { checkList, writeList, readWorkFiles, listBranch, endBranch, BUILD_FORMS, PACKET_STATES, DEFAULT_FILES, IDEATE_FILES } from '../lib/packets.mjs';
import { archiveBoard, docCheck, mergeArchive } from '../lib/brainstorm-archive.mjs';
import { ROSTER_DOC, closesCycle, rosterOf, rosterWalkOrder, setFrontmatterValue, setRosterEntry } from '../lib/roster-edit.mjs';
import { ignoredAtRisk, loadManifest, recordsOut, recordsPending, saveManifest, withRecordsLock } from '../lib/campaign-records.mjs';
import { safeParseFrontmatter } from '../lib/frontmatter.mjs';
import { needsPictures } from '../lib/design-boards.mjs';
import { missingDesignFiles } from '../lib/design-surface.mjs';
import { designNeeded, designSettled, namesScreens } from '../lib/design-lane.mjs';
import { validateBrainstormBoard } from '../lib/schema-validator.mjs';
import { linkedProject, realPathOf, recordsRel, workflowDir, workflowRel, workflowsRoot } from '../lib/records-root.mjs';
import { commitRecords } from '../lib/records-sync.mjs';
import { INDEX_NAME, META_FILE, hasDoc, readDoc, setFields as setRecordFields, writeDoc } from '../lib/records.mjs';
import { baseCheck, defaultRun, prShapeOf, readShipPlan } from '../lib/last-mile.mjs';

const USAGE = 'Usage: campaign.mjs <check|write|archive> <source-dir|board-file> | <status|open|land|start|built|reopen|done|close|migrate|remove-worktree> <projectRoot> <source> ... | slice-order <checkout> <slug> add ...';

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

function git(cwd, args) {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, stdout: (r.stdout ?? '').trim(), stderr: (r.stderr ?? '').trim() };
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
  const r = git(cwd, ['status', '--porcelain']);
  if (r.status !== 0) return null;
  return r.stdout.split(/\r?\n/).filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, '')).filter((p) => !posix(p).startsWith('.ai/'));
}

const gh = (root, args) => defaultRun('gh', args, { cwd: root });
/** The PR shape of the walk, from the ship plan: `single` (one PR for the list) or `stacked`. */
const shapeOf = (root) => prShapeOf(readShipPlan(root));

function configOf(root) {
  return readJson(join(root, '.ai', 'sdlc-config.json')) ?? {};
}

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
  if (!board) return { ok: false, error: `no ${boardFile} in ${dir}` };
  const res = checkList(board, { isIgnored: gitIgnoredCheck(root) });
  return { ok: !res.errors.length, ...res };
}

function writeCmd(arg, f) {
  const { dir, boardFile, root } = boardAt(arg);
  if (!existsSync(join(dir, boardFile))) return { ok: false, error: `no ${boardFile} in ${dir}` };
  return writeList(dir, { isIgnored: gitIgnoredCheck(root), dryRun: Boolean(f['dry-run']), boardFile });
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
  if (index?.type !== 'list') throw new Error(`${src} has no list: run campaign.mjs write first`);
  const packet = packets.find((p) => p.key === key || p['packet-slug'] === key);
  if (!packet) throw new Error(`${key} is not a packet of the list ${src}`);
  return { index, packets, packet };
}

function setPacketState(packet, state) {
  if (!PACKET_STATES.includes(state)) throw new Error(`unknown packet state ${state}`);
  setFields(packet.path, { state });
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
    if (missing?.length) return `the approved ${namesScreens(contract) ? 'screens' : 'boards'} are missing: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ` and ${missing.length - 3} more` : ''}`;
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
function openSlices(root, slug) {
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
    if (!hasDoc(wfDir(root, slug), ROSTER_DOC)) return { step: 'slice' };
    return { step: 'yolo' };
  }
  // built. A fix slice that is not built yet sends the packet back to the driver (6.1 step 13).
  const unbuilt = openSlices(root, slug);
  if (unbuilt.length) return { step: 'yolo', reason: `the slice(s) ${unbuilt.join(', ')} are not complete: run campaign.mjs reopen, then the driver` };
  const fid = decisionFidelity(root, slug, (packet['carried-decisions'] ?? []).map((d) => d.key));
  if (!fid.table) return { step: 'fidelity', reason: '07-review.md has no ## Decision Fidelity table: run the review again' };
  if (fid.missing.length) return { step: 'fidelity', reason: `the ## Decision Fidelity table has no row for ${fid.missing.join(', ')}: run the review again`, missing: fid.missing };
  if (fid.rows.length) return { step: 'fidelity', rows: fid.rows };
  if (packet['try-out'] === 'yes' && !tryOutRecorded(root, slug)) return { step: 'try-out' };
  return { step: 'done' };
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

function statusCmd(root, src) {
  const dir = sourceDir(root, src);
  if (!existsSync(dir)) return { ok: false, error: `no source folder ${workflowRel(src)}` };
  const { index, packets } = readList(root, src);
  const oldLedger = existsSync(join(oldCampDir(root, src), 'ledger.json'));
  if (oldLedger && index?.type !== 'list') {
    return { ok: true, source: src, migrate: true, reason: 'an old campaign ledger and no list: migrate first (section 12.2)', next: `campaign.mjs migrate <root> ${src} report` };
  }
  if (index?.type !== 'list') return { ok: false, source: src, error: `${src} has no list. Write it at brainstorm done (campaign.mjs write).` };
  if (oldLedger) {
    // The regroup wrote the list, and migrate finish did not run: the old ledger, worktrees and strays are still there.
    return { ok: true, source: src, migrate: 'finish', reason: 'the list is written and the old ledger is still in work/campaign/: finish the migration (section 12.2 steps 8 to 10)', next: `campaign.mjs migrate <root> ${src} finish` };
  }
  const branch = listBranch(src);
  const rows = packets.map((p) => ({ key: p.key, slug: p['packet-slug'], form: p.form, state: p.state, order: p.order, 'try-out': p['try-out'] ?? null, ...(p.migrated ? { migrated: true } : {}) }));
  const current = packets.find((p) => !['done', 'dropped'].includes(p.state)) ?? null;
  const needDesign = packets
    .filter((p) => BUILD_FORMS.includes(p.form) && !['done', 'dropped'].includes(p.state))
    .map((p) => {
      const opened = hasDoc(wfDir(root, p['packet-slug']), INDEX_NAME);
      const why = opened ? designBlock(root, p['packet-slug']) : ((p['ux-impact'] ?? 'none') !== 'none' ? 'not opened yet; the design stage runs after open' : null);
      return why ? { key: p.key, slug: p['packet-slug'], reason: why } : null;
    })
    .filter(Boolean);
  return {
    ok: true,
    source: src,
    branch,
    onListBranch: currentBranch(root) === branch,
    packets: rows,
    current: current ? { key: current.key, slug: current['packet-slug'], state: current.state, ...nextStep(root, src, current) } : null,
    needDesign,
    finished: !current,
  };
}

// ---------------------------------------------------------------- open (section 5)

function indexRow(root, slug, branch) {
  const file = join(workflowsRoot(root), 'INDEX.md');
  const header = '# .ai/workflows/INDEX.md — global workflow registry. Columns: slug<TAB>status<TAB>workflow-type<TAB>branch<TAB>updated-at. Sorted alphabetically by slug. Closed workflows are retained.';
  const lines = existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/).filter((l, i, a) => l || i < a.length - 1) : [header];
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
    'open-questions': [],
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
    '## Out of Scope', '', ...(outScope.length ? outScope.map((o) => `- ${o}`) : ['- None.']), '',
    '## Unknowns / Open Questions', '',
    ...(risks.length ? risks.map((r, i) => `- **RIM-${i + 1}** (carried to the slug-wide review) — ${r}`) : ['- None.']), '',
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
  if (!BUILD_FORMS.includes(packet.form)) return { ok: false, error: `${packet.key} is a ${packet.form} packet; the walk routes it to its own command`, route: routeOf(src, packet) };
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
    if (bc.stop) return { ok: false, branch, base: bc, error: bc.reason };
  }
  // Do not stash and do not force: git refuses a switch that would overwrite a change.
  const r = exists ? git(root, ['switch', branch]) : git(root, ['switch', '-c', branch, trunk]);
  if (r.status !== 0) return { ok: false, branch, error: `git switch failed: ${r.stderr}. Ask the person; do not stash and do not force.` };
  return { ok: true, branch, switched: true, created: !exists, from: exists ? null : trunk };
}

/**
 * The stacked shape: each build packet is one layer of a gh-stack stack, and the layer is its end
 * branch. The first layer starts from the trunk (`gh stack init`), a later one from the layer of
 * the build packet before (`gh stack add`).
 */
function landStacked(root, src, key, f) {
  if (!key) return { ok: false, error: 'the stacked shape lands on the layer of a packet: pass the packet key' };
  const { packets, packet } = packetOf(root, src, key);
  const layer = endBranch(src, packet.key);
  if (currentBranch(root) === layer) return { ok: true, branch: layer, switched: false, shape: 'stacked' };
  if (commitOf(root, `refs/heads/${layer}`)) {
    const r = git(root, ['switch', layer]);
    if (r.status !== 0) return { ok: false, branch: layer, error: `git switch failed: ${r.stderr}. Ask the person; do not stash and do not force.` };
    return { ok: true, branch: layer, switched: true, shape: 'stacked' };
  }
  const below = packets.filter((p) => (p.order ?? 0) < (packet.order ?? 0) && BUILD_FORMS.includes(p.form) && p.state === 'done').pop();
  const from = below ? endBranch(src, below.key) : trunkOf(root, f);
  if (!below) {
    const bc = baseCheck(root, from);
    if (bc.stop) return { ok: false, branch: layer, base: bc, error: bc.reason };
  }
  const sw = git(root, ['switch', from]);
  if (sw.status !== 0) return { ok: false, branch: layer, error: `git switch ${from} failed: ${sw.stderr}. Ask the person; do not stash and do not force.` };
  const r = gh(root, below ? ['stack', 'add', layer] : ['stack', 'init', layer]);
  if (r.status !== 0) return { ok: false, branch: layer, error: `gh stack ${below ? 'add' : 'init'} ${layer} failed: ${r.stderr || r.stdout}` };
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
  if (list['pr-number']) return { pushed: true, pr: list['pr-number'] };
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
  if (cur !== layer) throw new Error(`the walk's checkout is on ${cur ?? 'a detached HEAD'}, not on the layer ${layer}: run campaign.mjs land ${src} ${packet.key} first`);
  return layer;
}

function requireListBranch(root, src) {
  const branch = listBranch(src);
  const cur = currentBranch(root);
  if (cur !== branch) throw new Error(`the walk's checkout is on ${cur ?? 'a detached HEAD'}, not on the list branch ${branch}: run campaign.mjs land first`);
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
  if (u.status !== 0) return { ok: false, error: `git add -u failed in ${wt}: ${u.stderr}` };
  // The records are not code: a tracked .ai/ change stays out of the commit.
  git(wt, ['reset', '-q', '--', '.ai']);
  const others = git(wt, ['ls-files', '--others', '--exclude-standard', '-z']);
  if (others.status !== 0) return { ok: false, error: `git ls-files failed in ${wt}: ${others.stderr}` };
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
    if (r.status !== 0) return { ok: false, error: `git add failed in ${wt}: ${r.stderr}` };
  }
  const staged = git(wt, ['diff', '--cached', '--name-only', '-z']).stdout.split('\0').filter(Boolean);
  return { ok: true, any: staged.length > 0, files: staged.length, leftOut };
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
    if (!wt) return { ok: false, error: `the unit ${packet.key} needs a rebase, and its worktree ${m.worktree ?? '(none)'} is gone. Ask the person.` };
    // Before the snapshot: a unit with no commit beyond the wave base has its work in the wave base, or has no work yet.
    if (!Number(git(wt, ['rev-list', '--count', `${waveBase}..HEAD`]).stdout || 0)) {
      return { ok: false, error: `${branch} has no commit beyond the wave base ${waveBase}. Its work is in the wave base, which is not in the trunk, or it has no work yet. A rebase would bring nothing. Ask the person how to bring the work of ${packet.key} to ${list}.` };
    }
  }
  if (wt) {
    const dirty = dirtyOutsideAi(wt) ?? [];
    if (dirty.length) {
      const staged = stageSnapshot(wt);
      if (!staged.ok) return { ok: false, error: staged.error };
      const leftOut = staged.leftOut.length ? { leftOut: staged.leftOut } : {};
      if (staged.any) {
        const c = git(wt, ['commit', ...message(SUBJECTS.snapshot, `The campaign migration saved the uncommitted files of the work packet ${packet['packet-slug']}.`)]);
        if (c.status !== 0 && !/nothing to commit/.test(c.stdout + c.stderr)) return { ok: false, ...leftOut, error: `the snapshot commit failed in ${wt}: ${c.stderr || c.stdout}. The files are staged. Ask the person to commit them by hand with a message that the repo accepts, then start again.` };
      }
      steps.push({ snapshot: staged.files, ...leftOut });
    }
  }
  if (needsRebase) {
    const ahead = Number(git(wt, ['rev-list', '--count', `${waveBase}..HEAD`]).stdout || 0);
    if (ahead > 1) {
      // One commit, so the rebase can stop on a conflict once, not once per commit. The old commits stay on a backup branch.
      const backup = `campaign/${src}/backup--${packet['packet-slug']}`;
      const bk = git(wt, ['branch', '-f', backup, 'HEAD']);
      if (bk.status !== 0) return { ok: false, error: `git branch ${backup} failed: ${bk.stderr}` };
      const fork = git(wt, ['merge-base', waveBase, 'HEAD']).stdout;
      git(wt, ['reset', '-q', '--soft', fork]);
      const c = git(wt, ['commit', '-q', ...message(SUBJECTS.squash, `The work packet ${packet['packet-slug']}, in one commit for the campaign migration. The old commits are on ${backup}.`)]);
      if (c.status !== 0) {
        git(wt, ['reset', '-q', '--soft', backup]);
        return { ok: false, error: `the one-commit step failed in ${wt}: ${c.stderr || c.stdout}. Nothing changed. Ask the person to rebase by hand in ${wt} (git rebase --onto ${list} ${waveBase}), then start again.` };
      }
      steps.push({ squashed: ahead, backup });
    }
    const r = git(wt, ['rebase', '--onto', list, waveBase]);
    if (r.status !== 0) {
      git(wt, ['rebase', '--abort']);
      return { ok: false, conflict: 'rebase', error: `the rebase of ${branch} onto ${list} stopped on a conflict: ${r.stderr || r.stdout}. Ask the person to rebase by hand in ${wt} (git rebase --onto ${list} ${waveBase}), then start again.` };
    }
    steps.push({ rebased: true });
  }
  const mg = git(root, ['merge', '--no-ff', ...message(SUBJECTS.unitMerge, `Merge ${branch} into ${list} for the work packet ${packet['packet-slug']}.`), branch]);
  if (mg.status !== 0) {
    const stop = abortMerge(root, mg);
    if (stop.conflict) return { ok: false, conflict: 'merge', unmerged: stop.unmerged, error: `the merge of ${branch} into ${list} stopped on a conflict in ${stop.unmerged.join(', ')}. Ask the person to merge by hand, then start again.` };
    return { ok: false, refused: 'merge', error: `git refused the merge commit of ${branch} into ${list}, with no conflict: ${stop.text}. A commit-msg hook can refuse it. Ask the person to merge by hand with a message that the repo accepts, then start again.` };
  }
  steps.push({ merged: branch });
  setFields(packet.path, { migrated: { ...m, merged: true } });
  return { ok: true, steps };
}

function startCmd(root, src, [key], f) {
  const { packets, packet } = packetOf(root, src, key);
  if (!BUILD_FORMS.includes(packet.form)) return { ok: false, error: `${packet.key} is not a build packet` };
  if (packet.state === 'written') return { ok: false, error: `${packet.key} is not open: run campaign.mjs open first` };
  if (['done', 'dropped'].includes(packet.state)) return { ok: false, error: `${packet.key} is ${packet.state}` };
  requireWalkBranch(root, src, packet);
  const trunk = trunkOf(root, f);
  let migration = null;
  if (packet.migrated) {
    migration = landMigrated(root, src, packet);
    if (!migration.ok) return { ok: false, key: packet.key, ...migration };
  }
  // 6.2: the end branch of the build packet before, when HEAD holds it; else the trunk.
  const before = packets.filter((p) => (p.order ?? 0) < (packet.order ?? 0) && BUILD_FORMS.includes(p.form) && p.state === 'done').pop();
  let base = trunk;
  if (before) {
    const end = endBranch(src, before.key);
    if (commitOf(root, `refs/heads/${end}`) && isAncestor(root, end, 'HEAD')) base = end;
  }
  const wdir = wfDir(root, packet['packet-slug']);
  if (!hasDoc(wdir, INDEX_NAME)) return { ok: false, error: `${posix(relative(root, join(wdir, INDEX_NAME)))} does not exist: run campaign.mjs open` };
  setRecordFields(wdir, INDEX_NAME, { 'base-branch': base, branch: listBranch(src), 'updated-at': nowIso() });
  return { ok: true, key: packet.key, slug: packet['packet-slug'], base, ...(migration ? { migration } : {}) };
}

function builtCmd(root, src, [key], f = {}) {
  const { packet } = packetOf(root, src, key);
  if (packet.state !== 'open' && packet.state !== 'built') return { ok: false, error: `${packet.key} is ${packet.state}, not open` };
  setPacketState(packet, 'built');
  return { ok: true, key: packet.key, state: 'built', publish: publish(root, src, trunkOf(root, f), f) };
}

/** 6.1 step 13: a fix slice was added to a built packet, so the packet is open again until the driver builds it. */
function reopenCmd(root, src, [key]) {
  const { packet } = packetOf(root, src, key);
  if (packet.state === 'open') return { ok: true, key: packet.key, state: 'open', changed: false };
  if (packet.state !== 'built') return { ok: false, error: `${packet.key} is ${packet.state}; only a built packet opens again` };
  setPacketState(packet, 'open');
  return { ok: true, key: packet.key, state: 'open', changed: true };
}

function doneCmd(root, src, [key], f) {
  const { packet } = packetOf(root, src, key);
  if (packet.state !== 'built') return { ok: false, error: `${packet.key} is ${packet.state}; done needs a built packet (a clean yolo run, then campaign.mjs built)` };
  const slug = packet['packet-slug'];
  const unbuilt = openSlices(root, slug);
  if (unbuilt.length) return { ok: false, error: `the slice(s) ${unbuilt.join(', ')} of ${slug} are not complete: run the driver again`, unbuilt };
  const fid = decisionFidelity(root, slug, (packet['carried-decisions'] ?? []).map((d) => d.key));
  if (!fid.table) return { ok: false, error: `${slug}/07-review.md has no ## Decision Fidelity table` };
  if (fid.missing.length) return { ok: false, error: `the ## Decision Fidelity table of ${slug} has no row for ${fid.missing.join(', ')}`, missing: fid.missing };
  if (fid.rows.length) return { ok: false, error: `${fid.rows.length} fidelity row(s) are not honored and not approved`, rows: fid.rows };
  if (packet['try-out'] === 'yes' && !tryOutRecorded(root, slug)) return { ok: false, error: `the try-out of ${packet.key} is not recorded: run wf.mjs decide add ${root} ${slug} --kind try-out --key try-out --answer works` };
  requireWalkBranch(root, src, packet);
  const trunk = trunkOf(root, f);
  if (shapeOf(root) === 'stacked') {
    // The layer is the end branch. gh stack sync rebases the stack onto the trunk and pushes it
    // with --force-with-lease; no trunk merge enters a layer.
    const sync = f['no-push'] || !hasRemote(root) ? null : gh(root, ['stack', 'sync', '--remote', 'origin']);
    if (sync && sync.status === 3) return { ok: false, conflict: 'stack', error: `gh stack sync stopped on a rebase conflict: run gh stack rebase, resolve the files, git add them, and gh stack rebase --continue. Then run done again. ${sync.stderr}` };
    if (sync && sync.status !== 0) return { ok: false, error: `gh stack sync failed: ${sync.stderr || sync.stdout}` };
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
      if (stop.conflict) return { ok: false, conflict: 'trunk', unmerged: stop.unmerged, error: `the merge of ${from} into ${listBranch(src)} stopped on a conflict in ${stop.unmerged.join(', ')}. Ask the person to merge by hand, then run done again.` };
      return { ok: false, refused: 'trunk', error: `git refused the merge commit of ${from} into ${listBranch(src)}, with no conflict: ${stop.text}. A commit-msg hook can refuse it. Ask the person to merge by hand with a message that the repo accepts, then run done again.` };
    }
    merged = true;
  }
  const end = endBranch(src, packet.key);
  const b = git(root, ['branch', '-f', end, 'HEAD']);
  if (b.status !== 0) return { ok: false, error: `git branch -f ${end} failed: ${b.stderr}` };
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
  if (!['done', 'dropped'].includes(to)) throw new Error('close: the state is done or dropped');
  const { packet } = packetOf(root, src, key);
  if (['done', 'dropped'].includes(packet.state)) return { ok: true, key: packet.key, state: packet.state, changed: false };
  if (to === 'done' && BUILD_FORMS.includes(packet.form)) return { ok: false, error: `${packet.key} is a build packet: it is done through built and done, after its yolo run and its fidelity read` };
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

function sliceOrder(root, slug, [action], f) {
  if (action !== 'add') throw new Error('slice-order: the action is add');
  const s = String(f.slice ?? '').trim();
  const t = String(f.after ?? '').trim();
  if (!s || !t || s === t) throw new Error('slice-order add: give --slice <slice> --after <another slice>');
  const dir = workflowDir(root, slug);
  if (!hasDoc(dir, ROSTER_DOC)) return { ok: false, error: `slice-order: ${relative(root, join(dir, ROSTER_DOC))} does not exist` };
  const roster = rosterOf(dir);
  const entry = roster.find((e) => e.slug === s);
  if (!entry || !roster.some((e) => e.slug === t)) return { ok: false, error: `slice-order: ${!entry ? s : t} is not a slice of the roster of ${slug}` };
  if (entry.dependsOn.includes(t)) return { ok: true, slug, slice: s, after: t, added: false, walkOrder: rosterWalkOrder(roster).map((e) => e.slug) };
  if (closesCycle(roster, s, t)) return { ok: false, cycle: true, error: `slice-order: ${s} after ${t} closes a cycle, because ${t} already depends on ${s}` };
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

export function removeWorktree(root, src, path, { unitKey = null, allowIgnored = false, linkLimit = 5000 } = {}) {
  const entry = worktreeList(root).find((w) => samePath(w.path, path));
  if (!entry) return { ok: false, path, error: `${path} is not a worktree of ${root}` };
  if (!isOldCampaignWorktree(entry, src)) return { ok: false, path, untouched: true, error: `${path} is not an old campaign worktree of ${src}; the migration does not touch it` };
  if (!existsSync(path)) {
    git(root, ['worktree', 'prune']);
    return { ok: true, path, removed: true, pruned: true };
  }
  const dirty = dirtyOutsideAi(path);
  if (dirty === null) return { ok: false, path, error: `git status failed in ${path}` };
  if (dirty.length) return { ok: false, path, error: `${dirty.length} uncommitted change(s) outside .ai/; the worktree stays. Ask the person.`, dirty: dirty.slice(0, 20) };
  if (entry.detached && entry.head && !git(root, ['branch', '--all', '--contains', entry.head]).stdout) {
    return { ok: false, path, error: `the detached HEAD ${entry.head.slice(0, 12)} is on no branch; its commits would be lost. Ask the person.` };
  }
  if (existsSync(join(path, '.ai'))) {
    const m = unitKey ? manifestOf(root, src, unitKey) : null;
    const pending = recordsPending({ main: root, worktree: path, manifest: m?.manifest ?? { files: {} }, exclude: (rel) => rel === '.gitignore' });
    if (pending.length) return { ok: false, path, error: `${pending.length} record file(s) in the worktree exist nowhere else; the records sync did not bring them home. Ask the person.`, pending: pending.slice(0, 20) };
  }
  if (!allowIgnored) {
    const st = git(path, ['status', '--porcelain', '--ignored=matching']);
    const risk = ignoredAtRisk(st.stdout, configOf(root)?.campaign?.isolation?.['build-dirs'] ?? REMOVABLE_IGNORED);
    if (risk.length) {
      return {
        ok: false, path, ignoredAtRisk: true, ignored: risk.slice(0, 20),
        error: 'git worktree remove deletes these ignored files without asking, and they are not build output. Show them to the person. On a yes, run remove-worktree again with --allow-ignored.',
      };
    }
  }
  // CAUTION (12.7): remove each link as a link first, so no delete follows it into its target.
  const { links, complete } = linksIn(path, linkLimit);
  if (!complete) return { ok: false, path, error: `the worktree has more than ${linkLimit} links; a link after the limit could take the remove into its target. Ask the person.` };
  for (const l of links) removeLink(l);
  const r = git(root, ['worktree', 'remove', path]);
  if (r.status !== 0) return { ok: false, path, linksRemoved: links.length, error: `git refused to remove ${path}: ${r.stderr}. Ask the person; do not force.` };
  return { ok: true, path, removed: true, linksRemoved: links.length };
}

function removeWorktreeCmd(root, src, [path], f) {
  if (!path) throw new Error('remove-worktree: give the worktree path');
  return removeWorktree(root, src, resolve(path), { allowIgnored: Boolean(f['allow-ignored']) });
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
  if (!ledger?.units) return { ok: false, error: `no old campaign ledger in ${posix(relative(root, oldCampDir(root, src)))}` };
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
    ? `linked as \`${rep.linked}\` in the records repo (the migration brings the worktree records into its clone, and each campaign command commits what it writes there; the next records sync pushes the commits)`
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
  if (rep.live) return { ok: false, error: `an old wave run is live (last ledger event ${rep.ledgerAgeMinutes} minutes ago). Stop it first.` };
  if (rep.blocked.length) return { ok: false, error: 'the trunk does not hold the earlier waves of an in-flight unit. Merge the open wave PRs first.', blocked: rep.blocked };
  const { path: boardPath, board } = boardOf(root, src);
  if (!board) return { ok: false, error: `no board in ${workflowRel(src)}` };

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
  if (!shape.valid) return { ok: false, error: 'the migrated board does not pass the board schema', errors: shape.errors.slice(0, 10), records };
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
  if (!ledger?.units) return { ok: false, error: `no old campaign ledger in ${posix(relative(root, oldCampDir(root, src)))}` };
  const { path: boardPath, board } = boardOf(root, src);
  if (!board) return { ok: false, error: `no board in ${workflowRel(src)}` };
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
  if (!shape.valid) return { ok: false, error: 'the regrouped board does not pass the board schema', errors: shape.errors.slice(0, 10) };
  out.backup = backupBoard(root, src, boardPath, 'regroup');
  writeFileSync(boardPath, `${JSON.stringify(board, null, 2)}\n`);
  return out;
}

/** 12.2 steps 8 to 10, after the list is written: archive the ledger, move the strays, remove the old worktrees. */
export function migrateFinish(root, src) {
  const idx = readFm(join(workDir(root, src), 'index.md'));
  if (idx?.type !== 'list') return { ok: false, error: 'write the list first (campaign.mjs write)' };
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
    removed.push(removeWorktree(root, src, w.path));
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
  throw new Error('migrate: the phase is report, apply, regroup or finish');
}

// ---------------------------------------------------------------- main

function flags(args) {
  const BOOLEAN = new Set(['dry-run', 'json', 'allow-ignored', 'no-push']);
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
const READ_ONLY = new Set(['check', 'status', 'remove-worktree']);

/**
 * A linked project keeps its records in the clone of the records repo. Commit what the command
 * wrote there, so the clone history holds it before the next records sync pushes it. A failed
 * commit fails no command: that sync commits the files too.
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
    if (!existsSync(join(dir, boardFile))) return { ok: false, error: `no ${boardFile} in ${dir}` };
    return archiveCommand(dir, boardFile, { dryRun: Boolean(f['dry-run']) });
  }
  const [rootArg, second, ...rest] = pos;
  if (!rootArg || !second) return null;
  const root = resolve(rootArg);
  switch (cmd) {
    case 'status': return statusCmd(root, second);
    case 'open': return openCmd(root, second, rest, f);
    case 'land': return landCmd(root, second, rest, f);
    case 'start': return startCmd(root, second, rest, f);
    case 'built': return builtCmd(root, second, rest, f);
    case 'reopen': return reopenCmd(root, second, rest);
    case 'done': return doneCmd(root, second, rest, f);
    case 'close': return closeCmd(root, second, rest);
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
    return cmd ? dispatch(cmd, rest) : null;
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export function main(argv = process.argv.slice(2)) {
  const out = run(argv);
  if (out === null) { process.stderr.write(`${USAGE}\n`); return 2; }
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  return out.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
