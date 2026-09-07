#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  run
} from "./chunk-U3FUVLDD.mjs";
import {
  run as run2
} from "./chunk-CM34BU7T.mjs";
import {
  run as run3
} from "./chunk-OQDE7Q4K.mjs";
import "./chunk-JM633JQP.mjs";
import "./chunk-EQC6XDOG.mjs";
import "./chunk-QHIBXSRO.mjs";
import "./chunk-K6PBZI5W.mjs";
import "./chunk-KRRL2TSM.mjs";
import {
  runFolded
} from "./chunk-2AHSIRRU.mjs";
import "./chunk-Z76NJHKM.mjs";
import "./chunk-BHTZZLQM.mjs";
import "./chunk-DOKC4AFB.mjs";
import "./chunk-YVM64S7E.mjs";
import "./chunk-RV4GKXDG.mjs";
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
