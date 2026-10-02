#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  run
} from "./chunk-QJ34Y7HV.mjs";
import {
  run as run2
} from "./chunk-OE2I5TQZ.mjs";
import "./chunk-4HMFV4P2.mjs";
import {
  run as run3
} from "./chunk-XWBW65G7.mjs";
import "./chunk-DH6HHLEG.mjs";
import "./chunk-CGSPUUFD.mjs";
import "./chunk-TIRARM56.mjs";
import "./chunk-K6PBZI5W.mjs";
import "./chunk-KRRL2TSM.mjs";
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
