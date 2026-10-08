#!/usr/bin/env node
/**
 * scripts/campaign.mjs — the disk side of /wf campaign (WF-CAMPAIGN-PLAN, Stage C).
 * Bundled to dist/campaign.mjs; skills/wf/scripts/campaign.mjs runs the bundle.
 *
 *   orient   <root> <brainstorm>                 Phase 0: check, waves, forecast, ledger (9.1)
 *   status   <root> <brainstorm>                 the next action (section 6) and the ledger summary
 *   replan   <root> <brainstorm>                 re-read the packets; re-plan the waves not started (15)
 *   answer   <root> <brainstorm> <key> <json>    record a setup answer (9.2)
 *   unit     <root> <brainstorm> <key> <state> [--route r] [--reason r] [--merge sha] [--output path] [--digest json]
 *   outside  <root> <brainstorm> <key> <closed|needs-you>
 *   wave     <root> <brainstorm> <n> start [--trunk main]       start a wave (9.4 step 2; 9.3 step 6)
 *   wave     <root> <brainstorm> <n> set <state> [--pr url] [--version v] [--label l]
 *   ask      <root> <brainstorm> <id> [--wave n] <text...>      record a question (16.4)
 *   reply    <root> <brainstorm> <id> <answer...>               record the person's answer
 *   pause    <root> <brainstorm> <until ISO> <reason...>        (17.4)
 *   resume   <root> <brainstorm>
 *   context  <root> <brainstorm> <key>            write context/<slug>.md (section 10)
 *   drift    <root> <brainstorm> <n>              write drift/wave-<n>.md from as-built/*.json (11.2)
 *   version  <root> <brainstorm> wave|hotfix [--label beta]     the version at ship time (V2, V3)
 *   label    <root> <brainstorm> <n> [<slug>]     the build label of the branch tip (V4)
 *   journal  <root> <brainstorm> <event> [<json>] append a campaign journal line (the watch reads it)
 *   forecast <root> <brainstorm> [--wave n --minutes m --tokens t]
 *   worktree <root> <brainstorm> <key|wave-<n>> <add|refresh|sync|remove>   (13; local records)
 *
 * Every command prints one JSON object on stdout. The ledger (work/campaign/ledger.json)
 * is the truth; every write regenerates ledger.md beside it.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statfsSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  budgetState, buildForecast, buildLabel, campaignAction, DEFAULT_BUDGET, DEFAULT_MAX_UNSHIPPED, DEFAULT_WIDTH, effectiveWidth, isolationOf, isolationText,
  newestReading, portsFor, waveBase, checkCampaignSet, classifyDrift, deferUnprepared, hotfixVersion,
  isBuildUnit, newLedger, nextWaveVersion, renderContext, renderForecast, renderLedgerMd, replan, rowTokens,
  SETUP_ANSWERS, stageMinutesFromJournals, unitOf, UNIT_STATES, WAVE_STATES,
} from '../lib/campaign.mjs';
import { ignoredAtRisk, loadManifest, recordsIn, recordsOut, recordsPending, saveManifest, withRecordsLock } from '../lib/campaign-records.mjs';
import { safeParseFrontmatter } from '../lib/frontmatter.mjs';
import { missingBoardFiles, needsPictures } from '../lib/design-boards.mjs';
import { designNeeded, designSettled } from '../lib/design-lane.mjs';

const USAGE = 'Usage: campaign.mjs <orient|status|replan|answer|unit|outside|wave|ask|reply|pause|resume|context|drift|version|label|journal|forecast|budget|worktree|lock|stack> <projectRoot> <brainstorm> ...';

// scripts/ and dist/ both sit one level under the plugin root.
const PLUGIN_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const brainstormDir = (root, b) => join(root, '.ai', 'workflows', b);
const workDir = (root, b) => join(brainstormDir(root, b), 'work');
const campDir = (root, b) => join(workDir(root, b), 'campaign');
const ledgerPath = (root, b) => join(campDir(root, b), 'ledger.json');
export const journalPath = (root, b) => join(campDir(root, b), '.campaign-journal.jsonl');
export const controlPath = (root, b) => join(campDir(root, b), '.control.json');

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

function writeAtomic(file, text) {
  mkdirSync(join(file, '..'), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

function git(root, args) {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? r.stdout.trim() : null;
}

/** The work set on disk: work/index.md's revision and every packet's frontmatter. */
export function readWorkSet(root, b) {
  const dir = workDir(root, b);
  const indexFile = join(dir, 'index.md');
  if (!existsSync(indexFile)) return { error: `no work set: ${relative(root, indexFile)} does not exist. End the brainstorm with done first.` };
  // work/index.md is written by the brainstorm session and the write may not be
  // atomic: a read that does not parse is retried once (15.1).
  let index = safeParseFrontmatter(readFileSync(indexFile, 'utf8')).data;
  if (!index) index = safeParseFrontmatter(readFileSync(indexFile, 'utf8')).data;
  if (!index) return { error: 'work/index.md does not parse; read it again at the next boundary.' };
  const packets = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.md') || file === 'index.md' || file === 'changes.md') continue;
    const data = safeParseFrontmatter(readFileSync(join(dir, file), 'utf8')).data;
    if (data?.type === 'work-packet') packets.push({ ...data, file: `work/${file}` });
  }
  const written = Array.isArray(index.written) ? index.written.map(String) : [];
  return { revision: Number(index['work-revision']) || 0, index, packets, written };
}

/** The campaign units of a work set; a dependency on a written piece is done (see unitOf). */
const unitsOf = (ws) => ws.packets.map((p) => unitOf(p, { written: ws.written }));

function loadLedger(root, b) {
  const p = ledgerPath(root, b);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}

function saveLedger(root, b, ledger) {
  ledger['updated-at'] = nowIso();
  writeAtomic(ledgerPath(root, b), `${JSON.stringify(ledger, null, 2)}\n`);
  writeAtomic(join(campDir(root, b), 'ledger.md'), renderLedgerMd(ledger));
}

function requireLedger(root, b) {
  const l = loadLedger(root, b);
  if (!l) throw new Error(`no campaign ledger for ${b}: run orient first`);
  return l;
}

export function appendJournal(root, b, event, extra = {}) {
  const line = { at: nowIso(), event, ...extra };
  mkdirSync(campDir(root, b), { recursive: true });
  appendFileSync(journalPath(root, b), `${JSON.stringify(line)}\n`);
  return line;
}

function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

function readJsonl(file) {
  try {
    return readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

/** The history the forecast uses: every earlier driver journal and cost ledger in the repo. */
function forecastHistory(root) {
  const wfRoot = join(root, '.ai', 'workflows');
  const journals = [];
  const sliceTokens = [];
  const slicesPerSlug = [];
  let slugs = [];
  try { slugs = readdirSync(wfRoot, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { /* none */ }
  for (const slug of slugs) {
    const j = readJsonl(join(wfRoot, slug, '.driver-journal.jsonl'));
    if (j.length) journals.push(j);
    const cost = readJsonl(join(wfRoot, slug, 'cost.jsonl'));
    const n = sliceCount(root, slug);
    if (n) slicesPerSlug.push(n);
    if (cost.length && n) sliceTokens.push(cost.reduce((a, r) => a + rowTokens(r), 0) / n);
  }
  const med = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  return { stageMinutes: stageMinutesFromJournals(journals), sliceTokens: med(sliceTokens), slicesPerSlug: med(slicesPerSlug), journals: journals.length };
}

function sliceCount(root, slug) {
  const idx = join(root, '.ai', 'workflows', slug, '00-index.md');
  if (!existsSync(idx)) return null;
  const data = safeParseFrontmatter(readFileSync(idx, 'utf8')).data;
  const s = data?.slices;
  return Array.isArray(s) && s.length ? s.length : null;
}

function shipPlan(root) {
  const p = join(root, '.ai', 'ship-plan.md');
  if (!existsSync(p)) return null;
  const d = safeParseFrontmatter(readFileSync(p, 'utf8')).data ?? {};
  return {
    'version-scheme': d['version-scheme'] ?? null,
    'version-source-of-truth': d['version-source-of-truth'] ?? null,
    'version-bump-cmd': d['version-bump-cmd'] ?? null,
    'release-trigger': d['release-trigger'] ?? null,
    'rollout-stages': d['rollout-stages'] ?? null,
  };
}

function trunkOf(root) {
  const head = git(root, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  if (head) return head.replace(/^origin\//, '');
  for (const b of ['main', 'master']) if (git(root, ['rev-parse', '--verify', '--quiet', b]) !== null) return b;
  return 'main';
}

function flags(args) {
  const pos = [];
  const f = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) { f[args[i].slice(2)] = args[i + 1]; i++; } else pos.push(args[i]);
  }
  return { pos, f };
}

// ---------------------------------------------------------------- commands

function orient(root, b) {
  if (loadLedger(root, b)) return { ok: false, error: 'a ledger exists: use status (the campaign infers its phase from the ledger)' };
  const ws = readWorkSet(root, b);
  if (ws.error) return { ok: false, error: ws.error };
  const units = unitsOf(ws);
  const check = checkCampaignSet(units);
  if (check.single) {
    const only = units.find(isBuildUnit);
    return { ok: false, single: true, error: 'the work set has one build packet: that is not a campaign.', start: only ? `/wf intake .ai/workflows/${b}/${only.file}` : null };
  }
  if (check.errors.length) return { ok: false, errors: check.errors, warnings: check.warnings };
  // 9.1 step 4: a branch carries .ai/ only when the repo tracks it. When the repo
  // does not, the records stay in the main checkout (local records, 13).
  const cfg = readJson(join(root, '.ai', 'sdlc-config.json')) ?? {};
  const ignored = cfg.artifactTracking === 'ignored' || git(root, ['check-ignore', '-q', '.ai/workflows']) !== null;
  const ledger = newLedger({ brainstorm: b, revision: ws.revision, units, now: nowIso() });
  ledger.records = ignored ? 'local' : 'tracked';
  if (ignored) check.warnings.push('the repo does not track .ai/: the records stay in the main checkout. Each worktree gets a copy, and its changes come back before the worktree is removed (local records). The wave PR text and the code are still public.');
  ledger['ship-plan'] = shipPlan(root);
  ledger.trunk = trunkOf(root);
  ledger['run-id'] = `${nowIso().replace(/[-:]/g, '').replace(/\.\d+/, '')}-${b}`;
  if (ledger['ship-plan'] === null || ledger['ship-plan']['version-scheme'] === 'none') ledger.answers['target-version'] = 'none';
  // Handoff and ship both stop without a ship plan, so name the gap before wave 1, not at its PR.
  if (ledger['ship-plan'] === null) ledger['tool-gaps'].push({ tool: 'ship-plan', have: 'none', need: '.ai/ship-plan.md', fix: '/wf ship-plan init' });
  const cliOk = claudeVersionGap();
  if (cliOk) ledger['tool-gaps'].push(cliOk);
  // 16.0: stacked wave PRs need gh-stack v0.1.0 (merge). The campaign never upgrades a tool itself.
  const stackVersion = ghStackVersion();
  const stackOk = stackVersion !== null && compareSemver(stackVersion, '0.1.0') >= 0;
  if (stackVersion !== null && !stackOk) ledger['tool-gaps'].push({ tool: 'gh-stack', have: stackVersion, need: '0.1.0', fix: 'gh extension upgrade stack' });
  ledger.stack = { enabled: stackOk && cfg.campaign?.stack !== false, number: null, 'max-unshipped': cfg.campaign?.['max-unshipped'] ?? DEFAULT_MAX_UNSHIPPED };
  const history = forecastHistory(root);
  const slices = Object.fromEntries(units.filter(isBuildUnit).map((u) => [u.key, sliceCount(root, u.slug)]).filter(([, n]) => n));
  const fc = buildForecast({ units, history, slices });
  ledger.forecast = { minutes: fc.minutes, tokens: fc.tokens, unknown: fc.unknown, journals: history.journals };
  saveLedger(root, b, ledger);
  writeAtomic(join(campDir(root, b), 'forecast.md'), renderForecast(fc, { brainstorm: b, now: nowIso() }));
  appendJournal(root, b, 'campaign-orient', { revision: ws.revision, waves: ledger.waves.length });
  return { ok: true, records: ledger.records, waves: ledger.waves.map((w) => w.units), waiting: ledger.waiting, outside: Object.keys(ledger.outside), warnings: check.warnings, forecast: ledger.forecast, toolGaps: ledger['tool-gaps'], next: campaignAction(ledger, { revision: ws.revision }) };
}

function claudeVersionGap() {
  const r = process.platform === 'win32'
    // A .cmd shim needs the shell; one command string avoids the args-with-shell deprecation.
    ? spawnSync('claude --version', { encoding: 'utf8', windowsHide: true, shell: true })
    : spawnSync('claude', ['--version'], { encoding: 'utf8' });
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(r.stdout ?? '');
  if (!m) return null; // not on PATH here: the session that runs the campaign is Claude Code itself
  const [maj, min, pat] = m.slice(1).map(Number);
  const ok = maj > 2 || (maj === 2 && (min > 1 || (min === 1 && pat >= 287)));
  return ok ? null : { tool: 'claude-code', have: m[0], need: '2.1.287', fix: 'update Claude Code' };
}

/** The installed gh-stack version, or null when gh or the extension is absent. */
function ghStackVersion() {
  if (process.env.SDLC_CAMPAIGN_SKIP_TOOLS === '1') return null;
  const r = spawnSync('gh', ['extension', 'list'], { encoding: 'utf8', windowsHide: true });
  const line = (r.stdout ?? '').split(/\r?\n/).find((l) => /gh-stack/.test(l));
  const m = line ? /v?(\d+\.\d+\.\d+)/.exec(line) : null;
  return m ? m[1] : null;
}

function compareSemver(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

const configOf = (root) => readJson(join(root, '.ai', 'sdlc-config.json')) ?? {};

// 17.1: the usage guard writes one reading file per session here.
const usageDir = () => process.env.SDLC_USAGE_DIR || join(homedir(), '.claude', 'sdlc', 'usage');

function readings() {
  const dir = usageDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => readJson(join(dir, f)));
}

/** 17.3: the budget state before a drive starts, and the width it allows. */
function budget(root, b) {
  const ledger = requireLedger(root, b);
  const cfg = configOf(root);
  const reading = newestReading(readings());
  const st = budgetState(reading, ledger.answers.budget ?? DEFAULT_BUDGET, { now: Date.now() });
  const isolation = isolationOf(cfg);
  const width = effectiveWidth({ width: cfg.campaign?.width ?? DEFAULT_WIDTH, isolation, budget: st.state });
  return { ok: true, ...st, width, readingAt: reading?.at ?? null, isolation: isolation !== null };
}

/**
 * Keep the worktree path short. Windows limits a path to 260 characters unless git
 * has core.longpaths, and a long worktree root pushes deep repo files past it.
 * The run stamp (the run id up to its first dash) keeps two runs apart.
 */
const worktreeRoot = (root, ledger) => join(root, '.scratch', 'cw', String(ledger['run-id'] ?? 'run').split('-')[0]);
/** git, with long paths on: a no-op off Windows. */
const gitLong = (root, args) => spawnSync('git', ['-c', 'core.longpaths=true', '-C', root, ...args], { encoding: 'utf8', windowsHide: true });
const commitOf = (root, ref) => {
  const r = spawnSync('git', ['-C', root, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? r.stdout.trim() : null;
};

const recordsDir = (root, b) => join(campDir(root, b), 'records');
const manifestFile = (root, b, id) => join(recordsDir(root, b), `${id}.json`);
const isLocal = (ledger) => ledger?.records === 'local';
/**
 * The worktree's `.ai/.gitignore` belongs to the campaign: it ignores every copied
 * record, so no `git add` in the worktree can put one on a branch. The main
 * `.gitignore` may be untracked, so a worktree cannot rely on it. The sync never
 * copies this file in either direction.
 */
const WORKTREE_IGNORE = '# written by /wf campaign (local records): the records in this worktree stay out of git\n*\n';
const isAiIgnore = (rel) => rel === '.gitignore';
/** The campaign folder belongs to the main checkout: a drive reads it there, by absolute path. */
const mainOwned = (b) => (rel) => isAiIgnore(rel) || rel.startsWith(`workflows/${b}/work/campaign/`);
/** A stage's evidence folder: `implement-evidence/`, `verify-evidence/`, `probe-evidence/`. */
const EVIDENCE_RE = /^workflows\/([^/]+)\/[^/]+-evidence(\/|$)/;
/** A workflow's design boards folder (DESIGN-BOARDS-PLAN section 3). */
const DESIGN_RE = /^workflows\/([^/]+)\/design(\/|$)/;
/**
 * What a worktree does not receive: the campaign folder, and the evidence folders and
 * design boards of every workflow that the worktree does not drive. One finished
 * workflow can hold hundreds of thousands of evidence files and megabytes of board
 * PNGs, and a drive reads only its own.
 */
const notCopiedIn = (b, slugs) => (rel) => {
  if (mainOwned(b)(rel)) return true;
  const m = EVIDENCE_RE.exec(rel) ?? DESIGN_RE.exec(rel);
  return Boolean(m) && !slugs.includes(m[1]);
};
/** The workflow slugs that a worktree drives: the unit's slug, or every unit slug of the wave. */
const slugsOf = (ledger, w, u) => (w ? w.units.map((k) => ledger.units[k]?.slug ?? k) : [u.slug]);

/**
 * The tracked `.ai/` files that the worktree holds exactly as committed (no staged
 * or unstaged change), as paths relative to `.ai/`. The sync never writes over them.
 */
function committedAs(path) {
  const list = (args) => {
    const r = spawnSync('git', ['-C', path, ...args, '-z', '--', '.ai'], { encoding: 'utf8', windowsHide: true });
    if (r.status !== 0) throw new Error(`records: git ${args.join(' ')} failed in ${path}: ${(r.stderr || '').trim()}`);
    return r.stdout.split('\0').filter(Boolean).map((p) => p.replace(/^\.ai\//, ''));
  };
  const changed = new Set([...list(['diff', '--name-only']), ...list(['diff', '--cached', '--name-only'])]);
  const clean = new Set(list(['ls-files']).filter((p) => !changed.has(p)));
  return (rel) => clean.has(rel);
}

/** Main to worktree, under the records lock (local records, 13). */
function syncIn(root, b, id, path, slugs) {
  return withRecordsLock(join(recordsDir(root, b), '.lock'), id, () => {
    const ignoreFile = join(path, '.ai', '.gitignore');
    mkdirSync(join(path, '.ai'), { recursive: true });
    const tracked = spawnSync('git', ['-C', path, 'ls-files', '--error-unmatch', '.ai/.gitignore'], { encoding: 'utf8', windowsHide: true }).status === 0;
    const have = existsSync(ignoreFile) ? readFileSync(ignoreFile, 'utf8') : '';
    if (!tracked && !have.split(/\r?\n/).includes('*')) writeFileSync(ignoreFile, WORKTREE_IGNORE);
    const manifest = loadManifest(manifestFile(root, b, id), id);
    manifest.worktree = path;
    const res = recordsIn({ main: root, worktree: path, manifest, exclude: notCopiedIn(b, slugs), pristine: committedAs(path) });
    saveManifest(manifestFile(root, b, id), manifest, nowIso());
    // Check what git sees: a copied record that git can stage could reach a public branch.
    const st = spawnSync('git', ['-C', path, 'status', '--porcelain', '--untracked-files=all', '--', '.ai'], { encoding: 'utf8', windowsHide: true });
    const visible = st.status === 0 ? st.stdout.split(/\r?\n/).filter((l) => l.startsWith('?? ')).map((l) => l.slice(3)) : ['(git status failed)'];
    if (visible.length) res.visibleToGit = visible;
    return res;
  });
}

/** Worktree to main, under the records lock. Nothing is deleted; a change on both sides keeps both versions. */
function syncOut(root, b, id, path) {
  return withRecordsLock(join(recordsDir(root, b), '.lock'), id, () => {
    const manifest = loadManifest(manifestFile(root, b, id), id);
    const conflictsDir = join(recordsDir(root, b), 'conflicts', id, nowIso().replace(/[-:]/g, ''));
    const res = recordsOut({ main: root, worktree: path, manifest, conflictsDir, exclude: isAiIgnore });
    saveManifest(manifestFile(root, b, id), manifest, nowIso());
    if (res.copied.length || res.conflicts.length) appendJournal(root, b, 'records-out', { id, copied: res.copied.length, conflicts: res.conflicts.map((c) => c.rel) });
    return res;
  });
}

/**
 * Remove a campaign worktree without losing a file (13). With local records, the
 * records come back first, and a file that exists only in the worktree stops the
 * remove. In both modes, an ignored file outside .ai/ that is not a build folder
 * stops it, because git deletes ignored files without asking. Never --force.
 */
function removeWorktree(root, b, ledger, id, path) {
  let records = null;
  if (isLocal(ledger)) {
    records = syncOut(root, b, id, path);
    const pending = recordsPending({ main: root, worktree: path, manifest: loadManifest(manifestFile(root, b, id), id), exclude: isAiIgnore });
    if (pending.length) return { ok: false, error: `${pending.length} file(s) in the worktree exist nowhere else, so the worktree stays. Ask the person.`, pending, records };
  } else {
    // The watch cursors are machine-local and never committed; left in place, they make git refuse.
    const wf = join(path, '.ai', 'workflows');
    if (existsSync(wf)) for (const d of readdirSync(wf)) rmSync(join(wf, d, '.watch-state.json'), { force: true });
  }
  const st = spawnSync('git', ['-C', path, 'status', '--porcelain', '--ignored=matching'], { encoding: 'utf8', windowsHide: true });
  if (st.status !== 0) return { ok: false, error: `git status failed in ${path}: ${(st.stderr || '').trim()}`, records };
  const risk = ignoredAtRisk(st.stdout, isolationOf(configOf(root))?.['build-dirs'] ?? []);
  if (risk.length) return { ok: false, error: 'git worktree remove deletes ignored files without asking, and these are not build folders. Ask the person: copy what they need into the main checkout, or name the folder in campaign.isolation.build-dirs, then remove again.', ignored: risk, records };
  // CAUTION (13): never --force. A refusal means uncommitted or untracked work; the person decides.
  const r = spawnSync('git', ['-C', root, 'worktree', 'remove', path], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) return { ok: false, error: `git refused to remove ${path}: ${(r.stderr || '').trim()}. Ask the person; do not force.`, records };
  return { ok: true, removed: true, records };
}

/**
 * 13: a worktree per drive, its slug branch from the wave branch, and the
 * prepared workflow folder copied in. `wave-<n>` names the wave worktree: the
 * boundary merges there, and with local records handoff and ship run there.
 *   add      create the worktree, or reuse it; with local records, copy the main .ai/ in
 *   refresh  with local records, copy the main changes in; a worktree change stays
 *   sync     with local records, copy the worktree changes back to the main checkout
 *   remove   sync, check that no file would be lost, then git worktree remove
 */
function worktree(root, b, args) {
  const res = worktreeStep(root, b, args);
  const visible = res.records?.visibleToGit ?? [];
  if (!visible.length) return res;
  return { ...res, ok: false, error: `git can stage ${visible.length} copied record(s) in this worktree, so a commit there could publish them. Do not drive, hand off or ship in this worktree. Ask the person.` };
}

function worktreeStep(root, b, [key, action]) {
  const ledger = requireLedger(root, b);
  const waveN = /^wave-(\d+)$/.exec(key ?? '')?.[1];
  const w = waveN ? ledger.waves.find((x) => x.n === Number(waveN)) : null;
  if (waveN && !w) throw new Error(`worktree: no wave ${waveN}`);
  const u = waveN ? null : ledger.units[key];
  if (!waveN && !u) throw new Error(`worktree: ${key} is not a build unit of this campaign`);
  if (!['add', 'refresh', 'sync', 'remove'].includes(action)) throw new Error('worktree: the action is add, refresh, sync or remove');
  const local = isLocal(ledger);
  const holder = w ?? u;
  const slugs = slugsOf(ledger, w, u);
  if (action !== 'add') {
    if (!holder.worktree) return { ok: true, removed: false, synced: false, reason: local ? 'no worktree: the drive wrote in the main checkout' : 'no worktree' };
    if (action === 'remove') {
      const res = removeWorktree(root, b, ledger, key, holder.worktree.path);
      if (res.ok) {
        delete holder.worktree;
        saveLedger(root, b, ledger);
      }
      return res;
    }
    if (!local) return { ok: true, synced: false, reason: 'the repo tracks .ai/: the records travel in commits' };
    return { ok: true, records: action === 'sync' ? syncOut(root, b, key, holder.worktree.path) : syncIn(root, b, key, holder.worktree.path, slugs) };
  }
  if (w) {
    if (!w.branch) throw new Error(`worktree: wave ${w.n} has no branch yet`);
    const path = w.worktree && existsSync(w.worktree.path) ? w.worktree.path : join(worktreeRoot(root, ledger), key);
    if (!existsSync(path)) {
      mkdirSync(worktreeRoot(root, ledger), { recursive: true });
      const r = gitLong(root, ['worktree', 'add', path, w.branch]);
      if (r.status !== 0) return { ok: false, error: `git worktree add failed: ${(r.stderr || '').trim()}` };
    }
    w.worktree = { path, branch: w.branch };
    saveLedger(root, b, ledger);
    return { ok: true, ...w.worktree, ...(local ? { records: syncIn(root, b, key, path, slugs) } : {}) };
  }
  const iso = isolationOf(configOf(root));
  if (!iso) return { ok: false, error: 'no usable isolation contract (campaign.isolation in .ai/sdlc-config.json): drive this slug in the main checkout at width 1' };
  const uw = ledger.waves.find((x) => x.n === u.wave);
  if (!uw || uw.state !== 'running' || !uw.branch) throw new Error(`worktree: wave ${u.wave} of ${key} is not running`);
  if (u.worktree && existsSync(u.worktree.path)) return { ok: true, ...u.worktree, reused: true, ...(local ? { records: syncIn(root, b, key, u.worktree.path, slugs) } : {}) };
  const base = worktreeRoot(root, ledger);
  mkdirSync(base, { recursive: true });
  const freeGb = statfsSync(base).bavail * statfsSync(base).bsize / 1024 ** 3;
  if (freeGb < iso['min-free-gb']) return { ok: false, wait: true, error: `${freeGb.toFixed(1)} GB free, below min-free-gb ${iso['min-free-gb']}: wait until a merged slug's worktree is removed` };
  const index = [...uw.units].sort((a, c) => (ledger.units[a].order ?? 0) - (ledger.units[c].order ?? 0)).indexOf(key);
  const branch = `campaign/${b}/wave-${uw.n}--${u.slug}`;
  const path = join(base, `w${uw.n}-${index + 1}`);
  // A branch left by an earlier attempt of this wave is reused: it holds the slug's commits, if any.
  // A branch that does not contain the wave tip comes from another run; the person decides.
  const had = commitOf(root, `refs/heads/${branch}`);
  if (had && spawnSync('git', ['-C', root, 'merge-base', '--is-ancestor', uw.branch, branch], { windowsHide: true }).status !== 0) {
    return { ok: false, error: `the branch ${branch} exists and does not contain the wave branch ${uw.branch}, so it comes from another run. Ask the person: delete it, or rename it, then add again.` };
  }
  const r = gitLong(root, had ? ['worktree', 'add', path, branch] : ['worktree', 'add', '-b', branch, path, uw.branch]);
  if (r.status !== 0) {
    // A failed `add -b` leaves its new branch behind. At the wave tip it holds no commit, so delete it: the retry starts clean.
    if (!had && commitOf(root, `refs/heads/${branch}`) === commitOf(root, uw.branch)) spawnSync('git', ['-C', root, 'branch', '-D', branch], { encoding: 'utf8', windowsHide: true });
    return { ok: false, error: `git worktree add failed: ${(r.stderr || '').trim()}` };
  }
  u.worktree = { path, branch, index, ports: portsFor(iso, index) };
  saveLedger(root, b, ledger);
  let records = null;
  if (local) records = syncIn(root, b, key, path, slugs);
  else {
    // The slug's prepared artifacts may be uncommitted in the main checkout; the drive needs them.
    const src = join(root, '.ai', 'workflows', u.slug);
    const dest = join(path, '.ai', 'workflows', u.slug);
    if (existsSync(src) && !existsSync(dest)) cpSync(src, dest, { recursive: true });
  }
  appendJournal(root, b, 'worktree', { key, slug: u.slug, path, branch, index });
  return { ok: true, ...u.worktree, ...(records ? { records } : {}) };
}

const LOCK_STALE_MS = 3 * 60 * 60 * 1000;

/** 13: the heavy-suite lock. One holder at a time; a lock older than 3 hours is stale. */
function lock(root, b, [action, holder]) {
  if (!holder) throw new Error('lock: give the holder (the slug)');
  const file = join(root, '.scratch', 'campaign', 'heavy.lock');
  mkdirSync(join(file, '..'), { recursive: true });
  const cur = readJson(file);
  if (action === 'release') {
    if (!cur || cur.holder !== holder) return { ok: true, released: false, holder: cur?.holder ?? null };
    rmSync(file, { force: true });
    return { ok: true, released: true };
  }
  if (action !== 'acquire') throw new Error('lock: the action is acquire or release');
  if (cur && cur.holder !== holder && Date.now() - Date.parse(cur.at) < LOCK_STALE_MS) return { ok: true, acquired: false, holder: cur.holder, since: cur.at };
  if (!cur || cur.holder !== holder) {
    try {
      writeFileSync(file, JSON.stringify({ holder, at: nowIso() }), { flag: cur ? 'w' : 'wx' });
    } catch {
      const now = readJson(file);
      return { ok: true, acquired: false, holder: now?.holder ?? null, since: now?.at ?? null };
    }
  }
  return { ok: true, acquired: true, holder };
}

/** 16.1: the stack of wave PRs — on, off, or its number on GitHub. */
function stack(root, b, [action, value]) {
  const ledger = requireLedger(root, b);
  ledger.stack = { enabled: false, number: null, 'max-unshipped': DEFAULT_MAX_UNSHIPPED, ...(ledger.stack ?? {}) };
  if (action === 'enable') ledger.stack.enabled = true;
  else if (action === 'disable') ledger.stack.enabled = false;
  else if (action === 'set') {
    if (!/^\d+$/.test(value ?? '')) throw new Error('stack set: give the stack number');
    ledger.stack.number = Number(value);
  } else throw new Error('stack: the action is enable, disable, or set <number>');
  saveLedger(root, b, ledger);
  return { ok: true, stack: ledger.stack };
}

function status(root, b) {
  const ledger = loadLedger(root, b);
  const ws = readWorkSet(root, b);
  const revision = ws.error ? null : ws.revision;
  return { ok: true, next: campaignAction(ledger, { revision }), revision, ledger: ledger ? { waves: ledger.waves.map((w) => ({ n: w.n, state: w.state, units: w.units, moved: w.moved })), waiting: ledger.waiting, pause: ledger.pause } : null };
}

function doReplan(root, b) {
  const ledger = requireLedger(root, b);
  const ws = readWorkSet(root, b);
  if (ws.error) return { ok: false, error: ws.error };
  const units = unitsOf(ws);
  const check = checkCampaignSet(units);
  if (check.errors.length) return { ok: false, errors: check.errors };
  const before = new Set([...Object.keys(ledger.units), ...Object.keys(ledger.outside)]);
  // A packet that is prepared or routed counts as prepared for a unit still planned.
  for (const u of units) if (ledger.units[u.key]?.state === 'planned' && ['prepared', 'routed'].includes(u.packetState)) ledger.units[u.key].state = 'prepared';
  replan(ledger, units, { revision: ws.revision, now: nowIso() });
  const added = [...Object.keys(ledger.units), ...Object.keys(ledger.outside)].filter((k) => !before.has(k));
  saveLedger(root, b, ledger);
  appendJournal(root, b, 'replan', { revision: ws.revision, added });
  return { ok: true, added, waves: ledger.waves.map((w) => ({ n: w.n, state: w.state, units: w.units })), waiting: ledger.waiting };
}

function answer(root, b, [key, ...rest]) {
  if (!SETUP_ANSWERS.includes(key)) throw new Error(`answer: the key is one of ${SETUP_ANSWERS.join(', ')}`);
  const ledger = requireLedger(root, b);
  const raw = rest.join(' ');
  let value;
  try { value = JSON.parse(raw); } catch { value = raw; }
  if (key === 'budget') {
    // 17.2: 'default' takes 75 / 90 / 15; an object overrides any of the three lines.
    if (value === 'default') value = { ...DEFAULT_BUDGET };
    if (!value || typeof value !== 'object' || Object.keys(value).some((k) => !(k in DEFAULT_BUDGET) || !Number.isFinite(value[k]))) throw new Error('answer budget: default, or {"fiveHourSlow":n,"fiveHourPause":n,"sevenDayReserve":n}');
    value = { ...DEFAULT_BUDGET, ...value };
  }
  ledger.answers[key] = value;
  saveLedger(root, b, ledger);
  return { ok: true, key, value, next: campaignAction(ledger, {}) };
}

/**
 * Why a unit's design keeps it from `prepared`, or null (DESIGN-BOARDS-PLAN W5b).
 * The prepare runs the design lane with the person; a unit whose design is needed
 * is prepared only when the design is settled. For `visual` and `new-surface`, the
 * contract must also name its frozen boards, and every board must exist on disk.
 */
export function designBlocksPrepared(root, slug) {
  const dir = join(root, '.ai', 'workflows', slug);
  const read = (name) => (existsSync(join(dir, name)) ? safeParseFrontmatter(readFileSync(join(dir, name), 'utf8')).data ?? {} : null);
  const index = read('00-index.md');
  if (!index) return null;
  if (!designNeeded(index, existsSync(join(dir, '02b-design.md')))) return null;
  const contract = read('02c-craft.md');
  const missing = contract ? missingBoardFiles(dir, contract) : null;
  if (!designSettled(index, contract, missing)) {
    if (missing?.length) return `the confirmed boards are missing: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ` and ${missing.length - 3} more` : ''}`;
    return `the design is not settled; run /wf design ${slug} with the person`;
  }
  const skipped = index.progress && typeof index.progress === 'object' && index.progress.design === 'skipped';
  if (!skipped && needsPictures(index) && !String(contract?.boards ?? '').trim()) {
    return `02c-craft.md names no boards: (ux-impact ${index['ux-impact']}); run /wf design ${slug} amend or import to freeze the boards`;
  }
  return null;
}

function unit(root, b, [key, state], f) {
  if (!UNIT_STATES.includes(state)) throw new Error(`unit: the state is one of ${UNIT_STATES.join(', ')}`);
  const ledger = requireLedger(root, b);
  const u = ledger.units[key];
  if (!u) throw new Error(`unit: ${key} is not a build unit of this campaign`);
  if (state === 'prepared') {
    const why = designBlocksPrepared(root, u.slug);
    if (why) return { ok: false, key, state: u.state, error: `unit ${key} is not prepared: ${why}` };
  }
  u.state = state;
  for (const k of ['route', 'reason', 'merge', 'output']) if (f[k] !== undefined) u[k] = f[k];
  // The yolo outcome's decision digest, kept for the as-built note (11.1).
  if (f.digest !== undefined) { try { u.digest = JSON.parse(f.digest); } catch { u.digest = f.digest; } }
  saveLedger(root, b, ledger);
  appendJournal(root, b, 'unit-state', { key, slug: u.slug, state, ...(f.route ? { route: f.route } : {}) });
  return { ok: true, key, state };
}

function outside(root, b, [key, state]) {
  const ledger = requireLedger(root, b);
  if (!ledger.outside[key]) throw new Error(`outside: ${key} is not a task, investigate or discover packet of this campaign`);
  if (!['closed', 'needs-you'].includes(state)) throw new Error('outside: the state is closed or needs-you');
  ledger.outside[key].state = state;
  saveLedger(root, b, ledger);
  return doReplan(root, b);
}

function wave(root, b, [nText, action, state], f) {
  const ledger = requireLedger(root, b);
  const n = Number(nText);
  const w = ledger.waves.find((x) => x.n === n);
  if (!w) throw new Error(`wave: no wave ${nText}`);
  if (action === 'start') {
    if (w.state !== 'planned') throw new Error(`wave ${n} is ${w.state}, not planned`);
    const lives = ledger.waves.filter((x) => ['running', 'boundary', 'handoff', 'shipping'].includes(x.state));
    const building = lives.find((x) => ['running', 'boundary'].includes(x.state));
    if (building) throw new Error(`wave ${building.n} is ${building.state}: a wave starts after the wave below merged its slugs into its branch`);
    // Stage D2: with stacked wave PRs, a wave may start on the wave branch below
    // while that wave waits in handoff or ship, up to max-unshipped (12.5).
    if (lives.length && !ledger.stack?.enabled) throw new Error(`wave ${lives[0].n} is ${lives[0].state}: without stacked PRs a wave starts after the previous wave merged`);
    const max = ledger.stack?.['max-unshipped'] ?? DEFAULT_MAX_UNSHIPPED;
    if (lives.length >= max) throw new Error(`${lives.length} unshipped waves wait above the trunk (max-unshipped ${max}): ship one first`);
    const ws = readWorkSet(root, b);
    const units = ws.error ? [] : unitsOf(ws);
    const prepared = new Set(w.units.filter((k) => ledger.units[k]?.state === 'prepared'));
    const { start, moved } = deferUnprepared(w.units, units, prepared);
    if (!start.length) return { ok: false, error: `no unit of wave ${n} is prepared`, moved };
    const trunk = waveBase(ledger, n, f.trunk ?? ledger.trunk ?? 'main');
    w.units = start;
    w.moved = [...(w.moved ?? []), ...moved];
    w.state = 'running';
    w.branch = `campaign/${b}/wave-${n}`;
    w.base = trunk;
    w['started-at'] = nowIso();
    for (const k of start) { ledger.units[k].state = 'prepared'; ledger.units[k].wave = n; }
    // The moved units go back to planning: they enter the earliest later wave their dependencies allow.
    if (moved.length) replan(ledger, units, { revision: ledger['work-revision'], now: nowIso() });
    saveLedger(root, b, ledger);
    appendJournal(root, b, 'wave-start', { wave: n, branch: w.branch, base: trunk, units: start, slugs: start.map((k) => ledger.units[k].slug), moved });
    return { ok: true, wave: n, branch: w.branch, base: trunk, units: start.map((k) => ({ key: k, slug: ledger.units[k].slug })), moved };
  }
  if (action === 'set') {
    if (!WAVE_STATES.includes(state)) throw new Error(`wave set: the state is one of ${WAVE_STATES.join(', ')}`);
    w.state = state;
    for (const k of ['pr', 'version', 'label']) if (f[k] !== undefined) w[k] = f[k];
    if (state === 'shipped') {
      w['shipped-at'] = nowIso();
      for (const k of w.units) if (ledger.units[k]?.state === 'merged') ledger.units[k].state = 'shipped';
    }
    saveLedger(root, b, ledger);
    appendJournal(root, b, state === 'shipped' ? 'wave-end' : 'wave-state', { wave: n, state, ...(f.pr ? { pr: f.pr } : {}), ...(f.version ? { version: f.version } : {}) });
    return { ok: true, wave: n, state };
  }
  throw new Error('wave: the action is start or set');
}

function ask(root, b, args, f) {
  const [id, ...text] = args;
  const ledger = requireLedger(root, b);
  if (ledger.questions.some((q) => q.id === id && !q['answered-at'])) throw new Error(`ask: question ${id} is open`);
  const q = { id, ...(f.wave ? { wave: Number(f.wave) } : {}), text: text.join(' '), 'asked-at': nowIso() };
  ledger.questions.push(q);
  saveLedger(root, b, ledger);
  appendJournal(root, b, 'asked', { id, wave: q.wave ?? null, text: q.text });
  return { ok: true, question: q };
}

function reply(root, b, [id, ...text]) {
  const ledger = requireLedger(root, b);
  const q = ledger.questions.find((x) => x.id === id && !x['answered-at']);
  if (!q) throw new Error(`reply: no open question ${id}`);
  q.answer = text.join(' ');
  q['answered-at'] = nowIso();
  saveLedger(root, b, ledger);
  return { ok: true, question: q };
}

function pause(root, b, [until, ...reason]) {
  if (!until || !Number.isFinite(Date.parse(until))) throw new Error('pause: give the reset time as an ISO 8601 timestamp');
  const ledger = requireLedger(root, b);
  ledger.pause = { reason: reason.join(' ') || 'usage limit', until: new Date(Date.parse(until)).toISOString(), at: nowIso() };
  saveLedger(root, b, ledger);
  writeAtomic(controlPath(root, b), `${JSON.stringify({ action: 'pause', scope: 'campaign', until: ledger.pause.until, reason: ledger.pause.reason, requestedAt: nowIso() }, null, 2)}\n`);
  appendJournal(root, b, 'paused', ledger.pause);
  return { ok: true, pause: ledger.pause };
}

function resume(root, b) {
  const ledger = requireLedger(root, b);
  ledger.pause = null;
  saveLedger(root, b, ledger);
  const ctl = readJson(controlPath(root, b));
  if (ctl && ctl.action === 'pause') writeAtomic(controlPath(root, b), '{}\n');
  appendJournal(root, b, 'resumed', {});
  return { ok: true, next: campaignAction(ledger, {}) };
}

function asBuiltNotes(root, b) {
  const dir = join(campDir(root, b), 'as-built');
  const out = {};
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const d = readJson(join(dir, f));
    if (d?.key) out[d.key] = { ...d, path: `../as-built/${f.replace(/\.json$/, '.md')}` };
  }
  return out;
}

function context(root, b, [key]) {
  const ledger = requireLedger(root, b);
  const ws = readWorkSet(root, b);
  if (ws.error) return { ok: false, error: ws.error };
  const units = unitsOf(ws);
  const u = units.find((x) => x.key === key);
  if (!u) throw new Error(`context: no packet ${key}`);
  const driftFile = join(campDir(root, b), 'drift', `${key}.json`);
  const drift = (readJson(driftFile)?.lines ?? []).filter((l) => l.class === 'implementation-detail');
  const wt = ledger.units[key]?.worktree;
  const iso = wt ? isolationOf(readJson(join(root, '.ai', 'sdlc-config.json')) ?? {}) : null;
  const isolation = wt && iso
    ? isolationText(iso, { index: wt.index, worktree: wt.path, slug: u.slug, lockCmd: `node "${join(PLUGIN_ROOT, 'skills', 'wf', 'scripts', 'campaign.mjs')}" lock "${root}" ${b}` })
    : null;
  const text = renderContext({ unit: u, units, ledger, asBuilt: asBuiltNotes(root, b), drift, isolation, localRecords: isLocal(ledger) });
  const file = join(campDir(root, b), 'context', `${u.slug}.md`);
  writeAtomic(file, text);
  return { ok: true, key, slug: u.slug, path: file };
}

function drift(root, b, [nText]) {
  const ledger = requireLedger(root, b);
  const n = Number(nText);
  const w = ledger.waves.find((x) => x.n === n);
  if (!w) throw new Error(`drift: no wave ${nText}`);
  const ws = readWorkSet(root, b);
  const units = ws.error ? [] : unitsOf(ws);
  const notes = asBuiltNotes(root, b);
  const results = w.units.map((k) => units.find((u) => u.key === k)).filter(Boolean).map((u) => classifyDrift(u, notes));
  const L = [`# Drift check before wave ${n}`, '', 'Each waiting slug\'s expects lines against the as-built notes of the slugs it names, after the refuter (11.2).', ''];
  for (const r of results) {
    writeAtomic(join(campDir(root, b), 'drift', `${r.key}.json`), `${JSON.stringify(r, null, 2)}\n`);
    L.push(`## ${r.key} — ${r.class}`, '');
    if (!r.lines.length) L.push('- No expects lines.');
    for (const l of r.lines) L.push(`- \`${l.from}/${l.key}\` (${l.text}): ${l.status} → **${l.class}**${l.note ? `. ${l.note}` : ''}`);
    L.push('');
  }
  const contract = results.filter((r) => r.class === 'contract').map((r) => r.key);
  // A contract difference stops that slug and every slug that depends on it (11.2).
  const stop = new Set(contract);
  let grew = true;
  while (grew) {
    grew = false;
    for (const u of units) if (!stop.has(u.key) && u.dependsOn.some((d) => stop.has(d)) && w.units.includes(u.key)) { stop.add(u.key); grew = true; }
  }
  L.push('## Result', '', contract.length ? `Contract differences: ${contract.join(', ')}. These slugs and their dependents wait for the person: ${[...stop].join(', ')}.` : 'No contract difference. The wave can start.', '');
  writeAtomic(join(campDir(root, b), 'drift', `wave-${n}.md`), L.join('\n'));
  appendJournal(root, b, 'drift', { wave: n, contract, stop: [...stop], implementation: results.filter((r) => r.class === 'implementation-detail').map((r) => r.key) });
  return { ok: true, wave: n, results: results.map((r) => ({ key: r.key, class: r.class })), stop: [...stop] };
}

function version(root, b, [kind], f) {
  const ledger = requireLedger(root, b);
  const tags = (git(root, ['tag', '--list']) ?? '').split(/\r?\n/).filter(Boolean);
  const stages = ledger['ship-plan']?.['rollout-stages'];
  const label = f.label ?? (Array.isArray(stages) && typeof stages[0] === 'string' && /^[a-z]+$/.test(stages[0]) ? stages[0] : 'beta');
  if (kind === 'wave') {
    const target = ledger.answers['target-version'];
    if (!target || target === 'none') return { ok: true, version: null, reason: 'no versioning (V6): the outputs keep their build labels' };
    return { ok: true, version: nextWaveVersion({ target, tags, label }) };
  }
  if (kind === 'hotfix') return { ok: true, version: hotfixVersion({ tags }), confirm: 'the person confirms the hotfix number (V3)' };
  throw new Error('version: wave or hotfix');
}

function label(root, b, [nText, slug]) {
  const ledger = requireLedger(root, b);
  const w = ledger.waves.find((x) => x.n === Number(nText));
  if (!w?.branch) throw new Error(`label: wave ${nText} has no branch yet`);
  const ref = slug ? `campaign/${b}/wave-${w.n}--${slug}` : w.branch;
  const sha = git(root, ['rev-parse', ref]) ?? git(root, ['rev-parse', 'HEAD']);
  return { ok: true, label: buildLabel({ wave: w.n, slug: slug ?? null, sha }) };
}

function journal(root, b, [event, json]) {
  let extra = {};
  if (json) { try { extra = JSON.parse(json); } catch { throw new Error('journal: the second argument is a JSON object'); } }
  return { ok: true, line: appendJournal(root, b, event, extra) };
}

function forecast(root, b, f) {
  const ledger = requireLedger(root, b);
  const ws = readWorkSet(root, b);
  const units = ws.error ? [] : unitsOf(ws);
  ledger['forecast-actual'] ??= [];
  if (f.wave) ledger['forecast-actual'].push({ wave: Number(f.wave), minutes: f.minutes ? Number(f.minutes) : null, tokens: f.tokens ? Number(f.tokens) : null });
  const history = forecastHistory(root);
  const slices = Object.fromEntries(units.filter(isBuildUnit).map((u) => [u.key, sliceCount(root, u.slug)]).filter(([, n]) => n));
  const fc = buildForecast({ units: units.filter((u) => !['merged', 'shipped'].includes(ledger.units[u.key]?.state)), history, slices });
  ledger.forecast = { minutes: fc.minutes, tokens: fc.tokens, unknown: fc.unknown, journals: history.journals };
  saveLedger(root, b, ledger);
  writeAtomic(join(campDir(root, b), 'forecast.md'), renderForecast(fc, { brainstorm: b, now: nowIso(), actual: ledger['forecast-actual'] }));
  return { ok: true, forecast: ledger.forecast };
}

export function main(argv = process.argv.slice(2)) {
  const [cmd, rootArg, b, ...rest] = argv;
  if (!cmd || !rootArg || !b) { process.stderr.write(`${USAGE}\n`); return 2; }
  const root = resolve(rootArg);
  const { pos, f } = flags(rest);
  let out;
  try {
    switch (cmd) {
      case 'orient': out = orient(root, b); break;
      case 'status': out = status(root, b); break;
      case 'replan': out = doReplan(root, b); break;
      case 'answer': out = answer(root, b, pos); break;
      case 'unit': out = unit(root, b, pos, f); break;
      case 'outside': out = outside(root, b, pos); break;
      case 'wave': out = wave(root, b, pos, f); break;
      case 'ask': out = ask(root, b, pos, f); break;
      case 'reply': out = reply(root, b, pos); break;
      case 'pause': out = pause(root, b, pos); break;
      case 'resume': out = resume(root, b); break;
      case 'context': out = context(root, b, pos); break;
      case 'drift': out = drift(root, b, pos); break;
      case 'version': out = version(root, b, pos, f); break;
      case 'label': out = label(root, b, pos); break;
      case 'journal': out = journal(root, b, pos); break;
      case 'forecast': out = forecast(root, b, f); break;
      case 'budget': out = budget(root, b); break;
      case 'worktree': out = worktree(root, b, pos); break;
      case 'lock': out = lock(root, b, pos); break;
      case 'stack': out = stack(root, b, pos); break;
      default: process.stderr.write(`${USAGE}\n`); return 2;
    }
  } catch (e) {
    out = { ok: false, error: e.message };
  }
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  return out.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
