#!/usr/bin/env node
/**
 * Behavior:
 * - Scan workflow 00-index.md files under .ai/workflows/.
 * - Skip terminal statuses and malformed indexes.
 * - Emit no output when no active workflows exist.
 * - Emit JSON {systemMessage} when active workflows exist.
 * - Include branch mismatch information best-effort from git.
 * - Start detached bootstrap rendering after the fast orientation pass.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../lib/config.mjs';
import { spawnDetachedNode } from '../lib/detach.mjs';
import { logError } from '../lib/error-log.mjs';
import {
  currentGitBranch,
  outputSystemMessage,
  projectRootFromInput,
  stringifyField,
} from '../lib/hook-utils.mjs';
import { readStdinJson } from '../lib/stdin.mjs';
import { scanWorkflowIndexes, activeWorkflowIndexes } from '../lib/workflow-index.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..');

async function main() {
  if (process.env.CLAUDE_PLUGIN_INSTALL === '1') return;

  const input = await readStdinJson();
  const projectRoot = projectRootFromInput(input);
  const config = await loadConfig(projectRoot);
  startBootstrap(projectRoot, config);

  const workflows = activeWorkflowIndexes(await scanWorkflowIndexes({ projectRoot }));
  if (!workflows.length) return;

  const currentBranch = await currentGitBranch(projectRoot);
  const summaries = workflows.map((workflow) => formatWorkflowSummary(workflow, currentBranch));
  outputSystemMessage(summaries.length === 1
    ? summaries[0]
    : `Active workflows (${summaries.length}):\n\n${summaries.join('\n\n')}`);
}

function startBootstrap(projectRoot, config) {
  if (process.env.SDLC_DISABLE_BOOTSTRAP === '1') return;
  if (config.view?.bootstrap?.enabled === false) return;
  try {
    spawnDetachedNode(
      resolve(PLUGIN_ROOT, 'scripts', 'render-sunflower.mjs'),
      ['--bootstrap', '--plugin-root', PLUGIN_ROOT],
      { cwd: projectRoot, env: process.env },
    );
  } catch {
    // Session orientation must remain fail-open.
  }
}

function formatWorkflowSummary(workflow, currentBranch) {
  const fm = workflow.frontmatter ?? {};
  let summary = `Active workflow: ${workflow.slug}`;
  if (fm.title) summary += ` - ${fm.title}`;
  if (fm['current-stage']) summary += `\n  Stage: ${fm['current-stage']}`;
  if (fm['stage-status']) summary += ` (${fm['stage-status']})`;

  const selectedSlice = fm['selected-slice-or-focus'] ?? fm['selected-slice'];
  if (selectedSlice) summary += `\n  Slice: ${selectedSlice}`;

  const strategy = fm['branch-strategy'];
  if (strategy && strategy !== 'none') {
    const branch = fm.branch;
    let branchLine = `  Branch: ${branch || 'unknown'}`;
    if (currentBranch && branch) {
      branchLine += currentBranch === branch
        ? ' (on correct branch)'
        : ` (current: ${currentBranch} - WRONG BRANCH)`;
    }
    if (fm['base-branch']) branchLine += `, base: ${fm['base-branch']}`;
    summary += `\n${branchLine}`;
  }

  if (fm['pr-url']) summary += `\n  PR: ${fm['pr-url']}`;

  const nextInvocation = fm['recommended-next-invocation'] ?? fm['next-invocation'];
  const nextCommand = fm['recommended-next-command'] ?? fm['next-command'];
  if (nextInvocation) {
    summary += `\n  Next: ${nextInvocation}`;
  } else if (nextCommand) {
    summary += `\n  Next: /${nextCommand} ${workflow.slug}`;
  }

  const openQuestions = stringifyField(fm['open-questions']);
  if (openQuestions && openQuestions !== '[]' && openQuestions !== 'none') {
    summary += `\n  Open questions: ${openQuestions}`;
  }

  return summary;
}

main().catch(async (err) => {
  try {
    await logError('session-start-orient', err);
  } catch {
    // ignore logging failures
  }
  process.exit(0);
});
