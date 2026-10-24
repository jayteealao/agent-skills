#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  run
} from "./chunk-5O54QDVH.mjs";
import "./chunk-7EPCP4B5.mjs";
import {
  run as run2
} from "./chunk-T6KLXS3B.mjs";
import "./chunk-CI2GKFZ3.mjs";
import "./chunk-AZ4QRSJA.mjs";
import "./chunk-LJCAG37B.mjs";
import "./chunk-3O7UYQ5X.mjs";
import "./chunk-R35WUHOB.mjs";
import {
  runFolded
} from "./chunk-YFQS2JIK.mjs";
import "./chunk-TEDDSG5T.mjs";
import "./chunk-UR5JS5PH.mjs";
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
