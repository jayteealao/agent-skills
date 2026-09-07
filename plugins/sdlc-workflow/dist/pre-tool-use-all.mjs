#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  run
} from "./chunk-EL5MFPFB.mjs";
import {
  run as run2
} from "./chunk-SSQTEUB6.mjs";
import {
  run as run3
} from "./chunk-THL32TB6.mjs";
import "./chunk-BHJIRDNF.mjs";
import {
  runFolded
} from "./chunk-2AHSIRRU.mjs";
import "./chunk-Z76NJHKM.mjs";
import "./chunk-BHTZZLQM.mjs";
import "./chunk-DOKC4AFB.mjs";
import "./chunk-YVM64S7E.mjs";
import "./chunk-RV4GKXDG.mjs";
import "./chunk-FZ2GR6GF.mjs";
import "./chunk-LFGT2BKG.mjs";
import "./chunk-SGA7NFMW.mjs";

// hooks/pre-tool-use-all.mjs
function planPreToolUse(input) {
  const ti = input?.tool_input ?? {};
  const stages = [];
  if (typeof ti.file_path === "string") {
    stages.push(["pre-write-validate", run]);
    stages.push(["leak-guard-write", run3]);
  }
  if (typeof ti.command === "string") stages.push(["leak-guard-bash", run2]);
  return stages;
}
runFolded("pre-tool-use-all", planPreToolUse, { stopOnBlock: true });
export {
  planPreToolUse
};
