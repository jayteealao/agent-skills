import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-5S2ZRSHL.mjs";
import "../chunk-Y7F4BPUB.mjs";
import "../chunk-3WF6RHJV.mjs";
import "../chunk-T4MQEX5R.mjs";
import "../chunk-4WRIEOIP.mjs";
import "../chunk-LFGT2BKG.mjs";
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
