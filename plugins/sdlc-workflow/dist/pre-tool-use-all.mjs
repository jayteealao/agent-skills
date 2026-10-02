#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  run
} from "./chunk-O22HF2DQ.mjs";
import "./chunk-BXBMR76N.mjs";
import {
  run as run2
} from "./chunk-KXIIHXOZ.mjs";
import {
  run as run3
} from "./chunk-47TNUIBH.mjs";
import "./chunk-26W7OXX4.mjs";
import "./chunk-4HMFV4P2.mjs";
import {
  runFolded
} from "./chunk-TYIVWWNW.mjs";
import "./chunk-YYMENX7Z.mjs";
import "./chunk-3REOQAKO.mjs";
import "./chunk-KNXRJRUP.mjs";
import "./chunk-6KXVCHJL.mjs";
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
