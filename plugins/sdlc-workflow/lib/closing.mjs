// Closing a workflow: find the open workflows whose branch is merged, and close one.
//
// The next /wf call after a merge asks the person whether to close each such workflow; the
// dispatch prints a `close-ask:` line per workflow. A workflow is merged when its PR is merged on
// GitHub (a squash merge leaves no trace in git), or, with no PR, when its branch tip is in the
// base and its implement stage is complete. The answer of a PR check is cached on this machine for
// a while, so the call stays fast. A person who says no is not asked again.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { sdlcHomeDir } from './home.mjs';
import { defaultRun } from './last-mile.mjs';
import { INDEX_NAME, frontmatterOfDoc, setFields, writeDoc } from './records.mjs';
import { workflowDir } from './records-root.mjs';
import { TERMINAL_WORKFLOW_STATUSES } from './workflow-index.mjs';

const CHECK_TTL_MS = 15 * 60_000;
const nowIso = (d = new Date()) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
const cachePath = () => join(sdlcHomeDir(), 'merge-checks.json');

function readCache() {
  try { return JSON.parse(readFileSync(cachePath(), 'utf8')); } catch { return {}; }
}
function writeCache(cache) {
  try {
    mkdirSync(dirname(cachePath()), { recursive: true });
    writeFileSync(cachePath(), `${JSON.stringify(cache, null, 2)}\n`);
  } catch { /* a cache that cannot be written only costs a check */ }
}

const isOpen = (fm) => {
  const s = String(fm?.status ?? '');
  return !TERMINAL_WORKFLOW_STATUSES.has(s) && s !== 'shipped';
};

/** Why the branch of one workflow counts as merged, or null. */
export function mergedReason(root, fm, { run = defaultRun, cache = {}, key = null, now = Date.now() } = {}) {
  const branch = String(fm?.branch ?? '').trim();
  const base = String(fm?.['base-branch'] ?? '').trim();
  if (!branch || !base || branch === base || fm['close-declined-at']) return null;
  const pr = fm['pr-number'];
  if (pr) {
    const hit = key ? cache[key] : null;
    if (hit && hit.pr === pr && (hit.state === 'MERGED' || now - Date.parse(hit.at) < CHECK_TTL_MS)) return hit.state === 'MERGED' ? `PR ${pr} is merged` : null;
    const r = run('gh', ['pr', 'view', String(pr), '--json', 'state'], { cwd: root });
    let state = null;
    try { state = r.status === 0 ? JSON.parse(r.stdout).state : null; } catch { state = null; }
    if (key && state) cache[key] = { pr, state, at: new Date(now).toISOString() };
    return state === 'MERGED' ? `PR ${pr} is merged` : null;
  }
  if (fm.progress?.implement !== 'complete') return null;
  const ref = run('git', ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${base}`], { cwd: root }).status === 0 ? `origin/${base}` : base;
  if (run('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { cwd: root }).status !== 0) return null;
  return run('git', ['merge-base', '--is-ancestor', branch, ref], { cwd: root }).status === 0 ? `${branch} is in ${ref}` : null;
}

/** The open workflows whose branch is merged: `[{ slug, reason }]`. */
export function closeCandidates(root, workflows, { run = defaultRun, now = Date.now() } = {}) {
  const cache = readCache();
  const before = JSON.stringify(cache);
  const out = [];
  for (const w of workflows) {
    const fm = w.frontmatter ?? {};
    if (w.classification === 'invalid' || !isOpen(fm)) continue;
    const slug = w.directorySlug ?? w.slug;
    const reason = mergedReason(root, fm, { run, cache, key: `${root}::${slug}`, now });
    if (reason) out.push({ slug, reason });
  }
  if (JSON.stringify(cache) !== before) writeCache(cache);
  return out;
}

/**
 * Close a workflow: the close record `99-close.md` and the index fields. With `decline`, only
 * record that the person said no, so the question does not come back.
 */
export function closeWorkflow(root, slug, { reason = 'merged', note = null, decline = false, now = new Date() } = {}) {
  const dir = workflowDir(root, slug);
  const fm = frontmatterOfDoc(dir, INDEX_NAME);
  if (!fm) return { ok: false, reason: `no workflow ${slug}` };
  if (decline) {
    setFields(dir, INDEX_NAME, { 'close-declined-at': nowIso(now) });
    return { ok: true, declined: true };
  }
  if (!isOpen(fm)) return { ok: true, closed: false, reason: `${slug} is already ${fm.status}` };
  const progress = fm.progress && typeof fm.progress === 'object' ? fm.progress : {};
  const done = Object.entries(progress).filter(([, v]) => v === 'complete' || v === 'skipped').map(([k]) => k);
  const open = Object.entries(progress).filter(([, v]) => v !== 'complete' && v !== 'skipped').map(([k]) => k);
  const at = nowIso(now);
  writeDoc(dir, '99-close.md', {
    frontmatter: {
      schema: 'sdlc/v1', type: 'close-record', slug, 'workflow-type': fm['workflow-type'] ?? 'standard',
      'close-reason': reason, 'superseded-by': fm['pr-url'] || 'n/a', 'last-stage-reached': fm['current-stage'] ?? null,
      'stages-completed': done, 'stages-incomplete': open, 'had-open-branch': false, branch: fm.branch || 'none',
      'had-open-pr': false, 'pr-url': fm['pr-url'] || 'none', 'unmerged-commits': 0, 'closed-at': at,
      'next-command': 'none', 'next-invocation': 'none — workflow closed',
      'recommended-routes': [{ invocation: `/wf status ${slug}`, reason: 'the record of the closed workflow', default: true }],
    },
    body: `## Work Completed\n\n${done.map((s) => `- ${s}`).join('\n') || '- none'}\n\n## Work Not Completed\n\n${open.map((s) => `- ${s}`).join('\n') || '- none'}\n\n## Reason & Context\n\n${note ?? `Closed after the merge: ${reason}.`}\n\n## Revival Instructions\n\nNot applicable — closed permanently.\n`,
  });
  const files = Array.isArray(fm['workflow-files']) ? fm['workflow-files'] : [];
  setFields(dir, INDEX_NAME, {
    status: 'closed', 'close-reason': reason, 'closed-at': at,
    'next-invocation': 'Done', ...(files.includes('99-close.md') ? {} : { 'workflow-files': [...files, '99-close.md'] }),
  });
  return { ok: true, closed: true };
}

