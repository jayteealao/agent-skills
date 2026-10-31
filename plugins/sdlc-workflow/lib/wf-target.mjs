// lib/wf-target.mjs — the first argument of handoff, ship, retro, recap and status, in code.
//
// The argument is a slug, a PR (`pr#N`, `#N` or a bare number) or a branch name; first match
// wins, so a slug is never read as a branch. A PR resolves to its head branch with
// `gh pr view`. A branch resolves to its roster: every workflow whose index names that branch
// (the branch column of INDEX.md). With no argument, the one open workflow is the target.
//
// `wf.mjs target <root> [<arg>]` prints the result; each card keeps its own scope label.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultRun } from './last-mile.mjs';
import { workflowsRoot } from './records-root.mjs';
import { TERMINAL_WORKFLOW_STATUSES, scanWorkflowIndexes } from './workflow-index.mjs';

const DONE = new Set([...TERMINAL_WORKFLOW_STATUSES, 'shipped']);
const PR = /^(?:pr)?#?(\d+)$/i;

/** The rows of INDEX.md: { slug, status, type, branch, updatedAt }. */
function indexRows(root) {
  const file = join(workflowsRoot(root), 'INDEX.md');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#')).map((l) => {
    const [slug, status, type, branch, updatedAt] = l.split('\t');
    return { slug, status: status || null, type: type || null, branch: branch || null, updatedAt: updatedAt || null };
  });
}

/**
 * Every workflow of the project with its branch: the index files, and the INDEX.md rows that
 * have no folder here (a prototype keeps its records in its worktree).
 */
export async function workflowRows(root) {
  const rows = new Map();
  for (const w of await scanWorkflowIndexes({ projectRoot: root })) {
    if (w.classification === 'invalid') continue;
    const fm = w.frontmatter ?? {};
    rows.set(w.directorySlug, { slug: w.directorySlug, status: fm.status ?? null, branch: w.branch ?? null, updatedAt: fm['updated-at'] ?? null });
  }
  for (const r of indexRows(root)) if (r.slug && !rows.has(r.slug)) rows.set(r.slug, { slug: r.slug, status: r.status, branch: r.branch, updatedAt: r.updatedAt });
  return [...rows.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

const isDone = (r) => DONE.has(String(r.status ?? ''));

function gitBranchExists(root, branch, run) {
  const ref = (r) => run('git', ['-C', root, 'rev-parse', '--verify', '--quiet', r], { cwd: root }).status === 0;
  return ref(`refs/heads/${branch}`) || ref(`refs/remotes/origin/${branch}`);
}

/**
 * Resolve the argument. Returns `{ scope, slugs, branch }` and, as they apply:
 *   pr        the PR number of a `pr#N` argument
 *   siblings  for a slug: the other workflows on its branch (a single-slug verdict on a
 *             shared branch goes stale when a sibling moves the branch)
 *   closed    for a branch: the roster slugs that are closed or shipped
 *   inferred  no argument: the one open workflow was taken
 *   ambiguous no argument and several open workflows: `slugs` lists them, newest first
 *   error     nothing resolved; `scope` is null (or `branch` for a branch with no workflow)
 * `run(cmd, args, opts)` runs git and gh (a test passes a fake).
 */
export async function resolveTarget(root, arg = null, { run = defaultRun } = {}) {
  const rows = await workflowRows(root);
  const onBranch = (b) => rows.filter((r) => r.branch && r.branch === b);
  const roster = (branch, extra = {}) => {
    const list = onBranch(branch);
    if (!list.length) return { scope: 'branch', slugs: [], branch, ...extra, error: `No workflows are on branch ${branch}. Run /wf status to list workflows.` };
    return { scope: 'branch', slugs: list.map((r) => r.slug), branch, ...extra, closed: list.filter(isDone).map((r) => r.slug) };
  };
  const a = String(arg ?? '').trim();

  if (!a) {
    const open = rows.filter((r) => !isDone(r)).sort((x, y) => String(y.updatedAt ?? '').localeCompare(String(x.updatedAt ?? '')));
    if (!open.length) return { scope: null, slugs: [], branch: null, error: 'No workflows found. Start one with /wf intake <description>.' };
    if (open.length > 1) return { scope: null, slugs: open.map((r) => r.slug), branch: null, ambiguous: true };
    return { scope: 'slug', slugs: [open[0].slug], branch: open[0].branch, inferred: true, siblings: onBranch(open[0].branch).filter((r) => r.slug !== open[0].slug).map((r) => r.slug) };
  }

  const hit = rows.find((r) => r.slug === a);
  if (hit) return { scope: 'slug', slugs: [a], branch: hit.branch, siblings: hit.branch ? onBranch(hit.branch).filter((r) => r.slug !== a).map((r) => r.slug) : [] };

  const pr = PR.exec(a);
  if (pr) {
    const n = Number(pr[1]);
    const r = run('gh', ['pr', 'view', String(n), '--json', 'headRefName', '-q', '.headRefName'], { cwd: root });
    const branch = r.status === 0 ? String(r.stdout ?? '').trim() : '';
    if (!branch) return { scope: null, slugs: [], branch: null, pr: n, error: `gh pr view ${n} found no head branch${r.stderr ? `: ${String(r.stderr).trim()}` : ''}` };
    return roster(branch, { pr: n });
  }

  if (onBranch(a).length || gitBranchExists(root, a, run)) return roster(a);
  return { scope: null, slugs: [], branch: null, error: `${a} is not a workflow slug, a PR (pr#N) or a branch. Run /wf status to list workflows.` };
}

/** One line of text for the result. */
export function targetText(t) {
  if (t.error) return t.error;
  if (t.ambiguous) return `several open workflows; choose one: ${t.slugs.join(', ')}`;
  if (t.scope === 'slug') {
    const lines = [`slug ${t.slugs[0]}${t.branch ? ` (branch ${t.branch})` : ''}${t.inferred ? ', the one open workflow' : ''}`];
    if (t.siblings?.length) lines.push(`shared branch: ${t.siblings.join(', ')} also on ${t.branch}`);
    return lines.join('\n');
  }
  return `branch ${t.branch}${t.pr ? ` (PR #${t.pr})` : ''}: ${t.slugs.join(', ')}${t.closed?.length ? `; closed: ${t.closed.join(', ')}` : ''}`;
}
