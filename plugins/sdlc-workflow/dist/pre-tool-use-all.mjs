#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  run
} from "./chunk-I7M5UHOX.mjs";
import "./chunk-2NDPLZOO.mjs";
import "./chunk-XRORYZXI.mjs";
import {
  run as run2
} from "./chunk-OPW3BCG7.mjs";
import {
  run as run3
} from "./chunk-ZTBJSRGO.mjs";
import "./chunk-OEHIMFRM.mjs";
import "./chunk-3O7UYQ5X.mjs";
import "./chunk-LJCAG37B.mjs";
import "./chunk-R35WUHOB.mjs";
import {
  runFolded
} from "./chunk-NZ4BKMW5.mjs";
import "./chunk-MMR6SVFV.mjs";
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
