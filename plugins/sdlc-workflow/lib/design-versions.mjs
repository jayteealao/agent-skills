// The versions of a design: the pages of a workflow as they stood, kept in the records.
//
// A round is a draft on the way to a decision. The design stage saves one after each decision
// round, and the workflow close deletes them. An approved version is the decision that the build
// works against, and it stays. Only `approveDesign` makes one, from the answer event of the
// person. Rounds are numbered under the version that they lead to: after v2, the work is
// v3-r1, v3-r2.
//
//   <records>/_design/versions/<workflow>/
//     v1/                  an approved version
//     rounds/v2-r1/        a draft toward v2
//
// Each folder holds version.json, tokens.css, components.css and screens/<key>.html. A later squash cannot lose
// a version, because the pages are copies, not a commit id. An approved version holds every
// approved screen of the workflow: an approval of some screens carries the others from the
// version before it.
//
// A folder is made beside its place and moved there whole, and the number of a round or a version
// is taken under a lock, so two writers never share a number and a reader never sees half a folder.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { liveDecisions, readDecisions } from './decisions.mjs';
import { commitDesignRecords, designRecordsDir } from './design-records.mjs';
import { COMPONENTS_FILE, KEY_RE, SCREENS_DIR, TOKENS_FILE, addScreen, listScreens, readManifest, screenRel, surfaceDir, updateManifest, withDesignLock, writeJson } from './design-surface.mjs';
import { agentFix, refuse } from './fix.mjs';
import { INDEX_NAME, frontmatterOfDoc } from './records.mjs';
import { workflowDir } from './records-root.mjs';

const VERSION_RE = /^v(\d+)$/;
const ROUND_RE = /^v(\d+)-r(\d+)$/;
const MAX_REASON = 300;
const VERSION_FILE = 'version.json';
const nowIso = (d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

/** True for the name of one workflow folder: one path part, no parent and no hidden or script folder. */
export const isWorkflowSlug = (slug) => typeof slug === 'string' && /^[a-z0-9][a-z0-9._-]*$/i.test(slug) && !slug.includes('..');

/** Why `slug` names no workflow of this project: `{ reason, fix }`, or null when it names one. */
function workflowProblem(root, slug) {
  if (!isWorkflowSlug(slug)) return { reason: `${slug} is not the slug of a workflow`, fix: agentFix('Give the slug of the workflow: the name of its folder, with no path. Then run the command again.') };
  if (!frontmatterOfDoc(workflowDir(root, slug), INDEX_NAME)) return { reason: `no workflow ${slug}`, fix: agentFix('Run the command again with the slug of a workflow of this project.') };
  return null;
}

export const versionsDir = (root, workflow) => join(designRecordsDir(root), 'versions', workflow);

/** The folder of a version or a round, or null when `id` is neither or `workflow` is no slug. */
export function versionDir(root, workflow, id) {
  if (!isWorkflowSlug(workflow)) return null;
  if (VERSION_RE.test(id)) return join(versionsDir(root, workflow), id);
  if (ROUND_RE.test(id)) return join(versionsDir(root, workflow), 'rounds', id);
  return null;
}

/** The name that a person reads: `v3`, or `v3 round 2`. */
export function versionName(id) {
  const m = ROUND_RE.exec(id);
  return m ? `v${m[1]} round ${m[2]}` : id;
}

function readVersion(root, workflow, id) {
  const dir = versionDir(root, workflow, String(id ?? ''));
  if (!dir) return null;
  try {
    const j = JSON.parse(readFileSync(join(dir, VERSION_FILE), 'utf8'));
    if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
    // The folder name gives the number: a file that says another number does not move the version.
    const r = ROUND_RE.exec(id);
    const screens = (Array.isArray(j.screens) ? j.screens : []).filter((s) => s && KEY_RE.test(String(s.key ?? '')));
    return { ...j, screens, id, workflow, number: Number(r ? r[1] : VERSION_RE.exec(id)[1]), ...(r ? { round: Number(r[2]) } : {}) };
  } catch { return null; }
}

/** The versions of a workflow, oldest first: `{ approved, rounds }`. */
export function listVersions(root, workflow) {
  if (!isWorkflowSlug(workflow)) return { approved: [], rounds: [] };
  const ids = (dir, re) => { try { return readdirSync(dir).filter((n) => re.test(n)); } catch { return []; } };
  const read = (list) => list.map((id) => readVersion(root, workflow, id)).filter(Boolean);
  const base = versionsDir(root, workflow);
  return {
    approved: read(ids(base, VERSION_RE)).sort((a, b) => a.number - b.number),
    rounds: read(ids(join(base, 'rounds'), ROUND_RE)).sort((a, b) => a.number - b.number || a.round - b.round),
  };
}

const closed = (root, slug) => frontmatterOfDoc(workflowDir(root, slug), INDEX_NAME)?.status === 'closed';

/** The versions of each workflow for the canvas. `open` tells whether a restore can start there. */
export function versionsOf(root, workflows) {
  const out = {};
  for (const w of workflows) {
    const v = listVersions(root, w);
    if (v.approved.length || v.rounds.length) out[w] = { ...v, open: !closed(root, w) };
  }
  return out;
}

/** The text of a screen with the extra pages of a migrated screen. Null when the screen has no page. */
function pageText(screens, key) {
  try {
    const main = join(screens, `${key}.html`);
    if (!existsSync(main)) return null;
    const sub = join(screens, key);
    const more = existsSync(sub) ? readdirSync(sub, { recursive: true }).map(String).sort().map((f) => join(sub, f)).filter((f) => statSync(f).isFile()) : [];
    // A checkout can change the line ends, and a change of line ends is no design change.
    return [main, ...more].map((f) => readFileSync(f, 'utf8')).join('\0').replace(/\r\n/g, '\n');
  } catch { return null; }
}

const hasPage = (dir, key) => { try { return statSync(join(dir, `${key}.html`)).isFile(); } catch { return false; } };

/** Copy one page and the folder of its extra files. The folder at `to` becomes the folder at `from`: no older file stays. */
function copyPage(from, to, key) {
  cpSync(join(from, `${key}.html`), join(to, `${key}.html`));
  rmSync(join(to, key), { recursive: true, force: true });
  if (existsSync(join(from, key))) cpSync(join(from, key), join(to, key), { recursive: true });
}

const surfaceScreens = (root) => join(surfaceDir(root), SCREENS_DIR);
const screensOf = (root, v) => join(versionDir(root, v.workflow, v.id), SCREENS_DIR);

const sheetText = (dir) => { try { return readFileSync(join(dir, COMPONENTS_FILE), 'utf8').replace(/\r\n/g, '\n'); } catch { return null; } };

/** The screens of `keys` whose page differs from the version `v`, and the component sheet when it differs. */
function changedSince(root, keys, v) {
  if (!v) return keys;
  const had = screensOf(root, v);
  const sheet = sheetText(surfaceDir(root)) !== sheetText(versionDir(root, v.workflow, v.id)) ? [COMPONENTS_FILE] : [];
  return [...keys.filter((k) => pageText(surfaceScreens(root), k) !== pageText(had, k)), ...sheet];
}

/** The design decisions of a workflow after `since`, as one line. */
function decisionsSince(root, slug, since) {
  const after = since ? Date.parse(since) : -Infinity;
  const lines = liveDecisions(readDecisions(workflowDir(root, slug)))
    .filter((d) => (d.stage === 'design' || d.kind === 'design') && Date.parse(d.at) > after)
    .map((d) => `${d.key ?? d.question}: ${d.answer}`);
  return lines.join('; ').slice(0, MAX_REASON);
}

/** The screen as a version keeps it: enough to find its place and to add it again. */
const entryOf = (m, key) => {
  const s = m.screens[key] ?? {};
  return { key, title: s.title ?? key, area: s.area ?? null, flow: s.flow ?? null, order: s.order ?? null };
};

const RETRY_CODES = new Set(['EPERM', 'EACCES', 'EBUSY', 'ENOTEMPTY']);
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Move a folder into its place. On Windows a reader that holds a file of the old folder stops the move for a moment. */
function moveFolder(from, to) {
  const until = Date.now() + 1000;
  for (;;) {
    try {
      rmSync(to, { recursive: true, force: true });
      renameSync(from, to);
      return;
    } catch (e) {
      if (!RETRY_CODES.has(e.code) || Date.now() >= until) throw e;
      pause(20);
    }
  }
}

/**
 * Write the folder of a round or a version. It is made beside its place and then moved there, so
 * a copy that stops leaves no folder that a reader takes for a version.
 */
function writeFolder(root, dir, meta, surface, carried = [], carriedFrom = null) {
  const tmp = `${dir}.${process.pid}.tmp`;
  rmSync(tmp, { recursive: true, force: true });
  try {
    const to = join(tmp, SCREENS_DIR);
    mkdirSync(to, { recursive: true });
    for (const key of surface) copyPage(surfaceScreens(root), to, key);
    for (const key of carried) copyPage(carriedFrom, to, key);
    for (const sheet of [TOKENS_FILE, COMPONENTS_FILE]) {
      const from = join(surfaceDir(root), sheet);
      if (existsSync(from)) cpSync(from, join(tmp, sheet));
    }
    writeJson(join(tmp, VERSION_FILE), meta);
    moveFolder(tmp, dir);
  } catch (e) {
    rmSync(tmp, { recursive: true, force: true });
    throw e;
  }
}

/**
 * Save the pages of a workflow as a round. The round leads to the next version. Nothing is saved
 * when no page changed since the last round or version. The reason defaults to the design
 * decisions since then.
 *
 * `backup` marks the round that a restore saves of the pages it replaces: it keeps them, and it
 * is no decision about them. `restored` names the version that a restore put back. `commit: false`
 * leaves the records commit to the caller.
 */
export function saveRound(root, slug, { reason = null, now = new Date(), backup = false, restored = null, commit = true } = {}) {
  const bad = workflowProblem(root, slug);
  if (bad) return { ok: false, reason: bad.reason, fix: bad.fix };
  if (closed(root, slug)) return { ok: false, reason: `${slug} is closed: a closed workflow keeps no rounds`, fix: agentFix('Save no round for a closed workflow. To change its design, start a new workflow.') };
  const keys = listScreens(root, { workflow: slug }).filter((s) => s.exists).map((s) => s.key);
  if (!keys.length) return { ok: false, reason: `no screen of ${slug} is on the surface`, fix: agentFix('Add a screen of the workflow first, then save the round.', `wf.mjs design screen add <root> <key> --workflow ${slug}`) };
  const out = withDesignLock(versionsDir(root, slug), () => {
    const { approved, rounds } = listVersions(root, slug);
    const number = (approved.at(-1)?.number ?? 0) + 1;
    const toward = rounds.filter((r) => r.number === number);
    const last = toward.at(-1) ?? approved.at(-1) ?? null;
    const changed = changedSince(root, keys, last);
    if (!changed.length) return { ok: true, saved: false, id: last.id, reason: 'no page changed' };
    const round = (toward.at(-1)?.round ?? 0) + 1;
    const id = `v${number}-r${round}`;
    const m = readManifest(root);
    writeFolder(root, versionDir(root, slug, id), {
      kind: 'round', number, round, reason: String(reason ?? '').trim().slice(0, MAX_REASON) || decisionsSince(root, slug, last?.at) || 'A change with no recorded decision',
      at: nowIso(now), screens: keys.map((k) => entryOf(m, k)), changed,
      ...(backup ? { backup: true } : {}), ...(restored ? { restored } : {}),
    }, keys);
    return { ok: true, saved: true, id, changed };
  });
  if (out.saved && commit) commitDesignRecords(root, `design: ${versionName(out.id)} of ${slug}`);
  return out;
}

/**
 * Save an approved version: the approved pages, and the other screens of the version before it.
 * Only `approveDesign` calls this, after it found the answer event of the person. One answer makes
 * one version: a second call with the same `answeredAt` returns the version of the first.
 */
export function saveApproved(root, slug, keys, { commit, answeredAt = null, reason = null, slice = null, now = new Date() }) {
  return withDesignLock(versionsDir(root, slug), () => {
    const { approved } = listVersions(root, slug);
    const same = answeredAt ? approved.find((v) => v.answeredAt === answeredAt) : null;
    if (same) return same.id;
    const prior = approved.at(-1) ?? null;
    const number = (prior?.number ?? 0) + 1;
    const id = `v${number}`;
    const m = readManifest(root);
    const carried = (prior?.screens ?? []).map((s) => s.key).filter((k) => !keys.includes(k) && m.screens[k]);
    const fromPrior = prior ? screensOf(root, prior) : null;
    const lost = carried.filter((k) => !hasPage(fromPrior, k));
    if (lost.length) {
      throw refuse(`${prior.id} of ${slug} in the records lacks the page of ${lost.join(', ')}, so the new version cannot carry it`,
        agentFix('Name every screen of the workflow in the approval, so each page comes from the surface.', `wf.mjs design approve <root> ${slug} ${[...keys, ...lost].join(' ')}`));
    }
    const said = String(reason ?? '').trim().slice(0, MAX_REASON);
    writeFolder(root, versionDir(root, slug, id), {
      kind: 'approved', number, reason: said || (prior ? decisionsSince(root, slug, prior.at) || 'The design changed' : 'The first approved design'),
      at: nowIso(now), commit, ...(answeredAt ? { answeredAt } : {}), ...(slice ? { slice } : {}),
      screens: [...keys, ...carried].map((k) => entryOf(m, k)), changed: changedSince(root, keys, prior),
    }, keys, carried, fromPrior);
    return id;
  });
}

/**
 * The pages of the newest approved version of a workflow, or null when it has none. `missing`
 * lists the screens whose page the records do not hold.
 */
export function approvedPages(root, slug) {
  const v = listVersions(root, slug).approved.at(-1);
  if (!v) return null;
  const dir = screensOf(root, v);
  return { version: v.id, commit: v.commit, pages: v.screens.map((s) => ({ key: s.key, file: join(dir, `${s.key}.html`) })), missing: v.screens.map((s) => s.key).filter((k) => !hasPage(dir, k)) };
}

/**
 * Put the pages of a version back on the surface, as a new round. A restore is never an approval:
 * the restored pages need a new one. The pages that it replaces stay in a round of their own.
 * The token sheet stays, because DESIGN.md owns it and other workflows use it.
 *
 * A restore changes every page or none: a version that lacks a page restores nothing, and a copy
 * that fails puts the surface back as it was. `commit: false` leaves the records commit to the caller.
 */
export function restoreVersion(root, slug, id, { now = new Date(), commit = true } = {}) {
  const bad = workflowProblem(root, slug);
  if (bad) return { ok: false, reason: bad.reason, fix: bad.fix };
  const v = readVersion(root, slug, String(id ?? ''));
  if (!v) {
    const { approved, rounds } = listVersions(root, slug);
    const have = [...approved, ...rounds].map((x) => x.id);
    return { ok: false, reason: `${slug} has no version ${id}`, fix: agentFix(have.length ? `Name one of the versions of ${slug}: ${have.join(', ')}.` : `${slug} has no version yet: nothing can be restored.`, `wf.mjs design versions <root> ${slug}`) };
  }
  if (closed(root, slug)) return { ok: false, reason: `${slug} is closed: a closed workflow takes no restore`, fix: agentFix('Restore no version of a closed workflow. To change its design, start a new workflow.') };
  const from = screensOf(root, v);
  const lost = v.screens.map((s) => s.key).filter((k) => !hasPage(from, k));
  if (lost.length) {
    return { ok: false, reason: `${versionName(v.id)} of ${slug} lacks the page of ${lost.join(', ')} in the records: nothing was restored`, missing: lost,
      fix: agentFix('Bring the records of the project up to date, then restore again; or restore another version.', 'wf.mjs records pull <root>') };
  }
  const before = saveRound(root, slug, { reason: `The pages before the restore of ${versionName(id)}`, now, backup: true, commit: false });
  if (!before.ok && !/no screen of/.test(before.reason)) return before;
  // The surface as it is, so that a copy that fails can be undone.
  const to = surfaceScreens(root);
  const undo = mkdtempSync(join(tmpdir(), 'design-restore-'));
  const added = [];
  const had = new Map();
  try {
    for (const s of v.screens) {
      had.set(s.key, hasPage(to, s.key));
      if (had.get(s.key)) copyPage(to, undo, s.key);
    }
    try {
      const m = readManifest(root);
      for (const s of v.screens) {
        if (!m.screens[s.key]) { addScreen(root, s.key, { title: s.title, area: s.area, flow: s.flow, order: s.order, workflow: slug, now }); added.push(s.key); }
        copyPage(from, to, s.key);
      }
    } catch (e) {
      for (const [key, was] of had) {
        try {
          if (was) copyPage(undo, to, key);
          else { rmSync(join(to, `${key}.html`), { force: true }); rmSync(join(to, key), { recursive: true, force: true }); }
        } catch { /* the round before the restore still holds the page */ }
      }
      if (added.length) { try { updateManifest(root, (m) => { for (const k of added) delete m.screens[k]; }); } catch { /* the entry stays; the list names it as a screen with no file */ } }
      return { ok: false, reason: `the restore of ${versionName(v.id)} failed part way (${e.code ?? 'a copy failed'}): the surface is as it was`, fix: agentFix('Close any program that holds a file of .ai/design/screens/ open, then restore again.') };
    }
  } finally { rmSync(undo, { recursive: true, force: true }); }
  const after = saveRound(root, slug, { reason: `Restored from ${versionName(id)}`, now, restored: v.id, commit: false });
  if (!after.ok) return after;
  if (commit && (before.saved || after.saved)) commitDesignRecords(root, `design: restore ${versionName(v.id)} of ${slug}`);
  const tokens = (dir) => { try { return readFileSync(join(dir, TOKENS_FILE), 'utf8').replace(/\r\n/g, '\n'); } catch { return null; } };
  return { ok: true, id: after.id, restored: v.id, saved: after.saved, componentsDiffer: sheetText(versionDir(root, slug, v.id)) !== sheetText(surfaceDir(root)), tokensDiffer: tokens(versionDir(root, slug, v.id)) !== tokens(surfaceDir(root)) };
}

/**
 * Delete the rounds of a closed workflow. The approved versions stay. An open workflow keeps its
 * rounds: one of them can hold the only copy of the pages that a restore replaced.
 */
export function dropRounds(root, slug) {
  const bad = workflowProblem(root, slug);
  if (bad) throw refuse(bad.reason, bad.fix);
  if (!closed(root, slug)) throw refuse(`${slug} is open: only a closed workflow drops its rounds`, agentFix('Leave the rounds of an open workflow. The close of the workflow deletes them.'));
  const dir = join(versionsDir(root, slug), 'rounds');
  if (!existsSync(dir)) return false;
  withDesignLock(versionsDir(root, slug), () => rmSync(dir, { recursive: true, force: true }));
  commitDesignRecords(root, `design: delete the rounds of ${slug}`);
  return true;
}

/**
 * The screens whose page differs from their approved version with no round that holds the change:
 * a hand edit. `[{ screen, workflow, version }]`. A screen of several workflows counts against
 * its newest approval.
 *
 * A round holds the change of a page only when it changed that page and its copy equals the page
 * as it is now. The round that a restore saves of the replaced pages holds no change: it is a
 * backup, not a decision. With `restores: false`, the round of a restore holds none either: the
 * design gate uses this, because restored pages need a new approval.
 */
export function versionDrift(root, keys, { restores = true } = {}) {
  const m = readManifest(root);
  const cache = new Map();
  const of = (w) => { if (!cache.has(w)) cache.set(w, listVersions(root, w)); return cache.get(w); };
  const out = [];
  for (const key of keys) {
    const holds = (v) => v.screens.some((s) => s.key === key);
    const lists = (m.screens[key]?.workflows ?? []).map(of);
    const approved = lists.flatMap((l) => l.approved).filter(holds).sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const base = approved.at(-1);
    if (!base) continue;
    const now = pageText(surfaceScreens(root), key);
    if (now === null) continue;
    const decided = (r) => holds(r) && String(r.at) >= String(base.at) && !r.backup && (restores || !r.restored) && (!Array.isArray(r.changed) || r.changed.includes(key));
    const saved = [base, ...lists.flatMap((l) => l.rounds).filter(decided)];
    if (!saved.some((v) => pageText(screensOf(root, v), key) === now)) out.push({ screen: key, workflow: base.workflow, version: base.id });
  }
  return out;
}

/**
 * The ways in which the disk does not hold the approval that a contract claims: a list of lines,
 * empty when the approval stands. The design gate reads it (lib/design-lane.mjs designSettled), so
 * the fields of `02c-craft.md` alone never settle a design.
 *
 * - An approval from an answer event with a version (`design-version`): the records hold that
 *   version, it is the newest approved one, its commit and its answer time are those of the
 *   contract, the manifest holds the approval, every screen of the version (the carried ones too)
 *   has its page, and no page differs from its approved copy (a round of a restore does not count).
 * - An approval from before the versions (no `design-version`): the manifest holds an approval
 *   of the workflow at the commit of the contract.
 * - A migrated contract: the manifest holds the migrated approval of each screen at that commit.
 */
export function approvalProblems(root, slug, contract) {
  const by = String(contract?.['direction-confirmed-by'] ?? '').trim();
  const commit = String(contract?.['approval-commit'] ?? '').trim();
  const named = (Array.isArray(contract?.screens) ? contract.screens : []).map(String).filter((k) => KEY_RE.test(k));
  if (!commit || !isWorkflowSlug(slug)) return [];
  const m = readManifest(root);
  const approvalsOf = (key) => (m.screens[key]?.approvals ?? []).filter((a) => a.workflow === slug);
  if (by === 'migrated') {
    return named.filter((k) => !approvalsOf(k).some((a) => a.migrated === true && a.commit === commit)).map((k) => `${screenRel(k)} (the manifest holds no migrated approval of ${slug} at the commit of the contract)`);
  }
  if (by !== 'answer-event') return [];
  const answered = String(contract['answered-at'] ?? '').trim();
  const id = String(contract['design-version'] ?? '').trim();
  const { approved } = listVersions(root, slug);
  if (!id) {
    const held = named.some((k) => approvalsOf(k).some((a) => a.commit === commit && (!answered || !a.answeredAt || a.answeredAt === answered)));
    return held && !approved.length ? [] : [approved.length ? `02c-craft.md names no design-version, and the records hold ${approved.at(-1).id} of ${slug}` : `the manifest holds no approval of ${slug} at the commit of 02c-craft.md`];
  }
  const v = approved.find((x) => x.id === id);
  if (!v) return [`the records hold no approved version ${id} of ${slug}`];
  const out = [];
  if (approved.at(-1).id !== id) out.push(`02c-craft.md names ${id}, and the newest approved version of ${slug} is ${approved.at(-1).id}`);
  if (v.commit && v.commit !== commit) out.push(`the approval commit of 02c-craft.md is not the commit of ${id}`);
  if (v.answeredAt && v.answeredAt !== answered) out.push(`the answer time of 02c-craft.md is not the answer time of ${id}`);
  const keys = v.screens.map((s) => s.key);
  if (!keys.some((k) => approvalsOf(k).some((a) => a.version === id && (!answered || !a.answeredAt || a.answeredAt === answered)))) out.push(`the manifest holds no approval of ${slug} for ${id}`);
  out.push(...keys.filter((k) => !hasPage(surfaceScreens(root), k)).map(screenRel));
  out.push(...versionDrift(root, keys, { restores: false }).map((d) => `${screenRel(d.screen)} (it differs from the approved ${d.version} of ${d.workflow}: approve it again, or restore ${d.version})`));
  return out;
}
