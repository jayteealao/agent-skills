#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  run
} from "./chunk-6V745XD4.mjs";
import "./chunk-MUV6QL7A.mjs";
import "./chunk-U4PRGBEI.mjs";
import "./chunk-T5YC5F32.mjs";
import {
  run as run2
} from "./chunk-HK3EFXMP.mjs";
import {
  run as run3
} from "./chunk-O6Q7PFOH.mjs";
import "./chunk-OEHIMFRM.mjs";
import "./chunk-GKIHU4J2.mjs";
import {
  runFolded
} from "./chunk-BHLXNNOH.mjs";
import "./chunk-YYMENX7Z.mjs";
import "./chunk-4IHR673J.mjs";
import "./chunk-QUEAOP62.mjs";
import "./chunk-OVD25SAL.mjs";
import "./chunk-FZ2GR6GF.mjs";
import "./chunk-5U76735W.mjs";
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
