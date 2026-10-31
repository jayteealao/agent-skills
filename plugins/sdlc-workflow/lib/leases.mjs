// The lease of a workflow: which machine may write its records now.
//
// A lease is one git ref in the records repo, `refs/leases/<project>/<slug>`. It points at a
// commit with no files whose message is the lease as JSON. A machine claims it with a push and a
// `--force-with-lease` compare-and-swap, so two machines that claim at once cannot both win. The
// holder renews it at each step and stage boundary. It expires after the longest suite of the
// test profile plus one hour. An expired lease of another machine is taken only after the
// person said yes (`--take`).
//
// The lease runs only when `.machines/` of the clone lists two or more computers. With one
// computer no other writer exists, so the dispatch claims nothing and asks the remote nothing.
import { gitIn, machineCount, machineName, markHeld, pullRecords, readState } from './records-sync.mjs';
import { linkedProject, recordsHome } from './records-root.mjs';
import { SUITES, readProfile, suiteSeconds } from './test-profile.mjs';

export const LEASE_SLACK_SECONDS = 3600;
const nowIso = (d = new Date()) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
export const leaseRefOf = (project, slug) => `refs/leases/${project}/${slug}`;

/** True when the lease runs: `.machines/` of the clone lists two or more computers. */
export const leasesOn = (home = recordsHome()) => machineCount(home) >= 2;

/** The lifetime of a lease of this project: the longest suite plus one hour, in seconds. */
export function leaseSeconds(root) {
  const profile = readProfile(root);
  const longest = Math.max(0, ...SUITES.map((s) => suiteSeconds(profile, s) ?? 0));
  return longest + LEASE_SLACK_SECONDS;
}

/** The lease of a local ref: the copy that the last sync or claim fetched. Null when there is none. */
export function localLease(home, ref) {
  const r = gitIn(home, ['log', '-1', '--format=%B', ref]);
  if (r.status !== 0) return null;
  try { return JSON.parse(r.stdout); } catch { return null; }
}

/** The lease of another machine that is not expired, or null. `remote` asks the remote, else the local ref. */
export function otherLease(root, slug, { remote = false, now = new Date() } = {}) {
  const project = linkedProject(root);
  if (!project) return null;
  const home = recordsHome();
  if (!leasesOn(home)) return null;
  const ref = leaseRefOf(project, slug);
  const lease = remote ? remoteLease(home, ref).lease ?? null : localLease(home, ref);
  return lease && lease.machine !== machineName() && !expired(lease, now) ? lease : null;
}

/** The remote lease: `{ online, sha, lease }`. An unknown remote is `{ online: false }`. */
function remoteLease(home, ref) {
  const ls = gitIn(home, ['ls-remote', 'origin', ref], { net: true });
  if (ls.status !== 0) return { online: false };
  const sha = ls.stdout.split('\n').map((l) => l.split('\t')).find(([, r]) => r === ref)?.[0] ?? null;
  if (!sha) {
    gitIn(home, ['update-ref', '-d', ref]);
    return { online: true, sha: null, lease: null };
  }
  if (gitIn(home, ['cat-file', '-e', sha]).status !== 0) gitIn(home, ['fetch', '-q', 'origin', `+${ref}:${ref}`], { net: true });
  let lease = null;
  try { lease = JSON.parse(gitIn(home, ['log', '-1', '--format=%B', sha]).stdout); } catch { lease = null; }
  return { online: true, sha, lease };
}

const expired = (lease, now) => !lease || Date.parse(lease.expires) <= now.getTime();

/** The lease of a workflow, as this machine sees it now. */
export function showLease(root, slug, { now = new Date() } = {}) {
  const project = linkedProject(root);
  if (!project) return { linked: false };
  const r = remoteLease(recordsHome(), leaseRefOf(project, slug));
  if (!r.online) return { linked: true, online: false };
  const me = machineName();
  return { linked: true, online: true, lease: r.lease, mine: r.lease?.machine === me, expired: r.lease ? expired(r.lease, now) : null };
}

/**
 * Claim or renew the lease. Returns `{ ok }` with the lease, or `{ ok: false }` and why: `held`
 * (another machine holds it), `expired` (another machine's lease ran out; it needs the person's
 * yes), `offline`, or `raced` (another machine won the compare-and-swap).
 */
export function claimLease(root, slug, { take = false, host = null, now = new Date() } = {}) {
  const project = linkedProject(root);
  if (!project) return { ok: true, linked: false };
  const home = recordsHome();
  const ref = leaseRefOf(project, slug);
  const r = remoteLease(home, ref);
  if (!r.online) return { ok: false, offline: true };
  const me = machineName();
  const other = r.lease && r.lease.machine !== me;
  if (other && !expired(r.lease, now)) return { ok: false, held: true, lease: r.lease };
  if (other && !take) return { ok: false, expired: true, lease: r.lease };
  const lease = {
    schema: 'wf-lease/1', project, slug, machine: me, host,
    at: r.lease?.machine === me ? r.lease.at : nowIso(now),
    renewed: nowIso(now),
    expires: nowIso(new Date(now.getTime() + leaseSeconds(root) * 1000)),
  };
  const tree = gitIn(home, ['mktree'], { input: '' }).stdout;
  const commit = gitIn(home, ['commit-tree', tree, '-m', JSON.stringify(lease)]);
  if (commit.status !== 0) return { ok: false, reason: commit.stderr };
  const push = gitIn(home, ['push', '-q', `--force-with-lease=${ref}:${r.sha ?? ''}`, 'origin', `${commit.stdout}:${ref}`], { net: true });
  if (push.status !== 0) return { ok: false, raced: true, reason: push.stderr.split('\n')[0] };
  gitIn(home, ['update-ref', ref, commit.stdout]);
  markHeld(`${project}/${slug}`, true);
  return { ok: true, lease, renewed: r.lease?.machine === me, took: Boolean(other) };
}

/**
 * Claim the lease, and pull the work of other computers when this computer did not hold it: the
 * pull at the claim takes the place of a pull at each call. Returns the claim, with `pull` (the
 * result of `pullRecords`) after a new claim.
 */
export function claimAndPull(root, slug, opts = {}) {
  const c = claimLease(root, slug, opts);
  if (c.ok && c.linked !== false && !c.renewed) c.pull = pullRecords(recordsHome());
  return c;
}

/** Release the lease of this machine, so another machine or host can continue the workflow. */
export function releaseLease(root, slug) {
  const project = linkedProject(root);
  if (!project) return { ok: true, linked: false };
  const home = recordsHome();
  const ref = leaseRefOf(project, slug);
  const r = remoteLease(home, ref);
  if (!r.online) return { ok: false, offline: true };
  if (!r.lease) return { ok: true, released: false };
  if (r.lease.machine !== machineName()) return { ok: false, held: true, lease: r.lease };
  const push = gitIn(home, ['push', '-q', `--force-with-lease=${ref}:${r.sha}`, 'origin', `:${ref}`], { net: true });
  if (push.status !== 0) return { ok: false, raced: true, reason: push.stderr.split('\n')[0] };
  gitIn(home, ['update-ref', '-d', ref]);
  markHeld(`${project}/${slug}`, false);
  return { ok: true, released: true };
}

/**
 * Renew the lease when this machine holds it; otherwise change nothing. A lease that another
 * machine holds now is `{ ok: false, lost: true, lease }`: this machine must stop writing.
 */
export function renewIfMine(root, slug, { now = new Date() } = {}) {
  const s = showLease(root, slug, { now });
  if (s.online && s.lease && !s.mine && !s.expired) return { ok: false, lost: true, lease: s.lease };
  return s.online && s.mine ? claimLease(root, slug, { now }) : { ok: false, skipped: true };
}

/** True when this machine held the lease of the workflow at its last claim, and has not released it. */
export function heldBefore(root, slug) {
  const project = linkedProject(root);
  return Boolean(project && readState().held?.[`${project}/${slug}`]);
}

/** The line that tells a session to stop: another machine took the lease of this workflow. */
export const leaseLostLine = (slug, lease) => `lease-lost: ${slug} by ${lease.machine}${lease.host ? ` (${lease.host})` : ''} until ${lease.expires}`;
