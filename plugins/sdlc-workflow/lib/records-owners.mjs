// The owner of a workflow: the one computer that writes it. The owner is a file of the workflow,
// `<wf-dir>/owner`, with the text `<machine> <epoch>`. It travels in the same commit as the
// work, so the push without force of the compose sync (lib/records-compose.mjs) is the
// compare-and-swap of both: a computer that is not the owner cannot send the workflow, and its
// copy is parked on a conflict branch.
//
//   claim     a free or new workflow: fetch and apply, write `<me> <epoch + 1>`, flush. The work
//             starts when the push lands. Offline, only a workflow that never reached the
//             remote may start.
//   take      a claim over another computer, after the person said yes.
//   release   flush, then remove the owner (or hand it to `to`), then flush again. When a push
//             fails, this computer stays the owner.
//   parked    the copies that a sync parked: list, show, take one file, drop.
//
// Without `records.sync: compose` there is no fence: the owner file is written and committed,
// and the block of a second computer (lib/records-sync.mjs machineBlocked) keeps one writer.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { writeFileAtomic } from './atomic-write.mjs';
import { agentFix, personFix, refuse } from './fix.mjs';
import { INDEX_NAME, frontmatterOfDoc } from './records.mjs';
import { EPOCH_FILE, PARK_PREFIX, RECORDS_EPOCH, SYNCED_REF, composeOn, ownerText, parseOwner } from './records-compose.mjs';
import { linkedProject, recordsHome, workflowDir } from './records-root.mjs';
import { commitWorkflow, composeNow, flushRecords, machineName, mainBranch } from './records-sync.mjs';
import { unitOf } from './records-units.mjs';
import { wakeCommitter } from './records-committer.mjs';

export const OWNER_FILE = 'owner';

const git = (home, args, o = {}) => {
  const r = spawnSync('git', ['-C', home, '-c', 'core.quotepath=false', ...args], { encoding: o.raw ? 'buffer' : 'utf8', windowsHide: true, timeout: o.timeout ?? 60_000, maxBuffer: 1 << 28, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  return { ok: r.status === 0, out: o.raw ? r.stdout : (r.stdout ?? '').trim(), err: String(r.stderr ?? '').trim() };
};

const ownerFileOf = (root, slug) => join(workflowDir(root, slug), OWNER_FILE);
const readText = (file) => { try { return readFileSync(file, 'utf8'); } catch { return null; } };

/** The owner of a workflow in this computer's copy: `{ machine, epoch }`, or null. */
export const ownerOf = (root, slug) => parseOwner(readText(ownerFileOf(root, slug)));

/** The owner of a workflow at a ref of the clone (the last fetch of the remote by default). */
export function ownerAt(home, project, slug, ref = `refs/remotes/origin/${mainBranch(home)}`) {
  const r = git(home, ['show', `${ref}:${project}/${slug}/${OWNER_FILE}`]);
  return r.ok ? parseOwner(r.out) : null;
}

/** When the remote last changed the workflow, and its stage in this copy: for the take-over question. */
export function ownerFacts(root, slug) {
  const project = linkedProject(root);
  const home = recordsHome();
  const last = project ? git(home, ['log', '-1', '--format=%cI', `refs/remotes/origin/${mainBranch(home)}`, '--', `${project}/${slug}`]).out || null : null;
  const stage = frontmatterOfDoc(workflowDir(root, slug), INDEX_NAME)?.['current-stage'] ?? null;
  return { lastPush: last, stage };
}

/** True when the workflow never reached the remote: no commit that this computer synced holds it. */
function neverSent(home, project, slug) {
  return !git(home, ['cat-file', '-e', `${SYNCED_REF}:${project}/${slug}`]).ok && !git(home, ['cat-file', '-e', `refs/remotes/origin/${mainBranch(home)}:${project}/${slug}`]).ok;
}

/**
 * The highest epoch that the owner file of a workflow ever had at a ref: the file of the ref, or,
 * after a release removed it, the file before the last commit that touched it. A claim takes one
 * more, so an epoch never comes back.
 */
function lastEpoch(home, project, slug, ref) {
  const path = `${project}/${slug}/${OWNER_FILE}`;
  const now = git(home, ['show', `${ref}:${path}`]);
  if (now.ok) return parseOwner(now.out)?.epoch ?? 0;
  const at = git(home, ['log', '-1', '--format=%H', ref, '--', path]).out;
  if (!at) return 0;
  const before = git(home, ['show', `${at}^:${path}`]);
  return before.ok ? parseOwner(before.out)?.epoch ?? 0 : 0;
}

/** Write (or with null remove) the owner file; returns the old text, for an undo. */
function putOwner(root, slug, owner) {
  const file = ownerFileOf(root, slug);
  const old = readText(file);
  if (owner) { mkdirSync(dirname(file), { recursive: true }); writeFileAtomic(file, ownerText(owner.machine, owner.epoch)); } else rmSync(file, { force: true });
  return old;
}
function undoOwner(root, slug, old) {
  const file = ownerFileOf(root, slug);
  if (old === null) rmSync(file, { force: true }); else writeFileAtomic(file, old);
}

/** The repo carries the format of owner files: write `.records-epoch` once. */
function markFormat(home) {
  const file = join(home, EPOCH_FILE);
  const n = Number.parseInt(readText(file) ?? '', 10);
  if (!Number.isFinite(n) || n < RECORDS_EPOCH) writeFileAtomic(file, `${RECORDS_EPOCH}\n`);
}

/**
 * Claim a workflow for this computer. `take`: the workflow is owned by another computer, and the
 * person said yes. Returns `{ ok, owner, already?, offline?, warning? }`, or `{ ok: false, owned,
 * facts }` when another computer owns it and `take` is not set, or `{ ok: false, reason, fix }`.
 */
export function claimWorkflow(root, slug, { take = false } = {}) {
  const project = linkedProject(root);
  if (!project) return { ok: true, linked: false };
  const me = machineName();
  const home = recordsHome();
  if (!existsSync(workflowDir(root, slug))) return { ok: false, reason: `no workflow ${slug}`, fix: agentFix('Run the command again with the slug of a workflow that status lists.') };
  const local = ownerOf(root, slug);
  if (local?.machine === me) return { ok: true, owner: local, already: true };

  if (!composeOn()) {
    if (local && !take) return { ok: false, owned: local, facts: ownerFacts(root, slug) };
    const owner = { machine: me, epoch: Math.max(local?.epoch ?? 0, lastEpoch(home, project, slug, 'HEAD')) + 1 };
    putOwner(root, slug, owner);
    commitWorkflow(root, slug, `${project}/${slug}: owned by ${me}`, { urgent: true });
    return { ok: true, owner };
  }

  // Fetch and apply first: a claim on an old copy would be parked, and a take-over must see the
  // last work of the old owner.
  const s = composeNow(home, { project });
  if (!s.ok) {
    if (/git fetch/i.test(s.error ?? '') && !local && neverSent(home, project, slug)) {
      const owner = { machine: me, epoch: 1 };
      putOwner(root, slug, owner);
      markFormat(home);
      wakeCommitter({ urgent: true });
      return { ok: true, owner, offline: true, warning: `the records repo cannot be reached: ${slug} is new, so it starts here, and no other computer knows of it until the next sync` };
    }
    return { ok: false, reason: `the sync before the claim failed: ${s.error}`, fix: personFix('Check the network and the records clone (wf.mjs records status --problems), then claim again.') };
  }
  const remote = ownerAt(home, project, slug);
  if (remote && remote.machine !== me && !take) return { ok: false, owned: remote, facts: ownerFacts(root, slug) };
  const owner = { machine: me, epoch: Math.max(remote?.epoch ?? 0, lastEpoch(home, project, slug, `refs/remotes/origin/${mainBranch(home)}`)) + 1 };
  const old = putOwner(root, slug, owner);
  markFormat(home);
  const f = flushRecords({ project, slug });
  if (!f.landed) {
    undoOwner(root, slug, old);
    return { ok: false, reason: `the claim did not reach the remote: ${f.reason}`, fix: personFix('The workflow is not claimed. Run the claim again when the records repo can be reached.') };
  }
  return { ok: true, owner, ...(remote && remote.machine !== me ? { took: remote } : {}) };
}

/**
 * Give a workflow up: send it, then remove the owner, or hand it to the machine `to`, then send
 * that. When a push fails, this computer stays the owner. Returns `{ ok, owner, reason? }`.
 */
export function releaseWorkflow(root, slug, { to = null } = {}) {
  const project = linkedProject(root);
  if (!project) return { ok: true, linked: false };
  const me = machineName();
  const local = ownerOf(root, slug);
  if (local && local.machine !== me) return { ok: false, reason: `${slug} is owned by ${local.machine}, not by this computer`, fix: agentFix('Only the owner releases a workflow. Run wf.mjs records status for the owner.') };
  if (to && !/^[a-z0-9][a-z0-9._-]*$/.test(to)) return { ok: false, reason: `${to} is no machine name`, fix: agentFix('Give the name of a computer of .machines/ of the clone.') };
  const next = to ? { machine: to, epoch: (local?.epoch ?? 0) + 1 } : null;
  if (!composeOn()) {
    putOwner(root, slug, next);
    commitWorkflow(root, slug, `${project}/${slug}: ${to ? `handed to ${to}` : 'released'}`, { urgent: true });
    return { ok: true, owner: next };
  }
  const first = flushRecords({ project, slug });
  if (!first.landed) return { ok: false, reason: `the work of ${slug} did not reach the remote, so this computer stays its owner: ${first.reason}`, fix: personFix('Run the release again when the records repo can be reached.') };
  const old = putOwner(root, slug, next);
  const second = flushRecords({ project, slug });
  if (!second.landed) {
    undoOwner(root, slug, old);
    return { ok: false, reason: `the release did not reach the remote, so this computer stays the owner: ${second.reason}`, fix: personFix('Run the release again when the records repo can be reached.') };
  }
  return { ok: true, owner: next };
}

/** The owner of a workflow when it is another computer, or null: the stop signal of a stage. */
export function otherOwner(root, slug) {
  if (!linkedProject(root)) return null;
  const o = ownerOf(root, slug);
  return o && o.machine !== machineName() ? o : null;
}
export const ownerLostLine = (slug, owner) => `owner-lost: ${slug} is owned by ${owner.machine} (epoch ${owner.epoch})`;

// ---------------------------------------------------------------- parked copies

const parkedRef = (name) => `refs/wf/parked/${name}`;
const branchOk = (b) => /^conflict\/[a-z0-9][a-z0-9._-]*-[0-9a-f]{12}$/.test(String(b ?? ''));

/** The parked copies on the remote: `[{ branch, machine, mine }]`. */
export function listParked(home = recordsHome()) {
  const r = git(home, ['ls-remote', 'origin', `${PARK_PREFIX}*`]);
  if (!r.ok) throw refuse(`the records repo cannot be reached: ${r.err.split('\n')[0]}`, personFix('Check the network, then run the command again.'));
  const me = machineName();
  return r.out.split('\n').filter(Boolean).map((l) => l.split('\t')[1].replace('refs/heads/', '')).map((branch) => {
    const machine = /^conflict\/(.+)-[0-9a-f]{12}$/.exec(branch)?.[1] ?? null;
    return { branch, machine, mine: machine === me };
  });
}

function fetchParked(home, branch) {
  if (!branchOk(branch)) throw refuse(`${branch} is no parked copy: records parked lists them`, agentFix('Run wf.mjs records parked, then run the command again with a branch that it lists.'));
  const name = branch.slice('conflict/'.length);
  const f = git(home, ['fetch', '-q', 'origin', `+refs/heads/${branch}:${parkedRef(name)}`], { timeout: 120_000 });
  if (!f.ok) throw refuse(`the fetch of ${branch} failed: ${f.err.split('\n')[0]}`, personFix('Check the network and that the branch still exists (records parked), then run the command again.'));
  return parkedRef(name);
}

/** What a parked copy holds that the remote main branch does not: `[{ path, status, unit }]`. */
export function showParked(branch, home = recordsHome()) {
  const ref = fetchParked(home, branch);
  const main = `refs/remotes/origin/${mainBranch(home)}`;
  const base = git(home, ['merge-base', main, ref]).out || main;
  const d = git(home, ['diff', '--name-status', '--no-renames', '-z', base, ref]);
  const parts = d.out.split('\0').filter(Boolean);
  const out = [];
  for (let i = 0; i + 1 < parts.length; i += 2) out.push({ status: parts[i][0], path: parts[i + 1], unit: unitOf(parts[i + 1])?.unit ?? null });
  return out;
}

/**
 * Copy one file of a parked copy into the live folder of the clone. Only the owner of its unit
 * takes it (or anyone, for a unit with no owner). The committer sends it.
 */
export function takeParked(root, branch, path, home = recordsHome()) {
  const u = unitOf(path);
  if (!u) throw refuse(`${path} is no path of the records`, agentFix('Give a path that records parked show lists.'));
  if (u.kind === 'workflow') {
    const o = ownerOf(root, u.slug);
    if (o && o.machine !== machineName()) throw refuse(`${u.unit} is owned by ${o.machine}: only its owner takes a parked file into it`, agentFix('Ask the person to take the file on the computer that owns the workflow, or to take the workflow over first.'));
  }
  const ref = fetchParked(home, branch);
  const blob = git(home, ['show', `${ref}:${path}`], { raw: true });
  if (!blob.ok) throw refuse(`${branch} has no ${path}`, agentFix('Give a path that records parked show lists.'));
  const file = join(home, ...path.split('/'));
  mkdirSync(dirname(file), { recursive: true });
  writeFileAtomic(file, blob.out);
  wakeCommitter({ urgent: true });
  return { ok: true, path };
}

/** Delete a parked copy from the remote, after the person said yes. */
export function dropParked(branch, home = recordsHome()) {
  if (!branchOk(branch)) throw refuse(`${branch} is no parked copy: records parked lists them`, agentFix('Run wf.mjs records parked, then run the command again with a branch that it lists.'));
  const r = git(home, ['push', '-q', 'origin', '--delete', branch], { timeout: 120_000 });
  if (!r.ok) throw refuse(`the delete of ${branch} failed: ${r.err.split('\n')[0]}`, personFix('Check the network, then run the command again.'));
  git(home, ['update-ref', '-d', parkedRef(branch.slice('conflict/'.length))]);
  return { ok: true, branch };
}
