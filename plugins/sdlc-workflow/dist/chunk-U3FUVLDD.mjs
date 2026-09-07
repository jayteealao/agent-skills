import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  isEntry,
  runStandalone
} from "./chunk-2AHSIRRU.mjs";
import {
  collectToolInputPaths,
  gitAdd,
  isInsideWorkflowArtifacts,
  projectRootFromInput
} from "./chunk-Z76NJHKM.mjs";
import {
  loadConfig
} from "./chunk-YVM64S7E.mjs";
import {
  scanWorkflowIndexes
} from "./chunk-RV4GKXDG.mjs";

// hooks/post-write-auto-stage.mjs
import { existsSync } from "node:fs";
import { join } from "node:path";
async function run(input) {
  const projectRoot = projectRootFromInput(input);
  const config = await loadConfig(projectRoot);
  if (config.hooks.autoStage === false) return;
  if (existsSync(join(projectRoot, ".ai", ".no-auto-stage"))) return;
  if (!existsSync(join(projectRoot, ".ai", "workflows"))) return;
  const filePaths = collectToolInputPaths(input).filter((p) => !isInsideWorkflowArtifacts(p));
  if (!filePaths.length) return;
  const workflows = await scanWorkflowIndexes({ projectRoot });
  const hasImplementWorkflow = workflows.some((workflow) => {
    const strategy = workflow.frontmatter?.["branch-strategy"];
    return workflow.isActive && workflow.currentStage === "implement" && (strategy === "dedicated" || strategy === "shared");
  });
  if (!hasImplementWorkflow) return;
  for (const filePath of filePaths) await gitAdd(projectRoot, filePath);
}
if (isEntry("post-write-auto-stage")) runStandalone("post-write-auto-stage", run);

export {
  run
};
