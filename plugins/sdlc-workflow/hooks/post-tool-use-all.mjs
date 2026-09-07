#!/usr/bin/env node
/**
 * hooks/post-tool-use-all.mjs — the ONE PostToolUse process (WIDE-VIEW §14.2.6).
 *
 * hooks.json wires this file for `Write|Edit|MultiEdit|NotebookEdit`. It runs
 * auto-stage, then verify, then the render enqueue, in that order, on one parsed
 * payload. A verify block does not stop the render enqueue — the three separate
 * processes never depended on each other — and the process still exits 2 with
 * verify's stderr reason.
 */

import { runFolded } from '../lib/hook-runner.mjs';
import { run as postWriteAutoStage } from './post-write-auto-stage.mjs';
import { run as postWriteVerify } from './post-write-verify.mjs';
import { run as renderEnqueue } from './render-on-artifact-write.mjs';

export function planPostToolUse() {
  return [
    ['post-write-auto-stage', postWriteAutoStage],
    ['post-write-verify', postWriteVerify],
    ['post-write-render', renderEnqueue],
  ];
}

runFolded('post-tool-use-all', planPostToolUse, { stopOnBlock: false });
