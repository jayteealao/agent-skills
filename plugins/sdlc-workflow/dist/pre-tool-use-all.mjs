#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  run
} from "./chunk-4SQHXLR3.mjs";
import {
  run as run2
} from "./chunk-OJ7XYU52.mjs";
import {
  run as run3
} from "./chunk-5CWHPGY2.mjs";
import "./chunk-BHJIRDNF.mjs";
import {
  runFolded
} from "./chunk-ZVYCLTPL.mjs";
import "./chunk-Z76NJHKM.mjs";
import "./chunk-KVCYXUV7.mjs";
import "./chunk-DOKC4AFB.mjs";
import "./chunk-XLUSO7MY.mjs";
import "./chunk-O3FUA7PQ.mjs";
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
