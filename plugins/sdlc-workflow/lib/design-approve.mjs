// The approval of a design: a script records it from the answer event of the person, never
// from the agent's word.
//
// The design stage asks the approval question with the host question tool, and the question
// hook writes the answer event to answers.jsonl (lib/answers.mjs). `approveDesign` reads that
// event. On an approve, it commits the screens in the product repo, adds the approval to the
// manifest, stores one picture per screen in the records, and writes the confirmation fields
// into `02c-craft.md`.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { findAnswer } from './answers.mjs';
import { captureScreens } from './design-check.mjs';
import { approvalPicture, commitDesignRecords, readChecks } from './design-records.mjs';
import { MANIFEST_FILE, SURFACE_REL, TOKENS_FILE, listScreens, readManifest, screenRel, surfaceDir, writeManifest } from './design-surface.mjs';
import { INDEX_NAME, frontmatterOfDoc, setFields } from './records.mjs';
import { workflowDir } from './records-root.mjs';

/** The approval question. `approveDesign` looks for this exact text in the answer log. */
export const approvalQuestion = (slug) => `Approve the screens of ${slug} as the canvas shows them now?`;

const nowIso = (d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

function git(root, args) {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true });
  return { ok: r.status === 0, out: String(r.stdout ?? '').trim(), err: String(r.stderr ?? '').trim() };
}

/** Commit these paths of the product repo, and only these. Returns the commit that holds them. */
function commitSurface(root, paths, message) {
  if (!git(root, ['rev-parse', '--is-inside-work-tree']).ok) throw new Error('the product repo is not a git repo: the approval needs a commit');
  const add = git(root, ['add', '--', ...paths]);
  if (!add.ok) throw new Error(`git add failed: ${add.err}`);
  const changed = !git(root, ['diff', '--cached', '--quiet', '--', ...paths]).ok;
  if (changed) {
    const c = git(root, ['commit', '-q', '-m', message, '--', ...paths]);
    if (!c.ok) throw new Error(`git commit failed: ${c.err}`);
  }
  return { commit: git(root, ['rev-parse', 'HEAD']).out, changed };
}

/** The screens that an approval covers: the given keys, else the screens of the workflow (and slice). */
export function approvalKeys(root, slug, { keys = null, slice = null } = {}) {
  const screens = listScreens(root, { workflow: keys?.length ? null : slug });
  const chosen = keys?.length ? screens.filter((s) => keys.includes(s.key)) : screens.filter((s) => !slice || (s.slices ?? []).includes(slice));
  if (keys?.length) {
    const unknown = keys.filter((k) => !chosen.some((s) => s.key === k));
    if (unknown.length) throw new Error(`no screen ${unknown.join(', ')}`);
  }
  const missing = chosen.filter((s) => !s.exists).map((s) => s.key);
  if (missing.length) throw new Error(`the screen page is missing: ${missing.join(', ')}`);
  return chosen.map((s) => s.key);
}

/**
 * Record the approval. It fails, and writes nothing, when the contract is missing, when no
 * answer event to the approval question is newer than the last approval, or when the answer is
 * not an approve.
 */
export async function approveDesign(root, slug, { keys = null, slice = null, since = null, now = new Date(), browser = undefined } = {}) {
  const dir = workflowDir(root, slug);
  if (!frontmatterOfDoc(dir, INDEX_NAME)) return { ok: false, reason: `no workflow ${slug}` };
  const contract = frontmatterOfDoc(dir, '02c-craft.md');
  if (!contract) return { ok: false, reason: 'write 02c-craft.md first (wf.mjs record put), then record the approval' };
  const question = approvalQuestion(slug);
  const answer = findAnswer(root, question, { since: since ?? contract['answered-at'] ?? null });
  if (!answer || (contract['answered-at'] && answer.at === contract['answered-at'])) return { ok: false, reason: 'no new answer event for the approval question', question };
  if (!/^\s*approve\b/i.test(answer.answer)) return { ok: false, reason: `the person answered: ${answer.answer}`, question };
  const approved = approvalKeys(root, slug, { keys, slice });
  if (!approved.length) return { ok: false, reason: `no screen of ${slug}${slice ? ` slice ${slice}` : ''} is on the surface` };

  const surface = [...approved.map(screenRel), `${SURFACE_REL}/${MANIFEST_FILE}`, ...(existsSync(join(surfaceDir(root), TOKENS_FILE)) ? [`${SURFACE_REL}/${TOKENS_FILE}`] : [])];
  const { commit, changed } = commitSurface(root, surface, `design: approve ${approved.join(', ')} for ${slug}`);
  const at = nowIso(now);
  const m = readManifest(root);
  for (const key of approved) {
    const s = m.screens[key];
    s.approvals = [...(s.approvals ?? []), { commit, at, workflow: slug, ...(slice ? { slice } : {}) }];
  }
  writeManifest(root, m);
  commitSurface(root, [`${SURFACE_REL}/${MANIFEST_FILE}`], `design: record the approval of ${slug}`);

  const pictures = await captureScreens(root, approved, { browser });
  if (pictures) {
    for (const [key, png] of Object.entries(pictures)) {
      const file = approvalPicture(root, commit, key);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, png);
    }
    commitDesignRecords(root, `design: approval pictures of ${slug}`);
  }
  const checks = readChecks(root);
  const failures = (checks?.failures ?? []).filter((f) => approved.includes(f.screen));
  const fields = {
    screens: approved,
    'approval-commit': commit,
    'direction-confirmed-by': 'answer-event',
    'confirmed-at': at,
    'answered-at': answer.at,
    'image-gate': pictures ? 'pass' : 'skipped:no browser for the approval pictures; the screens are committed',
    'check-failures': checks ? failures.length : null,
  };
  setFields(dir, '02c-craft.md', fields);
  return { ok: true, slug, screens: approved, commit, committed: changed, pictures: pictures ? Object.keys(pictures).length : 0, checkFailures: fields['check-failures'], answer: answer.answer };
}
