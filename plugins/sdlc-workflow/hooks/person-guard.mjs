#!/usr/bin/env node
/**
 * PreToolUse(Bash|PowerShell): a sub-agent writes nothing in the name of the person.
 *
 * The host puts `agent_id` in the payload of a tool call that a sub-agent makes. For such a call
 * this check refuses the wf commands that record the words of the person: an entry by the
 * person, a steer, an approval, a rule of the project, a standing answer, a consent. The session
 * of the person runs them. A sub-agent holds the question and waits.
 * Exports `run(input)` for the folded `pre-tool-use-all` entry.
 */
import { personOnlyCommand } from '../lib/actor.mjs';
import { blockToolCall, isEntry, runStandalone } from '../lib/hook-runner.mjs';

export async function run(input) {
  if (!input?.agent_id) return;
  const what = personOnlyCommand(input?.tool_input?.command);
  if (!what) return;
  process.stderr.write(`wf: blocked. A sub-agent of a run does not ${what} in the name of the person. Hold the question with decide hold and wait for the answer with decide wait. For a choice of your own, record it with --by stage or --by delegate.\n`);
  blockToolCall();
}

if (isEntry('person-guard')) runStandalone('person-guard', run);
