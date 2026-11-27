// The sync of the records repo by composing, with no merge and no rebase. Each unit of the repo
// (lib/records-units.mjs) has one owner, so a sync lays the changes that this computer may send
// over the remote tree, and pushes without force. Git refuses the push when another computer
// pushed first; the sync then fetches and composes again.
//
//   1. Snapshot the live folder into a private index (GIT_INDEX_FILE), so the index of the clone
//      and its index.lock play no part. The guards hold back what no commit may hold: a file of
//      this computer only, a generated INDEX.md, a file above the size limit, a path that no unit
//      knows, and a unit whose write lock is held. The tree goes to refs/wf/local.
//   2. The local changes are the paths that differ between refs/wf/synced (the remote commit
//      this computer last applied) and the snapshot.
//   3. Fetch. Check each changed unit against its owner file (`<unit>/owner`: `<machine> <epoch>`).
//   4. Park what is not allowed on conflict/<machine>-<tree>. Other units go on.
//   5. Compose the allowed paths over the remote tree and push. At most 8 tries.
//   6. Apply what the remote changed and this computer did not, each file through a rename,
//      after a re-read: a file that changed since the snapshot is kept.
//   7. Move refs/wf/synced and the branch to the new head, last.
//
// It is off by default: `records.sync: compose` in ~/.sdlc/config.json turns it on.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { writeFileAtomic } from './atomic-write.mjs';
import { isStaleLock } from './file-lock.mjs';
import { readMachineConfig } from './home.mjs';
import { unitOf } from './records-units.mjs';
import { nameProblems, sparsePaths } from './records-join.mjs';

export const SYNCED_REF = 'refs/wf/synced';
export const LOCAL_REF = 'refs/wf/local';
export const PARK_PREFIX = 'refs/heads/conflict/';
export const MAX_TRIES = 8;
// The private index of the last snapshot, with the stat data of every file (in .git).
export const SNAPSHOT_CACHE = 'wf-snapshot-index';
// The snapshot of a clone with no cache reads every file once: on a clone of some GB, minutes.
const ADD_TIMEOUT_MS = 15 * 60_000;

/**
 * Why a git call failed, in one line: a timeout says so, and the warnings that git writes before
 * its error (a line-end warning of `add`) are not the error.
 */
export function gitFailure(r, timeoutMs) {
  if (r.status === null) return `stopped after ${Math.round(timeoutMs / 1000)} s with no answer`;
  const lines = String(r.err ?? '').trim().split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.find((l) => !/^(warning|hint):/i.test(l)) ?? lines[0] ?? `exit ${r.status}`;
}
// The format of the records that this plugin writes. A repo with a higher `.records-epoch` was
// changed by a newer plugin (a layout change or a history rewrite): this one does not write it.
export const RECORDS_EPOCH = 2;
export const EPOCH_FILE = '.records-epoch';

/** Why the clone at `home` may not be written by this plugin, or null. */
export function epochRefusal(home) {
  let text = null;
  try { text = readFileSync(join(home, EPOCH_FILE), 'utf8'); } catch { return null; }
  const n = Number.parseInt(text, 10);
  return Number.isFinite(n) && n > RECORDS_EPOCH ? `the records clone is in format ${n}, and this plugin writes format ${RECORDS_EPOCH}: update the plugin on this computer before it writes the records` : null;
}
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const NO_SHA = '0'.repeat(40);

/** True when this computer syncs its records by composing. */
export const composeOn = (config = readMachineConfig()) => config?.records?.sync === 'compose';

/** The owner of a unit, from the text of its owner file: `{ machine, epoch }`, or null. */
export function parseOwner(text) {
  const m = /^([a-z0-9][a-z0-9._-]*)\s+(\d+)\s*$/.exec(String(text ?? '').trim());
  return m ? { machine: m[1], epoch: Number(m[2]) } : null;
}
export const ownerText = (machine, epoch) => `${machine} ${epoch}\n`;
/** The owner file of a unit that has owners (a workflow, a screen), or null. */
export const ownerPathOf = (u) => (u && (u.kind === 'workflow' || u.kind === 'design-item') ? `${u.unit}/owner` : null);

/**
 * May this computer send the change of `unit`? `B`, `U`, `L` are the trees at synced, at the
 * remote and of the snapshot (path → `mode sha`); `text(entry)` reads a blob.
 *
 * - A unit with owners: when the remote and the local owner are this computer; when the remote
 *   owner did not change since synced and this computer owned it then (a hand-over too); or when
 *   it is a claim: the remote owner did not change, the local owner is this computer at epoch
 *   n + 1, and no path of the unit changed on the remote since synced. A unit that has no owner
 *   file on any side sends each path that the remote did not change since synced.
 * - A machine: only that machine sends it.
 * - The other units (the repo files, a project file): each path that the remote did not change.
 */
export function mayChange(u, paths, { B, U, L, H = null, text, me }) {
  if (u.kind === 'machine') return u.machine === me;
  const ownerFile = ownerPathOf(u);
  // A path that the remote changed after the base is still this computer's when the remote holds
  // what the branch of this clone committed (`H`): a writer of this clone that commits each change
  // itself (a session on a wf from before the compose sync) sent it, and the files on the disk
  // came after it.
  const cas = () => paths.every((p) => B.get(p) === U.get(p) || (H !== null && H.has(p) && H.get(p) === U.get(p)));
  if (!ownerFile) return cas();
  const [ob, ou, ol] = [B, U, L].map((t) => parseOwner(text(t.get(ownerFile))));
  if (!ob && !ou && !ol) return cas();
  const same = (a, b) => (a?.machine ?? null) === (b?.machine ?? null) && (a?.epoch ?? null) === (b?.epoch ?? null);
  if (ou && ol && same(ou, ol) && ol.machine === me) return true;
  if (!same(ou, ob)) return false;
  if (ob?.machine === me) return true;
  // A take-over is at the epoch of the owner plus one. A free unit (no owner file at the base,
  // after a release) takes any higher epoch: the claim reads it from the history, so that an
  // epoch never comes back.
  if (ol?.machine !== me || (ob ? ol.epoch !== ob.epoch + 1 : ol.epoch < 1)) return false;
  const prefix = `${u.unit}/`;
  for (const p of new Set([...B.keys(), ...U.keys()])) if (p.startsWith(prefix) && B.get(p) !== U.get(p)) return false;
  return true;
}

/**
 * True while a live process holds a write lock of the unit: `records.lock` (one write) or
 * `run.lock` (a code run, from its snapshot to the end of its restore).
 */
function unitBusy(home, unit) {
  return ['records.lock', 'run.lock'].some((name) => {
    const file = join(home, unit, name);
    if (!existsSync(file)) return false;
    try { return !isStaleLock(readFileSync(file, 'utf8'), statSync(file).mtimeMs); } catch { return false; }
  });
}

/**
 * One sync of the clone at `home`. `me` is this machine; `held(path)` says why a path stays out
 * of every commit (or null); `skip` are globs that the snapshot does not read. Returns `{ pushed, offline, tries, sent, fenced, parked, keptLocal,
 * held, applied, head }`; throws when git fails in a way that a try again cannot fix.
 */
export function composeSync(home, { me, branch = 'main', remote = 'origin', offline = false, held = () => null, skip = [], kill = process.env.SDLC_COMPOSE_KILL || null } = {}) {
  const dir = resolve(home);
  const idx = join(dir, '.git', `wf-index-${process.pid}-${randomBytes(3).toString('hex')}`);
  const G = (args, o = {}) => {
    const r = spawnSync('git', ['-C', dir, '-c', 'core.longpaths=true', '-c', 'core.autocrlf=input', '-c', 'core.safecrlf=false', '-c', 'core.quotepath=false', ...args], {
      encoding: o.raw ? 'buffer' : 'utf8', maxBuffer: 1 << 29, input: o.input, windowsHide: true, timeout: o.timeout ?? 120_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...(o.idx ? { GIT_INDEX_FILE: idx } : {}) },
    });
    return { status: r.status, out: o.raw ? r.stdout : String(r.stdout ?? '').replace(/\n$/, ''), err: String(r.stderr ?? '') };
  };
  const M = (args, o) => { const r = G(args, o); if (r.status !== 0) throw new Error(`git ${args.slice(0, 2).join(' ')}: ${gitFailure(r, o?.timeout ?? 120_000)}`); return r.out; };
  const ref = (name) => G(['rev-parse', '-q', '--verify', `${name}^{commit}`]).out || null;
  const tree = (t) => (t ? new Map(M(['ls-tree', '-r', '-z', t]).split('\0').filter(Boolean).map((l) => { const tab = l.indexOf('\t'); const [mode, , sha] = l.slice(0, tab).split(' '); return [l.slice(tab + 1), `${mode} ${sha}`]; })) : new Map());
  const text = (e) => (e ? M(['cat-file', 'blob', e.split(' ')[1]]) : '');
  const die = (step) => { if (kill === step) process.exit(9); };
  const tracking = `refs/remotes/${remote}/${branch}`;
  const out = { pushed: false, offline, tries: 0, sent: 0, fenced: [], parked: null, keptLocal: [], held: [], applied: 0, appliedPaths: [], head: null };
  try {
    // 1. The snapshot, with the guards.
    let base = ref(SYNCED_REF);
    if (!base) { base = ref(tracking) ?? ref('HEAD'); if (base) M(['update-ref', SYNCED_REF, base]); }
    // The private index starts from the cache of the last snapshot, which holds the stat data of
    // each file: `read-tree -m` keeps it for the entries that match the base, so `add` hashes only
    // the files that changed. A fresh index would hash every file of the clone at each sync.
    const cache = join(dir, '.git', SNAPSHOT_CACHE);
    if (base && existsSync(cache)) copyFileSync(cache, idx);
    if (!base || !existsSync(idx) || G(['read-tree', '-m', base], { idx: true }).status !== 0) M(['read-tree', ...(base ? [base] : ['--empty'])], { idx: true });
    // A sparse clone (a cloud session) has only some paths on the disk: the snapshot takes only
    // those, so the others are not read as deleted.
    const sparse = sparsePaths(dir);
    // `skip`: globs of files that never enter a commit (the images, with an image store). The
    // snapshot does not read them; a tracked one stays at its base entry, as a held path does.
    M(['add', '-A', '--', ...(sparse ?? ['.']), ...skip.map((g) => `:(exclude,glob,icase)${g}`)], { idx: true, timeout: ADD_TIMEOUT_MS });
    const B = tree(base);
    const staged = M(['diff', '--cached', '--name-only', '-z', '--no-renames', base ?? EMPTY_TREE], { idx: true }).split('\0').filter(Boolean);
    const back = [];
    const names = nameProblems([...new Set([...B.keys(), ...staged])]);
    for (const p of staged) {
      const u = unitOf(p);
      const why = !u ? 'no unit knows this path' : held(p) ?? names.get(p) ?? (u.unit && unitBusy(dir, u.unit) ? 'its unit is being written' : null);
      if (!why) continue;
      out.held.push({ path: p, why });
      back.push(B.has(p) ? `${B.get(p)}\t${p}\0` : `0 ${NO_SHA}\t${p}\0`);
    }
    if (back.length) M(['update-index', '-z', '--index-info'], { idx: true, input: back.join('') });
    const snap = M(['write-tree'], { idx: true });
    // The held paths are back at their base entries, so the cache matches the snapshot: the next
    // sync reads only what changed after it. Best effort: a missing cache costs time, not data.
    try { copyFileSync(idx, `${cache}.tmp`); renameSync(`${cache}.tmp`, cache); } catch {}
    // A writer of this clone that commits by itself moved the branch past the synced ref: its
    // commits are this computer's, and the person is told to restart the session that runs it.
    const head = ref(`refs/heads/${branch}`);
    const own = head && base && head !== base && G(['merge-base', '--is-ancestor', base, head]).status === 0 ? head : null;
    if (own) {
      const subjects = M(['log', '--format=%cI%x09%s', `${base}..${own}`]).split('\n').filter(Boolean).map((l) => { const [at, ...s] = l.split('\t'); return { at, subject: s.join('\t') }; })
        .filter((c) => !/^(sync|checkpoint) /.test(c.subject));
      if (subjects.length) out.directWriter = { commits: subjects.length, last: subjects[0] };
    }
    const H = own ? tree(own) : null;
    const prior = ref(LOCAL_REF);
    const parents = [base, prior && prior !== base && G(['merge-base', '--is-ancestor', prior, base ?? prior]).status !== 0 ? prior : null].filter(Boolean);
    const local = M(['commit-tree', snap, ...parents.flatMap((p) => ['-p', p]), '-m', `checkpoint ${me}`]);
    M(['update-ref', LOCAL_REF, local]);
    die('snapshot');
    if (offline) return out;

    // 2. The local changes.
    const L = tree(snap);
    const changed = [...new Set([...B.keys(), ...L.keys()])].filter((p) => B.get(p) !== L.get(p));
    const touched = new Set(changed);
    const heldPaths = new Set(out.held.map((h) => h.path));

    for (let i = 0; i < MAX_TRIES; i += 1) {
      out.tries += 1;
      // 3. Fetch, and check each unit.
      const f = G(['fetch', '-q', remote, `+refs/heads/${branch}:${tracking}`], { timeout: 60_000 });
      if (f.status !== 0 && !/couldn't find remote ref/i.test(f.err)) throw new Error(`git fetch: ${f.err.trim().split('\n')[0]}`);
      const up = ref(tracking);
      const U = tree(up);
      // A remote in a newer format of the records: this client must not write it.
      const epoch = U.has(EPOCH_FILE) ? Number.parseInt(M(['cat-file', 'blob', U.get(EPOCH_FILE).split(' ')[1]]), 10) : RECORDS_EPOCH;
      if (epoch > RECORDS_EPOCH) throw new Error(`the records repo is in format ${epoch}, and this plugin writes format ${RECORDS_EPOCH}: update the plugin on this computer, then sync again`);
      const todo = changed.filter((p) => L.get(p) !== U.get(p));
      const send = [];
      const bad = [];
      const byUnit = new Map();
      for (const p of todo) {
        const u = unitOf(p);
        if (u.addOnly) { (!B.has(p) && !U.has(p) ? send : bad).push(p); continue; }
        if (!byUnit.has(u.unit)) byUnit.set(u.unit, { u, paths: [] });
        byUnit.get(u.unit).paths.push(p);
      }
      for (const { u, paths } of byUnit.values()) (mayChange(u, paths, { B, U, L, H, text, me }) ? send : bad).push(...paths);
      out.fenced = [...new Set(bad.map((p) => unitOf(p).unit ?? p))];
      // A unit with no owner anywhere was not taken by a computer: two writers changed it at once.
      out.unowned = [...byUnit.values()].filter(({ u, paths }) => paths.some((p) => bad.includes(p)) && u.unit && (() => { const f = ownerPathOf(u); return !f || [B, U, L].every((t) => !parseOwner(text(t.get(f)))); })()).map(({ u }) => u.unit);

      // 4. Park what this computer may not send: the whole snapshot, once per tree.
      if (bad.length) {
        const park = `${PARK_PREFIX}${me}-${snap.slice(0, 12)}`;
        if (!G(['ls-remote', remote, park]).out) M(['push', '-q', remote, `${local}:${park}`], { timeout: 120_000 });
        out.parked = park.replace('refs/heads/', '');
      }

      // 5. Compose and push.
      let next = up;
      if (send.length) {
        M(['read-tree', ...(up ? [up] : ['--empty'])], { idx: true });
        M(['update-index', '-z', '--index-info'], { idx: true, input: send.map((p) => (L.has(p) ? `${L.get(p)}\t${p}\0` : `0 ${NO_SHA}\t${p}\0`)).join('') });
        next = M(['commit-tree', M(['write-tree'], { idx: true }), ...(up ? ['-p', up] : []), ...(prior && prior !== base ? ['-p', local] : []), '-m', `sync ${me}`]);
        die('compose');
        const p = G(['push', '-q', remote, `${next}:refs/heads/${branch}`], { timeout: 120_000 });
        if (p.status !== 0) { out.pushError = p.err.trim().split('\n')[0] || `exit ${p.status}`; continue; }
        delete out.pushError;
        die('push');
      }
      out.sent = send.length;

      // 6. Apply what the remote changed and this computer did not.
      const N = tree(next);
      const fenced = new Set(out.fenced);
      for (const p of new Set([...B.keys(), ...N.keys()])) {
        if (B.get(p) === N.get(p) || L.get(p) === N.get(p) || heldPaths.has(p)) continue;
        const u = unitOf(p);
        // A parked unit keeps its local files, except the owner file that this computer did not
        // change: so the computer learns who owns the unit now, and its next write says owner-lost.
        if (u?.unit && fenced.has(u.unit) && p !== ownerPathOf(u)) continue;
        if (sparse && !sparse.some((s) => p === s || p.startsWith(`${s}/`))) continue;
        if (touched.has(p)) { out.keptLocal.push(p); continue; }
        const file = join(dir, p);
        // The re-read: a file written since the snapshot is kept.
        const now = existsSync(file) ? G(['hash-object', '--', p]).out : null;
        if (now !== (B.get(p)?.split(' ')[1] ?? null)) { out.keptLocal.push(p); continue; }
        if (!N.has(p)) { rmSync(file, { force: true }); out.applied += 1; out.appliedPaths.push(p); continue; }
        writeFileAtomic(file, M(['cat-file', 'blob', N.get(p).split(' ')[1]], { raw: true }));
        out.applied += 1; out.appliedPaths.push(p);
      }
      die('apply');

      // 7. Last: the synced ref and the branch.
      if (next) {
        M(['update-ref', SYNCED_REF, next]);
        M(['update-ref', `refs/heads/${branch}`, next]);
        // The chain of offline checkpoints is in the history now: the next snapshot starts anew.
        M(['update-ref', LOCAL_REF, next]);
        // The index of the clone, so that git status reads the new head. Best effort. `-m` keeps
        // the stat data of the entries that did not change, so git status does not hash them all.
        if (G(['read-tree', '-m', next]).status !== 0) G(['read-tree', next]);
      }
      out.pushed = Boolean(next);
      out.head = next;
      return out;
    }
    return out;
  } finally {
    for (const f of [idx, `${idx}.lock`]) rmSync(f, { force: true });
  }
}
