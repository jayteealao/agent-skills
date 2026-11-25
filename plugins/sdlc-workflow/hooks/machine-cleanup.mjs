#!/usr/bin/env node
/**
 * SessionStart (Claude Code, pi; Codex through hooks/session-start.mjs). Runs the
 * one-time removal of the old hub and tray from this machine (lib/machine-cleanup.mjs), and
 * wakes the records committer when `records.sync: compose` is on (lib/records-committer.mjs).
 * After the first clean run it only checks the marker file. On that first clean
 * run it prints one warning when old mod settings are still set, except on Codex.
 * It always exits 0.
 */

import { logError } from '../lib/error-log.mjs';
import { runMachineCleanup } from '../lib/machine-cleanup.mjs';

if (process.env.CLAUDE_PLUGIN_INSTALL !== '1' && process.env.SDLC_DISPATCH_ACTIVE !== '1') {
  try {
    const { notice } = runMachineCleanup();
    if (notice && process.env.SDLC_HOST !== 'codex') process.stdout.write(`${JSON.stringify({ systemMessage: notice })}
`);
  } catch (err) {
    await logError('machine-cleanup', err).catch(() => {});
  }
  // With the compose sync of the records, a session starts one sync: the work of other
  // computers arrives before the first stage reads it. Off, this does nothing.
  try {
    const { wakeCommitter } = await import('../lib/records-committer.mjs');
    wakeCommitter({ urgent: true });
  } catch (err) {
    await logError('records-committer', err).catch(() => {});
  }
}
process.exit(0);
