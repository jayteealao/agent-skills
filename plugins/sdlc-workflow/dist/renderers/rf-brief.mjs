import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-AGXWJQ6L.mjs";
import "../chunk-FMAJ6EBW.mjs";
import "../chunk-3GHD3DNQ.mjs";
import "../chunk-32BBY5UE.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-4WRIEOIP.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/rf-brief.mjs
var render = laneRenderer({
  title: "Refactor \xB7 brief",
  lede: (fm) => fm.goal,
  metricFields: [
    { key: "existing-coverage", label: "coverage", tone: "info" }
  ]
});
export {
  render
};
