#!/usr/bin/env node
/**
 * Behavior:
 * - Exit 0 for all outcomes.
 * - Honor .ai/.no-auto-stage.
 * - Skip when no workflows directory exists.
 * - Skip when no file_path is present.
 * - Skip workflow artifact files; implementation commits own those.
 * - Stage with git add only when an active workflow is in implement stage
 *   and branch-strategy is dedicated or shared.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../lib/config.mjs';
import { logError } from '../lib/error-log.mjs';
import { readStdinJson } from '../lib/stdin.mjs';
import {
  gitAdd,
  isInsideWorkflowArtifacts,
  projectRootFromInput,
} from '../lib/hook-utils.mjs';
import { scanWorkflowIndexes } from '../lib/workflow-index.mjs';

async function main() {
  if (process.env.CLAUDE_PLUGIN_INSTALL === '1') return;

  const input = await readStdinJson();
  const projectRoot = projectRootFromInput(input);
  const config = await loadConfig(projectRoot);
  if (config.hooks.autoStage === false) return;

  if (existsSync(join(projectRoot, '.ai', '.no-auto-stage'))) return;
  if (!existsSync(join(projectRoot, '.ai', 'workflows'))) return;

  const filePath = input?.tool_input?.file_path;
  if (!filePath) return;
  if (isInsideWorkflowArtifacts(filePath)) return;

  const workflows = await scanWorkflowIndexes({ projectRoot });
  const hasImplementWorkflow = workflows.some((workflow) => {
    const strategy = workflow.frontmatter?.['branch-strategy'];
    return workflow.isActive &&
      workflow.currentStage === 'implement' &&
      (strategy === 'dedicated' || strategy === 'shared');
  });
  if (!hasImplementWorkflow) return;

  await gitAdd(projectRoot, filePath);
}

main().catch(async (err) => {
  try {
    await logError('post-write-auto-stage', err);
  } catch {
    // ignore logging failures
  }
}).finally(() => {
  process.exit(0);
});
