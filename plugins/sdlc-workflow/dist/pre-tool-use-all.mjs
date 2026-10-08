#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  run
} from "./chunk-CBYXXXFC.mjs";
import "./chunk-2LIQGJ42.mjs";
import "./chunk-UBOP6VUB.mjs";
import "./chunk-5QUQXL7Q.mjs";
import {
  run as run2
} from "./chunk-H6L2ODXM.mjs";
import {
  run as run3
} from "./chunk-TRHODOEO.mjs";
import "./chunk-7BEX7IM3.mjs";
import "./chunk-4HMFV4P2.mjs";
import {
  runFolded
} from "./chunk-6PEVRAGC.mjs";
import "./chunk-YYMENX7Z.mjs";
import "./chunk-PG46O7HW.mjs";
import "./chunk-KNXRJRUP.mjs";
import "./chunk-J4EY6FXU.mjs";
import "./chunk-5U76735W.mjs";
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
