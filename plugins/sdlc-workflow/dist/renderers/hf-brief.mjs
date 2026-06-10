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

// renderers/hf-brief.mjs
var render = laneRenderer({
  title: "Hotfix \xB7 brief",
  lede: (fm) => fm.symptom,
  metricFields: [
    { key: "impact", label: "impact", tone: "warn" },
    { key: "affected-scope", label: "scope", tone: "info" }
  ]
});
export {
  render
};
