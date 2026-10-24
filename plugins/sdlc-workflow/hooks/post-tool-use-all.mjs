#!/usr/bin/env node
/**
 * hooks/post-tool-use-all.mjs — the ONE PostToolUse process (WIDE-VIEW §14.2.6).
 *
 * hooks.json wires this file for `Write|Edit|MultiEdit|NotebookEdit`. It runs
 * auto-stage, then verify, in that order, on one parsed payload. A verify block
 * exits 2 with verify's stderr reason.
 */

import { runFolded } from '../lib/hook-runner.mjs';
import { run as postWriteAutoStage } from './post-write-auto-stage.mjs';
import { run as postWriteVerify } from './post-write-verify.mjs';

export function planPostToolUse() {
  return [
    ['post-write-auto-stage', postWriteAutoStage],
    ['post-write-verify', postWriteVerify, { failClosed: true }],
  ];
}

runFolded('post-tool-use-all', planPostToolUse, { stopOnBlock: false });
