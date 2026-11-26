// The step after a change of a workflow's records, shared by the CLI (`wf.mjs`) and the library
// (`lib/wf-api.mjs`), so neither door holds a rule that the other door lacks:
// 1. The GitHub layer queues the change (an answer as a comment, any other change as a progress
//    edit). A failure here never fails the change.
// 2. A linked project commits the workflow folder on the main branch of the records clone. The
//    commit starts the background push.
//    With `records.sync: compose`, nothing commits: the change wakes the committer
//    (lib/records-committer.mjs), at once for an answer or a close.
// 3. When the owner file of the workflow names another computer (a take-over or a hand-over
//    that the sync applied), the session is told to stop.
// 4. The background flush starts when one is due, so a driver that makes no `/wf` call keeps the
//    issues current.
import { join } from 'node:path';
import { noteAnswer, noteChange, startFlush } from './github-layer.mjs';
import { ownerLostLine, otherOwner } from './records-owners.mjs';
import { INDEX_NAME, frontmatterOfDoc } from './records.mjs';
import { workflowDir } from './records-root.mjs';
import { commitWorkflow } from './records-sync.mjs';
import { TERMINAL_WORKFLOW_STATUSES } from './workflow-index.mjs';

export { inBackground } from './records-sync.mjs';

/**
 * The step after a change of one workflow. `label` is the commit message; `answer` is
 * `{ question, answer, by }` when the change recorded an answer of the person. `warn` receives
 * each warning line. Returns `{ commit, conflicts, ownerLost }`.
 */
export function afterChange(root, slug, { label, answer = null, warn = (line) => process.stderr.write(`wf.mjs: ${line}\n`) } = {}) {
  const result = { commit: null, conflicts: [], ownerLost: null };
  try {
    if (answer) noteAnswer(root, slug, answer);
    else noteChange(root, slug);
  } catch (e) { warn(`the GitHub layer did not queue the change: ${e.message}`); }
  try {
    const status = String(frontmatterOfDoc(workflowDir(root, slug), INDEX_NAME)?.status ?? '');
    const c = commitWorkflow(root, slug, label ?? `${slug}: change`, { verb: TERMINAL_WORKFLOW_STATUSES.has(status) ? 'close' : 'push', urgent: Boolean(answer), warn });
    result.commit = c?.commit ?? null;
    result.conflicts = c?.conflicts ?? [];
    for (const f of result.conflicts) warn(`records-warning: the local copy of ${slug}/${f} differs from the clone copy; it is kept in ${join('.ai', 'workflows', '.conflicts', slug).replace(/\\/g, '/')}/`);
    const other = c ? otherOwner(root, slug) : null;
    if (other) {
      result.ownerLost = other;
      warn(`${ownerLostLine(slug, other)}. Stop the stage: another computer writes this workflow now.`);
    }
  } catch (e) { warn(`the records commit failed: ${e.message}`); }
  try { startFlush(root); } catch (e) { warn(`the GitHub layer did not start the flush: ${e.message}`); }
  return result;
}
