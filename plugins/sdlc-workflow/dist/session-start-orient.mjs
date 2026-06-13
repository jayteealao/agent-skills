#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  isAutostartEnabled,
  refreshAutostart
} from "./chunk-BUQPB4LT.mjs";
import {
  currentGitBranch,
  logError,
  outputSystemMessage,
  projectRootFromInput,
  readStdinJson,
  stringifyField
} from "./chunk-4OZLXOMA.mjs";
import {
  loadConfig
} from "./chunk-H5U2H73C.mjs";
import {
  spawnDetachedNode
} from "./chunk-HQR34SES.mjs";
import {
  activeWorkflowIndexes,
  scanWorkflowIndexes
} from "./chunk-NTSUEAI6.mjs";
import "./chunk-5U76735W.mjs";
import "./chunk-LFGT2BKG.mjs";
import "./chunk-UTP6CBAZ.mjs";
import "./chunk-FZ2GR6GF.mjs";
import {
  resolveEntrypoint
} from "./chunk-KRRL2TSM.mjs";
import "./chunk-SGA7NFMW.mjs";

// hooks/session-start-orient.mjs
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
var __dirname = dirname(fileURLToPath(import.meta.url));
var PLUGIN_ROOT = resolve(__dirname, "..");
async function main() {
  if (process.env.CLAUDE_PLUGIN_INSTALL === "1") return;
  const input = await readStdinJson();
  const projectRoot = projectRootFromInput(input);
  const config = await loadConfig(projectRoot);
  startBootstrap(projectRoot, config);
  healAutostartLauncher();
  const workflows = activeWorkflowIndexes(await scanWorkflowIndexes({ projectRoot }));
  if (!workflows.length) return;
  const currentBranch = await currentGitBranch(projectRoot);
  const summaries = workflows.map((workflow) => formatWorkflowSummary(workflow, currentBranch));
  outputSystemMessage(summaries.length === 1 ? summaries[0] : `Active workflows (${summaries.length}):

${summaries.join("\n\n")}`);
}
function healAutostartLauncher() {
  try {
    if (!isAutostartEnabled()) return;
    refreshAutostart({ trayBundle: resolveEntrypoint(PLUGIN_ROOT, "tray") });
  } catch {
  }
}
function startBootstrap(projectRoot, config) {
  if (process.env.SDLC_DISABLE_BOOTSTRAP === "1") return;
  if (config.view?.bootstrap?.enabled === false) return;
  try {
    spawnDetachedNode(
      resolveEntrypoint(PLUGIN_ROOT, "render-sunflower"),
      ["--bootstrap", "--plugin-root", PLUGIN_ROOT],
      { cwd: projectRoot, env: process.env }
    );
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
