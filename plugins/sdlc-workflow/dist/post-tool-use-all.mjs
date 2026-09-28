#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  run
} from "./chunk-JJPMJMGQ.mjs";
import {
  run as run2
} from "./chunk-GGRW4KCP.mjs";
import {
  run as run3
} from "./chunk-EQXGN632.mjs";
import "./chunk-NQ3YKNZA.mjs";
import "./chunk-CGSPUUFD.mjs";
import "./chunk-TNRU7QVJ.mjs";
import "./chunk-K6PBZI5W.mjs";
import "./chunk-KRRL2TSM.mjs";
import {
  runFolded
} from "./chunk-LNGIUQ2F.mjs";
import "./chunk-YYMENX7Z.mjs";
import "./chunk-XFYSNSWS.mjs";
import "./chunk-KNXRJRUP.mjs";
import "./chunk-XQW7VILZ.mjs";
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
