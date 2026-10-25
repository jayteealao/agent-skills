// Modernize an old workflow: the YAML record layout, and the nine stage names.
//
// A workflow of an older release has Markdown record files, and its index names two stages that
// are gone: `shape` (now the second phase of intake) and `handoff` (now the first part of ship).
// This module converts the files (records.mjs migrateWorkflow) and renames the two stages in the
// index: `current-stage`, the `progress` map and the next commands. It changes no decision, no
// verdict and no criterion. A merged progress value is the state of the two old stages together.
import { readdirSync } from 'node:fs';
import { INDEX_NAME, frontmatterOfDoc, migrateWorkflow, redirectOf, setFields } from './records.mjs';

const DONE = new Set(['complete', 'skipped']);
export const STAGE_RENAMES = Object.freeze({ shape: 'intake', handoff: 'ship' });

/** The progress of the new stage from the progress of the stage that stays and of the old one. */
export function mergedProgress(keep, old, { newStage }) {
  if (old === undefined || old === null) return keep;
  if (newStage === 'ship' && keep === 'complete') return 'complete';
  if (DONE.has(keep) && DONE.has(old)) return keep === 'complete' || old === 'complete' ? 'complete' : 'skipped';
  const idle = (v) => v === undefined || v === null || v === 'not-started';
  if (idle(keep) && (idle(old) || old === 'skipped')) return keep ?? 'not-started';
  return 'in-progress';
}

const renameCommand = (v) => (typeof v === 'string'
  ? v.replace(/(^|\s)\/wf shape(?=\s|$)/g, '$1/wf intake').replace(/(^|\s)\/wf handoff(?=\s|$)/g, '$1/wf ship')
  : v);

/** The index changes that rename the old stages, as dotted fields for setFields. */
export function stageRenames(index) {
  const change = {};
  const stage = index?.['current-stage'];
  if (STAGE_RENAMES[stage]) change['current-stage'] = STAGE_RENAMES[stage];
  const progress = index?.progress && typeof index.progress === 'object' ? index.progress : null;
  if (progress) {
    for (const [old, now] of Object.entries(STAGE_RENAMES)) {
      if (!(old in progress)) continue;
      const merged = mergedProgress(progress[now], progress[old], { newStage: now });
      if (merged !== progress[now]) change[`progress.${now}`] = merged;
      change[`progress.${old}`] = null;
    }
  }
  for (const f of ['next-invocation', 'next-command', 'recommended-next-invocation']) {
    const v = renameCommand(index?.[f]);
    if (v !== index?.[f]) change[f] = v;
  }
  return change;
}

/**
 * Convert one workflow. With `check`, only report. Returns `{ moved, kept, renamed }`: the old
 * files and their new places, the files that stay, and the index fields that change.
 */
export function modernizeWorkflow(dir, { check = false } = {}) {
  const index = frontmatterOfDoc(dir, INDEX_NAME);
  if (!index) return { ok: false, reason: 'no index' };
  const renamed = stageRenames(index);
  if (check) {
    const old = readdirSync(dir).filter((f) => /^\d{2}[a-z]?-.+\.md$/.test(f)).sort();
    return { ok: true, check: true, moved: old.map((f) => ({ from: f, to: redirectOf(f) })), kept: [], renamed };
  }
  const files = migrateWorkflow(dir);
  if (Object.keys(renamed).length) setFields(dir, INDEX_NAME, renamed);
  return { ok: true, ...files, renamed };
}
