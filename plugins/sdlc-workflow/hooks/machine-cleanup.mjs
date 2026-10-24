#!/usr/bin/env node
/**
 * SessionStart (Claude Code, pi; Codex through hooks/session-start.mjs). Runs the
 * one-time removal of the old hub and tray from this machine (lib/machine-cleanup.mjs).
 * After the first clean run it only checks the marker file. It never writes to
 * stdout and always exits 0.
 */

import { logError } from '../lib/error-log.mjs';
import { runMachineCleanup } from '../lib/machine-cleanup.mjs';

if (process.env.CLAUDE_PLUGIN_INSTALL !== '1' && process.env.SDLC_DISPATCH_ACTIVE !== '1') {
  try {
    runMachineCleanup();
  } catch (err) {
    await logError('machine-cleanup', err).catch(() => {});
  }
}
process.exit(0);
