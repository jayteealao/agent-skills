// lib/project-root.mjs
//
// One answer to "where is the project root?" for every render/hook entrypoint.
//
// Before this existed, the render hook and render-sunflower each took the
// session cwd verbatim. A Claude session (or sub-agent) parked in a repo
// subfolder that touched a workflow artifact would mint a stray
// `<subfolder>/.ai/_view` with an empty dashboard — three of these shipped in
// bot-backend, one nested INSIDE a workflow slug dir. Meanwhile the registry
// layer already climbed to the git toplevel (lib/registry.mjs gitIdentity), so
// the two layers disagreed about which directory "the project" was.
//
// Resolution order:
//   1. Nearest ancestor (starting at startDir itself) that owns `.ai/workflows`,
//      capped at the git toplevel. Nearest-wins keeps a monorepo sub-project
//      with its own workflow store anchored where its artifacts live. A stray
//      `.ai/_view`-only dir does NOT anchor — only the workflow store does.
//   2. The git toplevel, when no ancestor owns `.ai/workflows` (the store is
//      created there on first use).
//   3. startDir unchanged, when git is missing or startDir is not a checkout —
//      the pre-existing behaviour for non-git projects.

import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const WALK_CAP = 200;   // path depth bound — guards a cycle from a bad realpath

function gitToplevel(dir) {
  try {
    const out = execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

function canon(p) {
  try { return realpathSync.native(p); } catch { return resolve(p); }
}

// Windows paths compare case-insensitively (input.cwd and git can disagree on
// drive-letter case even after realpath fallback).
function sameDir(a, b) {
  if (process.platform === 'win32') return a.toLowerCase() === b.toLowerCase();
  return a === b;
}

function ownsWorkflowStore(dir) {
  return existsSync(join(dir, '.ai', 'workflows'));
}

/**
 * Resolve the project root for a directory the process happens to be running
 * in. Never throws; falls back to `startDir` when identity can't be improved.
 */
export function resolveProjectRoot(startDir = process.cwd()) {
  const start = canon(startDir);

  // Fast path — the common case (sessions rooted at the repo root) answers
  // without spawning git.
  if (ownsWorkflowStore(start)) return start;

  const top = gitToplevel(start);
  if (!top) return start;
  const topCanon = canon(top);

  let dir = start;
  for (let i = 0; i < WALK_CAP; i++) {
    if (ownsWorkflowStore(dir)) return dir;
    if (sameDir(dir, topCanon)) break;
    const parent = dirname(dir);
    if (sameDir(parent, dir)) break;   // hit the filesystem root before toplevel
    dir = parent;
  }
  return topCanon;
}
