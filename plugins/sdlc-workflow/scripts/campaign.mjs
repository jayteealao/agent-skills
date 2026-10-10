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
 *   lock     <root> <brainstorm> [quiet] <acquire|release> <slug>  the heavy-suite lock, or the quiet lease (C4)
 *   merge-in <root> <brainstorm> <key> <from>     merge a needed unit into a waiting unit (WF-CAMPAIGN-RUN-FIXES-PLAN N6)
 *   merge-order <root> <brainstorm> <n>           the boundary merge order from the merge-ins (C7)
 *   steer    <root> <brainstorm> <key|wave-<n>|all> <add|replace|remove|list> [--text t] [--match m] [--by who]   (C2)
 *   rule     <root> <brainstorm> <add|list|remove> [<id>] [--text t]   standing rules (C9)
 *   away     <root> <brainstorm> --words w [--until ISO]   |   back   |   recap [--since ISO]   (C3)
 *   decided  <root> <brainstorm> <id> --question q --answer a --why w [--options json] [--intent-bearing true] [--unit key]
 *
 * Every command prints one JSON object on stdout. The ledger (work/campaign/ledger.json)
 * is the truth; every write regenerates ledger.md beside it.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statfsSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  budgetState, buildForecast, buildLabel, campaignAction, DEFAULT_BUDGET, DEFAULT_MAX_UNSHIPPED, DEFAULT_WIDTH, effectiveWidth, isolationOf, isolationText,
  newestReading, portsFor, waveBase, checkCampaignSet, classifyDrift, deferUnprepared, hotfixVersion,
  isBuildUnit, newLedger, nextWaveVersion, renderContext, renderForecast, renderLedgerMd, replan, rowTokens,
  SETUP_ANSWERS, stageMinutesFromJournals, unitOf, UNIT_STATES, WAVE_STATES,
  boundaryMergeOrder, buildRecap, closeWaits, diskNeedGb, mergeInsReady, pathBudget, pluginUpdate, shortStamp, throughCovers, waveWaits,
} from '../lib/campaign.mjs';
import { ignoredAtRisk, loadManifest, recordsIn, recordsOut, recordsPending, saveManifest, withRecordsLock } from '../lib/campaign-records.mjs';
import { safeParseFrontmatter } from '../lib/frontmatter.mjs';
import { missingBoardFiles, needsPictures } from '../lib/design-boards.mjs';
import { designNeeded, designSettled } from '../lib/design-lane.mjs';

const USAGE = 'Usage: campaign.mjs <orient|status|replan|answer|unit|outside|wave|ask|reply|pause|resume|context|drift|version|label|journal|forecast|budget|worktree|lock|stack|merge-in|merge-order|steer|rule|away|back|decided|recap> <projectRoot> <brainstorm> ...';

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
  // C5, C6: on Windows, short paths outside the repo keep deep build paths under the limit.
  const iso = isolationOf(cfg);
  if (iso && process.platform === 'win32' && (!iso['outside-root'] || !iso['worktree-root'])) {
    check.warnings.push('Windows: ask the person at setup for short absolute paths in campaign.isolation: outside-root (the folders a unit needs outside its worktree, for example C:/co) and worktree-root (for example C:/cw). Without them, a drive keeps every build folder inside its worktree, and deep build paths can pass the 260-character limit.');
  }
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
 * The run stamp (the run time in base 36) keeps two runs apart. With
 * `campaign.isolation.worktree-root`, the worktrees live outside the repo (C6).
 */
const worktreeRoot = (root, ledger, iso = isolationOf(configOf(root))) => join(iso?.['worktree-root'] ?? join(root, '.scratch', 'cw'), shortStamp(ledger['run-id']));
/** C5: the root of the per-unit folders outside the worktree, or null. */
const outsideRoot = (root, ledger, iso = isolationOf(configOf(root))) => (iso?.['outside-root'] ? join(iso['outside-root'], shortStamp(ledger['run-id'])) : null);
/** C6: the path check runs on Windows; SDLC_CAMPAIGN_PATH_CHECK=1 turns it on elsewhere (tests). */
const pathCheckOn = () => process.platform === 'win32' || process.env.SDLC_CAMPAIGN_PATH_CHECK === '1';
/** The longest tracked path of the repo: a worktree checks out the same files. */
function longestTrackedPath(root) {
  const r = spawnSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8', windowsHide: true, maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) return 0;
  return r.stdout.split('\0').reduce((m, p) => Math.max(m, p.length), 0);
}

/**
 * C5: the size of a folder in GB, walked without following links, within a time
 * limit. `capped` is true when the walk stopped at the limit, so the size is a floor.
 */
function folderGb(dir, deadline) {
  let bytes = 0;
  let capped = false;
  const stack = [dir];
  while (stack.length) {
    if (Date.now() > deadline) { capped = true; break; }
    const d = stack.pop();
    let entries = [];
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = join(d, e.name);
      let st;
      try { st = lstatSync(p); } catch { continue; }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) stack.push(p);
      else bytes += st.size;
    }
  }
  return { gb: Math.round((bytes / 1024 ** 3) * 100) / 100, capped };
}

/** C5: every link (a junction or a symbolic link) under a folder; a recursive delete can follow one. */
function linksUnder(dir, limit = 20) {
  const found = [];
  const stack = [dir];
  while (stack.length && found.length < limit) {
    const d = stack.pop();
    let entries = [];
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = join(d, e.name);
      let st;
      try { st = lstatSync(p); } catch { continue; }
      if (st.isSymbolicLink()) found.push(relative(dir, p));
      else if (st.isDirectory()) stack.push(p);
    }
  }
  return found;
}
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
      // C5: measure the unit's build folders and outside folder for the disk estimate, before git deletes them.
      const wt = holder.worktree;
      let size = null;
      if (!w) {
        const deadline = Date.now() + 60_000;
        const dirs = [...(isolationOf(configOf(root))?.['build-dirs'] ?? []).map((d) => join(wt.path, d)), ...(wt.outside ? [wt.outside] : [])].filter((d) => existsSync(d));
        size = dirs.reduce((acc, d) => { const s = folderGb(d, deadline); return { gb: acc.gb + s.gb, capped: acc.capped || s.capped }; }, { gb: 0, capped: false });
      }
      const res = removeWorktree(root, b, ledger, key, wt.path);
      if (res.ok) {
        if (size && size.gb > 0) (ledger['disk-history'] ??= []).push({ key, gb: Math.round(size.gb * 100) / 100, capped: size.capped, at: nowIso() });
        if (wt.outside && existsSync(wt.outside)) {
          const links = linksUnder(wt.outside);
          if (links.length) res.outsideKept = { path: wt.outside, links, reason: 'the outside folder holds links, and a recursive delete can follow a link into the folder it points to. Ask the person.' };
          else { rmSync(wt.outside, { recursive: true, force: true }); res.outsideRemoved = wt.outside; }
        }
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
  const base = worktreeRoot(root, ledger, iso);
  const index = [...uw.units].sort((a, c) => (ledger.units[a].order ?? 0) - (ledger.units[c].order ?? 0)).indexOf(key);
  const branch = `campaign/${b}/wave-${uw.n}--${u.slug}`;
  const path = join(base, `w${uw.n}-${index + 1}`);
  // C6: on Windows, the deepest path a build can make must stay under the limit that the linker keeps.
  if (pathCheckOn()) {
    const pb = pathBudget({ worktree: path, longestTracked: longestTrackedPath(root), buildDepth: iso['build-depth'] });
    if (!pb.ok) return { ok: false, pathTooLong: pb, error: `the worktree path ${path} leaves too little room: ${pb.total} characters with the deepest build path, against the Windows limit of ${pb.limit}. Set campaign.isolation.worktree-root in .ai/sdlc-config.json to a short absolute path (for example C:/cw), then add again.` };
  }
  mkdirSync(base, { recursive: true });
  const freeGb = statfsSync(base).bavail * statfsSync(base).bsize / 1024 ** 3;
  // C5: the space for every unit of the wave that still needs a worktree, from the sizes of earlier units.
  const toStart = uw.units.filter((k) => !ledger.units[k]?.worktree && ['prepared', 'running'].includes(ledger.units[k]?.state)).length || 1;
  const need = diskNeedGb({ history: ledger['disk-history'] ?? [], toStart, minFreeGb: iso['min-free-gb'] });
  if (freeGb < need.needGb) {
    const why = need.from === 'history' ? `${toStart} unit(s) to start at up to ${need.perUnitGb} GB each (from earlier units), plus min-free-gb ${iso['min-free-gb']}` : `min-free-gb ${iso['min-free-gb']}`;
    return { ok: false, wait: true, freeGb: Math.round(freeGb * 10) / 10, need, error: `${freeGb.toFixed(1)} GB free, below the ${need.needGb} GB needed (${why}): wait until a merged slug's worktree is removed` };
  }
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
  // C5: the unit's own folder outside the worktree, for a second build folder or another commit's checkout.
  const outBase = outsideRoot(root, ledger, iso);
  if (outBase) {
    u.worktree.outside = join(outBase, `w${uw.n}-${index + 1}`);
    mkdirSync(u.worktree.outside, { recursive: true });
  }
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

const lockFileOf = (root, kind) => join(root, '.scratch', 'campaign', `${kind}.lock`);
/** A lock file whose holder is not `holder` and is younger than 3 hours, or null. */
function otherHolder(file, holder) {
  const cur = readJson(file);
  return cur && cur.holder !== holder && Date.now() - Date.parse(cur.at) < LOCK_STALE_MS ? cur : null;
}

/**
 * 13: the heavy-suite lock. One holder at a time; a lock older than 3 hours is stale.
 * C4: `lock quiet acquire|release <slug>` is the quiet lease. It waits until no other
 * unit holds the heavy lock, and while it is held, no other unit gets the heavy lock.
 */
function lock(root, b, args) {
  const quiet = args[0] === 'quiet';
  const [action, holder] = quiet ? args.slice(1) : args;
  if (!holder) throw new Error('lock: give the holder (the slug)');
  const file = lockFileOf(root, quiet ? 'quiet' : 'heavy');
  mkdirSync(join(file, '..'), { recursive: true });
  const cur = readJson(file);
  if (action === 'release') {
    if (!cur || cur.holder !== holder) return { ok: true, released: false, holder: cur?.holder ?? null };
    rmSync(file, { force: true });
    return { ok: true, released: true, ...(quiet ? { quiet: true } : {}) };
  }
  if (action !== 'acquire') throw new Error('lock: the action is acquire or release (lock quiet acquire|release for the quiet lease)');
  // C4: the two locks exclude each other across units.
  const blocker = otherHolder(lockFileOf(root, quiet ? 'heavy' : 'quiet'), holder);
  if (blocker) return { ok: true, acquired: false, holder: blocker.holder, since: blocker.at, ...(quiet ? { heavy: blocker.holder } : { quiet: blocker.holder }) };
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
  const mergeReady = ledger ? mergeInsReady(ledger, waitProgress(root, ledger)) : [];
  const update = pluginUpdate(runningPluginVersion(), installedPluginVersion(root));
  return {
    ok: true,
    next: campaignAction(ledger, { revision, mergeReady }),
    revision,
    // C9: the person's standing rules, in every status result, so that a compaction cannot lose them.
    rules: ledger?.rules ?? [],
    presence: ledger?.presence ?? { state: 'present' },
    ...(update ? { pluginUpdate: update } : {}),
    ledger: ledger ? {
      waves: ledger.waves.map((w) => ({ n: w.n, state: w.state, units: w.units, moved: w.moved })),
      waiting: ledger.waiting,
      pause: ledger.pause,
      units: Object.fromEntries(Object.entries(ledger.units).filter(([, u]) => u.wave && ledger.waves.find((x) => x.n === u.wave && x.state === 'running')).map(([k, u]) => [k, { state: u.state, route: u.route ?? null, openWaits: (u.waits ?? []).filter((x) => x.state === 'open').map((x) => ({ from: x.from, through: x.through, before: x.before })) }])),
    } : null,
  };
}

// ---------------------------------------------------------------- waits and merge-in (WF-CAMPAIGN-RUN-FIXES-PLAN 3.1)

/** The folder of a unit's workflow: in its worktree when it has one. */
const unitWorkflowDir = (root, u) => join(u.worktree?.path ?? root, '.ai', 'workflows', u.slug);

/**
 * How far a unit got: its slice list, the slices whose verify passed (`pass`, or
 * `partial` with a deferral), and whether the unit finished.
 */
export function unitProgress(root, u) {
  const dir = unitWorkflowDir(root, u);
  const index = existsSync(join(dir, '00-index.md')) ? safeParseFrontmatter(readFileSync(join(dir, '00-index.md'), 'utf8')).data ?? {} : {};
  const order = (Array.isArray(index.slices) ? index.slices : []).map((s) => (typeof s === 'string' ? s : s?.slug ?? s?.slice)).filter(Boolean);
  const passed = order.filter((s) => {
    const f = join(dir, `06-verify-${s}.md`);
    if (!existsSync(f)) return false;
    const fm = safeParseFrontmatter(readFileSync(f, 'utf8')).data ?? {};
    return ['pass', 'partial'].includes(String(fm.result ?? ''));
  });
  return { order, passed, finished: ['finished', 'merged', 'shipped'].includes(u.state) };
}

/** The progress of every unit that an open wait names. */
function waitProgress(root, ledger) {
  const from = new Set(Object.values(ledger.units).flatMap((u) => (u.waits ?? []).filter((w) => w.state === 'open').map((w) => w.from)));
  return Object.fromEntries([...from].filter((k) => ledger.units[k]).map((k) => [k, unitProgress(root, ledger.units[k])]));
}

const unitBranch = (b, u) => u.worktree?.branch ?? (u.wave ? `campaign/${b}/wave-${u.wave}--${u.slug}` : null);

/**
 * N6: merge the slug branch of `from` into the branch of `key`, while the drive of
 * `key` is stopped. On a conflict, the merge is aborted and the files are listed.
 */
function mergeIn(root, b, [key, from]) {
  const ledger = requireLedger(root, b);
  const u = ledger.units[key];
  const f = ledger.units[from];
  if (!u) throw new Error(`merge-in: ${key} is not a build unit of this campaign`);
  if (!f) throw new Error(`merge-in: ${from} is not a build unit of this campaign`);
  if (u.state === 'running') return { ok: false, error: `the drive of ${key} runs. Merge only while it is stopped (D5): wait for its wait stop, or stop it first.` };
  const open = (u.waits ?? []).filter((w) => w.state === 'open' && w.from === from);
  if (!open.length) return { ok: false, error: `${key} has no open wait on ${from}` };
  const p = unitProgress(root, f);
  const reached = p.finished ? 'finished' : [...p.passed].sort((x, y) => p.order.indexOf(y) - p.order.indexOf(x))[0];
  if (!reached || !open.some((w) => throughCovers(reached, w.through, p.order))) {
    return { ok: false, error: `${from} has not passed verify for what ${key} needs (${open.map((w) => w.through).join(', ')}); it reached ${reached ?? 'no passed slice'}` };
  }
  const fromBranch = unitBranch(b, f);
  if (!fromBranch || !commitOf(root, `refs/heads/${fromBranch}`)) return { ok: false, error: `the branch of ${from} (${fromBranch ?? 'unknown'}) does not exist` };
  let dir = u.worktree?.path ?? null;
  if (!dir) {
    const want = unitBranch(b, u);
    if (git(root, ['branch', '--show-current']) !== want) return { ok: false, error: `${key} has no worktree, and the main checkout is not on its branch ${want}. Check that branch out, or give the campaign an isolation contract.` };
    dir = root;
  }
  const dirty = spawnSync('git', ['-C', dir, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8', windowsHide: true });
  if (dirty.status !== 0 || dirty.stdout.trim()) return { ok: false, error: `the checkout of ${key} has uncommitted changes, so a merge could mix with them. Ask the person.`, dirty: dirty.stdout.trim().split(/\r?\n/).filter(Boolean) };
  // C7: rerere records the resolution of a conflict here, so the boundary replays it. The setting is in the repo's common config, which every worktree shares.
  spawnSync('git', ['-C', dir, 'config', 'rerere.enabled', 'true'], { windowsHide: true });
  const fromSha = commitOf(root, `refs/heads/${fromBranch}`);
  const m = spawnSync('git', ['-C', dir, 'merge', '--no-ff', '--no-edit', fromBranch], { encoding: 'utf8', windowsHide: true });
  if (m.status !== 0) {
    const files = (git(dir, ['diff', '--name-only', '--diff-filter=U']) ?? '').split(/\r?\n/).filter(Boolean);
    spawnSync('git', ['-C', dir, 'merge', '--abort'], { windowsHide: true });
    appendJournal(root, b, 'merge-in', { key, from, through: reached, result: 'conflict', files });
    return { ok: false, conflict: files, error: `merging ${from} into ${key} conflicts in ${files.length} file(s). The merge is aborted. Ask the person, or run the boundary's merge rules on this one merge (_boundary.md "Merge"), then run merge-in again.` };
  }
  const at = nowIso();
  const head = commitOf(dir, 'HEAD');
  (u['merged-in'] ??= []).push({ from, through: reached, sha: fromSha, merge: head, at });
  const closed = closeWaits(u.waits, { from, through: reached, order: p.order, at });
  if (u.state === 'waiting') { u.state = 'prepared'; u.route = null; }
  saveLedger(root, b, ledger);
  appendJournal(root, b, 'merge-in', { key, from, through: reached, sha: fromSha, merge: head, closed: closed.length });
  const ctx = context(root, b, [key]);
  return { ok: true, key, from, through: reached, merge: head, closed: closed.map((w) => `${w.from} through ${w.through}`), stillOpen: (u.waits ?? []).filter((w) => w.state === 'open').map((w) => `${w.from} through ${w.through}`), state: u.state, context: ctx.path ?? null, rerere: 'enabled' };
}

/** C4: the open quiet-window deferrals of a unit: timed checks that the boundary runs alone. */
function quietDeferrals(root, u) {
  const idx = join(unitWorkflowDir(root, u), '00-index.md');
  if (!existsSync(idx)) return [];
  const list = safeParseFrontmatter(readFileSync(idx, 'utf8')).data?.['runtime-evidence-deferrals'];
  return (Array.isArray(list) ? list : [])
    .filter((d) => d && d.kind === 'quiet-window' && !d['cleared-by'])
    .map((d) => ({ slice: d.slice ?? null, command: d['quiet-command'] ?? null, limit: d.limit ?? null, reason: d.reason ?? '' }));
}

/** C7: the boundary merge order of wave n, from each finished unit's merge-ins and branch tip. */
function mergeOrder(root, b, [nText]) {
  const ledger = requireLedger(root, b);
  const w = ledger.waves.find((x) => x.n === Number(nText));
  if (!w) throw new Error(`merge-order: no wave ${nText}`);
  const finished = w.units.filter((k) => ledger.units[k]?.state === 'finished');
  const units = finished.map((k) => {
    const u = ledger.units[k];
    const branch = unitBranch(b, u);
    return { key: k, slug: u.slug, branch, worktree: u.worktree?.path ?? null, tip: branch ? commitOf(root, `refs/heads/${branch}`) : null, mergedIn: (u['merged-in'] ?? []).map((m) => ({ from: m.from, sha: m.sha })), quiet: quietDeferrals(root, u) };
  });
  const { order, through } = boundaryMergeOrder(units);
  // `units` is the boundary driver's argument: the merge order first, then each carried unit with `through`.
  const boundaryUnits = [...order.map((k) => units.find((x) => x.key === k)), ...Object.entries(through).map(([k, by]) => ({ ...units.find((x) => x.key === k), through: by }))];
  return { ok: true, wave: w.n, order, through, units: boundaryUnits, carried: Object.entries(through).map(([k, by]) => ({ key: k, slug: ledger.units[k].slug, through: by })), quiet: units.filter((x) => x.quiet.length).map((x) => ({ key: x.key, checks: x.quiet.length })) };
}

// ---------------------------------------------------------------- the plugin version (3.8)

/** The version of the plugin that runs this script. */
function runningPluginVersion() {
  return readJson(join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'))?.version ?? readJson(join(PLUGIN_ROOT, 'package.json'))?.version ?? null;
}

/** The newest installed sdlc-workflow for this project, from Claude Code's install record. */
function installedPluginVersion(root) {
  const file = process.env.SDLC_INSTALLED_PLUGINS || join(homedir(), '.claude', 'plugins', 'installed_plugins.json');
  const rec = readJson(file);
  const plugins = rec?.plugins ?? {};
  let best = null;
  for (const [name, entries] of Object.entries(plugins)) {
    if (!/^sdlc-workflow@/.test(name) || !Array.isArray(entries)) continue;
    for (const e of entries) {
      if (e?.scope !== 'user' && !(e?.projectPath && resolve(e.projectPath) === resolve(root))) continue;
      if (e?.version && (!best || pluginUpdate(best, e.version))) best = e.version;
    }
  }
  return best;
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
  // N5: `unit <key> waiting --on <from>:<through>` records what the drive waits for.
  if (state === 'waiting') u.route = `waits for ${f.on ?? (u.waits ?? []).filter((w) => w.state === 'open').map((w) => `${w.from}: ${w.through}`).join(', ')}`;
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
    // C8: the plugin version that runs this wave, for the retro.
    w['plugin-version'] = runningPluginVersion();
    for (const k of start) { ledger.units[k].state = 'prepared'; ledger.units[k].wave = n; }
    // N3: the needs on another unit of this wave become open waits.
    const waits = waveWaits(units, start);
    for (const k of start) {
      if (waits[k]) ledger.units[k].waits = waits[k];
      else delete ledger.units[k].waits;
      ledger.units[k]['merged-in'] = [];
    }
    // The moved units go back to planning: they enter the earliest later wave their dependencies allow.
    if (moved.length) replan(ledger, units, { revision: ledger['work-revision'], now: nowIso() });
    saveLedger(root, b, ledger);
    appendJournal(root, b, 'wave-start', { wave: n, branch: w.branch, base: trunk, units: start, slugs: start.map((k) => ledger.units[k].slug), moved, ...(Object.keys(waits).length ? { waits } : {}) });
    return { ok: true, wave: n, branch: w.branch, base: trunk, units: start.map((k) => ({ key: k, slug: ledger.units[k].slug, ...(waits[k] ? { waits: waits[k].map((x) => `${x.from} through ${x.through} before ${x.before ?? 'the first slice'}`) } : {}) })), moved };
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
    ? isolationText(iso, { index: wt.index, worktree: wt.path, slug: u.slug, outside: wt.outside ?? null, lockCmd: `node "${join(PLUGIN_ROOT, 'skills', 'wf', 'scripts', 'campaign.mjs')}" lock "${root}" ${b}` })
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

// ---------------------------------------------------------------- steering (WF-CAMPAIGN-RUN-FIXES-PLAN 3.2)

const STEER_HEAD = '# Standing steering\n';
export const campaignSteerPath = (root, b) => join(campDir(root, b), 'steer.md');

/** The files that a steer target names: each unit's steer.md in the main checkout and in its worktree, or the campaign file. */
function steerFiles(root, b, ledger, target) {
  if (target === 'all') return [{ target: 'campaign', path: campaignSteerPath(root, b) }];
  const waveN = /^wave-(\d+)$/.exec(target ?? '')?.[1];
  const keys = waveN ? (ledger.waves.find((x) => x.n === Number(waveN))?.units ?? null) : [target];
  if (!keys) throw new Error(`steer: no wave ${waveN}`);
  const files = [];
  for (const k of keys) {
    const u = ledger.units[k];
    if (!u) throw new Error(`steer: ${k} is not a build unit of this campaign; the target is a packet key, wave-<n>, or all`);
    files.push({ target: k, path: join(root, '.ai', 'workflows', u.slug, 'steer.md') });
    if (u.worktree?.path) files.push({ target: k, path: join(u.worktree.path, '.ai', 'workflows', u.slug, 'steer.md') });
  }
  return files;
}

/** The top-level entries of a steer file: each `- ` line with the indented lines under it. */
function steerEntries(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const entries = [];
  let cur = null;
  lines.forEach((l, i) => {
    if (/^- /.test(l)) { cur = { start: i, end: i, text: l }; entries.push(cur); }
    else if (cur && (/^\s+\S/.test(l) || (l === '' && /^\s+\S/.test(lines[i + 1] ?? '')))) { cur.end = i; cur.text += `\n${l}`; }
    else cur = null;
  });
  return { lines, entries };
}

/**
 * C2: `steer <key|wave-<n>|all> add|replace|remove|list`. The script stamps the time
 * (D2). Every copy must agree before anything is written: a `--match` that finds
 * zero entries, or more than one, in any copy is an error.
 */
function steer(root, b, [target, action], f) {
  const ledger = requireLedger(root, b);
  if (!target) throw new Error('steer: give the target: a packet key, wave-<n>, or all');
  const files = steerFiles(root, b, ledger, target);
  const by = f.by ?? 'the person';
  const at = nowIso();
  const entry = (text) => `- ${String(text).trim()} (${by}, ${at})`;
  const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : STEER_HEAD);
  if (action === 'list') {
    const copies = files.map((x) => ({ ...x, exists: existsSync(x.path), entries: steerEntries(read(x.path)).entries.map((e) => e.text) }));
    const differs = [];
    for (const c of copies) {
      const main = copies.find((x) => x.target === c.target);
      if (c !== main && JSON.stringify(c.entries) !== JSON.stringify(main.entries)) differs.push(c.path);
    }
    return { ok: true, copies, differs };
  }
  if (!['add', 'replace', 'remove'].includes(action)) throw new Error('steer: the action is add, replace, remove or list');
  if (action !== 'remove' && !String(f.text ?? '').trim()) throw new Error(`steer ${action}: give --text "<the entry>"`);
  if (action !== 'add' && !String(f.match ?? '').trim()) throw new Error(`steer ${action}: give --match "<text of the entry>"`);
  const plans = files.map((x) => {
    const text = read(x.path);
    if (action === 'add') return { ...x, next: `${text.replace(/\s*$/, '')}\n\n${entry(f.text)}\n` };
    const { lines, entries } = steerEntries(text);
    const hits = entries.filter((e) => e.text.toLowerCase().includes(String(f.match).toLowerCase()));
    if (hits.length !== 1) return { ...x, error: `${hits.length} entries match "${f.match}" in ${x.path}` };
    const h = hits[0];
    const repl = action === 'replace' ? [entry(f.text)] : [];
    return { ...x, next: [...lines.slice(0, h.start), ...repl, ...lines.slice(h.end + 1)].join('\n').replace(/\n{3,}/g, '\n\n') };
  });
  const bad = plans.filter((x) => x.error);
  if (bad.length) return { ok: false, error: `steer ${action}: nothing written. ${bad.map((x) => x.error).join('; ')}` };
  for (const x of plans) writeAtomic(x.path, x.next);
  appendJournal(root, b, 'steer', { target, action, by, files: plans.length });
  return { ok: true, target, action, at, written: plans.map((x) => x.path) };
}

// ---------------------------------------------------------------- standing rules (3.9)

/** C9: `rule add --text`, `rule list`, `rule remove <id>`. The rules live in the ledger, and status prints them. */
function rule(root, b, [action, id], f) {
  const ledger = requireLedger(root, b);
  ledger.rules ??= [];
  if (action === 'list') return { ok: true, rules: ledger.rules };
  if (action === 'add') {
    if (!String(f.text ?? '').trim()) throw new Error('rule add: give --text "<the rule>"');
    const n = ledger.rules.reduce((m, r) => Math.max(m, Number(String(r.id).replace(/^R/, '')) || 0), 0) + 1;
    const r = { id: `R${n}`, text: String(f.text).trim(), by: f.by ?? 'the person', at: nowIso() };
    ledger.rules.push(r);
    saveLedger(root, b, ledger);
    appendJournal(root, b, 'rule', { action, id: r.id });
    return { ok: true, rule: r, rules: ledger.rules };
  }
  if (action === 'remove') {
    const i = ledger.rules.findIndex((r) => r.id === id);
    if (i < 0) throw new Error(`rule remove: no rule ${id}`);
    const [r] = ledger.rules.splice(i, 1);
    saveLedger(root, b, ledger);
    appendJournal(root, b, 'rule', { action, id });
    return { ok: true, removed: r, rules: ledger.rules };
  }
  throw new Error('rule: the action is add, list or remove');
}

// ---------------------------------------------------------------- away mode and the recap (3.3)

/** D3: what away mode never does. The script prints it with every away and decided. */
export const AWAY_LIMITS = Object.freeze([
  'Never push, open a PR, merge into the trunk, tag, release or delete anything.',
  'Never answer a question of the classes shared-env, external-party or irreversible: these wait for the person.',
  'Answer an intent-bearing stop only when the person\'s away words cover escalations (D4); record it with decided --intent-bearing true.',
]);

function away(root, b, f) {
  const ledger = requireLedger(root, b);
  if (!String(f.words ?? '').trim()) throw new Error('away: give --words "<the person\'s words>"');
  if (f.until && !Number.isFinite(Date.parse(f.until))) throw new Error('away: --until is an ISO 8601 time');
  ledger.presence = { state: 'away', since: nowIso(), words: String(f.words).trim(), ...(f.until ? { until: new Date(Date.parse(f.until)).toISOString() } : {}) };
  saveLedger(root, b, ledger);
  appendJournal(root, b, 'away', { words: ledger.presence.words });
  return { ok: true, presence: ledger.presence, limits: AWAY_LIMITS };
}

const decidedPath = (root, b) => join(campDir(root, b), 'decided-for-you.md');

function decided(root, b, [id], f) {
  const ledger = requireLedger(root, b);
  if (!id) throw new Error('decided: give an id');
  for (const k of ['question', 'answer', 'why']) if (!String(f[k] ?? '').trim()) throw new Error(`decided: give --${k}`);
  let options = null;
  if (f.options) { try { options = JSON.parse(f.options); } catch { options = f.options; } }
  const d = {
    id, at: nowIso(), question: f.question, ...(options ? { options } : {}), answer: f.answer, why: f.why,
    ...(f['intent-bearing'] === 'true' ? { 'intent-bearing': true } : {}),
    ...(f.unit ? { unit: f.unit } : {}),
    presence: ledger.presence?.state ?? 'present',
  };
  (ledger.decided ??= []).push(d);
  saveLedger(root, b, ledger);
  const file = decidedPath(root, b);
  const head = existsSync(file) ? '' : `# Decided for the person: ${b}\n\nThe campaign took these decisions while the person was away. Each one names the question, the answer, and why. The recap lists the intent-bearing ones first.\n`;
  const opts = Array.isArray(options) ? options.map((o) => (typeof o === 'string' ? o : o?.label ?? JSON.stringify(o))).join('; ') : (options ?? '');
  appendFileSync(file, `${head}\n## ${id} — ${d.at}${d['intent-bearing'] ? ' — intent-bearing' : ''}\n\n- Question: ${d.question}\n${opts ? `- Options: ${opts}\n` : ''}- Answer: ${d.answer}\n- Why: ${d.why}\n${d.unit ? `- Unit: ${d.unit}\n` : ''}`);
  appendJournal(root, b, 'decided', { id, ...(d['intent-bearing'] ? { 'intent-bearing': true } : {}) });
  return { ok: true, decided: d, path: file, limits: AWAY_LIMITS };
}

function recapOf(root, ledger, since) {
  const journals = {};
  for (const [k, u] of Object.entries(ledger.units)) {
    const j = readJsonl(join(unitWorkflowDir(root, u), '.driver-journal.jsonl'));
    if (j.length) journals[k] = j;
  }
  return buildRecap({ ledger, since, journals, campaign: readJsonl(journalPath(root, ledger.brainstorm)), now: nowIso() });
}

function recap(root, b, f) {
  const ledger = requireLedger(root, b);
  if (f.since && !Number.isFinite(Date.parse(f.since))) throw new Error('recap: --since is an ISO 8601 time');
  // The default is the start of the current away, or of the last one.
  const since = f.since ? new Date(Date.parse(f.since)).toISOString().replace(/\.\d{3}Z$/, 'Z') : (ledger.presence?.state === 'away' ? ledger.presence.since : ledger.presence?.['last-away'] ?? null);
  return { ok: true, recap: recapOf(root, ledger, since) };
}

function back(root, b) {
  const ledger = requireLedger(root, b);
  const since = ledger.presence?.state === 'away' ? ledger.presence.since : null;
  ledger.presence = { state: 'present', since: nowIso(), ...(since ? { 'last-away': since } : {}) };
  saveLedger(root, b, ledger);
  appendJournal(root, b, 'back', {});
  return { ok: true, presence: ledger.presence, recap: recapOf(root, ledger, since) };
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
      case 'merge-in': out = mergeIn(root, b, pos); break;
      case 'merge-order': out = mergeOrder(root, b, pos); break;
      case 'steer': out = steer(root, b, pos, f); break;
      case 'rule': out = rule(root, b, pos, f); break;
      case 'away': out = away(root, b, f); break;
      case 'back': out = back(root, b); break;
      case 'decided': out = decided(root, b, pos, f); break;
      case 'recap': out = recap(root, b, f); break;
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
