#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  run
} from "./chunk-P7SDIU7Y.mjs";
import {
  run as run2
} from "./chunk-ILHRWS2J.mjs";
import {
  run as run3
} from "./chunk-Q7JC33XH.mjs";
import "./chunk-BHJIRDNF.mjs";
import {
  runFolded
} from "./chunk-3SWSVG7U.mjs";
import "./chunk-Z76NJHKM.mjs";
import "./chunk-DFFTFQDP.mjs";
import "./chunk-DOKC4AFB.mjs";
import "./chunk-XLUSO7MY.mjs";
import "./chunk-KXEWPJJ7.mjs";
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
