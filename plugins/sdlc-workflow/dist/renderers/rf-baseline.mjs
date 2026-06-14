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

// renderers/rf-baseline.mjs
var render = laneRenderer({
  title: "Refactor \xB7 baseline",
  metricFields: [
    { key: "tests-passing", label: "passing", tone: "ok" },
    { key: "tests-failing", label: "failing", tone: "bad" },
    { key: "tests-skipped", label: "skipped", tone: "info" },
    { key: "caller-count", label: "callers", tone: "info" }
  ]
});
export {
  render
};
