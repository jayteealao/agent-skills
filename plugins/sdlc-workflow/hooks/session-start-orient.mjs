#!/usr/bin/env node
/**
 * Behavior:
 * - Scan workflow 00-index.md files under .ai/workflows/.
 * - Skip terminal statuses and malformed indexes.
 * - Emit no output when no active workflows exist.
 * - Emit JSON {systemMessage} when active workflows exist.
 * - Include branch mismatch information best-effort from git.
 * - Start detached bootstrap rendering after the fast orientation pass.
 */

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../lib/config.mjs';
import { spawnDetachedNode } from '../lib/detach.mjs';
import { resolveEntrypoint } from '../lib/entrypoint.mjs';
import { logError } from '../lib/error-log.mjs';
import { enqueue, readStatus, countPending } from '../lib/render-queue.mjs';
import {
  currentGitBranch,
  outputSystemMessage,
  projectRootFromInput,
  stringifyField,
} from '../lib/hook-utils.mjs';
import { readStdinJson } from '../lib/stdin.mjs';
import { isAutostartEnabled, refreshAutostart } from '../lib/tray-autostart.mjs';
import { scanWorkflowIndexes, activeWorkflowIndexes } from '../lib/workflow-index.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..');

async function main() {
  if (process.env.CLAUDE_PLUGIN_INSTALL === '1') return;

  const input = await readStdinJson();
  const projectRoot = projectRootFromInput(input);
  const config = await loadConfig(projectRoot);
  startBootstrap(projectRoot, config);
  healAutostartLauncher();

  const workflows = activeWorkflowIndexes(await scanWorkflowIndexes({ projectRoot }));
  if (!workflows.length) return;

  const currentBranch = await currentGitBranch(projectRoot);
  const summaries = workflows.map((workflow) => formatWorkflowSummary(workflow, currentBranch));
  let message = summaries.length === 1
    ? summaries[0]
    : `Active workflows (${summaries.length}):\n\n${summaries.join('\n\n')}`;

  // Advisory (RENDER-DISPATCH-PLAN): if the last render dispatch couldn't reach
  // the hub and view renders are queued, tell the user — their dashboard is
  // lagging until a daemon drains the queue.
  const advisory = pendingRenderAdvisory(projectRoot, config);
  if (advisory) message += `\n\n${advisory}`;

  outputSystemMessage(message);
}

// One-line advisory when hook-reported renders are queued AND the last
// ensure/drain recorded the hub as unreachable. Keys off a real failure signal
// (.status.json lastError), not merely a non-zero pending count, so the bootstrap
// we just enqueued this session doesn't trigger a false warning when the hub is
// healthy. Never throws.
function pendingRenderAdvisory(projectRoot, config) {
  try {
    if ((config.view?.renderDispatch ?? 'hub') !== 'hub') return null;
    const viewRoot = resolve(projectRoot, '.ai', '_view');
    const status = readStatus(viewRoot);
    if (!status?.lastError) return null;
    const pending = countPending(viewRoot);
    if (pending <= 0) return null;
    return `⚠ ${pending} view render(s) pending — ${status.lastError}. The dashboard will refresh once the hub drains the queue; start it (or run \`render-sunflower\`) to refresh now.`;
  } catch {
    return null;
  }
}

// Re-point an ENABLED tray autostart launcher at THIS plugin's tray bundle (and a
// durable node path) from this headless session-start context. The tray's own
// refreshAutostart (scripts/tray.mjs) only runs once the tray is alive — but a
// launcher left pointing at a prior version's bundle after an upgrade can't start
// the tray, so it never self-heals (chicken-and-egg). Healing it here closes that
// loop: every session start re-stamps the launcher to the current version, so the
// next logon launches the right tray. No-op when autostart is disabled (never
// creates a launcher uninvited) or already current. Fail-open — orientation must
// never break on this.
function healAutostartLauncher() {
  try {
    if (!isAutostartEnabled()) return;
    refreshAutostart({ trayBundle: resolveEntrypoint(PLUGIN_ROOT, 'tray') });
  } catch {
    // best-effort; session orientation must remain fail-open.
  }
}

function startBootstrap(projectRoot, config) {
  if (process.env.SDLC_DISABLE_BOOTSTRAP === '1') return;
  if (config.view?.bootstrap?.enabled === false) return;
  const dispatch = config.view?.renderDispatch ?? 'hub';

  // 'inline' (rollback): spawn the bootstrap render directly, as before.
  if (dispatch === 'inline') {
    try {
      spawnDetachedNode(
        resolveEntrypoint(PLUGIN_ROOT, 'render-sunflower'),
        ['--bootstrap', '--plugin-root', PLUGIN_ROOT],
        { cwd: projectRoot, env: process.env },
      );
    } catch {
      // Session orientation must remain fail-open.
    }
    return;
  }

  // 'hub' (default): enqueue a whole-repo bootstrap freshness pass + best-effort,
  // detached ensure-hub (which also registers the repo so the hub iterates it).
  // The hub renders it on its startup catch-up / next reconcile tick.
  try {
    const viewRoot = resolve(projectRoot, '.ai', '_view');
    mkdirSync(viewRoot, { recursive: true });
    enqueue(viewRoot, {
      repoRoot: projectRoot,
      kind: 'bootstrap',
      bucket: '__bootstrap__',
      enqueuedBy: { host: 'claude', pid: process.pid },
    }, { maxPending: config.view?.renderQueue?.maxPending });

    if (config.view?.ensureHubOnWrite !== false && process.env.SDLC_DISABLE_ENSURE_HUB !== '1') {
      spawnDetachedNode(
        resolveEntrypoint(PLUGIN_ROOT, 'hub-ensure'),
        ['--plugin-root', PLUGIN_ROOT, '--project-root', projectRoot, '--view', viewRoot],
        { cwd: projectRoot, env: process.env },
      );
    }
  } catch {
    // Session orientation must remain fail-open.
  }
}

function formatWorkflowSummary(workflow, currentBranch) {
  const fm = workflow.frontmatter ?? {};
  let summary = `Active workflow: ${workflow.slug}`;
  if (fm.title) summary += ` - ${fm.title}`;
  if (fm['current-stage']) summary += `\n  Stage: ${fm['current-stage']}`;
  if (fm['stage-status']) summary += ` (${fm['stage-status']})`;

  const selectedSlice = fm['selected-slice-or-focus'] ?? fm['selected-slice'];
  if (selectedSlice) summary += `\n  Slice: ${selectedSlice}`;

  const strategy = fm['branch-strategy'];
  if (strategy && strategy !== 'none') {
    const branch = fm.branch;
    let branchLine = `  Branch: ${branch || 'unknown'}`;
    if (currentBranch && branch) {
      branchLine += currentBranch === branch
        ? ' (on correct branch)'
        : ` (current: ${currentBranch} - WRONG BRANCH)`;
    }
    if (fm['base-branch']) branchLine += `, base: ${fm['base-branch']}`;
    summary += `\n${branchLine}`;
  }

  if (fm['pr-url']) summary += `\n  PR: ${fm['pr-url']}`;

  const nextInvocation = fm['recommended-next-invocation'] ?? fm['next-invocation'];
  const nextCommand = fm['recommended-next-command'] ?? fm['next-command'];
  if (nextInvocation) {
    summary += `\n  Next: ${nextInvocation}`;
  } else if (nextCommand) {
    summary += `\n  Next: /${nextCommand} ${workflow.slug}`;
  }

  const openQuestions = stringifyField(fm['open-questions']);
  if (openQuestions && openQuestions !== '[]' && openQuestions !== 'none') {
    summary += `\n  Open questions: ${openQuestions}`;
  }

  return summary;
}

main().catch(async (err) => {
  try {
    await logError('session-start-orient', err);
  } catch {
    // ignore logging failures
  }
  process.exit(0);
});
