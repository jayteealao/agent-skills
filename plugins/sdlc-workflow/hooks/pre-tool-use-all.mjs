#!/usr/bin/env node
/**
 * hooks/pre-tool-use-all.mjs — the ONE PreToolUse process: one process per tool event.
 *
 * hooks.json wires this file for `Write|Edit|MultiEdit|Bash|PowerShell`. The payload shape
 * selects the checks, in the order the three separate hooks used to run:
 *   - a file write (`tool_input.file_path`) → pre-write-validate (needs full
 *     `content`, so it acts on Write only), then leak-guard-write;
 *   - a shell command (`tool_input.command`) → shell-write-guard, then leak-guard-bash.
 * The first blocking check ends the process with exit 2 and its stderr reason.
 *
 * pre-write-validate fails closed: when it throws, the write is refused with a message that
 * names the error log. A payload this process cannot read is refused the same way, since no
 * check can run on it. The other checks stay advisory on an error: it is logged and the call passes.
 */

import { runFolded } from '../lib/hook-runner.mjs';

// Each check loads when the payload selects it, so a shell command does not load the write
// checks, and a write does not load the shell checks. The start of a Node process dominates the
// time of this hook on Windows, and every module that it reads adds to it.
const lazy = (file) => async (input) => (await import(file)).run(input);

export function planPreToolUse(input) {
  const ti = input?.tool_input ?? {};
  const stages = [];
  if (typeof ti.file_path === 'string') {
    stages.push(['pre-write-validate', lazy('./pre-write-validate.mjs'), { failClosed: true }]);
    stages.push(['leak-guard-write', lazy('./leak-guard-write.mjs')]);
  }
  if (typeof ti.command === 'string') {
    stages.push(['shell-write-guard', lazy('./shell-write-guard.mjs')]);
    stages.push(['leak-guard-bash', lazy('./leak-guard-bash.mjs')]);
  }
  return stages;
}

runFolded('pre-tool-use-all', planPreToolUse, { stopOnBlock: true, inputFailClosed: true });
