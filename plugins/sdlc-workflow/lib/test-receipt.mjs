// The test receipt of a slice: .test-receipt-<slice>.json, the green run that verify reuses.
//
// `wf.mjs receipt` writes it after the suites passed at HEAD. A tracked change outside .ai that
// HEAD lacks does not stop the receipt: the receipt names each such change in `dirty`, as the
// path and the blob hash of the file that the suites ran with (null for a deleted file). A reader
// reuses the receipt only while the tree is the tree that ran: the commit `sha` plus the changes
// of `dirty` with the same hashes. Any other change outside .ai, in a commit after `sha` or in
// the work tree, in a file that a suite reads or not, makes the receipt stale.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const git = (root, args) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });

/**
 * The tracked files outside .ai whose work-tree content differs from a commit (HEAD by default),
 * staged or not: [{ path, hash }], sorted by path, where `hash` is the blob hash of the file in
 * the work tree (git hash-object), or null when the file is deleted. Paths are relative to root.
 */
export function treeChanges(root, base = 'HEAD') {
  const diff = git(root, ['diff', '--name-only', '--relative', '-z', base, '--', '.', ':!.ai']);
  if (diff.status !== 0) throw new Error(`git diff ${base} failed in ${root}: ${diff.stderr.trim()}`);
  const paths = diff.stdout.split('\0').filter(Boolean).sort();
  const present = paths.filter((p) => existsSync(join(root, p)));
  const hashes = new Map();
  if (present.length) {
    const r = git(root, ['hash-object', '--', ...present]);
    if (r.status !== 0) throw new Error(`git hash-object failed in ${root}: ${r.stderr.trim()}`);
    r.stdout.trim().split(/\r?\n/).forEach((h, i) => hashes.set(present[i], h.trim()));
  }
  return paths.map((p) => ({ path: p, hash: hashes.get(p) ?? null }));
}

/**
 * Whether a receipt still names the tree of the project: { reusable, reason }. It is reusable when
 * it passed, and the files outside .ai that differ from its `sha` are the ones of its `dirty`
 * list, each with the same hash. A code commit after `sha` differs from it, so it is stale too.
 */
export function receiptState(root, receipt) {
  if (!receipt || receipt.result !== 'pass') return { reusable: false, reason: 'the receipt is not a pass' };
  if (!receipt.sha) return { reusable: false, reason: 'the receipt names no commit' };
  let now;
  try {
    now = new Map(treeChanges(root, receipt.sha).map((d) => [d.path, d.hash]));
  } catch {
    return { reusable: false, reason: `the commit ${String(receipt.sha).slice(0, 8)} of the receipt is not in this repo` };
  }
  const then = new Map((Array.isArray(receipt.dirty) ? receipt.dirty : []).map((d) => [d.path, d.hash ?? null]));
  for (const p of [...new Set([...then.keys(), ...now.keys()])].sort()) {
    if (!now.has(p)) return { reusable: false, reason: `${p} is back to ${String(receipt.sha).slice(0, 8)} after the receipt` };
    if (!then.has(p) || then.get(p) !== now.get(p)) return { reusable: false, reason: `${p} changed after the receipt` };
  }
  return { reusable: true, reason: null };
}
