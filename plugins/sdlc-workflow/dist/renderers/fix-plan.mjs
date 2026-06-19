import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-S4SC43JI.mjs";
import "../chunk-X7WWQU6R.mjs";
import "../chunk-VGPXFJ55.mjs";
import "../chunk-PVOPIC7E.mjs";
import "../chunk-4WRIEOIP.mjs";
import "../chunk-LFGT2BKG.mjs";
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
