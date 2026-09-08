#!/usr/bin/env node
/**
 * scripts/verify-release-pushed.mjs — the release-delivery guard.
 *
 * WHY THIS EXISTS
 *
 * A release commit is not done when the version bumps. It is done when
 * `origin/master` carries it.
 *
 * The marketplace resolves this plugin by a pinned commit SHA
 * (`installed_plugins.json` → `gitCommitSha`) sourced from the GitHub remote.
 * A release that is committed locally and never pushed is therefore invisible
 * to every project that installs the plugin — while looking completely healthy
 * in the dev tree: the version bumped, the tests pass, the CHANGELOG reads
 * right, `git log` shows the release. Nothing anywhere says "the field is still
 * running the version from ten days ago."
 *
 * That is exactly what happened: v9.137.0 through v9.140.0 sat unpushed for ten
 * days, so an entire handoff/ship hardening release never executed once in a
 * real project, and a follow-up audit re-discovered — as live field defects —
 * two things that were already fixed on disk.
 *
 * This guard makes that state loud. It is a *delivery* check, not a code check:
 * it asks only "is a release commit sitting here undelivered, and for how long?"
 *
 * EXIT CODES
 *   0  nothing undelivered, or undelivered but younger than the age bound
 *      (a release you just committed and are about to push is not a bug)
 *   1  a release commit has been undelivered longer than the age bound
 *   0  the comparison could not be made (no remote-tracking ref) — reported,
 *      never a hard failure, so a fresh clone or an offline box is not blocked
 *
 * USAGE
 *   node scripts/verify-release-pushed.mjs
 *   node scripts/verify-release-pushed.mjs --max-age-hours=0   # any unpushed release fails
 *   node scripts/verify-release-pushed.mjs --skip-installed   # skip the installed-version check
 *
 * The `installed` check (WIDE-VIEW-REPAIR-PLAN §14.2.1, W11.1) compares every
 * plugin install on THIS machine (Claude Code scopes, Codex cache) with the
 * shipped package.json version. A mismatch is the install gap the plan names:
 * the tree says one version, the hosts run another. Blocking outside CI;
 * advisory under CI, where no plugin is installed.
 *   node scripts/verify-release-pushed.mjs --branch=main --remote=upstream
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readClaudeInstalls, readCodexInstalls, shippedVersion, versionVerdict } from '../lib/doctor.mjs';

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A commit subject that announces a release of this plugin. */
// `.npmrc` gives `npm version` the `release(sdlc-workflow): vX.Y.Z` subject; a
// bare `vX.Y.Z` (npm's default when .npmrc is absent) is a release commit too.
export const RELEASE_SUBJECT = /^(?:release\(sdlc-workflow\):|v\d+\.\d+\.\d+(?:\s|$))/;

/**
 * Pure decision function — separated from git so it is directly testable.
 *
 * @param {Array<{sha: string, subject: string, committedAtMs: number}>} aheadCommits
 *        commits present on HEAD but not on the remote-tracking ref, newest first
 * @param {number} nowMs
 * @param {number} maxAgeHours  grace period before an undelivered release is a failure
 * @returns {{ok: boolean, undelivered: Array, oldestAgeHours: number|null, reason: string}}
 */
export function evaluateDelivery(aheadCommits, nowMs, maxAgeHours) {
  const undelivered = (aheadCommits || []).filter((c) => c && RELEASE_SUBJECT.test(c.subject || ''));
  if (undelivered.length === 0) {
    return { ok: true, undelivered: [], oldestAgeHours: null, reason: 'no undelivered release commits' };
  }
  const oldestMs = Math.min(...undelivered.map((c) => c.committedAtMs));
  const oldestAgeHours = (nowMs - oldestMs) / 3_600_000;
  if (oldestAgeHours <= maxAgeHours) {
    return {
      ok: true,
      undelivered,
      oldestAgeHours,
      reason: `release commit(s) undelivered for ${oldestAgeHours.toFixed(1)}h — within the ${maxAgeHours}h grace period`,
    };
  }
  return {
    ok: false,
    undelivered,
    oldestAgeHours,
    reason: `release commit(s) undelivered for ${oldestAgeHours.toFixed(1)}h — past the ${maxAgeHours}h bound`,
  };
}

function git(args) {
  const r = spawnSync('git', ['-C', PLUGIN_ROOT, ...args], { encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

/** Read the ahead-range as structured commits. Returns null when the ref is absent. */
export function readAheadCommits(remote, branch) {
  const ref = `${remote}/${branch}`;
  if (!git(['rev-parse', '--verify', '--quiet', ref]).ok) return null;
  // %H \x1f subject \x1f committer-unix-time — \x1f avoids colliding with subject text
  const log = git(['log', '--format=%H%x1f%s%x1f%ct', `${ref}..HEAD`]);
  if (!log.ok || !log.out) return [];
  return log.out.split('\n').map((line) => {
    const [sha, subject, ct] = line.split('\x1f');
    return { sha, subject, committedAtMs: Number(ct) * 1000 };
  });
}

/**
 * Pure over injected readers: every install row with its verdict against
 * `shipped`, plus `ok` (no install is behind or ahead). No installs at all is
 * ok — a CI runner or a fresh machine has nothing to mismatch.
 */
export function evaluateInstalled({ shipped, claude = [], codex = [] }) {
  const rows = [
    ...claude.map((i) => ({ host: 'claude', where: i.scope + (i.projectPath ? `:${i.projectPath}` : ''), version: i.version, verdict: versionVerdict(i.version, shipped) })),
    ...codex.map((i) => ({ host: 'codex', where: i.marketplace + (i.enabled === false ? ' (disabled)' : ''), version: i.version, verdict: versionVerdict(i.version, shipped) })),
  ];
  // A Codex cache keeps superseded versions beside the current one; only a
  // cache with NO row at the shipped version is a gap.
  const codexOk = rows.filter((r) => r.host === 'codex').length === 0 || rows.some((r) => r.host === 'codex' && r.verdict === 'ok');
  const claudeOk = rows.filter((r) => r.host === 'claude').every((r) => r.verdict === 'ok');
  return { shipped, rows, ok: codexOk && claudeOk };
}

function checkInstalled({ ci = Boolean(process.env.CI) } = {}) {
  const shipped = shippedVersion(PLUGIN_ROOT);
  const result = evaluateInstalled({ shipped, claude: readClaudeInstalls(), codex: readCodexInstalls().installs });
  const list = result.rows.map((r) => `  ${r.host.padEnd(6)} ${r.where.padEnd(48)} ${String(r.version).padEnd(10)} ${r.verdict}`).join('\n');
  if (result.ok) {
    console.log(`[release-guard] installed OK — every plugin install on this machine is at ${shipped}.${list ? `\n${list}` : ''}`);
    return true;
  }
  const header = ci ? '[release-guard] NOTE (installed, advisory under CI)' : '[release-guard] INSTALL GAP';
  console[ci ? 'log' : 'error'](
    `${header} — the tree ships ${shipped} but a host on this machine runs another version:\n${list}\n` +
    'Run `npm run doctor`, then follow docs/internal/SINGLE-SOURCE-CUTOVER.md §2 to update the host.'
  );
  return ci;
}

function main() {
  const argv = process.argv.slice(2);
  const arg = (name, fallback) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
  };
  const remote = arg('remote', 'origin');
  const branch = arg('branch', 'master');
  const maxAgeHours = Number(arg('max-age-hours', '12'));

  const installedOk = argv.includes('--skip-installed') ? true : checkInstalled();

  const ahead = readAheadCommits(remote, branch);
  if (ahead === null) {
    console.log(`[release-guard] no ${remote}/${branch} ref locally — cannot compare. Run \`git fetch ${remote}\` if you expected one.`);
    process.exit(installedOk ? 0 : 1);
  }

  const verdict = evaluateDelivery(ahead, Date.now(), maxAgeHours);
  if (verdict.undelivered.length === 0) {
    console.log(`[release-guard] OK — no release commit is sitting undelivered ahead of ${remote}/${branch}.`);
    process.exit(installedOk ? 0 : 1);
  }

  const list = verdict.undelivered.map((c) => `  ${c.sha.slice(0, 8)}  ${c.subject}`).join('\n');
  const header = verdict.ok ? '[release-guard] NOTE' : '[release-guard] UNDELIVERED RELEASE';
  console[verdict.ok ? 'log' : 'error'](
    `${header} — ${verdict.undelivered.length} release commit(s) are on HEAD but not on ${remote}/${branch}:\n${list}\n` +
    `Oldest is ${verdict.oldestAgeHours.toFixed(1)}h old. ${verdict.reason}.\n` +
    `The marketplace pins a commit SHA from the remote, so an unpushed release is invisible to every project:\n` +
    `  git push ${remote} ${branch}`
  );
  process.exit(verdict.ok && installedOk ? 0 : 1);
}

// Only run when invoked directly, so the pure functions above stay importable by tests.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
