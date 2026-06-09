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

import { execFileSync } from 'node:child_process';

// True iff `git -C <repoRoot> <args>` exits 0. Never throws. stdio ignored so a
// failing probe is silent.
function gitExit(repoRoot, args) {
  try {
    execFileSync('git', ['-C', repoRoot, ...args], {
      windowsHide: true,
      timeout: 2000,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function gitAvailable(repoRoot) {
  return gitExit(repoRoot, ['rev-parse', '--git-dir']);
}

// Best-effort `gh pr view <n>` merged check. Skipped unless prNumber is a
// positive integer (live data uses 0 / "" for "no PR" — Slice 0). Any
// absence/offline/auth failure → false (the git checks already ran first).
function prMerged(repoRoot, prNumber) {
  if (!(Number.isInteger(prNumber) && prNumber > 0)) return false;
  try {
    const state = execFileSync(
      'gh', ['pr', 'view', String(prNumber), '--json', 'state', '-q', '.state'],
      { cwd: repoRoot, encoding: 'utf-8', windowsHide: true, timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    return state === 'MERGED';
  } catch {
    return false;
  }
}

/**
 * Classify a slug's declared branch within its repo.
 *
 *   'live'    — `refs/heads/<branch>` exists and is NOT fully merged into base.
 *   'merged'  — branch ref exists AND its tip is an ancestor of base-branch
 *               (`git merge-base --is-ancestor`), or its PR resolves MERGED.
 *   'gone'    — branch ref not found locally (deleted, possibly post-merge).
 *   'unknown' — no branch declared (e.g. branch-strategy:none), git unavailable,
 *               or any error. Fails open; the caller renders no badge.
 *
 * @param {{repoRoot?:string, branch?:string|null, baseBranch?:string|null,
 *          prNumber?:number|null, checkPr?:boolean}} opts
 * @returns {'live'|'merged'|'gone'|'unknown'}
 */
export function computeBranchState({ repoRoot, branch, baseBranch, prNumber, checkPr = true } = {}) {
  try {
    const b = String(branch ?? '').trim();
    if (!repoRoot || !b) return 'unknown';           // nothing to assess
    if (!gitAvailable(repoRoot)) return 'unknown';

    const refExists = gitExit(repoRoot, ['show-ref', '--verify', '--quiet', `refs/heads/${b}`]);
    if (refExists) {
      const base = String(baseBranch ?? '').trim();
      // A branch fully contained in its base (tip is an ancestor) reads as merged
      // even before the local ref is deleted — prompting cleanup, not removal.
      if (base && base !== b && gitExit(repoRoot, ['merge-base', '--is-ancestor', b, base])) return 'merged';
      if (checkPr && prMerged(repoRoot, prNumber)) return 'merged';
      return 'live';
    }
    return 'gone';
  } catch {
    return 'unknown';
  }
}

/**
 * Stamp `branchState` onto every slugMeta row across a set of registry entries,
 * in place. Used by the hub's reload() so a branch deleted AFTER the last render
 * still flips to `gone` on the next refresh without a re-render. Best-effort and
 * never throws. `checkPr` defaults FALSE here — the hub refresh stays local-only
 * (no network) so it never blocks; upsert-time stamping does the richer PR check.
 *
 * @param {Array} entries
 * @param {{checkPr?:boolean}} [opts]
 * @returns {Array} the same (mutated) entries
 */
export function refreshEntriesLiveness(entries = [], { checkPr = false } = {}) {
  try {
    for (const e of (entries ?? [])) {
      if (!e || !Array.isArray(e.slugMeta)) continue;
      for (const sm of e.slugMeta) {
        try {
          sm.branchState = computeBranchState({
            repoRoot: e.repoRoot,
            branch: sm.branch,
            baseBranch: sm.baseBranch,
            prNumber: sm.prNumber,
            checkPr,
          });
        } catch {
          sm.branchState = sm.branchState ?? 'unknown';
        }
      }
    }
  } catch {
    /* best-effort — never affect the caller */
  }
  return entries;
}
