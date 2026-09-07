#!/usr/bin/env node
/**
 * Behavior:
 * - Exit 0 for all outcomes.
 * - Honor .ai/.no-auto-stage.
 * - Skip when no workflows directory exists.
 * - Skip when no file_path is present (every touched path is staged: file_path
 *   plus edits[].file_path, so a multi-file host payload stages each file).
 * - Skip workflow artifact files; implementation commits own those.
 * - Stage with git add only when an active workflow is in implement stage
 *   and branch-strategy is dedicated or shared.
 * Exports `run(input)` for the folded `post-tool-use-all` entry (WIDE-VIEW §14.2.6).
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../lib/config.mjs';
import { isEntry, runStandalone } from '../lib/hook-runner.mjs';
import {
  collectToolInputPaths,
  gitAdd,
  isInsideWorkflowArtifacts,
  projectRootFromInput,
} from '../lib/hook-utils.mjs';
import { scanWorkflowIndexes } from '../lib/workflow-index.mjs';

export async function run(input) {
  const projectRoot = projectRootFromInput(input);
  const config = await loadConfig(projectRoot);
  if (config.hooks.autoStage === false) return;

  if (existsSync(join(projectRoot, '.ai', '.no-auto-stage'))) return;
  if (!existsSync(join(projectRoot, '.ai', 'workflows'))) return;

  const filePaths = collectToolInputPaths(input).filter((p) => !isInsideWorkflowArtifacts(p));
  if (!filePaths.length) return;

  const workflows = await scanWorkflowIndexes({ projectRoot });
  const hasImplementWorkflow = workflows.some((workflow) => {
    const strategy = workflow.frontmatter?.['branch-strategy'];
    return workflow.isActive &&
      workflow.currentStage === 'implement' &&
      (strategy === 'dedicated' || strategy === 'shared');
  });
  if (!hasImplementWorkflow) return;

  for (const filePath of filePaths) await gitAdd(projectRoot, filePath);
}

if (isEntry('post-write-auto-stage')) runStandalone('post-write-auto-stage', run);
