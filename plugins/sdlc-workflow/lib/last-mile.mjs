// The last mile of ship, and the base check of every driver, in code.
//
//   baseCheck     fetch the base, compare `<base>...origin/<base>`: even, behind (fast-forwarded),
//                 ahead, or diverged (stop). Every driver runs it before it cuts a branch.
//   shipFacts     the merge rules of the repo: the methods it allows, the rulesets and the classic
//                 protection of the base, the merge queue, and the method that ship uses.
//   readyGaps     the gaps that a script can see before ship: no plan, a plan method the repo does
//                 not allow, a stacked plan with no gh-stack, no gh login, and a branch of a
//                 linked project that adds record files.
//   finishShip    after the merge: fast-forward the local base, switch to it, delete the branch.
//
// Every git and gh call goes through `run(cmd, args, opts)`, so a test passes a fake.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { safeParseFrontmatter } from './frontmatter.mjs';
import { linkedProject } from './records-root.mjs';

export const MERGE_METHODS = Object.freeze(['squash', 'rebase', 'merge']);
export const SHIP_PLAN = join('.ai', 'ship-plan.md');

export function defaultRun(cmd, args, { cwd, input } = {}) {
  // SDLC_GH_BIN replaces gh; a .mjs file runs under this Node (a test's fake).
  const bin = cmd === 'gh' ? process.env.SDLC_GH_BIN || 'gh' : cmd;
  const script = /\.m?js$/.test(bin);
  const r = spawnSync(script ? process.execPath : bin, script ? [bin, ...args] : args, { cwd, input, encoding: 'utf8', windowsHide: true, timeout: 60_000, maxBuffer: 32 * 1024 * 1024 });
  return { status: r.error ? 127 : r.status ?? 1, stdout: (r.stdout ?? '').trim(), stderr: (r.stderr ?? r.error?.message ?? '').trim() };
}

const ok = (r) => r.status === 0;
const git = (run, cwd, args) => run('git', args, { cwd });

/** The frontmatter of `.ai/ship-plan.md`, or null when there is no plan. */
export function readShipPlan(root) {
  const file = join(root, SHIP_PLAN);
  if (!existsSync(file)) return null;
  const r = safeParseFrontmatter(readFileSync(file, 'utf8'), { filePath: file });
  return r?.data ?? r?.frontmatter ?? {};
}

/** The merge method that the plan names (Block J, `governance.merge.method`), or null. */
export const planMethodOf = (plan) => {
  const m = plan?.governance?.merge?.method ?? plan?.merge?.method ?? null;
  return MERGE_METHODS.includes(m) ? m : null;
};

/** The PR shape of a list: `stacked` when the plan asks for it, else `single`. */
export const prShapeOf = (plan) => (plan?.['pr-shape'] === 'stacked' ? 'stacked' : 'single');

// ---------------------------------------------------------------- base check

/**
 * Compare the local base with the remote one, after a fetch. A base that is only behind is
 * fast-forwarded (`git merge --ff-only` when it is checked out, else `git fetch . origin/b:b`).
 * `stop` is true when the base has diverged: a driver must not cut a branch from it.
 */
export function baseCheck(root, base, { remote = 'origin', run = defaultRun, fastForward = true } = {}) {
  const remotes = git(run, root, ['remote']);
  if (!ok(remotes) || !remotes.stdout.split(/\r?\n/).includes(remote)) return { base, state: 'no-remote', stop: false };
  const fetch = git(run, root, ['fetch', '--quiet', remote, base]);
  if (!ok(fetch)) return { base, state: 'offline', stop: false, reason: fetch.stderr };
  const local = git(run, root, ['rev-parse', '--verify', '--quiet', `refs/heads/${base}`]);
  if (!ok(local)) return { base, state: 'no-local', stop: false };
  const counts = git(run, root, ['rev-list', '--left-right', '--count', `${base}...${remote}/${base}`]);
  if (!ok(counts)) return { base, state: 'no-remote-base', stop: false, reason: counts.stderr };
  const [ahead, behind] = counts.stdout.split(/\s+/).map(Number);
  if (ahead && behind) {
    return { base, state: 'diverged', ahead, behind, stop: true, reason: `${base} has ${ahead} commit(s) that ${remote}/${base} lacks, and lacks ${behind} of its commits. Reconcile it by hand before a branch is cut from it.` };
  }
  if (ahead) return { base, state: 'ahead', ahead, behind: 0, stop: false, reason: `${base} has ${ahead} commit(s) that are not pushed; a branch cut from it carries them.` };
  if (!behind) return { base, state: 'even', ahead: 0, behind: 0, stop: false };
  if (!fastForward) return { base, state: 'behind', ahead: 0, behind, stop: false, fastForwarded: false };
  const current = git(run, root, ['branch', '--show-current']).stdout;
  const ff = current === base
    ? git(run, root, ['merge', '--ff-only', '--quiet', `${remote}/${base}`])
    : git(run, root, ['fetch', '--quiet', '.', `${remote}/${base}:${base}`]);
  if (!ok(ff)) return { base, state: 'behind', ahead: 0, behind, stop: true, fastForwarded: false, reason: `the fast-forward of ${base} failed: ${ff.stderr}` };
  return { base, state: 'behind', ahead: 0, behind, stop: false, fastForwarded: true };
}

// ---------------------------------------------------------------- ship facts

const json = (r) => { try { return ok(r) && r.stdout ? JSON.parse(r.stdout) : null; } catch { return null; } };

/**
 * The merge rules of the repo for `base`. `method` is the plan's method when the repo allows it,
 * else the first allowed of squash, rebase, merge. `direct` is false when a rule needs a review
 * or a merge queue, so ship prints the one command instead of merging.
 */
export function shipFacts(root, base, { run = defaultRun, plan = readShipPlan(root) } = {}) {
  const repo = json(run('gh', ['repo', 'view', '--json', 'nameWithOwner,defaultBranchRef,mergeCommitAllowed,squashMergeAllowed,rebaseMergeAllowed,deleteBranchOnMerge'], { cwd: root }));
  if (!repo) return { ok: false, reason: 'gh repo view failed: gh is missing, not logged in, or the repo has no GitHub remote' };
  const branch = base || repo.defaultBranchRef?.name || 'main';
  let allowed = MERGE_METHODS.filter((m) => repo[`${m === 'merge' ? 'mergeCommit' : `${m}Merge`}Allowed`]);
  const rules = json(run('gh', ['api', `repos/${repo.nameWithOwner}/rules/branches/${branch}`], { cwd: root })) ?? [];
  const facts = { requiredReviews: 0, requiredChecks: [], mergeQueue: false, linear: false, rulesets: rules.length };
  for (const r of Array.isArray(rules) ? rules : []) {
    if (r.type === 'pull_request') {
      facts.requiredReviews = Math.max(facts.requiredReviews, Number(r.parameters?.required_approving_review_count ?? 0));
      const only = r.parameters?.allowed_merge_methods;
      if (Array.isArray(only) && only.length) allowed = allowed.filter((m) => only.includes(m));
    }
    if (r.type === 'required_status_checks') facts.requiredChecks.push(...(r.parameters?.required_status_checks ?? []).map((c) => c.context));
    if (r.type === 'merge_queue') facts.mergeQueue = true;
    if (r.type === 'required_linear_history') facts.linear = true;
  }
  const classic = json(run('gh', ['api', `repos/${repo.nameWithOwner}/branches/${branch}/protection`], { cwd: root }));
  if (classic) {
    facts.requiredReviews = Math.max(facts.requiredReviews, Number(classic.required_pull_request_reviews?.required_approving_review_count ?? 0));
    facts.requiredChecks.push(...(classic.required_status_checks?.contexts ?? []));
    if (classic.required_linear_history?.enabled) facts.linear = true;
  }
  if (facts.linear) allowed = allowed.filter((m) => m !== 'merge');
  facts.requiredChecks = [...new Set(facts.requiredChecks)];
  const wanted = planMethodOf(plan);
  const method = wanted && allowed.includes(wanted) ? wanted : allowed[0] ?? null;
  return {
    ok: true, repo: repo.nameWithOwner, base: branch, allowed, method, planMethod: wanted,
    planMethodAllowed: wanted ? allowed.includes(wanted) : null,
    deleteBranchOnMerge: Boolean(repo.deleteBranchOnMerge), ...facts,
    direct: !facts.mergeQueue && facts.requiredReviews === 0,
  };
}

/** The one command that merges a PR under these facts. */
export function mergeCommand(facts, pr) {
  if (!facts?.method) return null;
  const del = facts.deleteBranchOnMerge ? '' : ' --delete-branch';
  return facts.mergeQueue ? `gh pr merge ${pr} --auto --${facts.method}` : `gh pr merge ${pr} --${facts.method}${del}`;
}

// ---------------------------------------------------------------- readiness gaps

/** The gaps that a script can see, each `{ code, task }`. An empty list is ready. */
/** The files under `.ai/workflows/` that the branch adds against its base, `origin/<base>` first. */
function addedRecordFiles(root, base, run) {
  for (const b of [`origin/${base}`, base]) {
    const r = git(run, root, ['diff', '--name-only', '--diff-filter=A', `${b}...HEAD`, '--', '.ai/workflows']);
    if (ok(r)) return String(r.stdout ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  }
  return [];
}

// `allowNoPlan` leaves out the no-plan gap: at ship, the missing-plan gate of the PR phase owns a
// missing plan, and only that gate offers the answer that the release is external.
export function readyGaps(root, { run = defaultRun, base = null, allowNoPlan = false } = {}) {
  const plan = readShipPlan(root);
  const gaps = [];
  if (!plan && !allowNoPlan) gaps.push({ code: 'no-plan', task: 'Write the ship plan: /wf project ship-plan init' });
  const login = run('gh', ['auth', 'status'], { cwd: root });
  if (!ok(login)) gaps.push({ code: 'no-gh-login', task: 'Log in to GitHub: gh auth login' });
  else {
    const facts = shipFacts(root, base, { run, plan });
    if (!facts.ok) gaps.push({ code: 'no-repo', task: `Give the repo a GitHub remote (${facts.reason})` });
    else {
      if (!facts.allowed.length) gaps.push({ code: 'no-merge-method', task: 'The repo allows no merge method for the base branch: change its settings' });
      if (facts.planMethod && !facts.planMethodAllowed) gaps.push({ code: 'plan-method-forbidden', task: `The ship plan merges by ${facts.planMethod}, which the repo does not allow (${facts.allowed.join(', ') || 'none'}): run /wf project ship-plan edit` });
    }
  }
  if (plan && prShapeOf(plan) === 'stacked' && !ok(run('gh', ['stack', '--help'], { cwd: root }))) {
    gaps.push({ code: 'no-gh-stack', task: 'The ship plan asks for stacked PRs: gh extension install github/gh-stack' });
  }
  // A linked project keeps its records in the records repo: a PR that adds record files would
  // publish them in the product repo.
  const records = base && linkedProject(root) ? addedRecordFiles(root, base, run) : [];
  if (records.length) {
    gaps.push({ code: 'records-in-diff', task: `The branch adds ${records.length} record file(s) under .ai/workflows/ (${records.slice(0, 3).join(', ')}${records.length > 3 ? ', ...' : ''}). Remove them from the branch: git rm -r --cached -- .ai/workflows, then commit` });
  }
  return gaps;
}

// ---------------------------------------------------------------- finish

/**
 * After the PR merged: fetch, switch to the base, fast-forward it, delete the local branch, and
 * delete the remote branch when GitHub did not. A branch whose PR is not merged is kept.
 */
export function finishShip(root, { branch, base, pr = null, remote = 'origin', run = defaultRun, deleteRemote = true } = {}) {
  if (!branch || !base || branch === base) return { ok: false, reason: 'finish needs a branch other than the base' };
  const state = pr ? json(run('gh', ['pr', 'view', String(pr), '--json', 'state,headRefName'], { cwd: root })) : null;
  if (pr && state?.state !== 'MERGED') return { ok: false, reason: `PR ${pr} is ${state?.state ?? 'not readable'}, not merged` };
  const steps = [];
  const fetch = git(run, root, ['fetch', '--quiet', '--prune', remote]);
  steps.push(['fetch', ok(fetch)]);
  const sw = git(run, root, ['switch', base]);
  if (!ok(sw)) return { ok: false, steps, reason: `git switch ${base} failed: ${sw.stderr}` };
  const ff = git(run, root, ['merge', '--ff-only', '--quiet', `${remote}/${base}`]);
  if (!ok(ff)) return { ok: false, steps, reason: `${base} does not fast-forward to ${remote}/${base}: ${ff.stderr}. Reconcile it by hand.` };
  steps.push(['fast-forward', true]);
  // A squash or rebase merge leaves the branch unmerged in git's eyes: the merged PR is the proof.
  const del = git(run, root, ['branch', pr ? '-D' : '-d', branch]);
  steps.push(['delete-local', ok(del)]);
  if (deleteRemote) {
    const still = git(run, root, ['ls-remote', '--exit-code', '--heads', remote, branch]);
    if (ok(still)) steps.push(['delete-remote', ok(git(run, root, ['push', remote, '--delete', branch]))]);
  }
  return { ok: true, steps, base, branch };
}
