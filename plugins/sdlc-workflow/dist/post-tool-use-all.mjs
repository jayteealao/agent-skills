#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  run
} from "./chunk-JYH4NFHC.mjs";
import {
  run as run2
} from "./chunk-JMT7RA6C.mjs";
import "./chunk-CI2GKFZ3.mjs";
import "./chunk-AZ4QRSJA.mjs";
import "./chunk-GKIHU4J2.mjs";
import {
  run as run3
} from "./chunk-JJWLXOGQ.mjs";
import "./chunk-RYYEEV4S.mjs";
import "./chunk-CGSPUUFD.mjs";
import "./chunk-7SZUI3YK.mjs";
import "./chunk-K6PBZI5W.mjs";
import "./chunk-KRRL2TSM.mjs";
import {
  runFolded
} from "./chunk-SRV7YICD.mjs";
import "./chunk-YYMENX7Z.mjs";
import "./chunk-ILGBSRGY.mjs";
import "./chunk-QUEAOP62.mjs";
import "./chunk-I652ARYO.mjs";
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
