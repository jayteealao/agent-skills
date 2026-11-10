// The approval of a design: a script records it from the answer event of the person, never
// from the agent's word.
//
// The design stage asks the approval question with the host question tool, and the question
// hook writes the answer event to answers.jsonl (lib/answers.mjs). `approveDesign` reads that
// event. On an approve, it commits the screens in the product repo, adds the approval to the
// manifest, saves the approved version and one picture per screen in the records, and writes the
// confirmation fields into `02c-craft.md`.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { findAnswer } from './answers.mjs';
import { captureScreens } from './design-check.mjs';
import { approvalPicture, commitDesignRecords, readChecks } from './design-records.mjs';
import { componentFile, componentRel, workflowComponents } from './design-components.mjs';
import { saveApproved } from './design-versions.mjs';
import { COMPONENTS_FILE, MANIFEST_FILE, SURFACE_REL, TOKENS_FILE, listScreens, readManifest, screenRel, surfaceDir, writeManifest } from './design-surface.mjs';
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
export function commitSurface(root, paths, message) {
  if (!git(root, ['rev-parse', '--is-inside-work-tree']).ok) throw new Error('the product repo is not a git repo: the approval needs a commit');
  const add = git(root, ['add', '--', ...paths]);
  if (!add.ok) throw new Error(`git add failed: ${add.err}`);
  // A folder with no file, such as an empty components folder, is no path that git knows, and a
  // commit that names it fails. Commit only the paths that git knows after the add.
  paths = paths.filter((p) => git(root, ['ls-files', '--', p]).out);
  if (!paths.length) return { commit: git(root, ['rev-parse', 'HEAD']).out, changed: false };
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
 * The answer time of the newest approval of a workflow in the manifest, or null. An approval
 * before this field has its own time, which is later than its answer.
 */
export function lastApprovalAnswer(root, slug) {
  let last = null;
  for (const sc of Object.values(readManifest(root).screens)) {
    for (const a of sc?.approvals ?? []) {
      if (a?.workflow !== slug) continue;
      const t = a.answeredAt ?? a.at;
      if (t && (!last || Date.parse(t) > Date.parse(last))) last = t;
    }
  }
  return last;
}

// An approval that started and did not end: the steps that it made, so a rerun ends the same one.
const PENDING_FILE = '.design-approval.json';
const readJson = (file) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } };

/**
 * Record the approval. It fails, and writes nothing, when the contract is missing, when no
 * answer event to the approval question is newer than the last approval, or when the answer is
 * not an approve. The last approval is the later of the contract's `answered-at` and the newest
 * approval of the workflow in the manifest, so a rewrite of the contract cannot bring back an old
 * answer. An approval that stopped part way (a browser that fails, a process that ends) is ended
 * by the next run, with no second commit or version.
 */
export async function approveDesign(root, slug, { keys = null, slice = null, since = null, reason = null, now = new Date(), browser = undefined } = {}) {
  const dir = workflowDir(root, slug);
  if (!frontmatterOfDoc(dir, INDEX_NAME)) return { ok: false, reason: `no workflow ${slug}` };
  const contract = frontmatterOfDoc(dir, '02c-craft.md');
  if (!contract) return { ok: false, reason: 'write 02c-craft.md first (wf.mjs record put), then record the approval' };
  const question = approvalQuestion(slug);
  const pendingFile = join(dir, PENDING_FILE);
  const held = readJson(pendingFile);
  const resume = held?.answeredAt && Array.isArray(held.screens) && held.screens.length && contract['answered-at'] !== held.answeredAt ? held : null;
  let answer;
  let approved;
  if (resume) {
    answer = { at: resume.answeredAt, answer: resume.answer };
    approved = resume.screens;
    ({ slice = null, reason = null } = resume);
  } else {
    const marks = [contract['answered-at'], lastApprovalAnswer(root, slug)].filter((t) => t && Number.isFinite(Date.parse(t)));
    const mark = marks.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
    answer = findAnswer(root, question, { since: since ?? mark });
    if (!answer || (mark && Date.parse(answer.at) <= Date.parse(mark))) return { ok: false, reason: 'no new answer event for the approval question', question };
    if (!/^\s*approve\b/i.test(answer.answer)) return { ok: false, reason: `the person answered: ${answer.answer}`, question };
    approved = approvalKeys(root, slug, { keys, slice });
    if (!approved.length) return { ok: false, reason: `no screen of ${slug}${slice ? ` slice ${slice}` : ''} is on the surface` };
  }
  const step = { ...(resume ?? { answeredAt: answer.at, answer: answer.answer, screens: approved, at: nowIso(now), slice, reason }) };
  const keep = () => writeFileSync(pendingFile, `${JSON.stringify(step, null, 2)}\n`);
  keep();

  const library = workflowComponents(root, approved);
  const surface = [...approved.map(screenRel), `${SURFACE_REL}/${MANIFEST_FILE}`, ...[TOKENS_FILE, COMPONENTS_FILE].filter((f) => existsSync(join(surfaceDir(root), f))).map((f) => `${SURFACE_REL}/${f}`),
    ...Object.keys(readManifest(root).components).filter((k) => existsSync(componentFile(root, k))).map(componentRel)];
  let changed = false;
  if (!step.commit) {
    const c = commitSurface(root, surface, `design: approve ${approved.join(', ')} for ${slug}`);
    step.commit = c.commit;
    changed = c.changed;
    keep();
  }
  const { commit, at } = step;
  if (!step.version) {
    step.version = saveApproved(root, slug, approved, { commit, reason, slice, now });
    keep();
  }
  const { version } = step;
  const m = readManifest(root);
  let added = false;
  for (const key of approved) {
    const s = m.screens[key];
    if (!s || (s.approvals ?? []).some((a) => a?.workflow === slug && a.answeredAt === step.answeredAt)) continue;
    s.approvals = [...(s.approvals ?? []), { commit, version, at, answeredAt: step.answeredAt, workflow: slug, ...(slice ? { slice } : {}) }];
    added = true;
  }
  if (added) writeManifest(root, m);
  commitSurface(root, [`${SURFACE_REL}/${MANIFEST_FILE}`], `design: record the approval of ${slug}`);

  // The contract gets its fields before the pictures, so a failed capture loses no approval.
  const checks = readChecks(root);
  const failures = (checks?.failures ?? []).filter((f) => approved.includes(f.screen));
  const fields = {
    screens: approved,
    'approval-commit': commit,
    'design-version': version,
    components: library.used,
    'components-to-build': library.toBuild,
    'direction-confirmed-by': 'answer-event',
    'confirmed-at': at,
    'answered-at': step.answeredAt,
    'image-gate': 'skipped:the approval pictures were not taken yet',
    'check-failures': checks ? failures.length : null,
  };
  setFields(dir, '02c-craft.md', fields);
  rmSync(pendingFile, { force: true });

  let pictures = null;
  let captureError = null;
  try { pictures = await captureScreens(root, approved, { browser }); } catch (e) { pictures = null; captureError = e.message; }
  if (pictures) {
    for (const [key, png] of Object.entries(pictures)) {
      const file = approvalPicture(root, commit, key);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, png);
    }
  }
  commitDesignRecords(root, `design: ${version} of ${slug}`);
  const imageGate = pictures ? 'pass' : captureError
    ? `skipped:the approval pictures failed (${captureError}); the screens are committed`
    : 'skipped:no browser for the approval pictures; the screens are committed';
  setFields(dir, '02c-craft.md', { 'image-gate': imageGate });
  return { ok: true, slug, screens: approved, commit, version, committed: changed, pictures: pictures ? Object.keys(pictures).length : 0, checkFailures: fields['check-failures'], answer: answer.answer, ...(resume ? { resumed: true } : {}) };
}
