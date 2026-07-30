import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-PP5DTX47.mjs";
import "../chunk-XVERJEB5.mjs";
import "../chunk-245EJ2VL.mjs";
import "../chunk-QSMKFKMI.mjs";
import "../chunk-4WRIEOIP.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/discover.mjs
var render = laneRenderer({
  title: "Discovery",
  lede: (fm) => fm.hypothesis,
  metricFields: [
    { key: "verdict", label: "verdict", tone: "info" },
    { key: "confidence", label: "confidence", tone: "info" },
    { key: "recommended-next", label: "next", tone: "info" }
  ]
});
export {
  render
};
