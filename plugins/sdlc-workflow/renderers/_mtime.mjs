// renderers/_mtime.mjs
// Compute the additive (incremental) work-set. An artifact needs re-rendering
// when any of its storage inputs (.md, .yaml, .html.fragment) is newer than
// the view counterpart. See SUNFLOWER-VIEW-PLAN §"Pipeline" and §"Additive
// guarantees".

import { statSync, existsSync } from 'node:fs';

/**
 * Maximum mtime across a set of paths. Missing paths are skipped. Returns 0
 * when none exist.
 */
export function maxMtime(absPaths) {
  let max = 0;
  for (const p of absPaths) {
    if (!p || !existsSync(p)) continue;
    try {
      const s = statSync(p);
      if (s.mtimeMs > max) max = s.mtimeMs;
    } catch { /* ignore */ }
  }
  return max;
}

/**
 * Returns true when the storage inputs are newer than the view output, or
 * when the view output is missing entirely.
 */
export function isDirty({ storageInputs, viewOutput }) {
  if (!existsSync(viewOutput)) return true;
  const inputMtime  = maxMtime(storageInputs);
  const outputMtime = maxMtime([viewOutput]);
  // `>=` (not `>`): on coarse-grained filesystems (FAT32 2s, some NFS 1s) a
  // source edited in the same mtime bucket as the view would be missed by `>`,
  // serving a stale page. Equal-mtime re-renders are cheap and self-correcting.
  return inputMtime >= outputMtime;
}

/**
 * Build a work-set predicate based on the mode flags. In `clean` mode every
 * artifact is dirty; in `additive` mode the mtime comparison decides; an
 * `only` glob narrows the work-set further.
 */
export function workSetFilter({ mode, onlyGlob }) {
  const onlyRe = onlyGlob ? globToRegex(onlyGlob) : null;
  return ({ storagePath, storageInputs, viewOutput }) => {
    if (onlyRe && !onlyRe.test(storagePath)) return false;
    if (mode === 'clean') return true;
    return isDirty({ storageInputs, viewOutput });
  };
}

function globToRegex(glob) {
  const esc = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<<DOUBLESTAR>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<DOUBLESTAR>>/g, '.*');
  return new RegExp('^' + esc + '$');
}
