#!/usr/bin/env node
/**
 * hooks/run-notice.mjs — SessionStart: name each run that stopped or died, with one resume command.
 *
 * A driver that dies leaves its progress record at `running`. lib/progress.mjs reads the record
 * and the driver journal; a run quiet for longer than its limit is stopped. Claude Code shows the
 * notice to the person as a systemMessage. The Codex adapter (hooks/session-start.mjs) calls
 * runNotice itself and gives the text to the model. A compaction is not a session start.
 * Always exits 0: a session start must never fail on a notice.
 */
import { stoppedRuns } from '../lib/progress.mjs';
import { outputSystemMessage, projectRootFromInput } from '../lib/hook-utils.mjs';
import { readStdinJson } from '../lib/stdin.mjs';

/** The notice text for a project, or null when no run stopped. */
export function runNotice(projectRoot, { now = Date.now() } = {}) {
  const runs = stoppedRuns(projectRoot, { now });
  if (!runs.length) return null;
  return ['Stopped workflow runs:', ...runs.map((r) => `- ${r.slug}: ${r.line}`)].join('\n');
}

async function main() {
  if (process.env.CLAUDE_PLUGIN_INSTALL === '1') return;
  if (process.env.SDLC_DISPATCH_ACTIVE === '1') return;
  const input = await readStdinJson();
  if (input?.source === 'compact') return;
  const text = runNotice(projectRootFromInput(input));
  if (text) outputSystemMessage(text);
}

const isMain = process.argv[1] && /run-notice\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (isMain) main().catch(() => {}).finally(() => process.exit(0));
