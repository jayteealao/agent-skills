// The step after a change of a workflow's records, shared by the CLI (`wf.mjs`) and the library
// (`lib/wf-api.mjs`), so neither door holds a rule that the other door lacks:
// 1. The GitHub layer queues the change (an answer as a comment, any other change as a progress
//    edit). A failure here never fails the change.
// 2. A linked project commits the workflow folder to its live branch. A local file that differs
//    from the clone copy is kept aside and reported.
// 3. When the lease ref of the last sync names another machine, the session is told to stop.
// 4. The push runs in the background; a closed workflow is squashed onto the main branch.
import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { noteAnswer, noteChange } from './github-layer.mjs';
import { otherLease, leaseLostLine } from './leases.mjs';
import { INDEX_NAME, frontmatterOfDoc } from './records.mjs';
import { workflowDir } from './records-root.mjs';
import { commitWorkflow } from './records-sync.mjs';
import { TERMINAL_WORKFLOW_STATUSES } from './workflow-index.mjs';

const WF_CLI = fileURLToPath(new URL('../scripts/wf.mjs', import.meta.url));

/** Run `wf.mjs <args>` detached. SDLC_RECORDS_FOREGROUND=1 runs it in this process's time, for tests. */
export function inBackground(args) {
  if (process.env.SDLC_RECORDS_FOREGROUND === '1') { spawnSync(process.execPath, [WF_CLI, ...args], { stdio: 'ignore', windowsHide: true }); return; }
  try {
    spawn(process.execPath, [WF_CLI, ...args], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } catch { /* the next sync pushes it */ }
}

/**
 * The step after a change of one workflow. `label` is the commit message; `answer` is
 * `{ question, answer, by }` when the change recorded an answer of the person. `warn` receives
 * each warning line. Returns `{ commit, conflicts, leaseLost }`.
 */
export function afterChange(root, slug, { label, answer = null, warn = (line) => process.stderr.write(`wf.mjs: ${line}\n`) } = {}) {
  const result = { commit: null, conflicts: [], leaseLost: null };
  try {
    if (answer) noteAnswer(root, slug, answer);
    else noteChange(root, slug);
  } catch (e) { warn(`the GitHub layer did not queue the change: ${e.message}`); }
  try {
    const c = commitWorkflow(root, slug, label ?? `${slug}: change`);
    result.commit = c?.commit ?? null;
    result.conflicts = c?.conflicts ?? [];
    for (const f of result.conflicts) warn(`records-warning: the local copy of ${slug}/${f} differs from the clone copy; it is kept in ${join('.ai', 'workflows', '.conflicts', slug).replace(/\\/g, '/')}/`);
    const other = c ? otherLease(root, slug) : null;
    if (other) {
      result.leaseLost = other;
      warn(`${leaseLostLine(slug, other)}. Stop the stage: another computer writes this workflow now.`);
    }
    if (c) {
      const status = String(frontmatterOfDoc(workflowDir(root, slug), INDEX_NAME)?.status ?? '');
      inBackground(['records', TERMINAL_WORKFLOW_STATUSES.has(status) ? 'close' : 'push', root, slug]);
    }
  } catch (e) { warn(`the records commit failed: ${e.message}`); }
  return result;
}
