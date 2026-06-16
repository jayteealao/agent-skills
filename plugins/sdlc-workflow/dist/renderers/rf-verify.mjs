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

// renderers/rf-verify.mjs
var render = laneRenderer({
  title: "Refactor \xB7 verify",
  metricFields: [
    { key: "result", label: "result", tone: "info" },
    { key: "baseline-tests-pass", label: "baseline pass", tone: "info" },
    { key: "post-refactor-tests-pass", label: "post pass", tone: "ok" },
    { key: "api-surface-identical", label: "api identical", tone: "ok" }
  ]
});
export {
  render
};
