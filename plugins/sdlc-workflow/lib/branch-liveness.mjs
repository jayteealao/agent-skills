// lib/branch-liveness.mjs
//
// Per-slug branch liveness (SLUG-BRANCH-IDENTITY-PLAN §4.3 / D2). Each workflow
// slug declares its own `branch` / `base-branch` / `pr-number` in frontmatter;
// this module classifies that branch against the repo it belongs to so the hub
// can show a soft `merged` / `branch gone` badge — it NEVER deletes anything.
//
// Contract: best-effort and NEVER throws. A liveness failure must not affect a
// render or a served page (same posture as the registry write). On any error or
// missing git, it fails OPEN to `unknown` (no badge). Git-only checks are the
// spine; the optional `gh` PR check is strictly secondary and network-guarded
// (R2) — disabled by default on the hub-refresh path so a reload never blocks on
// the network.

import { execFile, execFileSync } from 'node:child_process';

const GIT_OPTS = { windowsHide: true, timeout: 2000, stdio: 'ignore' };
const GH_TIMEOUT_MS = 3000;
const ghArgs = (prNumber) => ['pr', 'view', String(prNumber), '--json', 'state', '-q', '.state'];
const hasPr = (prNumber) => Number.isInteger(prNumber) && prNumber > 0;

// True iff `git -C <repoRoot> <args>` exits 0. Never throws. stdio ignored so a
// failing probe is silent.
function gitExit(repoRoot, args) {
  try {
    execFileSync('git', ['-C', repoRoot, ...args], GIT_OPTS);
    return true;
  } catch {
    return false;
  }
}

// The same probe without blocking the event loop (the hub's refresh path).
function gitExitAsync(repoRoot, args) {
  return new Promise((resolve) => {
    try {
      execFile('git', ['-C', repoRoot, ...args], { windowsHide: true, timeout: GIT_OPTS.timeout }, (err) => resolve(!err));
    } catch {
      resolve(false);
    }
  });
}

// Best-effort `gh pr view <n>` merged check. Skipped unless prNumber is a
// positive integer (live data uses 0 / "" for "no PR" — Slice 0). Any
// absence/offline/auth failure → false (the git checks already ran first).
function prMerged(repoRoot, prNumber) {
  if (!hasPr(prNumber)) return false;
  try {
    const state = execFileSync('gh', ghArgs(prNumber),
      { cwd: repoRoot, encoding: 'utf-8', windowsHide: true, timeout: GH_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    return state === 'MERGED';
  } catch {
    return false;
  }
}

function prMergedAsync(repoRoot, prNumber) {
  if (!hasPr(prNumber)) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      execFile('gh', ghArgs(prNumber), { cwd: repoRoot, encoding: 'utf-8', windowsHide: true, timeout: GH_TIMEOUT_MS },
        (err, stdout) => resolve(!err && String(stdout).trim() === 'MERGED'));
    } catch {
      resolve(false);
    }
  });
}

// Stages that precede branch creation. The dedicated slug branch is cut by
// implement (auto/yolo do it up front, but then the ref exists and this set is
// never consulted) — so a missing ref while still at one of these stages means
// "declared, not created yet", not attrition. An unknown/absent stage falls
// through to 'gone' (the pre-planned behavior) so a malformed row never hides
// a genuinely deleted branch.
const PRE_BRANCH_STAGES = new Set(['intake', 'shape', 'slice', 'plan', 'design', 'routing']);

/**
 * Classify a slug's declared branch within its repo.
 *
 *   'live'    — `refs/heads/<branch>` exists and is NOT fully merged into base.
 *   'merged'  — branch ref exists AND its tip is an ancestor of base-branch
 *               (`git merge-base --is-ancestor`), or its PR resolves MERGED.
 *   'planned' — branch ref not found AND the workflow is still at a pre-branch
 *               stage (intake/shape/slice/plan/design/routing): implement will
 *               create it later. Expected, never attention-worthy.
 *   'gone'    — branch ref not found locally at/after implement (deleted,
 *               possibly post-merge).
 *   'unknown' — no branch declared (e.g. branch-strategy:none), git unavailable,
 *               or any error. Fails open; the caller renders no badge.
 *
 * @param {{repoRoot?:string, branch?:string|null, baseBranch?:string|null,
 *          prNumber?:number|null, currentStage?:string|null, checkPr?:boolean}} opts
 * @returns {'live'|'merged'|'planned'|'gone'|'unknown'}
 */
export function computeBranchState(opts = {}) {
  try {
    const steps = branchStateSteps(opts);
    let r = steps.next();
    while (!r.done) {
      const p = r.value;
      r = steps.next(p.pr ? prMerged(opts.repoRoot, opts.prNumber) : gitExit(opts.repoRoot, p.git));
    }
    return r.value;
  } catch {
    return 'unknown';
  }
}

/** computeBranchState without blocking the event loop: the same rules, async probes. */
export async function computeBranchStateAsync(opts = {}) {
  try {
    const steps = branchStateSteps(opts);
    let r = steps.next();
    while (!r.done) {
      const p = r.value;
      r = steps.next(await (p.pr ? prMergedAsync(opts.repoRoot, opts.prNumber) : gitExitAsync(opts.repoRoot, p.git)));
    }
    return r.value;
  } catch {
    return 'unknown';
  }
}

// The classification rules, once. The generator yields each probe — `{ git: args }`
// or `{ pr: true }` — and receives its boolean result, so the sync and the async
// driver above apply exactly the same rules.
function* branchStateSteps({ repoRoot, branch, baseBranch, currentStage, checkPr = true }) {
  const b = String(branch ?? '').trim();
  if (!repoRoot || !b) return 'unknown';             // nothing to assess
  if (!(yield { git: ['rev-parse', '--git-dir'] })) return 'unknown';

  if (yield { git: ['show-ref', '--verify', '--quiet', `refs/heads/${b}`] }) {
    const base = String(baseBranch ?? '').trim();
    // A branch fully contained in its base (tip is an ancestor) reads as merged
    // even before the local ref is deleted — prompting cleanup, not removal.
    if (base && base !== b && (yield { git: ['merge-base', '--is-ancestor', b, base] })) return 'merged';
    if (checkPr && (yield { pr: true })) return 'merged';
    return 'live';
  }
  return PRE_BRANCH_STAGES.has(String(currentStage ?? '').trim().toLowerCase()) ? 'planned' : 'gone';
}

const slugRows = (entries) => (entries ?? []).flatMap((e) =>
  (e && Array.isArray(e.slugMeta) ? e.slugMeta.map((sm) => ({ e, sm })) : []));
const stateOpts = (e, sm, checkPr) => ({
  repoRoot: e.repoRoot, branch: sm.branch, baseBranch: sm.baseBranch,
  prNumber: sm.prNumber, currentStage: sm.currentStage, checkPr,
});

/**
 * Stamp `branchState` onto every slugMeta row across a set of registry entries,
 * in place. Best-effort and never throws. `checkPr` defaults FALSE here — a
 * refresh stays local-only (no network); upsert-time stamping does the richer
 * PR check. The hub uses refreshEntriesLivenessAsync instead: this form blocks
 * for every git probe (13 s for 136 slugs on 2026-10-19).
 *
 * @param {Array} entries
 * @param {{checkPr?:boolean}} [opts]
 * @returns {Array} the same (mutated) entries
 */
export function refreshEntriesLiveness(entries = [], { checkPr = false } = {}) {
  try {
    for (const { e, sm } of slugRows(entries)) {
      try { sm.branchState = computeBranchState(stateOpts(e, sm, checkPr)); }
      catch { sm.branchState = sm.branchState ?? 'unknown'; }
    }
  } catch {
    /* best-effort — never affect the caller */
  }
  return entries;
}

/**
 * refreshEntriesLiveness without blocking the event loop. Used by the hub's
 * reload() so a branch deleted AFTER the last render still flips to `gone`
 * without a re-render, while the hub keeps answering requests. At most
 * `concurrency` slugs are probed at once; `shouldStop()` returning true ends
 * the run before the next slug (a closed hub). Never rejects.
 *
 * @param {Array} entries
 * @param {{checkPr?:boolean, concurrency?:number, shouldStop?:() => boolean}} [opts]
 * @returns {Promise<{slugs:number}>}
 */
export async function refreshEntriesLivenessAsync(entries = [], { checkPr = false, concurrency = 4, shouldStop = () => false } = {}) {
  let rows = [];
  try { rows = slugRows(entries); } catch { return { slugs: 0 }; }
  let next = 0;
  const worker = async () => {
    while (next < rows.length && !shouldStop()) {
      const { e, sm } = rows[next++];
      sm.branchState = await computeBranchStateAsync(stateOpts(e, sm, checkPr));
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, rows.length)) }, worker));
  return { slugs: rows.length };
}
