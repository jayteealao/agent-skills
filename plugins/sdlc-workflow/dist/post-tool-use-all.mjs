#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  run
} from "./chunk-U4HUO674.mjs";
import {
  run as run2
} from "./chunk-ASAZ47L5.mjs";
import {
  run as run3
} from "./chunk-Y53E4JZF.mjs";
import "./chunk-NIWWFUVD.mjs";
import "./chunk-EQC6XDOG.mjs";
import "./chunk-4SHOXKGN.mjs";
import "./chunk-K6PBZI5W.mjs";
import "./chunk-KRRL2TSM.mjs";
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
