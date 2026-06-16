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
