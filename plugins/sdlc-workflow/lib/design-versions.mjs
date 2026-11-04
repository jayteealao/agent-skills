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
// Each folder holds version.json, tokens.css and screens/<key>.html. A later squash cannot lose
// a version, because the pages are copies, not a commit id. An approved version holds every
// approved screen of the workflow: an approval of some screens carries the others from the
// version before it.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { liveDecisions, readDecisions } from './decisions.mjs';
import { commitDesignRecords, designRecordsDir } from './design-records.mjs';
import { SCREENS_DIR, TOKENS_FILE, addScreen, listScreens, readManifest, surfaceDir, writeJson } from './design-surface.mjs';
import { INDEX_NAME, frontmatterOfDoc } from './records.mjs';
import { workflowDir } from './records-root.mjs';

const VERSION_RE = /^v(\d+)$/;
const ROUND_RE = /^v(\d+)-r(\d+)$/;
const MAX_REASON = 300;
const VERSION_FILE = 'version.json';
const nowIso = (d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

export const versionsDir = (root, workflow) => join(designRecordsDir(root), 'versions', workflow);

/** The folder of a version or a round, or null when `id` is neither. */
export function versionDir(root, workflow, id) {
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
  const dir = versionDir(root, workflow, id);
  try { return dir ? { ...JSON.parse(readFileSync(join(dir, VERSION_FILE), 'utf8')), id, workflow } : null; } catch { return null; }
}

/** The versions of a workflow, oldest first: `{ approved, rounds }`. */
export function listVersions(root, workflow) {
  const ids = (dir, re) => (existsSync(dir) ? readdirSync(dir).filter((n) => re.test(n)) : []);
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
  const main = join(screens, `${key}.html`);
  if (!existsSync(main)) return null;
  const sub = join(screens, key);
  const more = existsSync(sub) ? readdirSync(sub, { recursive: true }).map(String).sort().map((f) => join(sub, f)).filter((f) => statSync(f).isFile()) : [];
  // A checkout can change the line ends, and a change of line ends is no design change.
  return [main, ...more].map((f) => readFileSync(f, 'utf8')).join('\0').replace(/\r\n/g, '\n');
}

function copyPage(from, to, key) {
  cpSync(join(from, `${key}.html`), join(to, `${key}.html`));
  if (existsSync(join(from, key))) cpSync(join(from, key), join(to, key), { recursive: true });
}

const surfaceScreens = (root) => join(surfaceDir(root), SCREENS_DIR);
const screensOf = (root, v) => join(versionDir(root, v.workflow, v.id), SCREENS_DIR);

/** The screens of `keys` whose page differs from the version `v`. */
function changedSince(root, keys, v) {
  if (!v) return keys;
  const had = screensOf(root, v);
  return keys.filter((k) => pageText(surfaceScreens(root), k) !== pageText(had, k));
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

function writeFolder(root, dir, meta, surface, carried = [], carriedFrom = null) {
  rmSync(dir, { recursive: true, force: true });
  const to = join(dir, SCREENS_DIR);
  mkdirSync(to, { recursive: true });
  for (const key of surface) copyPage(surfaceScreens(root), to, key);
  for (const key of carried) copyPage(carriedFrom, to, key);
  const tokens = join(surfaceDir(root), TOKENS_FILE);
  if (existsSync(tokens)) cpSync(tokens, join(dir, TOKENS_FILE));
  // A folder with no version.json does not exist for a reader, so a stopped copy shows nothing.
  writeJson(join(dir, VERSION_FILE), meta);
}

/**
 * Save the pages of a workflow as a round. The round leads to the next version. Nothing is saved
 * when no page changed since the last round or version. The reason defaults to the design
 * decisions since then.
 */
export function saveRound(root, slug, { reason = null, now = new Date() } = {}) {
  if (!frontmatterOfDoc(workflowDir(root, slug), INDEX_NAME)) return { ok: false, reason: `no workflow ${slug}` };
  if (closed(root, slug)) return { ok: false, reason: `${slug} is closed: a closed workflow keeps no rounds` };
  const keys = listScreens(root, { workflow: slug }).filter((s) => s.exists).map((s) => s.key);
  if (!keys.length) return { ok: false, reason: `no screen of ${slug} is on the surface` };
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
  }, keys);
  commitDesignRecords(root, `design: ${versionName(id)} of ${slug}`);
  return { ok: true, saved: true, id, changed };
}

/**
 * Save an approved version: the approved pages, and the other screens of the version before it.
 * Only `approveDesign` calls this, after it found the answer event of the person.
 */
export function saveApproved(root, slug, keys, { commit, reason = null, slice = null, now = new Date() }) {
  const prior = listVersions(root, slug).approved.at(-1) ?? null;
  const number = (prior?.number ?? 0) + 1;
  const id = `v${number}`;
  const m = readManifest(root);
  const carried = (prior?.screens ?? []).map((s) => s.key).filter((k) => !keys.includes(k) && m.screens[k]);
  const fromPrior = prior ? screensOf(root, prior) : null;
  const said = String(reason ?? '').trim().slice(0, MAX_REASON);
  writeFolder(root, versionDir(root, slug, id), {
    kind: 'approved', number, reason: said || (prior ? decisionsSince(root, slug, prior.at) || 'The design changed' : 'The first approved design'),
    at: nowIso(now), commit, ...(slice ? { slice } : {}),
    screens: [...keys, ...carried].map((k) => entryOf(m, k)), changed: changedSince(root, keys, prior),
  }, keys, carried, fromPrior);
  return id;
}

/** The pages of the newest approved version of a workflow, or null when it has none. */
export function approvedPages(root, slug) {
  const v = listVersions(root, slug).approved.at(-1);
  if (!v) return null;
  const dir = screensOf(root, v);
  return { version: v.id, commit: v.commit, pages: v.screens.map((s) => ({ key: s.key, file: join(dir, `${s.key}.html`) })) };
}

/**
 * Put the pages of a version back on the surface, as a new round. A restore is never an approval:
 * the restored pages need a new one. The pages that it replaces stay in a round of their own.
 * The token sheet stays, because DESIGN.md owns it and other workflows use it.
 */
export function restoreVersion(root, slug, id, { now = new Date() } = {}) {
  const v = readVersion(root, slug, String(id ?? ''));
  if (!v) return { ok: false, reason: `${slug} has no version ${id}` };
  const before = saveRound(root, slug, { reason: `The pages before the restore of ${versionName(id)}`, now });
  if (!before.ok) return before;
  const m = readManifest(root);
  for (const s of v.screens) {
    if (!m.screens[s.key]) addScreen(root, s.key, { title: s.title, area: s.area, flow: s.flow, order: s.order, workflow: slug, now });
    copyPage(screensOf(root, v), surfaceScreens(root), s.key);
  }
  const after = saveRound(root, slug, { reason: `Restored from ${versionName(id)}`, now });
  if (!after.ok) return after;
  const tokens = (dir) => { try { return readFileSync(join(dir, TOKENS_FILE), 'utf8').replace(/\r\n/g, '\n'); } catch { return null; } };
  return { ok: true, id: after.id, restored: v.id, saved: after.saved, tokensDiffer: tokens(versionDir(root, slug, id)) !== tokens(surfaceDir(root)) };
}

/** Delete the rounds of a workflow when it closes. The approved versions stay. */
export function dropRounds(root, slug) {
  const dir = join(versionsDir(root, slug), 'rounds');
  if (!existsSync(dir)) return false;
  rmSync(dir, { recursive: true, force: true });
  commitDesignRecords(root, `design: delete the rounds of ${slug}`);
  return true;
}

/**
 * The screens whose page differs from their approved version with no round that holds the change:
 * a hand edit. `[{ screen, workflow, version }]`. A screen of several workflows counts against
 * its newest approval.
 */
export function versionDrift(root, keys) {
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
    const saved = [base, ...lists.flatMap((l) => l.rounds).filter((r) => holds(r) && String(r.at) >= String(base.at))];
    if (!saved.some((v) => pageText(screensOf(root, v), key) === now)) out.push({ screen: key, workflow: base.workflow, version: base.id });
  }
  return out;
}
