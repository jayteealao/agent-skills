import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-N4FWWIMJ.mjs";
import "../chunk-YVS5HJJI.mjs";
import "../chunk-M4L3PWUR.mjs";
import "../chunk-U4XWDSQ3.mjs";
import "../chunk-3RXHOXIK.mjs";
import "../chunk-CGSPUUFD.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/investigate.mjs
var render = laneRenderer({
  title: "Investigation",
  lede: (fm) => fm["problem-statement"],
  metricFields: [
    { key: "option-count", label: "options", tone: "info" }
  ]
});
export {
  render
};
