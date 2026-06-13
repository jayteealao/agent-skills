import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-UQIRE523.mjs";
import "../chunk-EIDZLZPA.mjs";
import "../chunk-I4RNJFXK.mjs";
import "../chunk-UL7P67Q2.mjs";
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
