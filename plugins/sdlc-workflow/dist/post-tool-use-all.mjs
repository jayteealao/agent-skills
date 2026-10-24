#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  run
} from "./chunk-EJT7TGFH.mjs";
import {
  run as run2
} from "./chunk-F7WSYQ4P.mjs";
import "./chunk-CI2GKFZ3.mjs";
import "./chunk-AZ4QRSJA.mjs";
import "./chunk-ZQSE2SVB.mjs";
import "./chunk-JTJFHSOY.mjs";
import {
  run as run3
} from "./chunk-SHIOZ53A.mjs";
import "./chunk-47R6CSZC.mjs";
import "./chunk-CGSPUUFD.mjs";
import "./chunk-BACBQ62E.mjs";
import "./chunk-K6PBZI5W.mjs";
import "./chunk-KRRL2TSM.mjs";
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

// hooks/post-tool-use-all.mjs
function planPostToolUse() {
  return [
    ["post-write-auto-stage", run],
    ["post-write-verify", run2, { failClosed: true }],
    ["post-write-render", run3]
  ];
}
runFolded("post-tool-use-all", planPostToolUse, { stopOnBlock: false });
export {
  planPostToolUse
};
