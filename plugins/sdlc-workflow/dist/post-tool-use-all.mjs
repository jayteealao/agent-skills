#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  run
} from "./chunk-2VRFZE4I.mjs";
import {
  run as run2
} from "./chunk-MCSG373J.mjs";
import "./chunk-4HMFV4P2.mjs";
import {
  run as run3
} from "./chunk-DPVMJYID.mjs";
import "./chunk-RI5SKTSH.mjs";
import "./chunk-CGSPUUFD.mjs";
import "./chunk-MPQEZDIA.mjs";
import "./chunk-K6PBZI5W.mjs";
import "./chunk-KRRL2TSM.mjs";
import {
  runFolded
} from "./chunk-QAWMADB5.mjs";
import "./chunk-YYMENX7Z.mjs";
import "./chunk-7IIQGNPM.mjs";
import "./chunk-KNXRJRUP.mjs";
import "./chunk-JNFVGADR.mjs";
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
