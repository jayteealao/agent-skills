#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  run
} from "./chunk-5FPH7TRN.mjs";
import "./chunk-OVTHNCY6.mjs";
import "./chunk-UBOP6VUB.mjs";
import "./chunk-5QUQXL7Q.mjs";
import {
  run as run2
} from "./chunk-5HFSSTPW.mjs";
import {
  run as run3
} from "./chunk-C7GFU6NW.mjs";
import "./chunk-7BEX7IM3.mjs";
import "./chunk-4HMFV4P2.mjs";
import {
  runFolded
} from "./chunk-6PEVRAGC.mjs";
import "./chunk-YYMENX7Z.mjs";
import "./chunk-PG46O7HW.mjs";
import "./chunk-QUEAOP62.mjs";
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
