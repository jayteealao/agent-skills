#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  run
} from "./chunk-63OSOI3Z.mjs";
import {
  run as run2
} from "./chunk-GXGTTPLI.mjs";
import {
  run as run3
} from "./chunk-YFP5OCU3.mjs";
import "./chunk-WIOD7AIL.mjs";
import "./chunk-EQC6XDOG.mjs";
import "./chunk-LZJA3HOL.mjs";
import "./chunk-K6PBZI5W.mjs";
import "./chunk-KRRL2TSM.mjs";
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
