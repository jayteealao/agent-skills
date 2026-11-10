#!/usr/bin/env node
/**
 * Behavior:
 * - Exit 0 for all outcomes.
 * - Honor .ai/.no-auto-stage.
 * - Skip when no workflows directory exists.
 * - Skip when no file_path is present (every touched path is staged: file_path
 *   plus edits[].file_path, so a multi-file host payload stages each file).
 * - Skip workflow artifact files; implementation commits own those. Skip the
 *   prompt files of a consult (.ai/consult/): they hold inlined code and diffs.
 * - Stage with git add only when an active workflow is in implement stage,
 *   its branch-strategy is dedicated or shared, and its branch is the branch
 *   checked out. Only the head of each workflow index is read.
 * Exports `run(input)` for the folded `post-tool-use-all` entry.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../lib/config.mjs';
import { isEntry, runStandalone } from '../lib/hook-runner.mjs';
import {
  collectToolInputPaths,
  gitAdd,
  isInsideWorkflowArtifacts,
  projectRootFromInput,
} from '../lib/hook-utils.mjs';
import { TERMINAL_WORKFLOW_STATUSES } from '../lib/workflow-index.mjs';
import { INDEX_NAME, readDoc } from '../lib/records.mjs';
import { workflowsRoot } from '../lib/records-root.mjs';

const CONSULT_PATH = /(?:^|\/)\.ai\/consult\//;

/** The branch checked out in the project, or null (detached, or not a git repo). */
function currentBranch(projectRoot) {
  try {
    return execFileSync('git', ['-C', projectRoot, 'symbolic-ref', '--short', 'HEAD'], { encoding: 'utf8', windowsHide: true, timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch { return null; }
}

/** Whether a workflow at implement, with a dedicated or shared branch, owns the checked-out branch. */
export function implementOwnsBranch(projectRoot) {
  const root = workflowsRoot(projectRoot);
  let entries = [];
  try { entries = readdirSync(root, { withFileTypes: true }); } catch { return false; }
  let branch;
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    let fm;
    try { fm = readDoc(join(root, e.name), INDEX_NAME)?.frontmatter; } catch { continue; }
    if (!fm || fm['current-stage'] !== 'implement') continue;
    if (TERMINAL_WORKFLOW_STATUSES.has(String(fm.status ?? '').trim())) continue;
    const strategy = fm['branch-strategy'];
    if (strategy !== 'dedicated' && strategy !== 'shared') continue;
    if (branch === undefined) branch = currentBranch(projectRoot);
    if (branch && fm.branch === branch) return true;
  }
  return false;
}

export async function run(input) {
  const projectRoot = projectRootFromInput(input);
  const config = await loadConfig(projectRoot);

  if (existsSync(join(projectRoot, '.ai', '.no-auto-stage'))) return;
  if (!existsSync(workflowsRoot(projectRoot))) return;

  const filePaths = collectToolInputPaths(input)
    .filter((p) => !isInsideWorkflowArtifacts(p) && !CONSULT_PATH.test(String(p).replace(/\\/g, '/')));
  if (!filePaths.length) return;

  if (!implementOwnsBranch(projectRoot)) return;

  for (const filePath of filePaths) await gitAdd(projectRoot, filePath);
}

if (isEntry('post-write-auto-stage')) runStandalone('post-write-auto-stage', run);
