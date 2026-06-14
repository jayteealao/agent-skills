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

// renderers/dep-plan.mjs
var render = laneRenderer({
  title: "Deps \xB7 plan",
  metricFields: [
    { key: "p0-count", label: "P0 security", tone: "bad" },
    { key: "p1-count", label: "P1 major", tone: "warn" },
    { key: "p2-count", label: "P2 safe", tone: "info" },
    { key: "hold-count", label: "hold", tone: "info" }
  ]
});
export {
  render
};
