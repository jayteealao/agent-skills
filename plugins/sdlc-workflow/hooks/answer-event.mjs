#!/usr/bin/env node
// hooks/answer-event.mjs — PostToolUse on the host question tool: AskUserQuestion on Claude
// Code (and on pi, through the bridge), request_user_input on Codex. It appends the answer
// event to answers.jsonl in the records folder of the project (lib/answers.mjs). Never blocks.

import { appendAnswerEvent, answerEventOf } from '../lib/answers.mjs';
import { projectRootFromInput } from '../lib/hook-utils.mjs';
import { readStdinJson } from '../lib/stdin.mjs';

export function run(input) {
  const event = answerEventOf(input);
  if (!event) return false;
  const host = process.env.SDLC_HOST || (event.tool === 'request_user_input' ? 'codex' : 'claude');
  return appendAnswerEvent(projectRootFromInput(input), event, { host, session: input.session_id ?? null });
}

try {
  run((await readStdinJson()) ?? {});
} catch {
  // A log that cannot be written never stops the tool call.
}
process.exit(0);
