#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  run
} from "./chunk-54NYG6RU.mjs";
import "./chunk-MUV6QL7A.mjs";
import "./chunk-U4PRGBEI.mjs";
import "./chunk-T5YC5F32.mjs";
import {
  run as run2
} from "./chunk-6S6FDFMO.mjs";
import {
  run as run3
} from "./chunk-G6DLSSJQ.mjs";
import "./chunk-OEHIMFRM.mjs";
import "./chunk-GKIHU4J2.mjs";
import {
  runFolded
} from "./chunk-JZ7FCJ3B.mjs";
import "./chunk-YYMENX7Z.mjs";
import "./chunk-GOXWGGLN.mjs";
import "./chunk-QUEAOP62.mjs";
import "./chunk-GUVQYSNY.mjs";
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
