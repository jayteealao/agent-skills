#!/usr/bin/env node
/**
 * Parity table vs hooks/scripts/pre-compact.sh:
 * - Scan workflow 00-index.md files under .ai/workflows/.
 * - Skip terminal statuses and malformed indexes.
 * - Emit no output when no active workflows exist.
 * - Emit plain-text compaction preservation instructions when active workflows exist.
 * - Exit 0 always.
 */

import { logError } from '../lib/error-log.mjs';
import { projectRootFromInput, stringifyField } from '../lib/hook-utils.mjs';
import { readStdinJson } from '../lib/stdin.mjs';
import { activeWorkflowIndexes, scanWorkflowIndexes } from '../lib/workflow-index.mjs';

async function main() {
  if (process.env.CLAUDE_PLUGIN_INSTALL === '1') return;

  const input = await readStdinJson();
  const projectRoot = projectRootFromInput(input);

  const workflows = activeWorkflowIndexes(await scanWorkflowIndexes({ projectRoot }));
  if (!workflows.length) return;

  const summaries = workflows.map(formatPreserveSummary).join('\n\n');
  process.stdout.write(`CRITICAL - Active SDLC workflow state. Preserve ALL of the following in the compaction summary.\n\n${summaries}\n\nPRESERVE IN SUMMARY:\n1. The active workflow slug, current stage, and selected slice\n2. Branch name and strategy (the user needs to know which branch they're on)\n3. Open questions (these are blocking - losing them means re-asking the PO)\n4. Progress map (which stages are complete vs in-progress)\n5. The recommended next command and its full invocation\n6. Any decisions made during this conversation (triage results, PO answers, architectural choices)\n7. Any errors or blockers encountered and their resolution status\n\nThe next stage's Step 0 Orient will rebuild full context by reading workflow artifact files,\nbut the summary must carry enough state for the model to orient immediately after compaction\nwithout re-reading all artifacts.\n`);
}

function formatPreserveSummary(workflow) {
  const fm = workflow.frontmatter ?? {};
  const lines = [
    `WORKFLOW: ${workflow.slug}`,
    `  Title: ${fm.title ?? ''}`,
    `  Status: ${fm.status ?? ''}`,
    `  Current stage: ${fm['current-stage'] ?? ''} (stage ${fm['stage-number'] ?? ''} of 10)`,
  ];
  const selectedSlice = fm['selected-slice-or-focus'] ?? fm['selected-slice'];
  if (selectedSlice) lines.push(`  Selected slice: ${selectedSlice}`);
  if (fm['branch-strategy']) lines.push(`  Branch strategy: ${fm['branch-strategy']}`);
  if (fm.branch) lines.push(`  Branch: ${fm.branch}`);

  const progress = stringifyField(fm.progress);
  if (progress) lines.push(`  Progress: ${progress}`);

  const openQuestions = stringifyField(fm['open-questions']);
  if (openQuestions) lines.push(`  Open questions: ${openQuestions}`);

  const next = fm['recommended-next-invocation'] ?? fm['next-invocation'] ?? fm['recommended-next-command'] ?? fm['next-command'];
  if (next) lines.push(`  Next command: ${next}`);

  return lines.join('\n');
}

main().catch(async (err) => {
  try {
    await logError('pre-compact-preserve', err);
  } catch {
    // ignore logging failures
  }
}).finally(() => {
  process.exit(0);
});
