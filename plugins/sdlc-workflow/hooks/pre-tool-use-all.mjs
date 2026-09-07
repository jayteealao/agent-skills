#!/usr/bin/env node
/**
 * hooks/pre-tool-use-all.mjs — the ONE PreToolUse process (WIDE-VIEW §14.2.6).
 *
 * hooks.json wires this file for `Write|Edit|MultiEdit|Bash`. The payload shape
 * selects the checks, in the order the three separate hooks used to run:
 *   - a file write (`tool_input.file_path`) → pre-write-validate (needs full
 *     `content`, so it acts on Write only), then leak-guard-write;
 *   - a shell command (`tool_input.command`) → leak-guard-bash.
 * The first blocking check ends the process with exit 2 and its stderr reason.
 */

import { runFolded } from '../lib/hook-runner.mjs';
import { run as leakGuardBash } from './leak-guard-bash.mjs';
import { run as leakGuardWrite } from './leak-guard-write.mjs';
import { run as preWriteValidate } from './pre-write-validate.mjs';

export function planPreToolUse(input) {
  const ti = input?.tool_input ?? {};
  const stages = [];
  if (typeof ti.file_path === 'string') {
    stages.push(['pre-write-validate', preWriteValidate]);
    stages.push(['leak-guard-write', leakGuardWrite]);
  }
  if (typeof ti.command === 'string') stages.push(['leak-guard-bash', leakGuardBash]);
  return stages;
}

runFolded('pre-tool-use-all', planPreToolUse, { stopOnBlock: true });
