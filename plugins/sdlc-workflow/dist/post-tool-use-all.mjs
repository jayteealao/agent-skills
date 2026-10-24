#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  run
} from "./chunk-L56KETU5.mjs";
import {
  run as run2
} from "./chunk-XYMVWOCR.mjs";
import "./chunk-AZ4QRSJA.mjs";
import "./chunk-CI2GKFZ3.mjs";
import "./chunk-3O7UYQ5X.mjs";
import "./chunk-LJCAG37B.mjs";
import "./chunk-R35WUHOB.mjs";
import {
  runFolded
} from "./chunk-FATSKH6O.mjs";
import "./chunk-YE4HRDEF.mjs";
import "./chunk-DS4JUPRY.mjs";
import "./chunk-TIGAJNZN.mjs";
import "./chunk-BSVWX5RF.mjs";
import "./chunk-ZGVOYTOL.mjs";

// hooks/post-tool-use-all.mjs
function planPostToolUse() {
  return [
    ["post-write-auto-stage", run],
    ["post-write-verify", run2, { failClosed: true }]
  ];
}
runFolded("post-tool-use-all", planPostToolUse, { stopOnBlock: false });
export {
  planPostToolUse
};
