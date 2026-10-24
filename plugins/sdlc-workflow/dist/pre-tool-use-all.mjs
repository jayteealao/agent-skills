#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  run
} from "./chunk-DFS3ZIGZ.mjs";
import "./chunk-Z6HTLQ6W.mjs";
import "./chunk-DW2YQRFR.mjs";
import {
  run as run2
} from "./chunk-NYOKRTVO.mjs";
import {
  run as run3
} from "./chunk-IPLQORDM.mjs";
import "./chunk-OEHIMFRM.mjs";
import "./chunk-ZQSE2SVB.mjs";
import "./chunk-JTJFHSOY.mjs";
import {
  runFolded
} from "./chunk-PGKNNQX4.mjs";
import "./chunk-YYMENX7Z.mjs";
import "./chunk-RMWRN4OY.mjs";
import "./chunk-QUEAOP62.mjs";
import "./chunk-S534URUW.mjs";
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
