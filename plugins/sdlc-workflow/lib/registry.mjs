// lib/registry.mjs
//
// The machine-wide multi-repo registry — every repo+branch/worktree where
// sdlc-workflow has rendered. Lives in the home dir (`~/.sdlc/`), never inside a
// repo, so it spans all repos and is never committed. See
// MULTI-REPO-REGISTRY-PLAN §3.
//
// Write strategy (§3.4): a render NEVER rewrites the whole registry.json (two
// worktrees rendering at once would lose entries — both read stale JSON before
// either writes). Instead:
//   • If the hub is alive, POST the single entry to it (the hub is the sole
//     merger of registry.json).
//   • If the hub is down, write ONLY this entry to `~/.sdlc/registry.d/<id>.json`
//     (atomic rename of a one-entry file — no cross-entry contention).
// The hub merges shards into registry.json at startup and on POST. If the hub
// never runs, the writer-as-janitor merges + clears once the shard dir exceeds
// SHARD_SOFT_CAP, so a hub-less developer never silently leaks shards.
//
// Security (§3.6, invariant #5): `resolveRequestPath` only stops escape *within*
// a viewDir; it cannot tell whether the viewDir itself is legitimate. So every
// entry is rejected on read AND write unless its viewDir realpaths to a path
// ending in `.ai/_view` and sits under its own declared repoRoot inside a real
// git repo. Without this, a poisoned entry (`viewDir:"C:\\"`) would be perfectly
// "contained" — to the whole drive.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync,
  renameSync, rmSync, realpathSync, statSync, appendFileSync,
} from 'node:fs';
import { request } from 'node:http';
import { homedir } from 'node:os';
import { basename, dirname, join, sep } from 'node:path';

import { readPidFile, isPidAlive } from './pid-file.mjs';
import { scanWorkflowIndexes } from './workflow-index.mjs';
import { computeBranchState } from './branch-liveness.mjs';
import { countPending } from './render-queue.mjs';

export const REGISTRY_VERSION = 2;   // v2 (SLUG-BRANCH-IDENTITY §4.2): id = hash(repoRoot) only
export const SHARD_SOFT_CAP = 100;   // §3.4 — writer-as-janitor merge trigger
// Fresh-registration survival window (FRESH-REPO-REGISTRATION-FIX-PLAN F2): a
// repo registered moments ago legitimately has neither `.last-render` nor
// queued work while its bootstrap render is still being scheduled; the prune
// paths keep it alive this long before the no-output arm may fire.
export const REGISTRY_FRESH_GRACE_MS = 10 * 60 * 1000;

/* ───────────────────────── Home-dir paths ───────────────────────── */
// `~/.sdlc/` is the correct home for all of these precisely because the hub is a
// single machine-wide process, not a per-repo one (§3).

export function sdlcHomeDir() {
  // SDLC_HOME relocates the entire machine-wide state dir (registry, shards,
  // hub.pid, hub-config). A state-location override (like GIT_DIR / XDG_*), not
  // a behaviour flag — keeps tests hermetic and lets power users relocate it.
  const override = process.env.SDLC_HOME;
  return override && override.trim() ? override : join(homedir(), '.sdlc');
}
export function registryPath() {
  return join(sdlcHomeDir(), 'registry.json');
}
export function shardDir() {
  return join(sdlcHomeDir(), 'registry.d');
}
export function pruneLogPath() {
  return join(sdlcHomeDir(), 'registry.prune.log');
}
export function hubPidPath() {
  return join(sdlcHomeDir(), 'hub.pid');
}

/* ───────────────────────── git identity (§3.1) ───────────────────────── */

function git(cwd, args) {
  try {
    return execFileSync('git', ['-C', cwd, ...args], {
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Resolve repo+worktree identity for a checkout, plus the checkout's current
 * HEAD branch as INFORMATIONAL context (`headBranch` — no longer part of the
 * entry id; see §4.2). Returns null if `cwd` is not inside a git repo (the
 * registry is a git-repo concept).
 */
export function gitIdentity(cwd) {
  const topLevel = git(cwd, ['rev-parse', '--show-toplevel']);
  if (!topLevel) return null;

  let repoRoot;
  try { repoRoot = realpathSync.native(topLevel); }
  catch { repoRoot = topLevel.replace(/\//g, sep); }

  let headBranch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  // Detached HEAD → fall back to the worktree basename so the label is stable.
  if (!headBranch || headBranch === 'HEAD') headBranch = basename(repoRoot);

  // Worktree detection: a linked worktree's git dir differs from the common dir.
  const gitDir = git(cwd, ['rev-parse', '--absolute-git-dir']);
  const commonDirRaw = git(cwd, ['rev-parse', '--git-common-dir']);
  let isWorktree = false;
  if (gitDir && commonDirRaw) {
    const commonAbs = commonDirRaw.match(/^([a-zA-Z]:[\\/]|\/)/)
      ? commonDirRaw
      : join(repoRoot, commonDirRaw);
    isWorktree = canon(gitDir) !== canon(commonAbs);
  }

  return {
    repoRoot,
    headBranch,
    // A linked worktree has its OWN repoRoot, so repo-scoped ids keep worktrees
    // distinct for free; the label is kept for display.
    worktreeLabel: isWorktree ? basename(repoRoot) : null,
  };
}

function canon(p) {
  try { return realpathSync.native(p); } catch { return p; }
}

/* ───────────────────────── id computation (§3.3) ───────────────────────── */

/**
 * sha256(repoRoot_fwdslash) → first 12 hex chars (48 bits). repoRoot is
 * normalised to forward slashes for cross-platform hash stability.
 *
 * REPO-SCOPED (§4.2/D1): the id is keyed off repoRoot ALONE — branch is no
 * longer in the digest. One entry per checkout/worktree, so an in-place
 * `git checkout` of a new branch can never fork the entry into a phantom
 * duplicate. (A linked worktree has its own repoRoot, so it stays distinct.)
 * The optional 2nd arg is accepted-and-ignored for source call-site
 * compatibility during the transition; it does not affect the digest.
 */
export function computeEntryId(repoRoot, _ignoredBranch) {
  const fwd = String(repoRoot).replace(/\\/g, '/');
  return createHash('sha256').update(fwd).digest('hex').slice(0, 12);
}

/**
 * Resolve an id against existing entries, appending a 4-char path-hash suffix on
 * a genuine collision (same 12-hex id, GENUINELY different repoRoot). The clash
 * test is branch-INSENSITIVE (§4.2): switching branches must NOT re-split the
 * entry we just collapsed — only a different repoRoot colliding on the same
 * 48-bit base earns a suffix.
 */
function resolveEntryId(repoRoot, existing) {
  const base = computeEntryId(repoRoot);
  const clash = existing.find((e) => e.id === base && e.repoRoot !== repoRoot);
  if (!clash) return base;
  const suffix = createHash('sha256').update(String(repoRoot)).digest('hex').slice(0, 4);
  return `${base}-${suffix}`;
}

/* ───────────────────────── entry validation (§3.6) ───────────────────────── */

/**
 * Defence-in-depth gate run at BOTH write and read. Rejects an entry unless its
 * viewDir realpaths under its own repoRoot, ends in `.ai/_view`, and the repoRoot
 * is a real git repo. Returns { ok, reason? }. Never throws.
 */
export function validateEntry(entry) {
  if (!entry || typeof entry !== 'object') return { ok: false, reason: 'not an object' };
  const { id, repoRoot, viewDir } = entry;
  // `headBranch` is canonical (§4.2); tolerate a legacy v1 `branch` so an
  // un-migrated on-disk entry or stale shard still validates structurally.
  const headBranch = entry.headBranch ?? entry.branch;
  if (!id || !repoRoot || !headBranch || !viewDir) {
    return { ok: false, reason: 'missing id/repoRoot/headBranch/viewDir' };
  }

  let realView;
  try { realView = realpathSync.native(viewDir); }
  catch { return { ok: false, reason: `viewDir does not resolve: ${viewDir}` }; }

  // 1. basename chain ends in `.ai/_view`
  if (basename(realView) !== '_view' || basename(dirname(realView)) !== '.ai') {
    return { ok: false, reason: `viewDir is not a .ai/_view path: ${realView}` };
  }

  // 2. viewDir is a descendant of realpath(repoRoot)
  let realRepo;
  try { realRepo = realpathSync.native(repoRoot); }
  catch { return { ok: false, reason: `repoRoot does not resolve: ${repoRoot}` }; }
  const repoWithSep = realRepo.endsWith(sep) ? realRepo : `${realRepo}${sep}`;
  if (realView !== realRepo && !realView.startsWith(repoWithSep)) {
    return { ok: false, reason: `viewDir escapes repoRoot: ${realView} ⊄ ${realRepo}` };
  }

  // 3. repoRoot is a real git repo (.git dir OR file — worktrees use a file)
  if (!existsSync(join(realRepo, '.git'))) {
    return { ok: false, reason: `repoRoot is not a git repo: ${realRepo}` };
  }

  return { ok: true };
}

/* ───────────────────────── entry construction ───────────────────────── */

function readLastRender(viewDir) {
  const marker = join(viewDir, '.last-render');
  if (!existsSync(marker)) return { renderedAt: null, configHash: null, version: null, buildId: null };
  try {
    const parsed = JSON.parse(readFileSync(marker, 'utf-8'));
    return {
      renderedAt: parsed.renderedAt ?? null,
      configHash: parsed.configHash ?? null,
      // The shared runtimeVersion the view was rendered under (STALE-RENDER-HEAL
      // §2). null for a pre-9.60 marker that predates the stamp.
      version: typeof parsed.version === 'string' && parsed.version ? parsed.version : null,
      // The shared-runtime buildId the view was rendered under (NATIVE-INTEROP
      // Workstream B — the cross-host-safe drift signal). null for a pre-9.75
      // marker that predates the buildId stamp.
      buildId: typeof parsed.buildId === 'string' && parsed.buildId ? parsed.buildId : null,
    };
  } catch {
    return { renderedAt: null, configHash: null, version: null, buildId: null };
  }
}

async function collectSlugMeta({ projectRoot, workflowsRoot }) {
  try {
    const workflows = await scanWorkflowIndexes({ projectRoot, workflowsRoot });
    return workflows
      .filter((w) => w.classification !== 'invalid')
      .map((w) => {
        // Per-slug branch facts (SLUG-BRANCH-IDENTITY-PLAN §4.1). Already
        // blank-normalised by loadWorkflowIndex; tolerate legacy/hand-edited
        // indexes lacking them — default null, never throw.
        const branch = w.branch ?? null;
        const baseBranch = w.baseBranch ?? null;
        const prNumber = w.prNumber ?? null;
        return {
          slug: w.slug,
          title: w.title ?? null,
          currentStage: w.currentStage ?? null,
          status: w.status ?? null,
          classification: w.classification,
          blocked: w.status === 'blocked' || w.frontmatter?.blocked === true,
          branch,
          branchStrategy: w.branchStrategy ?? null,
          baseBranch,
          prNumber,
          prUrl: w.prUrl ?? null,
          // Liveness stamped at render time — buildEntry already has repoRoot and
          // runs git (§4.3). Best-effort: 'unknown' when there's no branch / no
          // git. Local-git only (checkPr:false) so the hot artifact-write render
          // path never makes a `gh` network call (R2); local ref + base-ancestry
          // already yield gone/merged. The hub refresh is likewise local-only.
          branchState: computeBranchState({ repoRoot: projectRoot, branch, baseBranch, prNumber, currentStage: w.currentStage ?? null, checkPr: false }),
        };
      });
  } catch {
    return [];
  }
}

/**
 * Build a registry entry for a checkout. Async (scans workflow indexes for
 * slugMeta). Returns null when `projectRoot` is not inside a git repo.
 */
export async function buildEntry({ projectRoot, viewDir, configHash = null, existing = [], nowIso }) {
  const identity = gitIdentity(projectRoot);
  if (!identity) return null;
  const { repoRoot, headBranch, worktreeLabel } = identity;

  const resolvedViewDir = (() => {
    try { return realpathSync.native(viewDir); } catch { return viewDir; }
  })();

  const id = resolveEntryId(repoRoot, existing);
  const last = readLastRender(resolvedViewDir);
  const workflowsRoot = join(repoRoot, '.ai', 'workflows');
  const slugMeta = await collectSlugMeta({ projectRoot: repoRoot, workflowsRoot });
  const stamp = nowIso ?? new Date().toISOString();
  const prior = existing.find((e) => e.id === id);

  return {
    id,
    repoRoot,
    // Informational only — the checkout's current HEAD, NOT identity (§4.2).
    // Per-slug branches (the authored truth) live on each slugMeta row.
    headBranch,
    worktreeLabel,
    viewDir: resolvedViewDir,
    lastRenderedAt: last.renderedAt ?? stamp,
    // Shared runtimeVersion + buildId the view was last rendered under — the
    // stale-render heal's drift signal (STALE-RENDER-HEAL §2, NATIVE-INTEROP
    // Workstream B). Daemons read them live from `.last-render`, but carrying
    // them on the entry surfaces them in the hub inbox.
    renderedVersion: last.version ?? null,
    renderedBuildId: last.buildId ?? null,
    slugs: slugMeta.map((s) => s.slug),
    slugMeta,
    configHash: configHash ?? last.configHash ?? null,
    registeredAt: prior?.registeredAt ?? stamp,
    updatedAt: stamp,
  };
}

/* ───────────────────────── registry read / migrate / merge ───────────────────────── */

/**
 * Re-key entries off repoRoot ALONE (D1) and collapse any that now map to the
 * same id. The single mechanism behind BOTH the v1→v2 migration AND the merged
 * read view, so it must be idempotent: re-keying an already-repo-scoped (v2)
 * entry yields the same id and no collapse. Running it on the combined
 * file ∪ shard set means a stale pre-upgrade (v1, branch-keyed) shard can't
 * resurrect a phantom duplicate next to its migrated v2 twin. §4.2.
 *
 * Collapse rule: union slugMeta by slug (newer entry wins per slug), latest
 * `updatedAt` wins the scalar fields, earliest `registeredAt` is preserved.
 */
function repoScopeEntries(entries) {
  const byId = new Map();
  for (const raw of (entries ?? [])) {
    if (!raw || typeof raw !== 'object' || !raw.repoRoot) continue;
    const id = computeEntryId(raw.repoRoot);
    const headBranch = raw.headBranch ?? raw.branch ?? null;
    const e = { ...raw, id, headBranch };
    delete e.branch;   // drop the legacy v1 field once promoted to headBranch
    const prev = byId.get(id);
    byId.set(id, prev ? mergeCollapsedEntries(prev, e) : e);
  }
  return [...byId.values()].sort(
    (a, b) => String(a.registeredAt ?? '').localeCompare(String(b.registeredAt ?? '')),
  );
}

function mergeCollapsedEntries(a, b) {
  const newer = String(b.updatedAt ?? '') >= String(a.updatedAt ?? '') ? b : a;
  const older = newer === b ? a : b;
  // Union slugMeta by slug; the newer entry's row wins on conflict.
  const slugMap = new Map();
  for (const sm of (older.slugMeta ?? [])) slugMap.set(sm.slug, sm);
  for (const sm of (newer.slugMeta ?? [])) slugMap.set(sm.slug, sm);
  const slugMeta = [...slugMap.values()];
  const registered = [a.registeredAt, b.registeredAt].filter(Boolean).sort();
  return {
    ...newer,
    slugMeta,
    slugs: slugMeta.map((s) => s.slug),
    registeredAt: registered[0] ?? newer.registeredAt ?? null,
  };
}

function migrateRegistry(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.entries)) {
    return { version: REGISTRY_VERSION, entries: [] };
  }
  if (raw.version === REGISTRY_VERSION) {
    return { version: REGISTRY_VERSION, entries: raw.entries };
  }
  // v1 (or older / unversioned) → v2: repo-scope re-key + collapse phantom
  // branch-forked duplicates. Pure transform on read — no migration command.
  return { version: REGISTRY_VERSION, entries: repoScopeEntries(raw.entries) };
}

function readRegistryFile() {
  const path = registryPath();
  if (!existsSync(path)) return { version: REGISTRY_VERSION, entries: [] };
  try {
    return migrateRegistry(JSON.parse(readFileSync(path, 'utf-8')));
  } catch {
    return { version: REGISTRY_VERSION, entries: [] };
  }
}

function readShards() {
  const dir = shardDir();
  if (!existsSync(dir)) return [];
  const out = [];
  let names;
  try { names = readdirSync(dir).filter((n) => n.endsWith('.json')); }
  catch { return []; }
  for (const name of names) {
    try {
      const entry = JSON.parse(readFileSync(join(dir, name), 'utf-8'));
      if (entry && typeof entry === 'object' && entry.id) out.push({ entry, file: join(dir, name) });
    } catch { /* skip torn shard */ }
  }
  return out;
}

/**
 * The merged, validated view of the registry: registry.json ∪ shards. Pure read
 * — never writes or clears shards (use mergeShardsIntoRegistry for that). The
 * combined set is repo-scoped (re-keyed + collapsed) so a v1 shard sitting next
 * to its migrated v2 twin folds into one entry. Invalid entries (§3.6) are
 * dropped and logged. `{ version, entries }`.
 */
export function readRegistry({ validate = true, logInvalid = true } = {}) {
  const file = readRegistryFile();
  const shards = readShards().map((s) => s.entry);
  let entries = repoScopeEntries([...file.entries, ...shards]);
  if (validate) {
    entries = entries.filter((e) => {
      const v = validateEntry(e);
      if (!v.ok && logInvalid) logPrune(`drop-on-read ${e.id ?? '?'}: ${v.reason}`);
      return v.ok;
    });
  }
  return { version: REGISTRY_VERSION, entries };
}

function writeRegistryAtomic(registry) {
  const path = registryPath();
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(registry, null, 2)}\n`, 'utf-8');
  try { renameSync(tmp, path); }
  catch (err) { try { rmSync(tmp, { force: true }); } catch { /* ignore */ } throw err; }
}

/**
 * Persist an entry list as the registry (atomic). The hub is the sole writer of
 * registry.json, so it calls this after every in-memory mutation (upsert/drop).
 * Entries are sorted by registeredAt for a stable on-disk order.
 */
export function writeRegistry(entries) {
  const sorted = [...entries].sort(
    (a, b) => String(a.registeredAt ?? '').localeCompare(String(b.registeredAt ?? '')),
  );
  writeRegistryAtomic({ version: REGISTRY_VERSION, entries: sorted });
}

/**
 * Merge all shards into registry.json (validating), then delete applied shards.
 * The hub does this at startup and on POST; the writer-as-janitor does it past
 * SHARD_SOFT_CAP. Returns { entries, mergedShards }.
 */
export function mergeShardsIntoRegistry() {
  const file = readRegistryFile();
  const shards = readShards();
  const merged = repoScopeEntries([...file.entries, ...shards.map((s) => s.entry)])
    .filter((e) => validateEntry(e).ok);
  writeRegistryAtomic({ version: REGISTRY_VERSION, entries: merged });
  for (const { file: shardFile } of shards) {
    try { rmSync(shardFile, { force: true }); } catch { /* ignore */ }
  }
  return { entries: merged, mergedShards: shards.length };
}

/* ───────────────────────── pruning (§3.5) ───────────────────────── */

/**
 * True while an entry's `updatedAt` is younger than `graceMs` — the fresh-
 * registration survival window (FRESH-REPO-REGISTRATION-FIX-PLAN F2). Without
 * it, a repo registered with an empty queue is reaped before its bootstrap
 * render can land. A missing or unparseable `updatedAt` is NOT fresh.
 */
export function entryWithinGrace(entry, graceMs = REGISTRY_FRESH_GRACE_MS, now = Date.now()) {
  const t = Date.parse(entry?.updatedAt ?? '');
  return Number.isFinite(t) && now - t < graceMs;
}

/**
 * Drop any entry whose repoRoot or viewDir no longer exists (or that fails
 * validation), OR that has neither rendered output (.last-render) nor pending
 * render-queue work once past the fresh-registration grace window. The
 * pending-queue clause (RENDER-DISPATCH-PLAN) keeps a registered-but-not-yet-
 * rendered repo alive while its render is queued; the grace window (F2) covers
 * the moments before that first job exists at all. Missing backing dirs and
 * failed validation prune immediately regardless of grace — that arm is the
 * real GC. Rewrites registry.json and clears shards. Logs pruned entries with
 * the arm that fired. Returns { kept, pruned }.
 */
export function pruneRegistry({ graceMs = REGISTRY_FRESH_GRACE_MS, now = Date.now() } = {}) {
  const { entries } = readRegistry({ validate: false, logInvalid: false });
  const kept = [];
  let pruned = 0;
  for (const e of entries) {
    const valid = validateEntry(e).ok;
    const backing = valid && existsSync(e.repoRoot) && existsSync(e.viewDir);
    const hasWork = backing
      && (existsSync(join(e.viewDir, '.last-render')) || countPending(e.viewDir) > 0);
    if (backing && (hasWork || entryWithinGrace(e, graceMs, now))) {
      kept.push(e);
    } else {
      pruned++;
      const reason = !valid ? 'failed validation'
        : !backing ? 'missing repoRoot/viewDir'
          : 'no .last-render + no queued renders past registration grace';
      logPrune(`prune ${e.id ?? '?'} (${e.repoRoot ?? '?'} @ ${e.headBranch ?? e.branch ?? '?'}): ${reason}`);
    }
  }
  writeRegistryAtomic({ version: REGISTRY_VERSION, entries: kept });
  // Whole-file rewrite supersedes any shards — clear them so a stale shard can't
  // resurrect a pruned entry on the next read.
  for (const { file } of readShards()) { try { rmSync(file, { force: true }); } catch { /* ignore */ } }
  return { kept: kept.length, pruned };
}

// Exported so the hub's reconcile loop can mirror its prunes into the same
// on-disk log (F3) — a daemon's stdout is gone once the console closes, and a
// reaped fresh repo used to leave zero trace.
export function logPrune(line) {
  try {
    mkdirSync(sdlcHomeDir(), { recursive: true });
    appendFileSync(pruneLogPath(), `[${new Date().toISOString()}] ${line}\n`, 'utf-8');
  } catch { /* best-effort */ }
}

/* ───────────────────────── shard write + janitor (§3.4) ───────────────────────── */

function writeShard(entry) {
  const dir = shardDir();
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${entry.id}.json`);
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(entry, null, 2)}\n`, 'utf-8');
  try { renameSync(tmp, path); }
  catch (err) { try { rmSync(tmp, { force: true }); } catch { /* ignore */ } throw err; }
}

function shardCount() {
  const dir = shardDir();
  if (!existsSync(dir)) return 0;
  try { return readdirSync(dir).filter((n) => n.endsWith('.json')).length; }
  catch { return 0; }
}

/* ───────────────────────── hub POST (sole-writer path) ───────────────────────── */

function liveHub() {
  // PID-file-gated (no HTTP cost when no hub): read hub.pid, check the pid is
  // alive, and surface its bound address + write token (§3.4 must-fix #5).
  let record = null;
  try {
    const text = readFileSync(hubPidPath(), 'utf-8').trim();
    record = text ? JSON.parse(text) : null;
  } catch { return null; }
  if (!record || !record.pid || !isPidAlive(record.pid)) return null;
  return record;   // { pid, host, port, token, ... }
}

function postEntryToHub(hub, entry) {
  return new Promise((resolve) => {
    let body;
    try { body = JSON.stringify(entry); } catch { return resolve(false); }
    const host = hub.host === '0.0.0.0' ? '127.0.0.1' : (hub.host ?? '127.0.0.1');
    const req = request({
      hostname: host,
      port: hub.port,
      path: '/__sdlc/registry/upsert',
      method: 'POST',
      timeout: 1500,
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
        'x-sdlc-token': hub.token ?? '',
      },
    }, (res) => {
      res.resume();
      resolve(res.statusCode === 200 || res.statusCode === 201);
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
    req.end(body);
  });
}

/* ───────────────────────── consumer .ai/.gitignore seed (F13) ───────────────────────── */

const AI_GITIGNORE_RULES = ['_view/', 'workflows/*/.locks/'];

/**
 * Seed `.ai/.gitignore` next to a VALIDATED viewDir (its parent is known to be
 * a real `.ai` dir) so the rendered view and per-slug lock dirs stay out of
 * `git status` — a fresh repo otherwise stages its own render output
 * (FRESH-REPO-REGISTRATION-FIX-PLAN F13). Append-only and idempotent: user
 * lines are preserved, present rules are never duplicated. Best-effort — a
 * failure must never affect registration.
 */
function seedAiGitignore(viewDir) {
  try {
    const path = join(dirname(viewDir), '.gitignore');
    let text = '';
    try { text = readFileSync(path, 'utf-8'); } catch { /* absent — created below */ }
    const have = new Set(text.split(/\r?\n/).map((l) => l.trim()));
    const missing = AI_GITIGNORE_RULES.filter((r) => !have.has(r));
    if (!missing.length) return;
    const head = text
      ? text.replace(/\r?\n?$/, '\n')
      : '# managed by sdlc-workflow — render output and locks stay out of git\n';
    writeFileSync(path, `${head}${missing.join('\n')}\n`, 'utf-8');
  } catch { /* best-effort */ }
}

/* ───────────────────────── public upsert entrypoint ───────────────────────── */

/**
 * Register (or refresh) this checkout in the machine-wide registry. Best-effort
 * and idempotent — MUST never throw to the caller (a registry write must never
 * affect render success; the next render re-registers). Called from
 * render-sunflower.mjs renderMain() immediately after the `.last-render` flush.
 *
 * @returns {Promise<{ action: string, id?: string }>}
 */
export async function upsertRegistryEntry({ projectRoot = process.cwd(), viewDir, configHash = null } = {}) {
  try {
    const resolvedView = viewDir ?? join(projectRoot, '.ai', '_view');

    // Build against the merged registry so the id collision check + registeredAt
    // preservation see prior state.
    const existing = readRegistry({ logInvalid: false }).entries;
    const entry = await buildEntry({ projectRoot, viewDir: resolvedView, configHash, existing });
    if (!entry) return { action: 'skipped-not-git' };

    // F1 (FRESH-REPO-REGISTRATION-FIX-PLAN): a brand-new repo has no .ai/_view
    // yet — hub-ensure registers BEFORE its writeStatus creates the dir, so
    // validateEntry's realpath used to reject the very first registration.
    // Create the dir at this choke point (covers every caller) and re-stamp the
    // entry with the now-resolvable realpath. A mkdir failure falls through to
    // validateEntry, which rejects with the precise reason.
    try {
      mkdirSync(resolvedView, { recursive: true });
      entry.viewDir = realpathSync.native(resolvedView);
    } catch { /* validateEntry below owns the reject */ }

    // Self-reject a poisoned/misconfigured entry before it ever lands on disk.
    const v = validateEntry(entry);
    if (!v.ok) { logPrune(`reject-on-write ${entry.id}: ${v.reason}`); return { action: 'rejected', id: entry.id }; }

    // F13: the parent of a validated viewDir is a real `.ai` dir — seed its
    // .gitignore so render output and lock dirs never pollute `git status`.
    seedAiGitignore(entry.viewDir);

    // Sole-writer path: hand the entry to the hub if it's alive.
    const hub = liveHub();
    if (hub) {
      const ok = await postEntryToHub(hub, entry);
      if (ok) return { action: 'posted-to-hub', id: entry.id };
      // Hub unreachable despite a live pid — fall through to a shard so the
      // entry isn't lost.
    }

    // Lock-free fallback: write only our own shard (no whole-file race).
    writeShard(entry);

    // Writer-as-janitor: if no hub is consuming shards and they pile up, fold
    // them into registry.json ourselves and clear (§3.4 self-bounding).
    if (!hub && shardCount() > SHARD_SOFT_CAP) {
      try {
        const { mergedShards } = mergeShardsIntoRegistry();
        logPrune(`janitor: merged ${mergedShards} shards past cap ${SHARD_SOFT_CAP}`);
      } catch { /* best-effort */ }
    }

    return { action: 'sharded', id: entry.id };
  } catch (err) {
    // Defensive: never let a registry failure surface to the render.
    try { logPrune(`upsert error: ${err?.message ?? err}`); } catch { /* ignore */ }
    return { action: 'error' };
  }
}
