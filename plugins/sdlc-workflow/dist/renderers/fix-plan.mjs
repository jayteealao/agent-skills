import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-5L5AMMTY.mjs";
import "../chunk-WSLT3R6C.mjs";
import "../chunk-ULKKJGJ3.mjs";
import "../chunk-MSJ2NCHW.mjs";
import "../chunk-BTT5W62B.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-KGLQRRIU.mjs";

// renderers/fix-plan.mjs
var render = laneRenderer({
  title: "Quick fix",
  lede: (fm) => fm.intent,
  metricFields: [
    { key: "estimated-steps", label: "steps", tone: "info" }
  ]
});
export {
  render
};
