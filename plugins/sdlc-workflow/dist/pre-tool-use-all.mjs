#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  run
} from "./chunk-WGL4257E.mjs";
import "./chunk-2NDPLZOO.mjs";
import "./chunk-WAHMOTHP.mjs";
import {
  run as run2
} from "./chunk-LQWLPDKX.mjs";
import {
  run as run3
} from "./chunk-YFKTY5MV.mjs";
import "./chunk-OEHIMFRM.mjs";
import "./chunk-3O7UYQ5X.mjs";
import "./chunk-LJCAG37B.mjs";
import "./chunk-R35WUHOB.mjs";
import {
  runFolded
} from "./chunk-BZC7UJKK.mjs";
import "./chunk-P7Y6FJOM.mjs";
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
