#!/usr/bin/env node
/**
 * scripts/tray-heal.mjs — background reconcile of a RUNNING tray against the
 * current plugin bundle (see lib/tray-lifecycle.mjs). Spawned DETACHED by the
 * session-start-orient hook so orientation never blocks on the WMI process scan.
 *
 * Self-contained: the current tray bundle is resolved from THIS file's own
 * plugin root (never ${CLAUDE_PLUGIN_*}), because the launching hook may run
 * from a different host's plugin tree. Exits 0 regardless — a heal failure must
 * never surface as a hook error.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveEntrypoint } from '../lib/entrypoint.mjs';
import { reconcileRunningTray } from '../lib/tray-lifecycle.mjs';
import { logError } from '../lib/error-log.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..');

reconcileRunningTray({ currentBundle: resolveEntrypoint(PLUGIN_ROOT, 'tray') })
  .catch(async (err) => { try { await logError('tray-heal', err); } catch { /* ignore */ } })
  .finally(() => process.exit(0));
