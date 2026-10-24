#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  run
} from "./chunk-EWO2SNYE.mjs";
import "./chunk-2NDPLZOO.mjs";
import "./chunk-XRORYZXI.mjs";
import {
  run as run2
} from "./chunk-KDWENTFH.mjs";
import {
  run as run3
} from "./chunk-5OPLDUFH.mjs";
import "./chunk-OEHIMFRM.mjs";
import "./chunk-LJCAG37B.mjs";
import "./chunk-3O7UYQ5X.mjs";
import "./chunk-R35WUHOB.mjs";
import {
  runFolded
} from "./chunk-YFQS2JIK.mjs";
import "./chunk-TEDDSG5T.mjs";
import "./chunk-UR5JS5PH.mjs";
import "./chunk-DS4JUPRY.mjs";
import "./chunk-TIGAJNZN.mjs";
import "./chunk-BSVWX5RF.mjs";
import "./chunk-ZGVOYTOL.mjs";

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
