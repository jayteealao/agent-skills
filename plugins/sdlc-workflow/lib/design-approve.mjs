// The approval of a design: a script records it from the answer event of the person, never
// from the agent's word.
//
// The design stage asks the approval question with the host question tool, and the question
// hook writes the answer event to answers.jsonl (lib/answers.mjs). `approveDesign` reads that
// event. On an approve, it commits the screens in the product repo, adds the approval to the
// manifest, saves the approved version, one picture per screen and one per component that the
// screens use in the records, writes the confirmation fields into `02c-craft.md`, and sets the
// next step of the workflow in its index.
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { findAnswer, norm, readAnswerEvents } from './answers.mjs';
import { writeFileAtomic } from './atomic-write.mjs';
import { SYSTEM_CHECKS, captureComponents, captureScreens, systemFailures } from './design-check.mjs';
import { approvalPicture, commitDesignRecords, componentPictureKey, readChecks } from './design-records.mjs';
import { componentFile, componentRel, workflowComponents } from './design-components.mjs';
import { isWorkflowSlug, listVersions, saveApproved } from './design-versions.mjs';
import { COMPONENTS_FILE, KEY_RE, LAYOUT_SHEET, MANIFEST_FILE, SURFACE_REL, TOKENS_FILE, TOKENS_JSON, listScreens, readManifest, screenRel, surfaceDir, updateManifest } from './design-surface.mjs';
import { Refusal, agentFix, personFix, refuse } from './fix.mjs';
import { INDEX_NAME, frontmatterOfDoc, setFields } from './records.mjs';
import { workflowDir } from './records-root.mjs';
import { stageDone } from './stage-done.mjs';

/** The approval question. `approveDesign` looks for this exact text in the answer log. */
export const approvalQuestion = (slug) => `Approve the screens of ${slug} as the canvas shows them now?`;

/** The option of the approval question that approves. Only this answer records an approval. */
export const APPROVE_LABEL = 'Approve';

/** True when the answer is the Approve option itself. "Approve, but ..." is no approval. */
export const isApproval = (answer) => norm(answer).toLowerCase() === APPROVE_LABEL.toLowerCase();

const nowIso = (d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

function git(root, args) {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true });
  return { ok: r.status === 0, out: String(r.stdout ?? '').trim(), err: String(r.stderr ?? '').trim() };
}

/** Commit these paths of the product repo, and only these. Returns the commit that holds them. */
export function commitSurface(root, paths, message) {
  if (!git(root, ['rev-parse', '--is-inside-work-tree']).ok) throw refuse('the product repo is not a git repo: the approval needs a commit', personFix('Make the product folder a git repo, then run the command again.'));
  const add = git(root, ['add', '--', ...paths]);
  if (!add.ok) throw refuse(`git add failed: ${add.err.split('\n')[0]}`, personFix('Check the product repo with git status (a lock file or an ignore rule can stop the add), then run the command again.'));
  // A folder with no file, such as an empty components folder, is no path that git knows, and a
  // commit that names it fails. Commit only the paths that git knows after the add.
  paths = paths.filter((p) => git(root, ['ls-files', '--', p]).out);
  if (!paths.length) return { commit: git(root, ['rev-parse', 'HEAD']).out, changed: false };
  const changed = !git(root, ['diff', '--cached', '--quiet', '--', ...paths]).ok;
  if (changed) {
    const c = git(root, ['commit', '-q', '-m', message, '--', ...paths]);
    if (!c.ok) throw refuse(`git commit failed: ${c.err.split('\n')[0]}`, personFix('Check the product repo with git status (a commit hook, a merge or a missing user name can stop the commit), then run the command again.'));
  }
  return { commit: git(root, ['rev-parse', 'HEAD']).out, changed };
}

/** The screens that an approval covers: the given keys, else the screens of the workflow (and slice). */
export function approvalKeys(root, slug, { keys = null, slice = null } = {}) {
  const screens = listScreens(root, { workflow: keys?.length ? null : slug });
  const chosen = keys?.length ? screens.filter((s) => keys.includes(s.key)) : screens.filter((s) => !slice || (s.slices ?? []).includes(slice));
  if (keys?.length) {
    const unknown = keys.filter((k) => !chosen.some((s) => s.key === k));
    if (unknown.length) throw refuse(`no screen ${unknown.join(', ')}`, agentFix('Name screens of the surface, or name none to approve every screen of the workflow.', 'wf.mjs design list <root>'));
  }
  const missing = chosen.filter((s) => !s.exists).map((s) => s.key);
  if (missing.length) throw refuse(`the screen page is missing: ${missing.join(', ')}`, agentFix(`Draw the page of each missing screen in ${SURFACE_REL}/screens/, show the screens to the person again, then record the approval.`));
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

/** The answer to the approval question in the event of the time `at`, or null when the log holds no such event. */
function answerAt(root, question, at) {
  const want = norm(question);
  for (const ev of readAnswerEvents(root)) {
    if (ev?.at !== at) continue;
    const hit = (ev.questions ?? []).find((q) => norm(q?.question) === want);
    if (hit) return String(hit.answer ?? '');
  }
  return null;
}

/**
 * The file of an approval that stopped part way, when it can be trusted: the answer log holds
 * the approve of its answer time, and each of its screens is a screen of the manifest. Any other
 * file is no approval: it is removed, and the run starts from the answer log.
 */
function heldApproval(root, file, question, contract) {
  const held = readJson(file);
  if (!held) return null;
  const screens = readManifest(root).screens;
  const sound = typeof held.answeredAt === 'string' && contract['answered-at'] !== held.answeredAt
    && Array.isArray(held.screens) && held.screens.length > 0 && held.screens.every((k) => typeof k === 'string' && KEY_RE.test(k) && screens[k])
    && isApproval(answerAt(root, question, held.answeredAt) ?? '');
  if (sound) return held;
  rmSync(file, { force: true });
  return null;
}

/**
 * The next step after the design, by the kind of the workflow: the campaign walk for a work
 * packet, the plan for an `rca` workflow (it has no slice stage), else the slice stage.
 */
export function nextAfterDesign(slug, index) {
  const packet = /(?:^|\/)([^/]+)\/work\/[^/]+$/.exec(String(index?.['origin-packet'] ?? '').replace(/\\/g, '/'));
  if (packet) return `/wf campaign ${packet[1]}`;
  return index?.['workflow-type'] === 'rca' ? `/wf plan ${slug}` : `/wf slice ${slug}`;
}

const fail = (reason, fix, more = {}) => ({ ok: false, reason, ...more, fix });

/* ───────────────────────── waivers ───────────────────────── */

// A failure of the design system (a token, component, layout or library check) blocks the
// approval. The person may accept one cause as it is for one workflow: the waiver records the
// cause and why, in the manifest, so the approval goes on over it.

/** The waivers of the manifest, `[{ workflow, cause, reason, at }]`; `slug` keeps those of one workflow. */
export function waiversOf(root, slug = null) {
  const list = Array.isArray(readManifest(root).waivers) ? readManifest(root).waivers : [];
  return list.filter((w) => w && typeof w === 'object' && typeof w.workflow === 'string' && typeof w.cause === 'string' && (!slug || w.workflow === slug));
}

/** The keys of the screens that the gate reads for a workflow: its screens, and any screen that the approval names. */
const gateKeys = (root, slug, keys = []) => [...new Set([...listScreens(root, { workflow: slug }).map((s) => s.key), ...keys])];

/** The system failures of the stored check that stay for a workflow, after its waivers: `{ screens, library, causes }`. */
export function systemStay(root, slug, keys = []) {
  return systemFailures(readChecks(root), gateKeys(root, slug, keys), { workflow: slug, waivers: waiversOf(root, slug) });
}

/** The waive command of a workflow, for a fix. */
export const waiveCommand = (root, slug) => `wf.mjs design waive ${String(root).replace(/\\/g, '/')} ${slug} --cause "<cause>" --reason "<why the person accepts it>"`;

/**
 * Waive one cause of a system failure for a workflow: the person accepts it as it is. The cause is
 * one that the stored check names for the screens of the workflow or the library. A second waiver
 * of the same cause replaces the reason. Returns `{ ok, waiver, waivers }`.
 */
export function waiveCause(root, slug, { cause, reason, now = new Date() } = {}) {
  const c = typeof cause === 'string' ? cause.trim() : '';
  const why = typeof reason === 'string' ? reason.trim() : '';
  if (!c) throw refuse('design waive needs --cause', agentFix('Run the command again with --cause and the cause of a token, component, layout or library failure, as design check or design next prints it.', waiveCommand(root, slug)));
  if (!why) throw refuse('design waive needs --reason', agentFix('Run the command again with --reason and one sentence that says why the person accepts this cause as it is.', waiveCommand(root, slug)));
  const checks = readChecks(root);
  const all = systemFailures(checks, gateKeys(root, slug), { workflow: slug, waivers: [] });
  if (!all.causes.includes(c)) {
    throw refuse(`no ${SYSTEM_CHECKS.join(', ')} failure of ${slug} has the cause ${c}`, agentFix(all.causes.length ? `Run the command again with one of these causes: ${all.causes.slice(0, 20).join(', ')}.` : 'The stored check has no system failure for this workflow: run the check, then waive a cause that it names.', `wf.mjs design check ${String(root).replace(/\\/g, '/')} --workflow ${slug}`));
  }
  const waiver = { workflow: slug, cause: c, reason: why, at: nowIso(now) };
  const m = updateManifest(root, (x) => {
    const list = (Array.isArray(x.waivers) ? x.waivers : []).filter((w) => !(w?.workflow === slug && w?.cause === c));
    x.waivers = [...list, waiver];
  });
  return { ok: true, slug, waiver, waivers: (m.waivers ?? []).filter((w) => w?.workflow === slug) };
}

/**
 * Record the approval. It fails, and writes nothing, when the contract is missing, when no
 * answer event to the approval question is newer than the last approval, or when the answer is
 * not the Approve option. The last approval is the later of the contract's `answered-at` and the
 * newest approval of the workflow in the manifest, so a rewrite of the contract cannot bring back
 * an old answer. An approval that stopped part way (a browser that fails, a process that ends) is
 * ended by the next run, with no second commit or version.
 *
 * The contract then names every screen of the approved version, the carried ones too. The index
 * gets the end of the design stage and the next step; while a screen of the workflow has no
 * approval yet, the design stays in progress and the next step is the design stage. The result
 * carries those index fields in `index`.
 */
export async function approveDesign(root, slug, { keys = null, slice = null, since = null, reason = null, now = new Date(), browser = undefined } = {}) {
  if (!isWorkflowSlug(slug)) return fail(`${slug} is not the slug of a workflow`, agentFix('Give the slug of the workflow: the name of its folder, with no path. Then run the command again.'));
  const dir = workflowDir(root, slug);
  if (!frontmatterOfDoc(dir, INDEX_NAME)) return fail(`no workflow ${slug}`, agentFix('Run the command again with the slug of a workflow of this project.'));
  const contract = frontmatterOfDoc(dir, '02c-craft.md');
  if (!contract) return fail('write 02c-craft.md first (wf.mjs record put), then record the approval', agentFix('Write the draft of 02c-craft.md from the contract template and put it, then run the command again.'));
  const question = approvalQuestion(slug);
  const pendingFile = join(dir, PENDING_FILE);
  let step = null;
  try {
    const resume = heldApproval(root, pendingFile, question, contract);
    let answer;
    let approved;
    if (resume) {
      answer = { at: resume.answeredAt, answer: APPROVE_LABEL };
      approved = resume.screens;
      slice = typeof resume.slice === 'string' ? resume.slice : null;
      reason = typeof resume.reason === 'string' ? resume.reason : null;
    } else {
      const marks = [contract['answered-at'], lastApprovalAnswer(root, slug)].filter((t) => t && Number.isFinite(Date.parse(t)));
      const mark = marks.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
      answer = findAnswer(root, question, { since: since ?? mark });
      if (!answer || (mark && Date.parse(answer.at) <= Date.parse(mark))) {
        return fail('no new answer event for the approval question', agentFix(`Ask the approval question with the host question tool, with this exact text and the options ${APPROVE_LABEL}, Adjust and Stop. Then run the command again.`), { question });
      }
      if (!isApproval(answer.answer)) {
        return fail(`the person answered: ${answer.answer}. Only the answer ${APPROVE_LABEL} records an approval`,
          agentFix(`Do what the person answered. When the screens are ready, ask the approval question again; an approval is the option ${APPROVE_LABEL} and nothing more.`), { question });
      }
      approved = approvalKeys(root, slug, { keys, slice });
      if (!approved.length) return fail(`no screen of ${slug}${slice ? ` slice ${slice}` : ''} is on the surface`, agentFix('Add the screens of the workflow first, then show them to the person and record the approval.', `wf.mjs design screen add <root> <key> --workflow ${slug}`));
      // The design system gate: a token, component, layout or library failure blocks the approval
      // until it is repaired or the person waives its cause. The answer stays unused for the next run.
      const stay = systemStay(root, slug, approved);
      if (stay.causes.length) {
        throw refuse(`System check failures stay: ${stay.causes.length} cause(s) of the ${SYSTEM_CHECKS.join(', ')} checks are neither repaired nor waived: ${stay.causes.slice(0, 10).join(', ')}${stay.causes.length > 10 ? `, and ${stay.causes.length - 10} more` : ''}`,
          agentFix(`Repair each cause as its move or its do line says, run the check again, then run design approve again. When the person accepts a cause as it is, record that with design waive, once for each cause.`, waiveCommand(root, slug)));
      }
    }
    step = { ...(resume ?? { answeredAt: answer.at, answer: answer.answer, screens: approved, at: nowIso(now), slice, reason }) };
    const keep = () => writeFileAtomic(pendingFile, `${JSON.stringify(step, null, 2)}\n`);
    keep();

    const surface = [...approved.map(screenRel), `${SURFACE_REL}/${MANIFEST_FILE}`, ...[TOKENS_FILE, TOKENS_JSON, LAYOUT_SHEET, COMPONENTS_FILE].filter((f) => existsSync(join(surfaceDir(root), f))).map((f) => `${SURFACE_REL}/${f}`),
      ...Object.keys(readManifest(root).components).filter((k) => existsSync(componentFile(root, k))).map(componentRel)];
    let changed = false;
    if (!step.commit) {
      const c = commitSurface(root, surface, `design: approve ${approved.join(', ')} for ${slug}`);
      step.commit = c.commit;
      changed = c.changed;
      keep();
    }
    const { commit, at } = step;
    // One answer makes one version: a run that stopped after the version was written finds it again.
    if (!step.version) {
      step.version = saveApproved(root, slug, approved, { commit, answeredAt: step.answeredAt, reason, slice, now });
      keep();
    }
    const { version } = step;
    updateManifest(root, (m) => {
      let added = false;
      for (const key of approved) {
        const s = m.screens[key];
        if (!s || (s.approvals ?? []).some((a) => a?.workflow === slug && a.answeredAt === step.answeredAt)) continue;
        s.approvals = [...(s.approvals ?? []), { commit, version, at, answeredAt: step.answeredAt, workflow: slug, ...(slice ? { slice } : {}) }];
        added = true;
      }
      return added;
    });
    commitSurface(root, [`${SURFACE_REL}/${MANIFEST_FILE}`], `design: record the approval of ${slug}`);

    // The contract names every screen of the version: the screens of this approval, and the
    // screens that the version carries from the one before it.
    const held = listVersions(root, slug).approved.find((v) => v.id === version)?.screens.map((s) => s.key) ?? [];
    const screens = [...approved, ...held.filter((k) => !approved.includes(k))];
    const library = workflowComponents(root, screens);
    // The contract gets its fields before the pictures, so a failed capture loses no approval.
    const checks = readChecks(root);
    const failures = (checks?.failures ?? []).filter((f) => screens.includes(f.screen));
    const fields = {
      screens,
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

    // The index: the design stage is done when every screen of the workflow has its approval.
    const remaining = listScreens(root, { workflow: slug }).filter((s) => s.exists && !screens.includes(s.key)).map((s) => s.key);
    const before = frontmatterOfDoc(dir, INDEX_NAME) ?? {};
    const next = remaining.length ? `/wf design ${slug}` : nextAfterDesign(slug, before);
    const done = stageDone(dir, slug, 'design', null, { next, status: remaining.length ? 'in-progress' : 'complete' });
    const index = { 'current-stage': done['current-stage'], 'progress.design': done['progress.design'], 'next-command': done['next-command'], 'next-invocation': done['next-invocation'] };
    if (before.status === 'awaiting-input') { setFields(dir, INDEX_NAME, { status: 'active' }); index.status = 'active'; }

    let pictures = null;
    let captureError = null;
    try { pictures = await captureScreens(root, approved, { browser }); } catch (e) { pictures = null; captureError = e.message; }
    if (pictures) {
      for (const [key, png] of Object.entries(pictures)) {
        const file = approvalPicture(root, commit, key);
        mkdirSync(dirname(file), { recursive: true });
        writeFileAtomic(file, png);
      }
    }
    // One picture of each component that the approved screens use, beside the screen pictures, so
    // verify can hold the built component against it. A component that cannot be pictured is a
    // note, never a failed approval.
    let componentPictures = 0;
    const componentsSkipped = [];
    if (library.used.length) {
      let shots = null;
      let why = pictures ? null : captureError ? `the approval pictures failed (${captureError})` : 'no browser for the approval pictures';
      if (!why) {
        try { shots = await captureComponents(root, library.used, { browser }); } catch (e) { why = `the component pictures failed (${e.message})`; }
        if (!shots && !why) why = 'no browser for the component pictures';
      }
      if (shots) {
        for (const [key, png] of Object.entries(shots.pictures)) {
          const file = approvalPicture(root, commit, componentPictureKey(key));
          mkdirSync(dirname(file), { recursive: true });
          writeFileAtomic(file, png);
          componentPictures += 1;
        }
        componentsSkipped.push(...shots.skipped);
      } else componentsSkipped.push(...library.used.map((key) => ({ key, why })));
    }
    commitDesignRecords(root, `design: ${version} of ${slug}`);
    const imageGate = pictures ? 'pass' : captureError
      ? `skipped:the approval pictures failed (${captureError}); the screens are committed`
      : 'skipped:no browser for the approval pictures; the screens are committed';
    setFields(dir, '02c-craft.md', { 'image-gate': imageGate });
    return {
      ok: true, slug, screens: approved, approvedScreens: screens, remaining, commit, version, committed: changed,
      pictures: pictures ? Object.keys(pictures).length : 0, componentPictures, componentsSkipped, checkFailures: fields['check-failures'], answer: answer.answer,
      index, next, ...(resume ? { resumed: true } : {}),
    };
  } catch (e) {
    // A refusal names its repair; any other error is a defect, and the caller reports it as one.
    if (e instanceof Refusal) {
      // A refusal before the version exists ends this run: the next run reads the answer again,
      // so it can name other screens. The answer still counts, because no approval used it.
      if (step && !step.version) rmSync(pendingFile, { force: true });
      return fail(e.message, e.fix);
    }
    throw e;
  }
}
