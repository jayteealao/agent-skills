#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  run
} from "./chunk-EJQI2B2Z.mjs";
import {
  run as run2
} from "./chunk-NL46EEO2.mjs";
import "./chunk-7IP54LOR.mjs";
import {
  run as run3
} from "./chunk-PP55RKDI.mjs";
import "./chunk-VDBU23EK.mjs";
import "./chunk-CGSPUUFD.mjs";
import "./chunk-WSUMXP4J.mjs";
import "./chunk-K6PBZI5W.mjs";
import "./chunk-KRRL2TSM.mjs";
import {
  runFolded
} from "./chunk-6PEVRAGC.mjs";
import "./chunk-YYMENX7Z.mjs";
import "./chunk-PG46O7HW.mjs";
import "./chunk-QUEAOP62.mjs";
import "./chunk-J4EY6FXU.mjs";
import "./chunk-FZ2GR6GF.mjs";
import "./chunk-5U76735W.mjs";
import "./chunk-LFGT2BKG.mjs";
import "./chunk-SGA7NFMW.mjs";

// hooks/post-tool-use-all.mjs
function planPostToolUse() {
  return [
    ["post-write-auto-stage", run],
    ["post-write-verify", run2],
    ["post-write-render", run3]
  ];
}
runFolded("post-tool-use-all", planPostToolUse, { stopOnBlock: false });
export {
  planPostToolUse
};
