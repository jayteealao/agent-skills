#!/usr/bin/env node
/**
 * scripts/campaign.mjs — the disk side of /wf campaign (WF-CAMPAIGN-PLAN, Stage C).
 * Bundled to dist/campaign.mjs; skills/wf/scripts/campaign.mjs runs the bundle.
 *
 *   orient   <root> <brainstorm>                 Phase 0: check, the graph seed, forecast, ledger (9.1); next is deps
 *   status   <root> <brainstorm>                 the next action (section 6) and the ledger summary
 *   replan   <root> <brainstorm>                 re-read the packets; re-plan the waves not started (15)
 *   answer   <root> <brainstorm> <key> <json>    record a setup answer (9.2)
 *   unit     <root> <brainstorm> <key> <state> [--route r] [--reason r] [--merge sha] [--output path] [--digest json]
 *   unit     <root> <brainstorm> <ext key> absorb [--into <target>] | defer   place an extension unit of a started wave (WF-CAMPAIGN-SLICE-ORDER-PLAN 5.4)
 *   outside  <root> <brainstorm> <key> <closed|needs-you>
 *   wave     <root> <brainstorm> <n> start [--trunk main]       start a wave (9.4 step 2; 9.3 step 6)
 *   wave     <root> <brainstorm> <n> set <state> [--pr url] [--version v] [--label l]
 *   wave     <root> <brainstorm> <n> launch [--stop-before boundary]   the args of the wave driver (WF-CAMPAIGN-DRIVER-PLAN 5.1)
 *   wave     <root> <brainstorm> <n> record --outcome <file>         the wave driver's outcome into the ledger (5.11)
 *   wave     <root> <brainstorm> <n> sorted                          the person sorted the legacy waits (WF-CAMPAIGN-SLICE-ORDER-PLAN 5.3)
 *   ask      <root> <brainstorm> <id> [--wave n] [--unit k --kind k --stage s --slice s] <text...>   record a question (16.4)
 *   reply    <root> <brainstorm> <id> [--by person|session] [--move] <answer...>   record the answer
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
 *   merge-in <root> <brainstorm> <key> <from> [--at sha]   merge a needed unit, or one cleared commit of it, into a waiting unit (N6, D21)
 *   merge-order <root> <brainstorm> <n>           the boundary merge order from the merge-ins (C7)
 *   steer    <root> <brainstorm> <key|wave-<n>|all> <add|replace|remove|list> [--text t] [--match m] [--by who]   (C2)
 *   rule     <root> <brainstorm> <add|list|remove> [<id>] [--text t]   standing rules (C9)
 *   away     <root> <brainstorm> --words w [--until ISO]   |   back   |   recap [--since ISO]   (C3)
 *   decided  <root> <brainstorm> <id> --question q --answer a --why w [--options json] [--intent-bearing true] [--unit key]
 *   slice-done <root> <brainstorm> <key> <slice> [--final] [--run id]   the records commit, cleared, waits ready (5.6a)
 *   slice-done <root> <brainstorm> <key> <slice> --verified   the slice passed verify: its waits are ready (WF-CAMPAIGN-THROUGHPUT-PLAN T7)
 *   schedule <root> <brainstorm> <n> [--width w] [--machine-width w]   simulate wave n: critical path, slot bound, idle slots (section 3 step 8)
 *   locks    <root> <brainstorm> wait [--max seconds]   wait until no lock of campaign.isolation.locks is held (T9)
 *   needs    <root> <brainstorm> <key> add|list|remove [--from k --through s --before s --why w --by who --source s --kind need|merge --evidence e]   (5.7)
 *   contract <root> <brainstorm> <key> amend --line <line key> --text t   (5.5, kind contract)
 *   await    <root> <brainstorm> --wave n [--max seconds] [--seen id,id] | --cancel   the waiter of the wave driver (5.5a)
 *   question <root> <brainstorm> <id> consumed
 *   deps     <root> <brainstorm> show|plan|confirm   the dependency graph: show it, check and plan it, confirm it (WF-CAMPAIGN-ORDER-PLAN 4.4)
 *   deps     <root> <brainstorm> <key> depends-on add|remove <from> --why w [--by who] [--kind need|sequence --evidence e]   |   depends-on kind <from> --kind need|sequence --why w [--evidence e]   |   needs add|remove --from k [--through s --before s] --why w
 *            |   provides set|remove --line k [--text t]   |   expects set|remove --from k --line k [--text t]   |   paths --set p1,p2   (4.6)
 *   owner    <root> <slug>                       the live wave run that drives a slug (5.13)
 *   slice-order <checkout> <slug> add --slice s --after t [--why w]   a plan's order as a depends-on edge (WF-CAMPAIGN-SLICE-ORDER-PLAN 4.4)
 *
 * Every command prints one JSON object on stdout. The ledger (work/campaign/ledger.json)
 * is the truth; every write regenerates ledger.md beside it.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statfsSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  budgetState, buildForecast, buildLabel, campaignAction, DEFAULT_BUDGET, DEFAULT_MAX_UNSHIPPED, DEFAULT_WIDTH, effectiveWidth, isolationOf, isolationText,
  newestReading, portsFor, waveBase, checkCampaignSet, classifyDrift, deferUnprepared, hotfixVersion,
  isBuildUnit, newLedger, nextWaveVersion, renderContext, renderForecast, renderLedgerMd, replan, rowTokens,
  SETUP_ANSWERS, stageMinutesFromJournals, unitOf, UNIT_STATES, WAVE_STATES,
  boundaryMergeOrder, buildRecap, clearedCover, closeWaits, diskNeedGb, pathBudget, pluginUpdate, repoTag, runLive, sameNeed, shortStamp, sliceCycle, throughCovers, waitPending, waveWaits,
  DEPS_BY, ensureDeps, hasGraphFields, migrateDeps, seedDeps, serialWaves, sharedPaths, startedKeys, startEntry, syncDepsState, unconfirmedKeys,
  absorbedBy, addMergeNote, dropRecordOf, extensionWaveErrors, legacyWaits, migrateOrder, needsSort, ownsSlice, PAIR_KINDS, syncAbsorbed, targetOf,
  conventionsOn, EDGE_KINDS, edgeKind, nextWaveAsk, OPTIONAL_ANSWERS, scheduleOf, stageMinutesFromJournals as stageMedians, unclassifiedEdges, waveReady,
} from '../lib/campaign.mjs';
import { closesCycle, editRosterEntry, frontmatterValue, rosterEntries, rosterWalkOrder, setFrontmatterValue } from '../lib/roster-edit.mjs';
import { ignoredAtRisk, loadManifest, recordsIn, recordsOut, recordsPending, saveManifest, withRecordsLock } from '../lib/campaign-records.mjs';
import { sdlcHomeDir } from '../lib/registry.mjs';
import { safeParseFrontmatter } from '../lib/frontmatter.mjs';
import { missingBoardFiles, needsPictures } from '../lib/design-boards.mjs';
import { designNeeded, designSettled } from '../lib/design-lane.mjs';

const USAGE = 'Usage: campaign.mjs <orient|status|replan|answer|unit|outside|wave|ask|reply|pause|resume|context|drift|version|label|journal|forecast|budget|worktree|lock|locks|stack|merge-in|merge-order|steer|rule|away|back|decided|recap|slice-done|needs|contract|await|question|deps|owner|slice-order|schedule> <projectRoot> <brainstorm> ...';

// scripts/ and dist/ both sit one level under the plugin root.
const PLUGIN_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const brainstormDir = (root, b) => join(root, '.ai', 'workflows', b);
const workDir = (root, b) => join(brainstormDir(root, b), 'work');
const campDir = (root, b) => join(workDir(root, b), 'campaign');
const ledgerPath = (root, b) => join(campDir(root, b), 'ledger.json');
export const journalPath = (root, b) => join(campDir(root, b), '.campaign-journal.jsonl');
export const controlPath = (root, b) => join(campDir(root, b), '.control.json');

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

const sleepMs = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * D20: a rename over a file that another process reads fails on Windows with EPERM
 * or EBUSY for a moment. The write tries again, up to 20 times in 2 seconds.
 */
function writeAtomic(file, text) {
  mkdirSync(join(file, '..'), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  for (let i = 0; ; i++) {
    try { renameSync(tmp, file); return; } catch (e) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code) || i >= 19) { rmSync(tmp, { force: true }); throw e; }
      sleepMs(100);
    }
  }
}

/**
 * D20: every command that changes the ledger holds this lock while it reads,
 * changes and writes the ledger, so the session and the wave driver's agents
 * never overwrite each other's changes. The lock names its process: a lock of a
 * process that is gone is taken over at once.
 */
const ledgerLockPath = (root, b) => join(campDir(root, b), 'ledger.lock');
const LEDGER_COMMANDS = new Set(['orient', 'replan', 'answer', 'unit', 'outside', 'wave', 'ask', 'reply', 'pause', 'resume', 'forecast', 'worktree', 'stack', 'merge-in', 'rule', 'away', 'back', 'decided', 'slice-done', 'needs', 'contract', 'question', 'deps']);

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

/**
 * The campaign units of a work set: the single seam of every reader of the graph
 * (WF-CAMPAIGN-ORDER-PLAN 4.3). Each packet's frontmatter, with the four graph fields
 * from its entry in the ledger `deps`. A packet with no entry yet gets its starting
 * entry (the old fields, or the serial chain). A dependency on a written piece is done.
 */
const unitsOf = (ws, ledger) => ws.packets.map((p) => unitOf(p, { written: ws.written, deps: ledger?.deps?.units?.[p.key] ?? startEntry(p, ws.packets) }));

function loadLedger(root, b) {
  const p = ledgerPath(root, b);
  if (!existsSync(p)) return null;
  const ledger = JSON.parse(readFileSync(p, 'utf8'));
  // 4.8 step 2: a ledger of the old form gets its graph from the packets on first load.
  if (!ledger.deps) {
    const ws = readWorkSet(root, b);
    if (!ws.error) migrateDeps(ledger, ws.packets, nowIso());
  }
  // WF-CAMPAIGN-SLICE-ORDER-PLAN 5.2: a ledger below version 2 marks its driver waits `legacy`.
  migrateOrder(ledger);
  return ledger;
}

function saveLedger(root, b, ledger) {
  syncDepsState(ledger, nowIso());
  syncAbsorbed(ledger);
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

/** Flags that take no value: `reply --move`, `slice-done --final`, `await --cancel`. */
const BOOLEAN_FLAGS = new Set(['move', 'final', 'cancel', 'verified', 'refresh']);

function flags(args) {
  const pos = [];
  const f = {};
  for (let i = 0; i < args.length; i++) {
    const name = args[i].startsWith('--') ? args[i].slice(2) : null;
    if (name && BOOLEAN_FLAGS.has(name)) f[name] = true;
    else if (name) { f[name] = args[i + 1]; i++; } else pos.push(args[i]);
  }
  return { pos, f };
}

// ---------------------------------------------------------------- commands

function orient(root, b) {
  if (loadLedger(root, b)) return { ok: false, error: 'a ledger exists: use status (the campaign infers its phase from the ledger)' };
  const ws = readWorkSet(root, b);
  if (ws.error) return { ok: false, error: ws.error };
  // 4.4 step 1: the graph starts as the old packet fields (seed) or the serial chain.
  const deps = seedDeps(ws.packets);
  const units = unitsOf(ws, { deps });
  // The graph errors wait for the deps phase, where the person fixes them in this
  // session. The errors of the work set itself (two packets on one slug, too many
  // carried decisions) need the brainstorm.
  const check = checkCampaignSet(units.map((u) => ({ ...u, dependsOn: [], needs: [], expects: [] })));
  if (check.single) {
    const only = units.find(isBuildUnit);
    return { ok: false, single: true, error: 'the work set has one build packet: that is not a campaign.', start: only ? `/wf intake .ai/workflows/${b}/${only.file}` : null };
  }
  if (check.errors.length) return { ok: false, errors: check.errors, warnings: check.warnings };
  // 9.1 step 4: a branch carries .ai/ only when the repo tracks it. When the repo
  // does not, the records stay in the main checkout (local records, 13).
  const cfg = readJson(join(root, '.ai', 'sdlc-config.json')) ?? {};
  const ignored = cfg.artifactTracking === 'ignored' || git(root, ['check-ignore', '-q', '.ai/workflows']) !== null;
  const ledger = newLedger({ brainstorm: b, revision: ws.revision, units, now: nowIso(), deps });
  ledger.records = ignored ? 'local' : 'tracked';
  if (ignored) check.warnings.push('the repo does not track .ai/: the records stay in the main checkout. Each worktree gets a copy, and its changes come back before the worktree is removed (local records). The wave PR text and the code are still public.');
  // C5, C6: on Windows, short paths outside the repo keep deep build paths under the limit.
  const iso = isolationOf(cfg);
  // D19: the wave driver runs every unit in its own worktree, so a campaign needs a contract before wave 1.
  if (!iso) ledger['tool-gaps'].push({ tool: 'isolation', have: 'none', need: 'campaign.isolation in .ai/sdlc-config.json', fix: 'ask the person for the isolation contract (campaign/_phases.md, "Width")' });
  if (iso && process.platform === 'win32' && !iso['outside-root']) {
    check.warnings.push('Windows: ask the person at setup for a short absolute path in campaign.isolation.outside-root (the folders a unit needs outside its worktree, for example C:/co). Without it, a drive keeps every build folder inside its worktree, and deep build paths can pass the 260-character limit. The worktrees default to ~/.sdlc/cw; when worktree add reports a path that is too long, ask for a shorter worktree-root (for example C:/cw).');
  }
  ledger['ship-plan'] = shipPlan(root);
  ledger.trunk = trunkOf(root);
  ledger['run-id'] = `${nowIso().replace(/[-:]/g, '').replace(/\.\d+/, '')}-${b}`;
  if (ledger['ship-plan'] === null || ledger['ship-plan']['version-scheme'] === 'none') ledger.answers['target-version'] = 'none';
  // Handoff and ship both stop without a ship plan, so name the gap before wave 1, not at its PR.
  if (ledger['ship-plan'] === null) ledger['tool-gaps'].push({ tool: 'ship-plan', have: 'none', need: '.ai/ship-plan.md', fix: '/wf project ship-plan init' });
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
  appendJournal(root, b, 'campaign-orient', { revision: ws.revision, waves: 0 });
  const seeded = new Set(ws.packets.filter(hasGraphFields).map((p) => p.key));
  const keys = Object.keys(deps.units);
  return {
    ok: true, records: ledger.records, waves: [], outside: Object.keys(ledger.outside), warnings: check.warnings, forecast: ledger.forecast, toolGaps: ledger['tool-gaps'],
    // 4.4: the deps phase comes next. `seeded` units start from their old packet fields (D8), `serial` units from the serial chain.
    deps: { state: ledger.deps.state, units: keys, seeded: keys.filter((k) => seeded.has(k)), serial: keys.filter((k) => !seeded.has(k)) },
    next: campaignAction(ledger, { revision: ws.revision }),
  };
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
 * The run stamp (the run time in base 36) keeps two runs apart. The worktrees
 * live outside the repo: in `campaign.isolation.worktree-root` (C6), or by
 * default in `~/.sdlc/cw/<repo tag>` (SDLC_HOME moves it).
 */
const defaultWorktreeBase = (root) => join(sdlcHomeDir(), 'cw', repoTag(resolve(root)));
const worktreeRoot = (root, ledger, iso = isolationOf(configOf(root))) => join(iso?.['worktree-root'] ?? defaultWorktreeBase(root), shortStamp(ledger['run-id']));
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

/**
 * W0a: the holder of a lock is gone when its drive ended. The process that ran
 * `lock acquire` ends at once, so its pid says nothing; the drive's state does.
 * A holder is gone when its unit is in a state that a drive ends in, or when its
 * driver journal ends with `run-end` after the lock was taken.
 */
const DRIVE_ENDED = new Set(['stopped', 'finished', 'merged', 'needs-fix', 'shipped']);
function holderGone(root, b, cur) {
  const ledger = loadLedger(root, b);
  const u = ledger ? Object.values(ledger.units ?? {}).find((x) => x.slug === cur.holder) : null;
  if (!u) return false;
  if (DRIVE_ENDED.has(u.state)) return true;
  const last = readJsonl(join(unitWorkflowDir(root, u), '.driver-journal.jsonl')).at(-1);
  return last?.event === 'run-end' && String(last.at ?? '') > String(cur.at ?? '');
}

/** A lock file whose holder is not `holder`, is younger than 3 hours, and whose drive still runs; or null. */
function otherHolder(root, b, file, holder) {
  const cur = readJson(file);
  return cur && cur.holder !== holder && Date.now() - Date.parse(cur.at) < LOCK_STALE_MS && !holderGone(root, b, cur) ? cur : null;
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
  const blocker = otherHolder(root, b, lockFileOf(root, quiet ? 'heavy' : 'quiet'), holder);
  if (blocker) return { ok: true, acquired: false, holder: blocker.holder, since: blocker.at, ...(quiet ? { heavy: blocker.holder } : { quiet: blocker.holder }) };
  if (otherHolder(root, b, file, holder)) return { ok: true, acquired: false, holder: cur.holder, since: cur.at };
  const takenOver = cur && cur.holder !== holder ? cur.holder : null;
  if (!cur || cur.holder !== holder) {
    try {
      writeFileSync(file, JSON.stringify({ holder, at: nowIso() }), { flag: cur ? 'w' : 'wx' });
    } catch {
      const now = readJson(file);
      return { ok: true, acquired: false, holder: now?.holder ?? null, since: now?.at ?? null };
    }
  }
  return { ok: true, acquired: true, holder, ...(takenOver ? { takenOver } : {}) };
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
  // D25: a live wave run drives its units; the session must not launch it again.
  const driving = ledger ? liveRun(root, b, ledger) : null;
  const update = pluginUpdate(runningPluginVersion(), installedPluginVersion(root));
  return {
    ok: true,
    next: campaignAction(ledger, { revision, driving }),
    revision,
    // C9: the person's standing rules, in every status result, so that a compaction cannot lose them.
    rules: ledger?.rules ?? [],
    presence: ledger?.presence ?? { state: 'present' },
    ...(update ? { pluginUpdate: update } : {}),
    ...(ledger?.deps ? { deps: { state: ledger.deps.state, unconfirmed: unconfirmedKeys(ledger), unclassified: unclassifiedEdges(ledger).length } } : {}),
    ledger: ledger ? {
      waves: ledger.waves.map((w) => ({ n: w.n, state: w.state, units: w.units, moved: w.moved })),
      waiting: ledger.waiting,
      pause: ledger.pause,
      units: Object.fromEntries(Object.entries(ledger.units).filter(([, u]) => u.wave && ledger.waves.find((x) => x.n === u.wave && ['running', 'boundary'].includes(x.state))).map(([k, u]) => [k, { state: u.state, route: u.route ?? null, openWaits: (u.waits ?? []).filter(waitPending).map((x) => ({ from: x.from, through: x.through, before: x.before, state: x.state })) }])),
    } : null,
  };
}

// ---------------------------------------------------------------- waits and merge-in (WF-CAMPAIGN-RUN-FIXES-PLAN 3.1)

/** The folder of a unit's workflow: in its worktree when it has one. */
const unitWorkflowDir = (root, u) => join(u.worktree?.path ?? root, '.ai', 'workflows', u.slug);

/** D8: what a unit owns, for ownsSlice: its key, the keys it absorbed, and its form. */
const ownOf = (ledger, key) => ({ keys: [key, ...absorbedBy(ledger, key)], form: ledger.units[key]?.form ?? 'intake' });

/** The roster entries of a unit's 03-slice.md ({ slug, unit, source, dependsOn }), by slug. */
function rosterOf(dir) {
  const f = join(dir, '03-slice.md');
  return new Map((existsSync(f) ? rosterEntries(readFileSync(f, 'utf8')) : []).map((e) => [e.slug, e]));
}

/**
 * How far a unit got: its slice list, the slices whose verify passed (`pass`, or
 * `partial` with a deferral), and whether the unit finished. With `own` (ownOf), the
 * list holds only the slices that the unit owns (D8).
 */
export function unitProgress(root, u, own = null) {
  const dir = unitWorkflowDir(root, u);
  const index = existsSync(join(dir, '00-index.md')) ? safeParseFrontmatter(readFileSync(join(dir, '00-index.md'), 'utf8')).data ?? {} : {};
  const roster = own ? rosterOf(dir) : new Map();
  const order = (Array.isArray(index.slices) ? index.slices : []).map((s) => (typeof s === 'string' ? s : s?.slug ?? s?.slice)).filter(Boolean)
    .filter((s) => !own || ownsSlice(roster.get(s) ?? { slug: s }, own));
  const passed = order.filter((s) => {
    const f = join(dir, `06-verify-${s}.md`);
    if (!existsSync(f)) return false;
    const fm = safeParseFrontmatter(readFileSync(f, 'utf8')).data ?? {};
    return ['pass', 'partial'].includes(String(fm.result ?? ''));
  });
  return { order, passed, finished: ['finished', 'merged', 'shipped'].includes(u.state) };
}

/**
 * W0a: the run-time files of a drive. A drive writes them while it runs, so they
 * can be dirty while the drive is stopped. A merge of another unit never touches
 * them: each unit writes only its own workflow folder.
 */
export const RUN_TIME_FILES = Object.freeze(['.watch-state.json', '.driver-journal.jsonl', 'commentary.md', 'cost.jsonl', '.read-ledger.jsonl']);
const RUN_TIME_EXCLUDES = RUN_TIME_FILES.map((f) => `:(exclude,glob).ai/workflows/*/${f}`);

const unitBranch = (b, u) => u.worktree?.branch ?? (u.wave ? `campaign/${b}/wave-${u.wave}--${u.slug}` : null);

/**
 * N6: merge the slug branch of `from` into the branch of `key`, while the drive of
 * `key` is stopped. On a conflict, the merge is aborted and the files are listed.
 */
function mergeIn(root, b, [key, from], f = {}) {
  const ledger = requireLedger(root, b);
  const u = ledger.units[key];
  const fu = ledger.units[from];
  if (!u) throw new Error(`merge-in: ${key} is not a build unit of this campaign`);
  if (!fu) throw new Error(`merge-in: ${from} is not a build unit of this campaign`);
  if (u.state === 'running') return { ok: false, error: `the drive of ${key} runs. Merge only while it is stopped (D5): wait for its wait stop, or stop it first.` };
  // T7: --refresh merges a review fix of a slice whose verified commit this unit merged earlier.
  const refresh = f.refresh === true;
  const open = (u.waits ?? []).filter((w) => (refresh ? w.state === 'met' : waitPending(w)) && w.from === from);
  if (!open.length) return { ok: false, error: refresh ? `${key} has no met wait on ${from} to refresh` : `${key} has no open wait on ${from}` };
  const p = unitProgress(root, fu, ownOf(ledger, from));
  let reached;
  let mergeRef;
  if (f.at) {
    // D21: merge exactly the commit of the cleared slice, not the branch tip. T7: a verified commit counts.
    const c = [...(fu.cleared ?? []), ...(fu.verified ?? [])].find((x) => x.sha === f.at || String(x.sha).startsWith(f.at));
    if (!c) return { ok: false, error: `${f.at} is not a cleared or verified commit of ${from}: a merge-in takes the sha that slice-done recorded` };
    reached = c.slice;
    if (!open.some((w) => throughCovers(reached, w.through, p.order))) return { ok: false, error: `the cleared slice ${reached} of ${from} does not cover what ${key} needs (${open.map((w) => w.through).join(', ')})` };
    mergeRef = c.sha;
  } else {
    reached = p.finished ? 'finished' : [...p.passed].sort((x, y) => p.order.indexOf(y) - p.order.indexOf(x))[0];
    if (!reached || !open.some((w) => throughCovers(reached, w.through, p.order))) {
      return { ok: false, error: `${from} has not passed verify for what ${key} needs (${open.map((w) => w.through).join(', ')}); it reached ${reached ?? 'no passed slice'}` };
    }
  }
  const fromBranch = unitBranch(b, fu);
  if (!mergeRef && (!fromBranch || !commitOf(root, `refs/heads/${fromBranch}`))) return { ok: false, error: `the branch of ${from} (${fromBranch ?? 'unknown'}) does not exist` };
  mergeRef ??= fromBranch;
  let dir = u.worktree?.path ?? null;
  if (!dir) {
    const want = unitBranch(b, u);
    if (git(root, ['branch', '--show-current']) !== want) return { ok: false, error: `${key} has no worktree, and the main checkout is not on its branch ${want}. Check that branch out, or give the campaign an isolation contract.` };
    dir = root;
  }
  const dirty = spawnSync('git', ['-C', dir, 'status', '--porcelain', '--untracked-files=no', '--', '.', ...RUN_TIME_EXCLUDES], { encoding: 'utf8', windowsHide: true });
  if (dirty.status !== 0 || dirty.stdout.trim()) return { ok: false, error: `the checkout of ${key} has uncommitted changes, so a merge could mix with them. Ask the person.`, dirty: dirty.stdout.trim().split(/\r?\n/).filter(Boolean) };
  // C7: rerere records the resolution of a conflict here, so the boundary replays it. The setting is in the repo's common config, which every worktree shares.
  // D22: `wave launch` sets it once; two merge-ins never write the common config at the same time.
  if (git(dir, ['config', '--get', 'rerere.enabled']) !== 'true') spawnSync('git', ['-C', dir, 'config', 'rerere.enabled', 'true'], { windowsHide: true });
  const fromSha = commitOf(root, mergeRef);
  const m = spawnSync('git', ['-C', dir, 'merge', '--no-ff', '--no-edit', mergeRef], { encoding: 'utf8', windowsHide: true });
  if (m.status !== 0) {
    const files = (git(dir, ['diff', '--name-only', '--diff-filter=U']) ?? '').split(/\r?\n/).filter(Boolean);
    spawnSync('git', ['-C', dir, 'merge', '--abort'], { windowsHide: true });
    appendJournal(root, b, 'merge-in', { key, from, through: reached, result: 'conflict', files });
    return { ok: false, conflict: files, error: `merging ${from} into ${key} conflicts in ${files.length} file(s). The merge is aborted. Ask the person, or run the boundary's merge rules on this one merge (_boundary.md "Merge"), then run merge-in again.` };
  }
  const at = nowIso();
  const head = commitOf(dir, 'HEAD');
  (u['merged-in'] ??= []).push({ from, through: reached, sha: fromSha, merge: head, at });
  const closed = refresh ? [] : closeWaits(u.waits, { from, through: reached, order: p.order, at });
  if (refresh) for (const w of open) if (throughCovers(reached, w.through, p.order)) { w.sha = fromSha; w['refreshed-at'] = at; delete w.refresh; }
  // The yolo path relaunched a waiting unit; the wave driver sets the unit running itself.
  if (u.state === 'waiting' && !f.at) { u.state = 'prepared'; u.route = null; }
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

// ---------------------------------------------------------------- the wave driver (WF-CAMPAIGN-DRIVER-PLAN)

const DRIVER_ROOT = join(PLUGIN_ROOT, 'skills', 'wf', 'workflows');
const isMoved = (u) => u?.state === 'stopped' && /^moved\b/.test(String(u.route ?? ''));
/** 5.10: the cancel marker of one wave run. */
const cancelPathOf = (root, runId, n) => join(root, '.scratch', 'campaign', runId, `wave-${n}`, 'cancel');

/** D25: every journal line of wave n's run: the campaign journal and each unit journal. */
function waveRunLines(root, b, ledger, w) {
  const lines = readJsonl(journalPath(root, b));
  for (const k of w.units) {
    const u = ledger.units[k];
    if (u) lines.push(...readJsonl(join(unitWorkflowDir(root, u), '.driver-journal.jsonl')));
  }
  return lines;
}

/** D25: the live wave run, as { wave, run, newestAt }, or null. */
function liveRun(root, b, ledger) {
  for (const w of ledger.waves ?? []) {
    if (!w.run?.id) continue;
    const r = runLive(w.run, waveRunLines(root, b, ledger, w), Date.now());
    if (r.live) return { wave: w.n, run: w.run.id, newestAt: r.newestAt };
  }
  return null;
}

/** Set keys in a frontmatter block; a key that is absent is added at its end. */
function setFrontmatterKeys(file, pairs) {
  if (!existsSync(file)) return false;
  const text = readFileSync(file, 'utf8');
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return false;
  let fm = m[1];
  for (const [k, v] of Object.entries(pairs)) {
    const re = new RegExp(`^${k}:.*$`, 'm');
    const line = `${k}: ${v}`;
    fm = re.test(fm) ? fm.replace(re, () => line) : `${fm}\n${line}`;
  }
  writeAtomic(file, text.replace(m[0], () => `---\n${fm}\n---`));
  return true;
}

/** A unit's review scope from its 00-index.md: per-slice unless it says slug-wide. */
function reviewScopeOf(root, u) {
  const idx = join(unitWorkflowDir(root, u), '00-index.md');
  const fm = existsSync(idx) ? safeParseFrontmatter(readFileSync(idx, 'utf8')).data ?? {} : {};
  return fm['review-scope'] === 'slug-wide' ? 'slug-wide' : 'per-slice';
}

/** 5.5a: the answers of wave n that no resume consumed yet. */
const answersOf = (ledger, n) => (ledger.questions ?? [])
  .filter((q) => q.wave === n && q['answered-at'] && !q.consumed)
  .map((q) => ({ id: q.id, unit: q.unit ?? null, kind: q.kind ?? null, answer: q.answer, by: q.by ?? 'person', move: q.move === true }));

const questionArgs = (q) => ({
  id: q.id, kind: q.kind ?? null, stage: q.stage ?? null, slice: q.slice ?? null, text: q.text,
  answer: q.answer ?? null, by: q.by ?? null, move: q.move === true, consumed: q.consumed === true, answered: Boolean(q['answered-at']),
});

/**
 * 5.1: `wave <n> launch` — every worktree, context file and branch field of the wave,
 * then the args of the wave driver. Safe to run again (D22). Refuses without an
 * isolation contract (D19), while the wave's run is live (D25), at width 0, and,
 * before it changes anything, when one unit cannot get a worktree (D15).
 */
function launch(root, b, n, f) {
  let ledger = requireLedger(root, b);
  const w = ledger.waves.find((x) => x.n === n);
  // D3: mode drift is a separate run before wave n; it reads the as-built notes and adds no worktree.
  if (f.mode === 'drift') {
    return {
      ok: true, wave: n, mode: 'drift',
      stage: `node "${join(PLUGIN_ROOT, 'scripts', 'stage-yolo-driver.mjs')}" "${root}" --driver campaign-wave`,
      driver: join(DRIVER_ROOT, 'campaign-wave.js'),
      args: { mode: 'drift', projectRoot: root, referenceRoot: join(PLUGIN_ROOT, 'skills', 'wf', 'reference'), brainstorm: b, wave: n, campaignDir: campDir(root, b), campaignControlPath: controlPath(root, b), campaignSteerPath: campaignSteerPath(root, b), units: [] },
    };
  }
  const cfg = configOf(root);
  const iso = isolationOf(cfg);
  if (!iso) return { ok: false, error: 'isolation-required', detail: 'the wave driver runs every unit in its own worktree, and this project has no usable campaign.isolation in .ai/sdlc-config.json. Ask the person for one (_phases.md, "Width"); "parallel": false runs the wave at width 1, still in worktrees.' };
  if (!['running', 'boundary'].includes(w.state)) return { ok: false, error: `wave ${n} is ${w.state}: run wave ${n} start first` };
  // WF-CAMPAIGN-SLICE-ORDER-PLAN 5.3, 5.4: legacy waits and unplaced extensions are sorted with the person first.
  if (needsSort(ledger, w)) {
    return {
      ok: false, wave: n, next: 'sort-waits', error: 'sort-waits',
      detail: `wave ${n} holds waits of ledger version 1, or an extension unit whose slices sit in its target's roster. Sort them with the person (campaign/_order.md, "Sort waits"), then run wave ${n} sorted. The launch prints no args until then.`,
      legacy: legacyWaits(ledger, w),
      extensions: (w['extensions-pending'] ?? []).map((k) => ({ key: k, target: targetOf(ledger, k), wave: ledger.units[k]?.wave ?? null })),
    };
  }
  if (w.run?.id) {
    const r = runLive(w.run, waveRunLines(root, b, ledger, w), Date.now());
    if (r.live) return { ok: false, error: 'run-live', run: w.run.id, newestAt: r.newestAt, detail: `the run ${w.run.id} of wave ${n} wrote its newest journal line at ${r.newestAt}. Do not launch it again: it drives the same worktrees. A run is live until wave ${n} record, or until its journals are silent for 20 minutes.` };
  }
  const bud = budget(root, b);
  if (bud.width === 0) return { ok: false, paused: { until: bud.until ?? null, reason: bud.reason ?? 'usage limit' } };
  // D15: check every unit that has no worktree yet, before any worktree is added.
  const keys = w.units.filter((k) => ledger.units[k] && !isMoved(ledger.units[k]));
  const fresh = keys.filter((k) => !(ledger.units[k].worktree && existsSync(ledger.units[k].worktree.path)));
  const blocked = [];
  if (fresh.length) {
    const base = worktreeRoot(root, ledger, iso);
    if (pathCheckOn()) {
      const longest = longestTrackedPath(root);
      const order = [...w.units].sort((a, c) => (ledger.units[a].order ?? 0) - (ledger.units[c].order ?? 0));
      for (const k of fresh) {
        const path = join(base, `w${n}-${order.indexOf(k) + 1}`);
        const pb = pathBudget({ worktree: path, longestTracked: longest, buildDepth: iso['build-depth'] });
        if (!pb.ok) blocked.push({ key: k, cause: 'path', detail: `${path}: ${pb.total} characters with the deepest build path, against the Windows limit of ${pb.limit}. Set campaign.isolation.worktree-root to a short absolute path.` });
      }
    }
    mkdirSync(base, { recursive: true });
    const st = statfsSync(base);
    const freeGb = (st.bavail * st.bsize) / 1024 ** 3;
    const need = diskNeedGb({ history: ledger['disk-history'] ?? [], toStart: fresh.length, minFreeGb: iso['min-free-gb'] });
    if (freeGb < need.needGb) for (const k of fresh) blocked.push({ key: k, cause: 'disk', detail: `${freeGb.toFixed(1)} GB free, below the ${need.needGb} GB that ${fresh.length} new worktree(s) need` });
    if (blocked.length) return { ok: false, blocked };
  }
  // D22: rerere once, in the common config, before any merge-in can run.
  spawnSync('git', ['-C', root, 'config', 'rerere.enabled', 'true'], { windowsHide: true });
  for (const k of keys) {
    const r = worktreeStep(root, b, [k, 'add']);
    if (!r.ok) return { ok: false, key: k, error: `worktree ${k} add: ${r.error}`, ...(r.records?.visibleToGit ? { visibleToGit: r.records.visibleToGit } : {}) };
    if (r.records?.visibleToGit?.length) return { ok: false, key: k, error: `git can stage ${r.records.visibleToGit.length} copied record(s) in the worktree of ${k}. Ask the person.`, visibleToGit: r.records.visibleToGit };
  }
  ledger = requireLedger(root, b);
  const lw = ledger.waves.find((x) => x.n === n);
  for (const k of keys) {
    const u = ledger.units[k];
    setFrontmatterKeys(join(u.worktree.path, '.ai', 'workflows', u.slug, '00-index.md'), { 'branch-strategy': 'dedicated', branch: u.worktree.branch, 'base-branch': lw.branch });
    // With tracked records, the branch fields are committed, so no merge-in finds the index dirty.
    if (!isLocal(ledger)) {
      const rel = `.ai/workflows/${u.slug}/00-index.md`;
      spawnSync('git', ['-C', u.worktree.path, 'add', '--', rel], { windowsHide: true });
      if (spawnSync('git', ['-C', u.worktree.path, 'diff', '--cached', '--quiet', '--', rel], { windowsHide: true }).status === 1) {
        spawnSync('git', ['-C', u.worktree.path, 'commit', '-q', '-m', `chore(${u.slug}): record the branch`, '--', rel], { windowsHide: true });
      }
    }
    // D22: finished and stopped stay; a unit that waited or was prepared drives.
    if (['prepared', 'waiting', 'running'].includes(u.state)) { u.state = 'running'; u.route = null; }
  }
  const campaignRunId = `${nowIso().replace(/[-:]/g, '').replace(/\.\d+/, '')}-${b}-w${n}`;
  if (lw.run?.id) {
    rmSync(join(root, '.scratch', 'campaign', lw.run.id), { recursive: true, force: true });
    // T13: the trial worktree of the old run lived in its folder: drop its git record too.
    spawnSync('git', ['-C', root, 'worktree', 'prune'], { windowsHide: true });
  }
  lw.run = { id: campaignRunId, at: nowIso() };
  saveLedger(root, b, ledger);
  for (const k of keys) context(root, b, [k]);
  const widthMax = effectiveWidth({ width: cfg.campaign?.width ?? DEFAULT_WIDTH, isolation: iso, budget: 'ok' });
  const width = Math.max(1, Math.min(widthMax, bud.width || widthMax));
  const allDone = keys.every((k) => ledger.units[k].state === 'finished');
  const args = {
    mode: allDone ? 'boundary' : 'wave',
    projectRoot: root,
    referenceRoot: join(PLUGIN_ROOT, 'skills', 'wf', 'reference'),
    brainstorm: b,
    wave: n,
    campaignRunId,
    waveBranch: lw.branch,
    base: lw.base,
    campaignDir: campDir(root, b),
    campaignControlPath: controlPath(root, b),
    campaignSteerPath: campaignSteerPath(root, b),
    cancelPath: cancelPathOf(root, campaignRunId, n),
    width,
    widthMax,
    stopBefore: f['stop-before'] === 'boundary' ? 'boundary' : null,
    output: ledger.answers.output ?? null,
    records: ledger.records ?? 'tracked',
    agentCeiling: 900,
    moved: lw.moved ?? [],
    // WF-CAMPAIGN-ORDER-PLAN 4.5: the pairs that the deps phase expects to share a path.
    expectedShared: (lw['expected-shared'] ?? []).filter((s) => keys.includes(s.a) && keys.includes(s.b)),
    // WF-CAMPAIGN-SLICE-ORDER-PLAN D4, D10: the merge notes of the wave, and the person's standing rules.
    mergeNotes: lw['merge-notes'] ?? [],
    rules: (ledger.rules ?? []).map((r) => ({ id: r.id, text: r.text })),
    // WF-CAMPAIGN-THROUGHPUT-PLAN T12: the campaign conventions for hotspot files; T9: the machine
    // slots and the project's locks; T13: the trial merge while the units walk.
    conventions: conventionsOn(ledger),
    machineWidth: Math.max(1, Math.min(iso?.['machine-width'] ?? widthMax, widthMax * 2)),
    locks: (iso?.locks ?? []).map((l) => l.name),
    trialMerge: cfg.campaign?.['trial-merge'] !== false,
    trialPorts: trialPortsOf(iso, keys.map((k) => ledger.units[k].worktree?.index ?? 0)),
    units: keys.map((k) => {
      const u = ledger.units[k];
      return {
        key: k, slug: u.slug, form: u.form, order: u.order,
        // D8: the unit walks only the slices it owns: its key and the keys of the units it absorbed.
        ownKeys: ownOf(ledger, k).keys,
        root: u.worktree.path, branch: u.worktree.branch,
        contextPath: join(campDir(root, b), 'context', `${u.slug}.md`),
        reviewScope: reviewScopeOf(root, u),
        state: u.state,
        runId: u['wave-run-id'] ?? null,
        cleared: u.cleared ?? [],
        waits: (u.waits ?? []).map((x) => ({ from: x.from, through: x.through, before: x.before ?? null, why: x.why ?? '', source: x.source ?? 'packet', ...(x.kind ? { kind: x.kind } : {}), state: x.state, sha: x.sha ?? null, ...(x.refresh ? { refresh: x.refresh } : {}) })),
        questions: (ledger.questions ?? []).filter((q) => q.unit === k && q.wave === n).map(questionArgs),
      };
    }),
    waveQuestions: (ledger.questions ?? []).filter((q) => q.wave === n && !q.unit).map(questionArgs),
  };
  appendJournal(root, b, 'run-start', { run: campaignRunId, wave: n, units: keys, mode: args.mode });
  const outcomeDir = join(root, '.scratch', 'campaign', campaignRunId, `wave-${n}`);
  return {
    ok: true, wave: n, run: campaignRunId, mode: args.mode, width, widthMax,
    stage: `node "${join(PLUGIN_ROOT, 'scripts', 'stage-yolo-driver.mjs')}" "${root}" --driver campaign-wave`,
    driver: join(DRIVER_ROOT, 'campaign-wave.js'),
    outcomePath: join(outcomeDir, 'outcome.json'),
    args,
  };
}

/**
 * 5.11: `wave <n> record --outcome <file>` — the wave driver's outcome into the ledger.
 * Every outcome clears the wave's run (D25). A held outcome records only the unit
 * facts, and the wave stays running for the next launch.
 */
function record(root, b, n, f) {
  if (!f.outcome) throw new Error('wave record: give --outcome <the outcome file>');
  const out = readJson(resolve(f.outcome));
  if (!out || typeof out !== 'object') return { ok: false, error: `wave record: ${f.outcome} is not a JSON outcome` };
  if (Number(out.wave) !== n) return { ok: false, error: `wave record: the outcome is of wave ${out.wave}, not ${n}` };
  const ledger = requireLedger(root, b);
  const w = ledger.waves.find((x) => x.n === n);
  const ranId = w.run?.id ?? null;
  delete w.run;
  for (const ou of out.units ?? []) {
    const lu = ledger.units[ou.key];
    if (!lu) continue;
    for (const c of ou.cleared ?? []) if (c?.slice && !(lu.cleared ?? []).some((x) => x.slice === c.slice && x.sha === c.sha)) (lu.cleared ??= []).push(c);
    if (ou.decisionDigest) lu.digest = ou.decisionDigest;
    if (ou.output) lu.output = ou.output;
    if (ou.runId) lu['wave-run-id'] = ou.runId;
    // The bookkeeping agents wrote these states during the run; the outcome is the safety net.
    if (['finished', 'stopped'].includes(ou.state) && !['merged', 'needs-fix', 'shipped'].includes(lu.state)) {
      lu.state = ou.state;
      lu.route = ou.state === 'stopped' ? (ou.route ?? lu.route ?? null) : null;
    }
  }
  const res = { ok: true, wave: n, run: ranId, held: out.held === true };
  if (!res.held && out.boundary) {
    const bd = out.boundary;
    for (const m of bd.merged ?? []) if (ledger.units[m.key]) Object.assign(ledger.units[m.key], { state: 'merged', merge: m.sha, route: null });
    for (const x of bd.needsFix ?? []) if (ledger.units[x.key]) Object.assign(ledger.units[x.key], { state: 'needs-fix', route: x.reason ?? null });
    for (const x of bd.notMerged ?? []) if (ledger.units[x.key]) Object.assign(ledger.units[x.key], { state: 'stopped', route: x.reason ?? null });
    if (out.waveReview) w.review = { path: out.waveReview.path ?? null, verdict: out.waveReview.verdict ?? null, open: out.waveReview.open ?? [] };
    if (bd.stopped) w.state = 'stopped';
    res.merged = (bd.merged ?? []).map((m) => m.key);
    res.needsFix = bd.needsFix ?? [];
    res.notMerged = bd.notMerged ?? [];
    res.cleanup = (bd.merged ?? []).map((m) => ({ key: m.key, worktree: ledger.units[m.key]?.worktree?.path ?? null, branch: ledger.units[m.key]?.worktree?.branch ?? null })).filter((x) => x.worktree || x.branch);
    if (bd.stopped) res.stopped = { at: bd.stoppedAt ?? 'boundary', reason: bd.reason ?? null };
    // T2 step 1: the merged wave branch is ready. The session asks the person at once whether the next wave starts on it.
    else if (res.merged.length && !out.stopBeforeNextWave) w['ready-at'] = nowIso();
  }
  res.derivedNeeds = out.derivedNeeds ?? [];
  if (out.stopBeforeNextWave) res.stopBeforeNextWave = out.reason ?? true;
  saveLedger(root, b, ledger);
  appendJournal(root, b, 'wave-record', { wave: n, run: ranId, held: res.held, ...(res.merged ? { merged: res.merged } : {}) });
  res.next = campaignAction(ledger, {});
  const ask = nextWaveAsk(ledger, n);
  if (ask) res.nextWave = ask;
  return res;
}

/**
 * 5.6a: `slice-done <key> <slice> [--final] [--run <id>]` — the end of a cleared slice,
 * in this order: the records commit, the cleared commit, the waits that it meets,
 * the budget, and the open answers.
 */
function sliceDone(root, b, [key, slice], f) {
  const ledger = requireLedger(root, b);
  const u = ledger.units[key];
  if (!u) throw new Error(`slice-done: ${key} is not a build unit of this campaign`);
  const final = f.final === true;
  if (!final && !slice) throw new Error('slice-done: give the slice, or --final');
  const dir = u.worktree?.path;
  if (!dir || !existsSync(dir)) return { ok: false, error: `slice-done: ${key} has no worktree (D19)` };
  if (f.verified === true) return sliceVerified(root, b, ledger, key, slice, dir);
  let committed = false;
  let records = null;
  if (isLocal(ledger)) records = syncOut(root, b, key, dir);
  else {
    // The run-time files stay out until the end; the final commit carries the journal and the commentary.
    const keepOut = final ? ['.watch-state.json'] : RUN_TIME_FILES;
    const spec = [`.ai/workflows/${u.slug}`, ...keepOut.map((x) => `:(exclude,glob).ai/workflows/${u.slug}/${x}`)];
    spawnSync('git', ['-C', dir, 'add', '--', ...spec], { encoding: 'utf8', windowsHide: true });
    const staged = spawnSync('git', ['-C', dir, 'diff', '--cached', '--quiet', '--', ...spec], { windowsHide: true });
    if (staged.status === 1) {
      const c = spawnSync('git', ['-C', dir, 'commit', '-q', '-m', `chore(${u.slug}): ${final ? 'record the drive' : `record ${slice}`}`, '--', ...spec], { encoding: 'utf8', windowsHide: true });
      if (c.status !== 0) return { ok: false, error: `slice-done: the records commit failed: ${(c.stderr || c.stdout || '').trim()}` };
      committed = true;
    }
  }
  const sha = commitOf(dir, 'HEAD');
  const at = nowIso();
  const name = final ? 'finished' : slice;
  if (!(u.cleared ?? []).some((c) => c.slice === name && c.sha === sha)) (u.cleared ??= []).push({ slice: name, sha, at });
  if (f.run) u['wave-run-id'] = f.run;
  const order = unitProgress(root, u, ownOf(ledger, key)).order;
  const ready = [];
  // T7: a wait that a consumer met at the verified commit of this slice, when the review changed the slice after it.
  const refresh = [];
  // Only the slice whose verified commit the consumer merged: a later slice is code the consumer does not need.
  const verifiedShas = new Set((u.verified ?? []).filter((v) => v.slice === name).map((v) => v.sha));
  for (const k of ledger.waves.find((x) => x.n === u.wave)?.units ?? []) {
    for (const wt of ledger.units[k]?.waits ?? []) {
      if (wt.from !== key || !throughCovers(name, wt.through, order)) continue;
      if (wt.state === 'met' && wt.sha && wt.sha !== sha && verifiedShas.has(wt.sha) && wt.refresh !== sha) {
        wt.refresh = sha;
        refresh.push({ key: k, from: key, through: wt.through, before: wt.before ?? null, sha, was: wt.sha });
        continue;
      }
      if (wt.state !== 'open') continue;
      wt.state = 'ready';
      wt.sha = sha;
      wt['ready-at'] = at;
      ready.push({ key: k, from: key, through: wt.through, sha });
    }
  }
  saveLedger(root, b, ledger);
  const bd = budget(root, b);
  return { ok: true, key, slice: name, sha, committed, ...(records ? { records } : {}), ready, ...(refresh.length ? { refresh } : {}), budget: { state: bd.state, width: bd.width, until: bd.until ?? null, reason: bd.reason ?? null }, answered: answersOf(ledger, u.wave) };
}

/**
 * WF-CAMPAIGN-THROUGHPUT-PLAN T7: `slice-done <key> <slice> --verified` — the slice passed
 * its verify. A consumer needs the verified code, not the review: each open wait that the
 * slice covers is ready at HEAD. The review comes later, and `slice-done` after it returns
 * `refresh` for each consumer that merged a commit that the review then changed.
 */
function sliceVerified(root, b, ledger, key, slice, dir) {
  const u = ledger.units[key];
  if (!slice) throw new Error('slice-done --verified: give the slice');
  const sha = commitOf(dir, 'HEAD');
  const at = nowIso();
  if (!(u.verified ?? []).some((v) => v.slice === slice && v.sha === sha)) (u.verified ??= []).push({ slice, sha, at });
  const order = unitProgress(root, u, ownOf(ledger, key)).order;
  const ready = [];
  for (const k of ledger.waves.find((x) => x.n === u.wave)?.units ?? []) {
    for (const wt of ledger.units[k]?.waits ?? []) {
      if (wt.from !== key || wt.state !== 'open' || !throughCovers(slice, wt.through, order)) continue;
      wt.state = 'ready';
      wt.sha = sha;
      wt['ready-at'] = at;
      wt['ready-on'] = 'verify';
      ready.push({ key: k, from: key, through: wt.through, sha });
    }
  }
  saveLedger(root, b, ledger);
  if (ready.length) appendJournal(root, b, 'slice-verified', { key, slice, sha, ready: ready.length });
  return { ok: true, key, slice, sha, verified: true, ready };
}

/**
 * 5.7: `needs <key> add|list|remove` — the derived needs entries of the wave driver.
 * WF-CAMPAIGN-SLICE-ORDER-PLAN: `--kind merge` writes a merge note of the wave and no wait
 * (4.2). `remove` leaves a drop record, and a later `add` by the driver of the same entry
 * returns `dropped: true` with no wait; only `--by person` brings it back (4.3).
 */
function needs(root, b, [key, action], f) {
  const ledger = requireLedger(root, b);
  const u = ledger.units[key];
  if (!u) throw new Error(`needs: ${key} is not a build unit of this campaign`);
  const ws = readWorkSet(root, b);
  const packet = ws.error ? null : unitsOf(ws, ledger).find((x) => x.key === key);
  const w = ledger.waves.find((x) => x.n === u.wave);
  if (action === 'list') return { ok: true, key, graph: packet?.needs ?? [], derived: u['derived-needs'] ?? [], waits: u.waits ?? [], dropped: u['dropped-needs'] ?? [], mergeNotes: (w?.['merge-notes'] ?? []).filter((m) => m.a === key || m.b === key) };
  const entry = { from: f.from, through: f.through ?? 'finished', before: f.before ?? null };
  if (!entry.from || !ledger.units[entry.from]) throw new Error(`needs ${action}: --from names a build unit of this campaign`);
  const by = f.by ?? (action === 'remove' ? 'person' : 'driver');
  if (action === 'remove') {
    const before = (u['derived-needs'] ?? []).length;
    u['derived-needs'] = (u['derived-needs'] ?? []).filter((x) => !sameNeed(x, entry));
    u.waits = (u.waits ?? []).filter((x) => !(sameNeed(x, entry) && x.source !== 'packet' && x.state !== 'met'));
    if (!u['derived-needs'].length) delete u['derived-needs'];
    // D5: the drop record keeps a relaunch from adding the same wait again.
    if (!dropRecordOf(u, entry)) (u['dropped-needs'] ??= []).push({ ...entry, by, at: nowIso(), why: f.why ?? '' });
    saveLedger(root, b, ledger);
    context(root, b, [key]);
    appendJournal(root, b, 'derived-need', { key, ...entry, removed: true, by });
    return { ok: true, key, removed: before - (u['derived-needs'] ?? []).length, dropRecord: true };
  }
  if (action !== 'add') throw new Error('needs: the action is add, list or remove');
  const kind = f.kind ?? 'need';
  if (!['need', 'merge'].includes(kind)) throw new Error(`needs add: --kind is need or merge (a ${PAIR_KINDS.at(-1)} pair parks; it is no needs entry)`);
  if (!w || ledger.units[entry.from].wave !== u.wave) return { ok: false, error: `needs add: ${entry.from} is not in the wave of ${key}` };
  const why = f.why ?? '';
  if (kind === 'merge') {
    // D4: the two slices change the same file and wait for nothing. The boundary merge reads the note.
    const r = addMergeNote(w, { a: entry.from, aSlice: entry.through, b: key, bSlice: entry.before, files: why, why: f.evidence ?? '', at: nowIso() });
    if (r.added) {
      saveLedger(root, b, ledger);
      appendJournal(root, b, 'merge-note', { key, ...entry, files: why });
    }
    return { ok: true, key, merge: true, note: r.note, exists: !r.added };
  }
  if ((packet?.needs ?? []).some((x) => sameNeed(x, entry)) || (u['derived-needs'] ?? []).some((x) => sameNeed(x, entry))) return { ok: true, key, exists: true };
  const drop = dropRecordOf(u, entry);
  if (drop && by !== 'person') return { ok: true, key, dropped: true, record: drop };
  // A cycle at slice level: each unit's slices in roster order, each wait an edge.
  const rosters = Object.fromEntries(w.units.map((k) => [k, unitProgress(root, ledger.units[k], ownOf(ledger, k)).order]));
  const waits = w.units.flatMap((k) => (ledger.units[k].waits ?? []).filter((x) => x.state !== 'rejected').map((x) => ({ key: k, from: x.from, through: x.through, before: x.before ?? null })));
  const cycle = sliceCycle(rosters, [...waits, { key, ...entry }]);
  if (cycle) return { ok: false, cycle, error: `needs add: the entry closes a cycle: ${cycle.join(' -> ')}` };
  const source = f.source ?? 'cross-unit';
  const evidence = f.evidence ?? '';
  // A slice that already passed its implement gets no wait: the wave review reads the pair.
  const dir = unitWorkflowDir(root, u);
  const implemented = entry.before && ['05-implement-', '05-implement'].some((p) => {
    const file = join(dir, p.endsWith('-') ? `${p}${entry.before}.md` : `${p}.md`);
    return existsSync(file) && String(safeParseFrontmatter(readFileSync(file, 'utf8')).data?.status ?? '') === 'complete';
  });
  if (implemented || (u.cleared ?? []).some((c) => c.slice === entry.before)) {
    // `focus` keeps one meaning: a late need (D4).
    (w.focus ??= []).push({ a: entry.from, aSlice: entry.through, b: key, bSlice: entry.before, files: why });
    saveLedger(root, b, ledger);
    appendJournal(root, b, 'derived-need', { key, ...entry, why, source, late: true, by });
    return { ok: true, key, late: true };
  }
  if (drop) u['dropped-needs'] = u['dropped-needs'].filter((d) => d !== drop);
  if (!u['dropped-needs']?.length) delete u['dropped-needs'];
  const at = nowIso();
  (u['derived-needs'] ??= []).push({ ...entry, why, by, at, source, kind: 'need', ...(evidence ? { evidence } : {}) });
  const fromU = ledger.units[entry.from];
  const cover = clearedCover(fromU.cleared, entry.through, unitProgress(root, fromU, ownOf(ledger, entry.from)).order);
  const wait = { ...entry, why, source, kind: 'need', state: cover ? 'ready' : 'open', ...(cover ? { sha: cover.sha } : {}) };
  (u.waits ??= []).push(wait);
  u['merged-in'] ??= [];
  saveLedger(root, b, ledger);
  context(root, b, [key]);
  appendJournal(root, b, 'derived-need', { key, ...entry, why, source, by, state: wait.state, ...(wait.sha ? { sha: wait.sha } : {}) });
  return { ok: true, key, wait };
}

/** 5.5 kind contract: `contract <key> amend --line <line key> --text <text>`. */
function contract(root, b, [key, action], f) {
  if (action !== 'amend') throw new Error('contract: the action is amend');
  const ledger = requireLedger(root, b);
  if (!ledger.units[key]) throw new Error(`contract: ${key} is not a build unit of this campaign`);
  if (!String(f.line ?? '').trim() || !String(f.text ?? '').trim()) throw new Error('contract amend: give --line <line key> and --text "<the new text>"');
  const a = { line: String(f.line).trim(), text: String(f.text).trim(), at: nowIso(), by: f.by ?? 'the person' };
  ((ledger['amended-contracts'] ??= {})[key] ??= []).push(a);
  saveLedger(root, b, ledger);
  // Each context file that carries or expects the line, and every unit of a started wave, is written again.
  const ws = readWorkSet(root, b);
  const units = ws.error ? [] : unitsOf(ws, ledger);
  const touched = units.filter((x) => x.key === key || x.expects.some((e) => e.from === key) || ledger.units[x.key]?.wave === ledger.units[key].wave).map((x) => x.key).filter((k) => ledger.units[k]?.wave);
  const written = touched.map((k) => context(root, b, [k])).filter((r) => r.ok).map((r) => r.key);
  appendJournal(root, b, 'contract-amend', { key, line: a.line });
  return { ok: true, key, amended: a, contexts: written };
}

/**
 * 5.5a: `await --wave <n> --max <seconds>` blocks until an answer, a stop, a pause,
 * width 0 or the cancel marker, or until `max` seconds passed. `--max 0` checks once.
 * `await --wave <n> --cancel` writes the cancel marker of the wave's run.
 */
function awaitCmd(root, b, f) {
  const n = Number(f.wave);
  if (!Number.isInteger(n) || n < 1) throw new Error('await: give --wave <n>');
  const first = requireLedger(root, b);
  const run = first.waves.find((x) => x.n === n)?.run?.id ?? null;
  if (f.cancel === true) {
    if (!run) return { ok: false, error: `await --cancel: wave ${n} has no run` };
    const p = cancelPathOf(root, run, n);
    writeAtomic(p, `${nowIso()}\n`);
    return { ok: true, cancelled: true, path: p };
  }
  const max = Math.max(0, Math.min(540, Number(f.max ?? 540) || 0));
  if (max > 0) appendJournal(root, b, 'waiter', { run, wave: n, open: (first.questions ?? []).filter((q) => q.wave === n && !q['answered-at']).map((q) => q.id) });
  const seen = new Set(String(f.seen ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  // WF-CAMPAIGN-SLICE-ORDER-PLAN 4.3 step 4: a wait that the person added or dropped since the run started.
  const since = Date.parse(first.waves.find((x) => x.n === n)?.run?.at ?? '') || 0;
  const unitsOfWave = new Set(first.waves.find((x) => x.n === n)?.units ?? []);
  const needsChanged = () => readJsonl(journalPath(root, b))
    .filter((l) => l.event === 'derived-need' && l.by === 'person' && !l.late && unitsOfWave.has(l.key) && (Date.parse(l.at ?? '') || 0) >= since)
    .map((l) => ({ id: needsChangeId(l), key: l.key, from: l.from, through: l.through ?? 'finished', before: l.before ?? null, action: l.removed ? 'remove' : 'add', ...(l.state ? { state: l.state } : {}), ...(l.sha ? { sha: l.sha } : {}) }))
    .filter((c) => !seen.has(c.id));
  const t0 = Date.now();
  const check = () => {
    const ledger = loadLedger(root, b) ?? first;
    if (run && existsSync(cancelPathOf(root, run, n))) return { cancelled: true };
    const ctl = readJson(controlPath(root, b));
    if (ctl?.action === 'stop' && ctl.scope === 'campaign') return { stopped: true, kind: 'stop', reason: ctl.reason ?? 'stop request' };
    if (ctl?.action === 'pause' && (!ctl.until || Date.parse(ctl.until) > Date.now())) return { stopped: true, kind: 'pause', until: ctl.until ?? null, reason: ctl.reason ?? 'pause' };
    const bd = budget(root, b);
    if (bd.width === 0) return { paused: { until: bd.until ?? null, reason: bd.reason ?? 'usage limit' } };
    // The driver passes the ids it already saw, so an answer that waits for its resume does not return again.
    const answered = answersOf(ledger, n).filter((a) => !seen.has(a.id));
    const changed = needsChanged();
    if (answered.length || changed.length) return { ...(answered.length ? { answered } : {}), ...(changed.length ? { needsChanged: changed } : {}) };
    return null;
  };
  for (;;) {
    const r = check();
    if (r) return { ok: true, ...r, waitedS: Math.round((Date.now() - t0) / 1000) };
    const left = max * 1000 - (Date.now() - t0);
    if (left <= 0) return { ok: true, timeout: true, waitedS: Math.round((Date.now() - t0) / 1000) };
    sleepMs(Math.min(10_000, left));
  }
}

/** The id of a person's needs change in the journal, for `await --seen`. */
const needsChangeId = (l) => `nc${createHash('sha1').update(`${l.at}|${l.key}|${l.from}|${l.through ?? ''}|${l.before ?? ''}|${l.removed ? 'remove' : 'add'}`).digest('hex').slice(0, 10)}`;

/** 5.5a step 5: `question <id> consumed` — the resumed step ran with this answer. */
function question(root, b, [id, action]) {
  if (action !== 'consumed') throw new Error('question: the action is consumed');
  const ledger = requireLedger(root, b);
  const q = (ledger.questions ?? []).find((x) => x.id === id);
  if (!q) throw new Error(`question: no question ${id}`);
  if (!q['answered-at']) return { ok: false, error: `question ${id} has no answer yet` };
  q.consumed = true;
  q['consumed-at'] = nowIso();
  saveLedger(root, b, ledger);
  return { ok: true, id, consumed: true };
}

/**
 * WF-CAMPAIGN-THROUGHPUT-PLAN section 3 step 8: `schedule <n>` — simulate wave n with no
 * agent. Each unit's roster (00-index.md slices, 03-slice.md depends-on and complexity), the
 * graph needs between the units of the wave, the review scope, the width, and the stage
 * medians of this repository's driver journals (the plan's medians when there are none).
 */
// T13: the trial worktree runs its suites on ports past every unit's.
function trialPortsOf(iso, indexes) {
  const ports = portsFor(iso, Math.max(0, ...indexes) + 1);
  return Object.keys(ports).length ? ports : null;
}

function schedule(root, b, [nText], f) {
  const ledger = requireLedger(root, b);
  const n = Number(nText);
  const w = ledger.waves.find((x) => x.n === n);
  if (!w) throw new Error(`schedule: no wave ${nText}`);
  const cfg = configOf(root);
  const iso = isolationOf(cfg);
  const widthMax = effectiveWidth({ width: cfg.campaign?.width ?? DEFAULT_WIDTH, isolation: iso, budget: 'ok' });
  const width = Math.max(1, Number(f.width) || widthMax);
  const machineWidth = Math.max(1, Number(f['machine-width']) || iso?.['machine-width'] || width);
  const units = w.units.filter((k) => ledger.units[k] && !isMoved(ledger.units[k])).map((k) => {
    const u = ledger.units[k];
    const dir = unitWorkflowDir(root, u);
    const own = ownOf(ledger, k);
    const fm = (name) => (existsSync(join(dir, name)) ? safeParseFrontmatter(readFileSync(join(dir, name), 'utf8')).data ?? {} : {});
    const index = fm('00-index.md');
    const rosterFm = fm('03-slice.md');
    const roster = rosterOf(dir);
    const extra = new Map((Array.isArray(rosterFm.slices) ? rosterFm.slices : []).filter((s) => s && s.slug).map((s) => [String(s.slug), s]));
    const list = (Array.isArray(index.slices) ? index.slices : []).map((s) => (typeof s === 'string' ? { slug: s } : s ?? {})).filter((s) => s.slug ?? s.slice);
    const slices = list.map((s) => {
      const name = String(s.slug ?? s.slice);
      return { slice: name, status: s.status ?? null, complexity: s.complexity ?? extra.get(name)?.complexity ?? null, dependsOn: roster.get(name)?.dependsOn ?? [] };
    }).filter((s) => ownsSlice(roster.get(s.slice) ?? { slug: s.slice }, own));
    return { key: k, slices, reviewScope: reviewScopeOf(root, u) };
  });
  const keys = new Set(units.map((u) => u.key));
  const waits = [];
  for (const k of keys) {
    for (const x of ledger.units[k].waits ?? []) if (x.state !== 'rejected' && keys.has(x.from)) waits.push({ key: k, from: x.from, through: x.through ?? 'finished', before: x.before ?? null });
    if (!ledger.units[k].waits) for (const nd of (ledger.deps?.units?.[k]?.needs ?? [])) if (keys.has(nd.from)) waits.push({ key: k, from: nd.from, through: nd.through ?? 'finished', before: nd.before ?? null });
  }
  const journals = units.map((u) => readJsonl(join(unitWorkflowDir(root, ledger.units[u.key]), '.driver-journal.jsonl')));
  const minutes = f.medians === 'plan' ? {} : stageMedians(journals.filter((j) => j.length));
  const sim = scheduleOf({ units, waits, width, machineWidth, minutes });
  return { ok: true, wave: n, ...sim, waits: waits.length, unsliced: units.filter((u) => !u.slices.length).map((u) => u.key) };
}

/**
 * T9: `locks wait [--max s]` — the project declares its own locks (campaign.isolation.locks:
 * { name, path, stale-minutes }). A lock is held while its file exists and is younger than
 * its stale age. The command waits until no lock is held, or until --max seconds pass.
 */
function locksCmd(root, b, [action], f) {
  if (action !== 'wait') throw new Error('locks: the action is wait');
  const iso = isolationOf(configOf(root));
  const list = iso?.locks ?? [];
  const held = () => list.filter((l) => {
    const p = resolve(root, l.path);
    if (!existsSync(p)) return false;
    try { return Date.now() - lstatSync(p).mtimeMs < l['stale-minutes'] * 60_000; } catch { return false; }
  }).map((l) => l.name);
  const max = Math.max(0, Math.min(540, Number(f.max ?? 540) || 0));
  const t0 = Date.now();
  for (;;) {
    const h = held();
    if (!h.length) return { ok: true, free: true, waitedS: Math.round((Date.now() - t0) / 1000), locks: list.map((l) => l.name) };
    const left = max * 1000 - (Date.now() - t0);
    if (left <= 0) return { ok: true, free: false, timeout: true, held: h, waitedS: Math.round((Date.now() - t0) / 1000) };
    sleepMs(Math.min(10_000, left));
  }
}

/**
 * WF-CAMPAIGN-SLICE-ORDER-PLAN 4.4: `slice-order <checkout> <slug> add --slice s --after t
 * --why w` — an order that a plan or a plan reconcile decided becomes a `depends-on` edge:
 * `t` joins the `depends-on` of `s` in the roster of 03-slice.md and in 03-slice-<s>.md.
 * It refuses a cycle, appends a line to index-history.jsonl, and writes the new walk order
 * into `implementation-order` of 04-plan.md. It only adds an edge, as `extend` only adds slices.
 */
function sliceOrder(root, slug, [action], f) {
  if (action !== 'add') throw new Error('slice-order: the action is add');
  const s = String(f.slice ?? '').trim();
  const t = String(f.after ?? '').trim();
  if (!s || !t || s === t) throw new Error('slice-order add: give --slice <slice> --after <another slice>');
  const dir = join(root, '.ai', 'workflows', slug);
  const rosterFile = join(dir, '03-slice.md');
  if (!existsSync(rosterFile)) return { ok: false, error: `slice-order: ${relative(root, rosterFile)} does not exist` };
  const text = readFileSync(rosterFile, 'utf8');
  const roster = rosterEntries(text);
  const entry = roster.find((e) => e.slug === s);
  if (!entry || !roster.some((e) => e.slug === t)) return { ok: false, error: `slice-order: ${!entry ? s : t} is not a slice of the roster of ${slug}` };
  if (entry.dependsOn.includes(t)) return { ok: true, slug, slice: s, after: t, added: false, walkOrder: rosterWalkOrder(roster).map((e) => e.slug) };
  if (closesCycle(roster, s, t)) return { ok: false, cycle: true, error: `slice-order: ${s} after ${t} closes a cycle, because ${t} already depends on ${s}` };
  const deps = [...entry.dependsOn, t];
  writeAtomic(rosterFile, editRosterEntry(text, s, { 'depends-on': deps }));
  const sliceFile = join(dir, `03-slice-${s}.md`);
  if (existsSync(sliceFile)) {
    const st = readFileSync(sliceFile, 'utf8');
    const have = frontmatterValue(st, 'depends-on');
    const list = Array.isArray(have) ? have.map(String) : [];
    if (!list.includes(t)) writeAtomic(sliceFile, setFrontmatterValue(st, 'depends-on', [...list, t]) ?? st);
  }
  const why = String(f.why ?? '').trim();
  appendFileSync(join(dir, 'index-history.jsonl'), `${JSON.stringify({ at: nowIso(), kind: 'note', text: `slice-order: '${s}' after '${t}'${why ? `: ${why}` : ''}`, stage: 'plan' })}\n`);
  const order = rosterWalkOrder(rosterEntries(readFileSync(rosterFile, 'utf8'))).map((e) => e.slug);
  const planFile = join(dir, '04-plan.md');
  if (existsSync(planFile)) {
    const pt = readFileSync(planFile, 'utf8');
    const next = setFrontmatterValue(pt, 'implementation-order', order);
    if (next && next !== pt) writeAtomic(planFile, next);
  }
  return { ok: true, slug, slice: s, after: t, added: true, dependsOn: deps, walkOrder: order };
}

/**
 * 5.13: `owner <projectRoot> <slug>` — the live wave run that drives a slug, from the
 * ledger of each brainstorm of the repo. `/wf yolo` stops on an owned slug.
 */
export function owner(root, slug) {
  const wf = join(root, '.ai', 'workflows');
  let dirs = [];
  try { dirs = readdirSync(wf, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { /* none */ }
  for (const b of dirs) {
    const ledger = readJson(ledgerPath(root, b));
    if (!ledger?.units) continue;
    for (const w of ledger.waves ?? []) {
      if (!w.run?.id) continue;
      const key = w.units.find((k) => ledger.units[k]?.slug === slug);
      if (!key) continue;
      const r = runLive(w.run, waveRunLines(root, b, ledger, w), Date.now());
      if (r.live) return { ok: true, owned: true, slug, brainstorm: b, wave: w.n, key, run: w.run.id, newestAt: r.newestAt, resume: `/wf campaign ${b}` };
    }
  }
  return { ok: true, owned: false, slug };
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

// ---------------------------------------------------------------- the dependency graph (WF-CAMPAIGN-ORDER-PLAN 4.4-4.6)

const depKey = (d) => (typeof d === 'string' ? d : d?.key);

/**
 * 4.4 step 5: the waves, the errors and the shared paths that the graph gives, with
 * no state change. Every unit is in the plan, also a unit that waits for its
 * confirmation. `serial` is the plan of the serial chain, for the side-by-side view.
 */
function depsPlanOf(ledger, ws) {
  const units = unitsOf(ws, ledger);
  const check = checkCampaignSet(units, { written: ws.written });
  const copy = JSON.parse(JSON.stringify(ledger));
  for (const e of Object.values(copy.deps?.units ?? {})) e['confirmed-at'] ??= 'plan';
  replan(copy, units, { revision: copy['work-revision'], now: nowIso() });
  const planned = copy.waves.filter((w) => w.state === 'planned');
  return {
    errors: check.errors,
    warnings: check.warnings,
    waves: copy.waves.map((w) => ({ n: w.n, state: w.state, units: w.units })),
    waiting: copy.waiting,
    serial: serialWaves(units.filter(isBuildUnit)),
    shared: planned.flatMap((w) => (w['expected-shared'] ?? []).map((s) => ({ wave: w.n, ...s }))),
    dropped: Object.entries(ledger.deps.units).flatMap(([k, e]) => (e.dropped ?? []).map((d) => ({ unit: k, from: d.key, why: d.why, by: d.by, at: d.at }))),
    unconfirmed: unconfirmedKeys(ledger),
    // T1: the edges with no kind, of units outside a started wave. Each one orders the waves as a need until it is classified.
    unclassified: unclassifiedEdges(ledger),
  };
}

/**
 * `deps show|plan|confirm`, and `deps <key> <field> <action> ...` (4.6). Each change
 * writes the ledger only, writes the unit's context file again, and appends a
 * journal line. A unit of a started wave changes only through `needs` and `contract`.
 */
function depsCmd(root, b, pos, f) {
  const ledger = requireLedger(root, b);
  const ws = readWorkSet(root, b);
  if (ws.error) return { ok: false, error: ws.error };
  const added = ensureDeps(ledger, ws.packets);
  const [sub, field, action, arg] = pos;
  if (sub === 'show' || sub === 'plan') {
    const plan = depsPlanOf(ledger, ws);
    if (sub === 'plan') return { ok: true, ...plan, ...(added.length ? { added } : {}) };
    return { ok: true, state: ledger.deps.state, revision: ledger.deps.revision, unconfirmed: plan.unconfirmed, units: ledger.deps.units, waves: plan.waves, errors: plan.errors, ...(added.length ? { added } : {}) };
  }
  if (sub === 'confirm') {
    const units = unitsOf(ws, ledger);
    const check = checkCampaignSet(units, { written: ws.written });
    if (check.errors.length) return { ok: false, errors: check.errors, warnings: check.warnings };
    const at = nowIso();
    const shown = unconfirmedKeys(ledger);
    for (const k of shown) ledger.deps.units[k]['confirmed-at'] = at;
    ledger.deps.revision = (ledger.deps.revision ?? 1) + 1;
    // A packet that is prepared or routed counts as prepared for a unit still planned.
    for (const u of units) if (ledger.units[u.key]?.state === 'planned' && ['prepared', 'routed'].includes(u.packetState)) ledger.units[u.key].state = 'prepared';
    replan(ledger, units, { revision: ledger['work-revision'], now: at });
    saveLedger(root, b, ledger);
    const planned = ledger.waves.filter((w) => w.state === 'planned');
    appendJournal(root, b, 'deps-confirm', { units: shown, revision: ledger.deps.revision, waves: planned.map((w) => w.units) });
    return {
      ok: true, confirmed: shown, waves: ledger.waves.map((w) => w.units), waiting: ledger.waiting, warnings: check.warnings,
      shared: planned.flatMap((w) => (w['expected-shared'] ?? []).map((s) => ({ wave: w.n, ...s }))),
      next: campaignAction(ledger, { revision: ws.revision }),
    };
  }
  const key = sub;
  const entry = ledger.deps.units[key];
  if (!entry) throw new Error(`deps: ${key ?? '(none)'} is not a packet of this work set. The form is deps show, deps plan, deps confirm, or deps <key> <field> <action>`);
  if (startedKeys(ledger).has(key)) return { ok: false, key, error: `deps: ${key} is in a started wave, and its graph does not change any more. Use needs ${key} add for a derived needs entry, or contract ${key} amend for a contract line.` };
  const by = f.by ?? 'person';
  if (!DEPS_BY.includes(by)) throw new Error(`deps: --by is one of ${DEPS_BY.join(', ')}`);
  const packetKeys = new Set(ws.packets.map((p) => p.key));
  const why = f.why ? String(f.why) : '';
  const at = nowIso();
  let change;
  if (field === 'depends-on') {
    if (!arg || !(packetKeys.has(arg) || ws.written.includes(arg))) throw new Error(`deps ${key} depends-on ${action ?? ''}: name a packet of this work set, or a written piece`);
    if (arg === key) throw new Error(`deps ${key} depends-on: a unit does not depend on itself`);
    if (!why) throw new Error(`deps ${key} depends-on ${action}: give --why with the evidence`);
    const list = entry['depends-on'] ??= [];
    // T1: an edge is a `need` (with evidence) or a `sequence`. An edge with no kind is legacy.
    const kind = f.kind === undefined ? null : String(f.kind);
    if (kind !== null && !EDGE_KINDS.includes(kind)) throw new Error(`deps ${key} depends-on: --kind is ${EDGE_KINDS.join(' or ')}`);
    if (kind === 'need' && !String(f.evidence ?? '').trim()) throw new Error(`deps ${key} depends-on: a need gives --evidence (a code, data or contract use); with none, the edge is a sequence`);
    const kindFields = kind ? { kind, ...(kind === 'need' ? { evidence: String(f.evidence).trim() } : {}) } : {};
    if (action === 'add') {
      if (list.some((d) => depKey(d) === arg)) return { ok: true, key, exists: true };
      list.push({ key: arg, why, by, at, ...kindFields });
    } else if (action === 'kind') {
      const i = list.findIndex((d) => depKey(d) === arg);
      if (i < 0) return { ok: false, key, error: `deps ${key}: there is no edge from ${arg}` };
      if (!kind) throw new Error(`deps ${key} depends-on kind: give --kind ${EDGE_KINDS.join('|')}`);
      const was = edgeKind(list[i]);
      const d = typeof list[i] === 'string' ? { key: arg } : { ...list[i] };
      delete d.evidence;
      list[i] = { ...d, ...kindFields, 'kind-why': why, 'kind-by': by, 'kind-at': at };
      change = { field, action, from: arg, kind, was, why };
    } else if (action === 'remove') {
      if (!list.some((d) => depKey(d) === arg)) return { ok: false, key, error: `deps ${key}: there is no edge from ${arg}` };
      entry['depends-on'] = list.filter((d) => depKey(d) !== arg);
      // The removal and its reason stay: `deps plan` shows each dropped edge with its evidence.
      (entry.dropped ??= []).push({ key: arg, why, by, at });
    } else throw new Error('deps <key> depends-on: the action is add, kind or remove');
    change ??= { field, action, from: arg, why, ...kindFields };
  } else if (field === 'needs') {
    const n = { from: f.from, through: f.through ?? 'finished', before: f.before ?? null };
    if (!n.from || !packetKeys.has(n.from)) throw new Error(`deps ${key} needs ${action ?? ''}: --from names a packet of this work set`);
    if (n.from === key) throw new Error(`deps ${key} needs: a unit does not need itself`);
    entry.needs ??= [];
    if (action === 'add') {
      if (!why) throw new Error(`deps ${key} needs add: give --why with the thing that it needs`);
      if (entry.needs.some((x) => sameNeed(x, n))) return { ok: true, key, exists: true };
      entry.needs.push({ ...n, why, by, at });
    } else if (action === 'remove') {
      const before = entry.needs.length;
      entry.needs = entry.needs.filter((x) => !sameNeed(x, n));
      if (entry.needs.length === before) return { ok: false, key, error: `deps ${key}: no such needs entry` };
    } else throw new Error('deps <key> needs: the action is add or remove');
    change = { field, action, ...n, why };
  } else if (field === 'provides' || field === 'expects') {
    const line = f.line ? String(f.line) : '';
    if (!line) throw new Error(`deps ${key} ${field}: give --line <the line key>`);
    if (field === 'expects' && !(f.from && (packetKeys.has(f.from) || ws.written.includes(f.from)))) throw new Error(`deps ${key} expects: --from names a packet of this work set, or a written piece`);
    const same = (x) => x.key === line && (field === 'provides' || x.from === f.from);
    const list = entry[field] ??= [];
    if (action === 'set') {
      if (!String(f.text ?? '').trim()) throw new Error(`deps ${key} ${field} set: give --text with the line`);
      const v = { ...(field === 'expects' ? { from: String(f.from) } : {}), key: line, text: String(f.text).trim(), by, at };
      const i = list.findIndex(same);
      if (i >= 0) list[i] = v;
      else list.push(v);
    } else if (action === 'remove') {
      if (!list.some(same)) return { ok: false, key, error: `deps ${key}: no ${field} line ${line}` };
      entry[field] = list.filter((x) => !same(x));
    } else throw new Error(`deps <key> ${field}: the action is set or remove`);
    change = { field, action, line, ...(field === 'expects' ? { from: f.from } : {}) };
  } else if (field === 'paths') {
    if (f.set === undefined) throw new Error(`deps ${key} paths: give --set <path,path>`);
    entry.paths = String(f.set).split(',').map((s) => s.trim()).filter(Boolean);
    change = { field, paths: entry.paths };
  } else throw new Error('deps <key>: the field is depends-on, needs, provides, expects, or paths');
  entry['changed-at'] = at;
  ledger.deps.revision = (ledger.deps.revision ?? 1) + 1;
  saveLedger(root, b, ledger);
  const u = unitsOf(ws, ledger).find((x) => x.key === key);
  if (u && existsSync(join(campDir(root, b), 'context', `${u.slug}.md`))) context(root, b, [key]);
  appendJournal(root, b, 'deps-change', { key, by, ...change });
  const confirmed = Boolean(entry['confirmed-at']);
  return { ok: true, key, entry, ...(confirmed ? { replan: true, note: `the entry of ${key} is confirmed: run replan, so that the waves follow the change` } : {}) };
}

function doReplan(root, b) {
  const ledger = requireLedger(root, b);
  const ws = readWorkSet(root, b);
  if (ws.error) return { ok: false, error: ws.error };
  ensureDeps(ledger, ws.packets);
  const units = unitsOf(ws, ledger);
  const check = checkCampaignSet(units, { written: ws.written });
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
  const optional = Object.keys(OPTIONAL_ANSWERS);
  if (!SETUP_ANSWERS.includes(key) && !optional.includes(key)) throw new Error(`answer: the key is one of ${[...SETUP_ANSWERS, ...optional].join(', ')}`);
  if (key === 'conventions' && !['on', 'off'].includes(rest.join(' ').trim())) throw new Error('answer conventions: on or off');
  const ledger = requireLedger(root, b);
  // 4.3: setup waits for the confirmed graph (Q2: no way to skip it).
  const pending = unconfirmedKeys(ledger);
  if (pending.length) return { ok: false, error: `the dependency graph is not confirmed (${pending.join(', ')}): run the deps phase first (campaign/_phases.md, "Phase 0b — Deps")`, next: campaignAction(ledger, {}) };
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

/** Commit one record file of a unit's checkout, when the repo tracks the records. */
function commitRecord(ledger, dir, rel, msg) {
  if (isLocal(ledger)) return false;
  spawnSync('git', ['-C', dir, 'add', '--', rel], { windowsHide: true });
  if (spawnSync('git', ['-C', dir, 'diff', '--cached', '--quiet', '--', rel], { windowsHide: true }).status !== 1) return false;
  return spawnSync('git', ['-C', dir, 'commit', '-q', '-m', msg, '--', rel], { windowsHide: true }).status === 0;
}

/** The checkout of a unit: its worktree when it has one, else the project root. */
const checkoutOf = (root, u) => (u.worktree?.path && existsSync(u.worktree.path) ? u.worktree.path : root);

/**
 * WF-CAMPAIGN-SLICE-ORDER-PLAN 5.4, absorb: the extension unit joins the wave of its
 * target. The target walks its slices, and the extension unit follows the target's state.
 */
function absorbUnit(root, b, key, f) {
  const ledger = requireLedger(root, b);
  const u = ledger.units[key];
  if (!u || u.form !== 'extension') throw new Error(`unit absorb: ${key} is not an extension unit of this campaign`);
  const target = f.into ?? targetOf(ledger, key);
  const t = target ? ledger.units[target] : null;
  if (!t || t.slug !== u.slug) return { ok: false, error: `unit absorb: ${target ?? '(none)'} is not the target of ${key}; give --into <the unit of slug ${u.slug}>` };
  const tw = ledger.waves.find((x) => x.n === t.wave);
  if (!tw || tw.state === 'planned') return { ok: false, error: `unit absorb: the wave of ${target} has not started; replan places ${key} after it` };
  u['absorbed-into'] = target;
  for (const w of ledger.waves) {
    if (w.state === 'planned') w.units = w.units.filter((k) => k !== key);
    if (w['extensions-pending']) { w['extensions-pending'] = w['extensions-pending'].filter((k) => k !== key); if (!w['extensions-pending'].length) delete w['extensions-pending']; }
  }
  const ws = readWorkSet(root, b);
  if (!ws.error) replan(ledger, unitsOf(ws, ledger), { revision: ledger['work-revision'], now: nowIso() });
  saveLedger(root, b, ledger);
  appendJournal(root, b, 'unit-absorb', { key, into: target, wave: tw.n });
  return { ok: true, key, absorbedInto: target, wave: tw.n };
}

/**
 * 5.4, defer: the extension's slices in the target's roster get `unit: <ext key>`, so the
 * target's walk skips them, and they wait for the extension's own wave.
 */
function deferUnit(root, b, key) {
  const ledger = requireLedger(root, b);
  const u = ledger.units[key];
  if (!u || u.form !== 'extension') throw new Error(`unit defer: ${key} is not an extension unit of this campaign`);
  const target = targetOf(ledger, key);
  if (!target) return { ok: false, error: `unit defer: ${key} has no target unit` };
  const t = ledger.units[target];
  const dir = checkoutOf(root, t);
  const rel = `.ai/workflows/${t.slug}/03-slice.md`;
  const file = join(dir, rel);
  if (!existsSync(file)) return { ok: false, error: `unit defer: ${rel} does not exist in ${dir}` };
  let text = readFileSync(file, 'utf8');
  const free = rosterEntries(text).filter((e) => e.source === 'extension' && !e.unit);
  const exts = Object.keys(ledger.units).filter((k) => ledger.units[k].form === 'extension' && ledger.units[k].slug === t.slug && !ledger.units[k]['absorbed-into'])
    .sort((x, y) => (ledger.units[x].order ?? 0) - (ledger.units[y].order ?? 0) || x.localeCompare(y));
  let mine = free;
  if (exts.length > 1) {
    const rounds = [...new Set(free.map((e) => e.extensionRound ?? 0))].sort((x, y) => x - y);
    if (rounds.length !== exts.length) return { ok: false, error: `unit defer: ${exts.length} extension units target ${t.slug}, and its roster has ${rounds.length} extension round(s) without a unit. Ask the person which slices belong to ${key}.`, candidates: free.map((e) => ({ slice: e.slug, round: e.extensionRound })) };
    mine = free.filter((e) => (e.extensionRound ?? 0) === rounds[exts.indexOf(key)]);
  }
  for (const e of mine) text = editRosterEntry(text, e.slug, { unit: key }) ?? text;
  writeAtomic(file, text);
  const committed = commitRecord(ledger, dir, rel, `chore(${t.slug}): name the unit of the deferred slices`);
  for (const w of ledger.waves) if (w['extensions-pending']) { w['extensions-pending'] = w['extensions-pending'].filter((k) => k !== key); if (!w['extensions-pending'].length) delete w['extensions-pending']; }
  saveLedger(root, b, ledger);
  appendJournal(root, b, 'unit-defer', { key, target, slices: mine.map((e) => e.slug) });
  return { ok: true, key, target, slices: mine.map((e) => e.slug), committed };
}

function unit(root, b, [key, state], f) {
  if (state === 'absorb') return absorbUnit(root, b, key, f);
  if (state === 'defer') return deferUnit(root, b, key);
  if (!UNIT_STATES.includes(state)) throw new Error(`unit: the state is one of ${UNIT_STATES.join(', ')}, or absorb or defer for an extension unit`);
  const ledger = requireLedger(root, b);
  const u = ledger.units[key];
  if (!u) throw new Error(`unit: ${key} is not a build unit of this campaign`);
  if (state === 'prepared') {
    if (unconfirmedKeys(ledger).includes(key)) return { ok: false, key, state: u.state, error: `unit ${key} is not prepared: the person has not confirmed its dependency graph. Run the deps phase first.` };
    const why = designBlocksPrepared(root, u.slug);
    if (why) return { ok: false, key, state: u.state, error: `unit ${key} is not prepared: ${why}` };
  }
  u.state = state;
  for (const k of ['route', 'reason', 'merge', 'output']) if (f[k] !== undefined) u[k] = f[k];
  // N5: `unit <key> waiting --on <from>:<through>` records what the drive waits for.
  if (state === 'waiting') u.route = `waits for ${f.on ?? (u.waits ?? []).filter((w) => w.state === 'open').map((w) => `${w.from}: ${w.through}`).join(', ')}`;
  // A unit that runs again has no route of a wait or a park.
  if (state === 'running' && f.route === undefined) u.route = null;
  // 5.5a step 7: a unit that moves out of the wave rejects every wait on it.
  const rejected = [];
  if (isMoved(u)) {
    for (const k of ledger.waves.find((x) => x.n === u.wave)?.units ?? []) {
      for (const wt of ledger.units[k]?.waits ?? []) {
        if (wt.from === key && waitPending(wt)) { wt.state = 'rejected'; wt['rejected-at'] = nowIso(); rejected.push({ key: k, from: key, through: wt.through }); }
      }
    }
  }
  // The yolo outcome's decision digest, kept for the as-built note (11.1).
  if (f.digest !== undefined) { try { u.digest = JSON.parse(f.digest); } catch { u.digest = f.digest; } }
  saveLedger(root, b, ledger);
  appendJournal(root, b, 'unit-state', { key, slug: u.slug, state, ...(f.route ? { route: f.route } : {}) });
  return { ok: true, key, state, ...(rejected.length ? { rejected } : {}) };
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
    const building = lives.find((x) => ['running', 'boundary'].includes(x.state) && !waveReady(x));
    if (building) throw new Error(`wave ${building.n} is ${building.state}: a wave starts after the wave below merged its slugs into its branch`);
    // Stage D2: with stacked wave PRs, a wave may start on the wave branch below
    // while that wave waits in handoff or ship, up to max-unshipped (12.5).
    if (lives.length && !ledger.stack?.enabled) throw new Error(`wave ${lives[0].n} is ${lives[0].state}: without stacked PRs a wave starts after the previous wave merged`);
    const max = ledger.stack?.['max-unshipped'] ?? DEFAULT_MAX_UNSHIPPED;
    if (lives.length >= max) throw new Error(`${lives.length} unshipped waves wait above the trunk (max-unshipped ${max}): ship one first`);
    // 4.3: a unit joins a started wave only with its confirmed graph.
    const pending = unconfirmedKeys(ledger).filter((k) => w.units.includes(k));
    if (pending.length) return { ok: false, error: `wave ${n} has units whose dependency graph is not confirmed: ${pending.join(', ')}. Run the deps phase first.`, unconfirmed: pending };
    // WF-CAMPAIGN-SLICE-ORDER-PLAN 4.6 step 5: an extension follows its target.
    const extErrors = extensionWaveErrors(ledger, n);
    if (extErrors.length) return { ok: false, error: extErrors.join(' '), extensions: extErrors };
    // 4.7: each need that a slice doc names is in the graph before the wave starts.
    const gaps = crossUnitNeedsGaps(root, ledger, w);
    if (gaps.length) {
      return {
        ok: false, gaps,
        error: `wave ${n}: ${gaps.length} cross-unit need(s) that a slice doc names are not in the dependency graph. Record each one with \`deps <key> needs add --from <key> --through <slice> --before <slice> --why <text> --by prepare\` (campaign/_phases.md, "Rolling prepare" step 1.3), then run replan. When an item is no need, take it out of the section.`,
      };
    }
    const ws = readWorkSet(root, b);
    const units = ws.error ? [] : unitsOf(ws, ledger);
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
  if (action === 'launch') return launch(root, b, n, f);
  if (action === 'record') return record(root, b, n, f);
  if (action === 'sorted') return sorted(root, b, ledger, w);
  throw new Error('wave: the action is start, set, launch, record or sorted');
}

/**
 * WF-CAMPAIGN-SLICE-ORDER-PLAN 4.7: the items of each unit's "Cross-Unit Needs" section
 * (03-slice.md) that name another unit of wave `w` and have no matching need in the
 * dependency graph, in either direction.
 */
function crossUnitNeedsGaps(root, ledger, w) {
  const keys = w.units.filter((k) => ledger.units[k]);
  const names = (k) => [...new Set([k, ledger.units[k].slug, ledger.units[k]['work-slug']].filter(Boolean))];
  const mentions = (text, name) => new RegExp(`(^|[^\\w-])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\w-]|$)`).test(text);
  const needsOf = (k) => ledger.deps?.units?.[k]?.needs ?? [];
  const gaps = [];
  for (const k of keys) {
    const f = join(unitWorkflowDir(root, ledger.units[k]), '03-slice.md');
    if (!existsSync(f)) continue;
    const lines = readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n');
    const at = lines.findIndex((l) => /^#{1,6}\s+Cross-Unit Needs/i.test(l));
    if (at < 0) continue;
    const level = /^#+/.exec(lines[at])[0].length;
    for (let i = at + 1; i < lines.length; i++) {
      const h = /^(#+)\s/.exec(lines[i]);
      if (h && h[1].length <= level) break;
      const item = lines[i].trim();
      if (!/^([-*]|\d+\.|\|)/.test(item) || /^\|[\s|:-]+\|$/.test(item)) continue;
      for (const other of keys) {
        if (other === k || !names(other).some((nm) => mentions(item, nm))) continue;
        const met = needsOf(k).some((x) => x.from === other) || needsOf(other).some((x) => x.from === k);
        if (!met) gaps.push({ key: k, names: other, item: item.slice(0, 300) });
      }
    }
  }
  return gaps;
}

/**
 * 5.3 step 5: `wave <n> sorted` — the person sorted the legacy waits. Each legacy wait
 * that is still pending is a need now, because the person kept it. Refuses while an
 * extension unit of the wave is not placed (absorb or defer, 5.4).
 */
function sorted(root, b, ledger, w) {
  if ((w['extensions-pending'] ?? []).length) return { ok: false, error: `wave ${w.n}: place each extension first, with unit <key> absorb --into <target> or unit <key> defer: ${w['extensions-pending'].join(', ')}` };
  let kept = 0;
  for (const k of w.units) {
    const lu = ledger.units[k];
    for (const x of lu?.waits ?? []) if (x.kind === 'legacy') { x.kind = 'need'; kept++; }
    for (const x of lu?.['derived-needs'] ?? []) if (x.kind === 'legacy') x.kind = 'need';
  }
  delete w['legacy-order'];
  saveLedger(root, b, ledger);
  appendJournal(root, b, 'waits-sorted', { wave: w.n, kept });
  return { ok: true, wave: w.n, kept, next: campaignAction(ledger, {}) };
}

function ask(root, b, args, f) {
  const [id, ...text] = args;
  const ledger = requireLedger(root, b);
  const same = ledger.questions.find((q) => q.id === id && !q['answered-at']);
  // W0a: a repeated ask of the same open question changes nothing, so an agent that runs twice does not fail.
  if (same && same.text === text.join(' ')) return { ok: true, exists: true, question: same };
  if (same) throw new Error(`ask: question ${id} is open with another text`);
  if (f.unit && !ledger.units[f.unit]) throw new Error(`ask: ${f.unit} is not a build unit of this campaign`);
  const q = {
    id, ...(f.wave ? { wave: Number(f.wave) } : {}),
    ...(f.unit ? { unit: f.unit } : {}), ...(f.kind ? { kind: f.kind } : {}), ...(f.stage ? { stage: f.stage } : {}), ...(f.slice ? { slice: f.slice } : {}),
    text: text.join(' '), 'asked-at': nowIso(),
  };
  ledger.questions.push(q);
  saveLedger(root, b, ledger);
  appendJournal(root, b, 'asked', { id, wave: q.wave ?? null, ...(q.unit ? { unit: q.unit, kind: q.kind ?? null } : {}), text: q.text });
  return { ok: true, question: q };
}

function reply(root, b, [id, ...text], f = {}) {
  const ledger = requireLedger(root, b);
  const q = ledger.questions.find((x) => x.id === id && !x['answered-at']);
  if (!q) throw new Error(`reply: no open question ${id}`);
  q.answer = text.join(' ');
  q['answered-at'] = nowIso();
  q.by = f.by ?? 'person';
  if (f.move === true) q.move = true;
  saveLedger(root, b, ledger);
  appendJournal(root, b, 'answered', { id, by: q.by, ...(q.unit ? { unit: q.unit } : {}), ...(q.move ? { move: true } : {}) });
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
  const units = unitsOf(ws, ledger);
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
  const units = ws.error ? [] : unitsOf(ws, ledger);
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
  const units = ws.error ? [] : unitsOf(ws, ledger);
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
  // W0a: a decision taken for the person also answers the open question of the same id.
  const q = (ledger.questions ?? []).find((x) => x.id === id && !x['answered-at']);
  if (q) { q.answer = d.answer; q['answered-at'] = d.at; q.by = 'session'; }
  saveLedger(root, b, ledger);
  const file = decidedPath(root, b);
  const head = existsSync(file) ? '' : `# Decided for the person: ${b}\n\nThe campaign took these decisions while the person was away. Each one names the question, the answer, and why. The recap lists the intent-bearing ones first.\n`;
  const opts = Array.isArray(options) ? options.map((o) => (typeof o === 'string' ? o : o?.label ?? JSON.stringify(o))).join('; ') : (options ?? '');
  appendFileSync(file, `${head}\n## ${id} — ${d.at}${d['intent-bearing'] ? ' — intent-bearing' : ''}\n\n- Question: ${d.question}\n${opts ? `- Options: ${opts}\n` : ''}- Answer: ${d.answer}\n- Why: ${d.why}\n${d.unit ? `- Unit: ${d.unit}\n` : ''}`);
  appendJournal(root, b, 'decided', { id, ...(d['intent-bearing'] ? { 'intent-bearing': true } : {}) });
  return { ok: true, decided: d, path: file, ...(q ? { answered: q.id } : {}), limits: AWAY_LIMITS };
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

/**
 * 5.13 "Overnight": the steps that waited for the person while the person was away —
 * the cleanup of each merged unit, the handoff of each wave whose boundary ended, and
 * each question that holds.
 */
function waitedSteps(ledger) {
  const steps = [];
  for (const [k, u] of Object.entries(ledger.units)) {
    if (u.state === 'merged' && u.worktree?.path && existsSync(u.worktree.path)) steps.push({ step: 'cleanup', key: k, worktree: u.worktree.path, branch: u.worktree.branch ?? null });
  }
  for (const w of ledger.waves) {
    if (!['running', 'boundary'].includes(w.state) || w.run?.id) continue;
    const states = w.units.map((k) => ledger.units[k]?.state);
    if (states.some((s) => s === 'merged') && states.every((s) => ['merged', 'needs-fix', 'stopped'].includes(s))) steps.push({ step: 'handoff', wave: w.n, branch: w.branch ?? null });
  }
  for (const q of ledger.questions ?? []) if (!q['answered-at']) steps.push({ step: 'question', id: q.id, wave: q.wave ?? null, unit: q.unit ?? null, kind: q.kind ?? null, text: q.text });
  return steps;
}

function back(root, b) {
  const ledger = requireLedger(root, b);
  const since = ledger.presence?.state === 'away' ? ledger.presence.since : null;
  ledger.presence = { state: 'present', since: nowIso(), ...(since ? { 'last-away': since } : {}) };
  saveLedger(root, b, ledger);
  appendJournal(root, b, 'back', {});
  return { ok: true, presence: ledger.presence, recap: recapOf(root, ledger, since), waited: waitedSteps(ledger) };
}

export function main(argv = process.argv.slice(2)) {
  const [cmd, rootArg, b, ...rest] = argv;
  if (!cmd || !rootArg || !b) { process.stderr.write(`${USAGE}\n`); return 2; }
  const root = resolve(rootArg);
  const { pos, f } = flags(rest);
  let out;
  try {
    // Without a work folder, no ledger can exist, and the lock would leave an empty folder.
    out = LEDGER_COMMANDS.has(cmd) && existsSync(workDir(root, b))
      ? withRecordsLock(ledgerLockPath(root, b), `${cmd} ${pos[0] ?? ''}`.trim(), () => dispatch(cmd, root, b, pos, f), { waitMs: 120_000, liveStaleMs: 30 * 60_000 })
      : dispatch(cmd, root, b, pos, f);
  } catch (e) {
    out = { ok: false, error: e.message };
  }
  if (out === null) { process.stderr.write(`${USAGE}\n`); return 2; }
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  return out.ok ? 0 : 1;
}

function dispatch(cmd, root, b, pos, f) {
  let out;
  {
    switch (cmd) {
      case 'orient': out = orient(root, b); break;
      case 'status': out = status(root, b); break;
      case 'replan': out = doReplan(root, b); break;
      case 'answer': out = answer(root, b, pos); break;
      case 'unit': out = unit(root, b, pos, f); break;
      case 'outside': out = outside(root, b, pos); break;
      case 'wave': out = wave(root, b, pos, f); break;
      case 'ask': out = ask(root, b, pos, f); break;
      case 'reply': out = reply(root, b, pos, f); break;
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
      case 'merge-in': out = mergeIn(root, b, pos, f); break;
      case 'merge-order': out = mergeOrder(root, b, pos); break;
      case 'steer': out = steer(root, b, pos, f); break;
      case 'rule': out = rule(root, b, pos, f); break;
      case 'away': out = away(root, b, f); break;
      case 'back': out = back(root, b); break;
      case 'decided': out = decided(root, b, pos, f); break;
      case 'recap': out = recap(root, b, f); break;
      case 'slice-done': out = sliceDone(root, b, pos, f); break;
      case 'needs': out = needs(root, b, pos, f); break;
      case 'contract': out = contract(root, b, pos, f); break;
      case 'await': out = awaitCmd(root, b, f); break;
      case 'question': out = question(root, b, pos); break;
      case 'deps': out = depsCmd(root, b, pos, f); break;
      // `owner <root> <slug>`: the second argument is the slug, not a brainstorm.
      case 'owner': out = owner(root, b); break;
      // `slice-order <checkout> <slug> add`: the root is the unit's checkout, the second argument the slug.
      case 'slice-order': out = sliceOrder(root, b, pos, f); break;
      case 'schedule': out = schedule(root, b, pos, f); break;
      case 'locks': out = locksCmd(root, b, pos, f); break;
      default: return null;
    }
  }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
