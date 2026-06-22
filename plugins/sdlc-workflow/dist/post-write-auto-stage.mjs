#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  gitAdd,
  isInsideWorkflowArtifacts,
  projectRootFromInput,
  readStdinJson
} from "./chunk-LC2YZRHK.mjs";
import {
  logError
} from "./chunk-SCQPZLF2.mjs";
import "./chunk-UTP6CBAZ.mjs";
import {
  loadConfig
} from "./chunk-ZMYLXAL2.mjs";
import {
  scanWorkflowIndexes
} from "./chunk-NTSUEAI6.mjs";
import "./chunk-5U76735W.mjs";
import "./chunk-FZ2GR6GF.mjs";
import "./chunk-LFGT2BKG.mjs";
import "./chunk-SGA7NFMW.mjs";

// hooks/post-write-auto-stage.mjs
import { existsSync } from "node:fs";
import { join } from "node:path";
async function main() {
  if (process.env.CLAUDE_PLUGIN_INSTALL === "1") return;
  const input = await readStdinJson();
  const projectRoot = projectRootFromInput(input);
  const config = await loadConfig(projectRoot);
  if (config.hooks.autoStage === false) return;
  if (existsSync(join(projectRoot, ".ai", ".no-auto-stage"))) return;
  if (!existsSync(join(projectRoot, ".ai", "workflows"))) return;
  const filePath = input?.tool_input?.file_path;
  if (!filePath) return;
  if (isInsideWorkflowArtifacts(filePath)) return;
  const workflows = await scanWorkflowIndexes({ projectRoot });
  const hasImplementWorkflow = workflows.some((workflow) => {
    const strategy = workflow.frontmatter?.["branch-strategy"];
    return workflow.isActive && workflow.currentStage === "implement" && (strategy === "dedicated" || strategy === "shared");
  });
  if (!hasImplementWorkflow) return;
  await gitAdd(projectRoot, filePath);
}
main().catch(async (err) => {
  try {
    await logError("post-write-auto-stage", err);
  } catch {
  }
}).finally(() => {
  process.exit(0);
});
