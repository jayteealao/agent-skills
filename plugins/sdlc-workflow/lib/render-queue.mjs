// lib/render-queue.mjs
//
// RENDER-DISPATCH-PLAN — the durable per-repo render queue. Hooks REPORT a
// managed-artifact write here instead of spawning a renderer; the serving
// daemons (multi-repo hub + standalone per-repo daemon) DRAIN it on their
// reconcile tick and render through the shared bounded engine
// (lib/heal-render.mjs's controller). When no daemon is running, a write still
// lands in the queue and is rendered at the daemon's startup catch-up — so a
// view never silently misses a change, it only lags.
//
// Layout (inside the already-git-ignored, hook-skipped <repo>/.ai/_view/, so a
// queue write can never re-enter the write hooks):
//
//   <viewDir>/.render-queue/
//     <epoch>-<rand>.json   one request per managed write (atomic temp+rename)
//     .processing/          claimed by a drain in progress (restart-overlap safe)
//     .failed/              past the attempt ceiling (surfaced in /__sdlc/health)
//     .status.json          { pendingCount, lastError, hubLastSeenAt, updatedAt }
//   <viewDir>/.render-errors.log   human-readable failures (pre-existing path)
//
// Delivery is AT-LEAST-ONCE; rendering is idempotent (the render version-gate +
// additive dirty-check make a redundant render a near no-op), so duplicate
// delivery is safe.
//
// Host-neutral: the future Codex hooks reuse enqueue() verbatim;
// `enqueuedBy.host` is the only host-specific field and it is provenance only.

import { randomBytes } from 'node:crypto';
import {
  appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync,
  renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

export const QUEUE_VERSION = 1;

const QUEUE_DIRNAME = '.render-queue';
const PROCESSING = '.processing';
const FAILED = '.failed';
const STATUS_FILE = '.status.json';
const ERROR_LOG = '.render-errors.log';   // at viewDir root (matches the pre-existing hook path)

export const RENDER_QUEUE_DEFAULTS = Object.freeze({
  maxPending: 500,       // hard backstop; coalescing bounds the queue by buckets first
  maxAttempts: 3,        // give up + move to .failed/ after this many render failures
  orphanTtlMs: 120000,   // reclaim a .processing/ file abandoned by a dead drain
});

/* ───────────────────────── paths ───────────────────────── */

export function queueDir(viewDir) { return join(viewDir, QUEUE_DIRNAME); }
function processingDir(viewDir) { return join(queueDir(viewDir), PROCESSING); }
function failedDir(viewDir) { return join(queueDir(viewDir), FAILED); }
function statusPath(viewDir) { return join(queueDir(viewDir), STATUS_FILE); }
export function errorLogPath(viewDir) { return join(viewDir, ERROR_LOG); }

/* ───────────────────────── atomic write ───────────────────────── */

// Temp file in the SAME dir + rename. For record/claim/fail the target name is
// unique and absent, so this is rename-into-an-empty-name (no POSIX
// atomic-replace assumption). status.json is the only overwrite; libuv's rename
// replaces an existing target on Windows (same pattern as registry.mjs /
// hub-config.mjs writeAtomic, which run in prod on Windows).
function writeFileAtomic(path, text) {
  const tmp = `${path}.${process.pid}.${randomBytes(3).toString('hex')}.tmp`;
  writeFileSync(tmp, text, 'utf-8');
  try { renameSync(tmp, path); }
  catch (err) { try { rmSync(tmp, { force: true }); } catch { /* ignore */ } throw err; }
}

// Pending record files only — excludes the .status.json sidecar (which also ends
// in .json) and the .processing/.failed subdirs (readdir yields their names, but
// they have no .json extension).
function listRecordFiles(dir) {
  let names;
  try { names = readdirSync(dir); }
  catch { return []; }
  return names.filter((n) => n.endsWith('.json') && n !== STATUS_FILE);
}

/* ───────────────────────── error log ───────────────────────── */

/**
 * Append a human-readable line to <viewDir>/.render-errors.log. Exported so the
 * write hooks report an ensure-hub failure through the same channel. Best-effort.
 */
export function appendError(viewDir, message) {
  try {
    mkdirSync(viewDir, { recursive: true });
    appendFileSync(errorLogPath(viewDir), `[${new Date().toISOString()}] render-queue: ${message}\n`, 'utf-8');
  } catch { /* best-effort */ }
}

/* ───────────────────────── enqueue (the "list") ───────────────────────── */

/**
 * Record one managed-artifact write to the durable queue. Atomic (temp+rename
 * into a unique, epoch-prefixed name). Best-effort: returns { ok, file?, reason? }
 * and NEVER throws — a queue failure must never break a write hook.
 *
 * @param {string} viewDir  absolute <repo>/.ai/_view
 * @param {object} item     { repoRoot, kind, bucket, paths, enqueuedBy }
 * @param {object} [o]      { now, maxPending }
 */
export function enqueue(viewDir, item = {}, {
  now = () => Date.now(),
  maxPending = RENDER_QUEUE_DEFAULTS.maxPending,
} = {}) {
  try {
    if (!viewDir) return { ok: false, reason: 'no viewDir' };
    const dir = queueDir(viewDir);
    mkdirSync(dir, { recursive: true });

    // Backstop only — coalescing normally bounds the queue by buckets touched,
    // but a long outage with churn could still pile up. Evict the oldest beyond
    // the cap (epoch-prefixed names sort chronologically) and log the drop so a
    // silent truncation never reads as "covered everything".
    const existing = listRecordFiles(dir);
    if (existing.length >= maxPending) {
      const overflow = existing.sort().slice(0, existing.length - maxPending + 1);
      for (const name of overflow) { try { rmSync(join(dir, name), { force: true }); } catch { /* ignore */ } }
      appendError(viewDir, `queue at cap (${existing.length} ≥ ${maxPending}); evicted ${overflow.length} oldest request(s)`);
    }

    const ts = now();
    const record = {
      v: QUEUE_VERSION,
      repoRoot: item.repoRoot ?? null,
      viewDir,
      kind: item.kind ?? 'incremental',     // incremental | offpipeline | bootstrap
      bucket: item.bucket ?? null,          // slug | project | docs | off-pipeline bucket | __bootstrap__
      paths: Array.isArray(item.paths) ? item.paths : [],
      attempts: 0,
      enqueuedAt: new Date(ts).toISOString(),
      enqueuedBy: {
        host: item.enqueuedBy?.host ?? 'claude',
        pid: item.enqueuedBy?.pid ?? process.pid,
      },
    };
    // padStart keeps lexical order == chronological order well past year 5138.
    const name = `${String(ts).padStart(15, '0')}-${randomBytes(4).toString('hex')}.json`;
    writeFileAtomic(join(dir, name), `${JSON.stringify(record, null, 2)}\n`);
    return { ok: true, file: name };
  } catch (err) {
    return { ok: false, reason: err?.message ?? String(err) };
  }
}

/* ───────────────────────── read / coalesce / plan→args ───────────────────────── */

/**
 * Snapshot the pending request files (top-level only — not .processing/.failed).
 * Returns [{ name, file (abs), record }] in chronological order, skipping torn
 * files (a half-written record is re-read on a later tick once it settles).
 */
export function readPending(viewDir) {
  const dir = queueDir(viewDir);
  const out = [];
  for (const name of listRecordFiles(dir)) {
    const abs = join(dir, name);
    try { out.push({ name, file: abs, record: JSON.parse(readFileSync(abs, 'utf-8')) }); }
    catch { /* torn — skip */ }
  }
  out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return out;
}

/**
 * Collapse a list of pending records into ONE render plan for the repo. The
 * bounded engine's inFlight is per-repo (one render at a time), so coalescing to
 * a single plan is both necessary and the correct batching — a burst of writes
 * renders once:
 *   - any bootstrap request, OR >1 distinct bucket, OR zero identifiable buckets
 *     → a whole-repo --bootstrap freshness pass (covers off-pipeline too, v9.68.0)
 *   - exactly one bucket → --only <bucket>/**
 * Returns { kind, bucket } or null when empty.
 */
export function coalesce(records) {
  if (!records || !records.length) return null;
  if (records.some((r) => r?.kind === 'bootstrap')) {
    return { kind: 'bootstrap', bucket: '__bootstrap__' };
  }
  const buckets = [...new Set(records.map((r) => r?.bucket).filter(Boolean))];
  if (buckets.length === 1) {
    const r = records.find((rr) => rr?.bucket === buckets[0]);
    return { kind: r?.kind ?? 'incremental', bucket: buckets[0] };
  }
  return { kind: 'bootstrap', bucket: '__bootstrap__' };
}

/**
 * Map a coalesced plan to render-sunflower argv (excluding the script path — the
 * heal controller resolves that via resolveRenderEntrypoint, the one seam native
 * interop repoints). cwd=repoRoot is supplied by the spawn; --view is
 * belt-and-braces against realpath divergence; --plugin-root pins the engine's
 * own plugin tree.
 */
export function renderArgsForPlan(plan, { viewDir, pluginRoot } = {}) {
  const tail = ['--view', viewDir];
  if (pluginRoot) tail.push('--plugin-root', pluginRoot);
  if (!plan || plan.kind === 'bootstrap') return ['--bootstrap', ...tail];
  return ['--only', `${plan.bucket}/**`, ...tail];
}

/* ───────────────────────── claim / ack / fail / reclaim ───────────────────────── */

/**
 * Move the named pending files into .processing/ so an overlapping drain (a
 * restart while one is mid-flight) can't render them twice. Returns the claimed
 * [{ name, file (abs in .processing), record }]. A file already claimed/gone is
 * skipped silently.
 */
export function claim(viewDir, names) {
  const dir = queueDir(viewDir);
  const proc = processingDir(viewDir);
  try { mkdirSync(proc, { recursive: true }); } catch { /* ignore */ }
  const claimed = [];
  for (const name of names) {
    const from = join(dir, name);
    let record = null;
    try { record = JSON.parse(readFileSync(from, 'utf-8')); } catch { /* may be torn/gone */ }
    try { renameSync(from, join(proc, name)); claimed.push({ name, file: join(proc, name), record }); }
    catch { /* already claimed/gone — skip */ }
  }
  return claimed;
}

/** Delete claimed files after a successful render. */
export function ack(viewDir, claimed) {
  for (const c of (claimed ?? [])) { try { rmSync(c.file, { force: true }); } catch { /* ignore */ } }
}

/**
 * Return claimed files to pending UNCHANGED — used when the bounded engine was
 * busy and rejected the submit, so the next tick retries without counting a
 * failure.
 */
export function unclaim(viewDir, claimed) {
  const dir = queueDir(viewDir);
  for (const c of (claimed ?? [])) {
    try { renameSync(c.file, join(dir, c.name)); } catch { /* ignore */ }
  }
}

/**
 * A render failed. For each claimed file, bump attempts; past maxAttempts move it
 * to .failed/ (surfaced in health), else return it to pending with the bumped
 * count so the next tick retries. Writes pending-first then removes the
 * .processing copy, so a crash mid-move leaves a duplicate (safe, idempotent)
 * rather than a lost request.
 */
export function fail(viewDir, claimed, {
  maxAttempts = RENDER_QUEUE_DEFAULTS.maxAttempts,
  now = () => Date.now(),
  error = 'render failed',
} = {}) {
  const dir = queueDir(viewDir);
  const failedD = failedDir(viewDir);
  for (const c of (claimed ?? [])) {
    const attempts = (c.record?.attempts ?? 0) + 1;
    const rec = { ...(c.record ?? {}), attempts, lastError: String(error), lastFailedAt: new Date(now()).toISOString() };
    const text = `${JSON.stringify(rec, null, 2)}\n`;
    if (attempts >= maxAttempts) {
      try { mkdirSync(failedD, { recursive: true }); } catch { /* ignore */ }
      try { writeFileAtomic(join(failedD, c.name), text); } catch { /* ignore */ }
      try { rmSync(c.file, { force: true }); } catch { /* ignore */ }
    } else {
      try { writeFileAtomic(join(dir, c.name), text); } catch { /* ignore */ }
      try { rmSync(c.file, { force: true }); } catch { /* ignore */ }
    }
  }
  appendError(viewDir, error);
}

/**
 * Move .processing/ files abandoned by a dead drain (older than ttlMs) back to
 * pending so a crash mid-render never strands a request. Run at daemon startup
 * catch-up. Returns the count reclaimed.
 */
export function reclaimOrphans(viewDir, {
  ttlMs = RENDER_QUEUE_DEFAULTS.orphanTtlMs,
  now = () => Date.now(),
} = {}) {
  const proc = processingDir(viewDir);
  const dir = queueDir(viewDir);
  let names;
  try { names = readdirSync(proc).filter((n) => n.endsWith('.json')); }
  catch { return 0; }
  let reclaimed = 0;
  for (const name of names) {
    const from = join(proc, name);
    let mtime;
    try { mtime = statSync(from).mtimeMs; } catch { continue; }
    if (now() - mtime < ttlMs) continue;
    try { renameSync(from, join(dir, name)); reclaimed++; } catch { /* ignore */ }
  }
  return reclaimed;
}

/* ───────────────────────── status + health helpers ───────────────────────── */

export function writeStatus(viewDir, status = {}, { now = () => Date.now() } = {}) {
  try {
    mkdirSync(queueDir(viewDir), { recursive: true });
    writeFileAtomic(statusPath(viewDir), `${JSON.stringify({ ...status, updatedAt: new Date(now()).toISOString() }, null, 2)}\n`);
  } catch { /* best-effort */ }
}

export function readStatus(viewDir) {
  try { return JSON.parse(readFileSync(statusPath(viewDir), 'utf-8')); }
  catch { return null; }
}

export function countPending(viewDir) { return listRecordFiles(queueDir(viewDir)).length; }

export function listFailed(viewDir) {
  try { return readdirSync(failedDir(viewDir)).filter((n) => n.endsWith('.json')); }
  catch { return []; }
}

/* ───────────────────────── the drain controller ───────────────────────── */

/**
 * The per-tick + startup drain controller, shared by both daemons. It does NOT
 * render itself — it claims coalesced work and hands it to the bounded engine via
 * `submit` (lib/heal-render.mjs), so a queue render and a stale-render heal for
 * the same repo can never run concurrently (the engine's inFlight is per-repo).
 *
 * @param {object}   o
 * @param {Function} o.submit        (entry, {args,label,onSettled}) => { action }
 * @param {Function} o.isBusy        (id) => bool
 * @param {string}   o.pluginRoot    forwarded into the render argv (--plugin-root)
 * @param {Function} [o.log]
 * @param {Function} [o.now]
 * @param {number}   [o.maxAttempts]
 * @param {number}   [o.orphanTtlMs]
 */
export function createRenderQueueDrainer({
  submit,
  isBusy,
  pluginRoot,
  log = () => {},
  now = () => Date.now(),
  maxAttempts = RENDER_QUEUE_DEFAULTS.maxAttempts,
  orphanTtlMs = RENDER_QUEUE_DEFAULTS.orphanTtlMs,
} = {}) {
  /** Drain one repo's queue on a tick. Never throws. */
  function drainEntry(entry) {
    try {
      if (!entry || !entry.id || !entry.viewDir) return { action: 'invalid' };
      const { id, viewDir } = entry;
      if (isBusy(id)) return { action: 'busy' };       // leave the queue for the next tick
      const pending = readPending(viewDir);
      if (!pending.length) return { action: 'empty' };
      const plan = coalesce(pending.map((p) => p.record));
      if (!plan) return { action: 'empty' };
      const claimed = claim(viewDir, pending.map((p) => p.name));
      if (!claimed.length) return { action: 'nothing-claimed' };

      const args = renderArgsForPlan(plan, { viewDir, pluginRoot });
      const r = submit(entry, {
        args,
        label: `render-queue: ${id} ${plan.kind} ${plan.bucket} (${claimed.length} req)`,
        onSettled: (code) => {
          try {
            if (code === 0) {
              ack(viewDir, claimed);
              writeStatus(viewDir, { pendingCount: countPending(viewDir), lastError: null }, { now });
            } else {
              fail(viewDir, claimed, { maxAttempts, now, error: `render exited ${code}` });
              writeStatus(viewDir, { pendingCount: countPending(viewDir), lastError: `render exited ${code}` }, { now });
            }
          } catch (err) { log(`render-queue: settle error for ${id}: ${err?.message ?? err}`); }
        },
      });

      if (r?.action !== 'enqueued') {
        unclaim(viewDir, claimed);   // engine busy — retry next tick, no failure counted
        return { action: r?.action ?? 'rejected' };
      }
      return { action: 'submitted', plan, claimed: claimed.length };
    } catch (err) {
      log(`render-queue: drain error for ${entry?.id ?? '?'}: ${err?.message ?? err}`);
      return { action: 'error' };
    }
  }

  /**
   * Startup catch-up (the "fetch the list once it starts" requirement): reclaim
   * orphaned .processing/ files, then drain every registered repo once before the
   * daemon settles into its timer cadence. Returns the per-entry drain results.
   */
  function catchUp(entries) {
    for (const e of (entries ?? [])) {
      try { reclaimOrphans(e.viewDir, { ttlMs: orphanTtlMs, now }); } catch { /* ignore */ }
    }
    return (entries ?? []).map((e) => drainEntry(e));
  }

  /** Observable state for /__sdlc/health. */
  function snapshot(entries) {
    const pending = {};
    const failed = [];
    for (const e of (entries ?? [])) {
      const n = countPending(e.viewDir);
      if (n > 0) pending[e.id] = n;
      for (const name of listFailed(e.viewDir)) failed.push({ id: e.id, file: name });
    }
    return { pending, failed, lastDrainAt: new Date(now()).toISOString() };
  }

  return { drainEntry, catchUp, snapshot };
}
