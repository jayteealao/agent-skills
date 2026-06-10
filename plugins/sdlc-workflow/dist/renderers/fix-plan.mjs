import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-RCD27UZJ.mjs";
import "../chunk-D4YORFGD.mjs";
import "../chunk-46VHMONS.mjs";
import "../chunk-YVOPQ7Y3.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-4WRIEOIP.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

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
