#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  isAutostartEnabled,
  refreshAutostart
} from "./chunk-ERHYJB4B.mjs";
import {
  currentGitBranch,
  outputSystemMessage,
  projectRootFromInput,
  readStdinJson,
  stringifyField
} from "./chunk-LC2YZRHK.mjs";
import {
  logError
} from "./chunk-SCQPZLF2.mjs";
import {
  ensureHubEnabled,
  spawnHubEnsure
} from "./chunk-L6EQJGVG.mjs";
import "./chunk-UTP6CBAZ.mjs";
import {
  spawnDetachedNode
} from "./chunk-K6PBZI5W.mjs";
import {
  loadConfig
} from "./chunk-ZMYLXAL2.mjs";
import {
  countPending,
  enqueue,
  readStatus,
  resolveEntrypoint,
  sdlcHomeDir
} from "./chunk-DVISHXT5.mjs";
import {
  activeWorkflowIndexes,
  scanWorkflowIndexes
} from "./chunk-NTSUEAI6.mjs";
import "./chunk-5U76735W.mjs";
import "./chunk-FZ2GR6GF.mjs";
import "./chunk-LFGT2BKG.mjs";
import "./chunk-SGA7NFMW.mjs";

// hooks/session-start-orient.mjs
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
var __dirname = dirname(fileURLToPath(import.meta.url));
var PLUGIN_ROOT = resolve(__dirname, "..");
async function main() {
  if (process.env.CLAUDE_PLUGIN_INSTALL === "1") return;
  if (process.env.SDLC_DISPATCH_ACTIVE === "1") return;
  const input = await readStdinJson();
  const projectRoot = projectRootFromInput(input);
  const config = await loadConfig(projectRoot);
  startBootstrap(projectRoot, config);
  healAutostartLauncher();
  healRunningTray();
  const workflows = activeWorkflowIndexes(await scanWorkflowIndexes({ projectRoot }));
  if (!workflows.length) return;
  const currentBranch = await currentGitBranch(projectRoot);
  const summaries = workflows.map((workflow) => formatWorkflowSummary(workflow, currentBranch));
  let message = summaries.length === 1 ? summaries[0] : `Active workflows (${summaries.length}):

${summaries.join("\n\n")}`;
  const advisory = pendingRenderAdvisory(projectRoot, config);
  if (advisory) message += `

${advisory}`;
  outputSystemMessage(message);
}
function pendingRenderAdvisory(projectRoot, config) {
  try {
    if ((config.view?.renderDispatch ?? "hub") !== "hub") return null;
    const viewRoot = resolve(projectRoot, ".ai", "_view");
    const status = readStatus(viewRoot);
    if (!status?.lastError) return null;
    const pending = countPending(viewRoot);
    if (pending <= 0) return null;
    return `\u26A0 ${pending} view render(s) pending \u2014 ${status.lastError}. The dashboard will refresh once the hub drains the queue; start it (or run \`render-sunflower\`) to refresh now.`;
  } catch {
    return null;
  }
}
function healAutostartLauncher() {
  try {
    if (!isAutostartEnabled()) return;
    refreshAutostart({ trayBundle: resolveEntrypoint(PLUGIN_ROOT, "tray") });
  } catch {
  }
}
function healRunningTray() {
  try {
    if (process.env.SDLC_DISABLE_TRAY_HEAL === "1") return;
    if (process.platform !== "win32") return;
    if (!isAutostartEnabled()) return;
    if (!trayHealDue()) return;
    spawnDetachedNode(resolveEntrypoint(PLUGIN_ROOT, "tray-heal"), [], { cwd: PLUGIN_ROOT, env: process.env });
  } catch {
  }
}
var TRAY_HEAL_DEBOUNCE_MS = 6e4;
function trayHealDue(now = Date.now()) {
  try {
    const marker = join(sdlcHomeDir(), ".tray-heal");
    try {
      const age = now - statSync(marker).mtimeMs;
      if (age >= 0 && age < TRAY_HEAL_DEBOUNCE_MS) return false;
    } catch {
    }
    writeFileSync(marker, `${now}
`, "utf-8");
    return true;
  } catch {
    return false;
  }
}
function startBootstrap(projectRoot, config) {
  if (process.env.SDLC_DISABLE_BOOTSTRAP === "1") return;
  if (config.view?.bootstrap?.enabled === false) return;
  const dispatch = config.view?.renderDispatch ?? "hub";
  if (dispatch === "inline") {
    try {
      spawnDetachedNode(
        resolveEntrypoint(PLUGIN_ROOT, "render-sunflower"),
        ["--bootstrap", "--plugin-root", PLUGIN_ROOT],
        { cwd: projectRoot, env: process.env }
      );
    } catch {
    }
    return;
  }
  try {
    const viewRoot = resolve(projectRoot, ".ai", "_view");
    mkdirSync(viewRoot, { recursive: true });
    enqueue(viewRoot, {
      repoRoot: projectRoot,
      kind: "bootstrap",
      bucket: "__bootstrap__",
      enqueuedBy: { host: "claude", pid: process.pid }
    }, { maxPending: config.view?.renderQueue?.maxPending });
    if (ensureHubEnabled(config.view)) {
      spawnHubEnsure({ pluginRoot: PLUGIN_ROOT, projectRoot, viewDir: viewRoot });
    }
  } catch {
  }
}
function formatWorkflowSummary(workflow, currentBranch) {
  const fm = workflow.frontmatter ?? {};
  let summary = `Active workflow: ${workflow.slug}`;
  if (fm.title) summary += ` - ${fm.title}`;
  if (fm["current-stage"]) summary += `
  Stage: ${fm["current-stage"]}`;
  if (fm["stage-status"]) summary += ` (${fm["stage-status"]})`;
  const selectedSlice = fm["selected-slice-or-focus"] ?? fm["selected-slice"];
  if (selectedSlice) summary += `
  Slice: ${selectedSlice}`;
  const strategy = fm["branch-strategy"];
  if (strategy && strategy !== "none") {
    const branch = fm.branch;
    let branchLine = `  Branch: ${branch || "unknown"}`;
    if (currentBranch && branch) {
      branchLine += currentBranch === branch ? " (on correct branch)" : ` (current: ${currentBranch} - WRONG BRANCH)`;
    }
    if (fm["base-branch"]) branchLine += `, base: ${fm["base-branch"]}`;
    summary += `
${branchLine}`;
  }
  if (fm["pr-url"]) summary += `
  PR: ${fm["pr-url"]}`;
  const nextInvocation = fm["recommended-next-invocation"] ?? fm["next-invocation"];
  const nextCommand = fm["recommended-next-command"] ?? fm["next-command"];
  if (nextInvocation) {
    summary += `
  Next: ${nextInvocation}`;
  } else if (nextCommand) {
    summary += `
  Next: /${nextCommand} ${workflow.slug}`;
  }
  const openQuestions = stringifyField(fm["open-questions"]);
  if (openQuestions && openQuestions !== "[]" && openQuestions !== "none") {
    summary += `
  Open questions: ${openQuestions}`;
  }
  return summary;
}
main().catch(async (err) => {
  try {
    await logError("session-start-orient", err);
  } catch {
  }
  process.exit(0);
});
