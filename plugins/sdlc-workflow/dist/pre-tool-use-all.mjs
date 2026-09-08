#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  run
} from "./chunk-4O2CME6E.mjs";
import {
  run as run2
} from "./chunk-NWPQ6YR4.mjs";
import {
  run as run3
} from "./chunk-Q2X5FZ4O.mjs";
import "./chunk-BHJIRDNF.mjs";
import {
  runFolded
} from "./chunk-5XCFZVDJ.mjs";
import "./chunk-Z76NJHKM.mjs";
import "./chunk-AOYZAFVW.mjs";
import "./chunk-DOKC4AFB.mjs";
import "./chunk-XLUSO7MY.mjs";
import "./chunk-5LBIJZHF.mjs";
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
