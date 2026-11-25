#!/usr/bin/env node
/**
 * PreToolUse(mcp__plugin_sdlc-workflow_wf__*): a sub-agent does not call wf_person.
 *
 * wf_person runs as the person. The host asks the person before each call
 * (`anthropic/requiresUserInteraction`), and this check refuses a call that a sub-agent makes,
 * whose payload carries `agent_id`: an agent of a run holds the question and waits.
 * Exports `run(input)` for the folded `pre-tool-use-all` entry.
 */
import { blockToolCall, isEntry, runStandalone } from '../lib/hook-runner.mjs';

export const WF_TOOL_PREFIX = 'mcp__plugin_sdlc-workflow_wf__';

export async function run(input) {
  if (input?.tool_name !== `${WF_TOOL_PREFIX}wf_person` || !input?.agent_id) return;
  process.stderr.write('wf: blocked. A sub-agent does not call wf_person: it acts in the name of the person. Hold the question with wf_decide { "op": "hold" } and wait for the answer with wf_wait { "op": "decide wait" }.\n');
  blockToolCall();
}

if (isEntry('mcp-guard')) runStandalone('mcp-guard', run);
