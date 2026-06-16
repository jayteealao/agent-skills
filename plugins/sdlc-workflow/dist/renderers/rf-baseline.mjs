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

// renderers/rf-baseline.mjs
var render = laneRenderer({
  title: "Refactor \xB7 baseline",
  metricFields: [
    { key: "tests-passing", label: "passing", tone: "ok" },
    { key: "tests-failing", label: "failing", tone: "bad" },
    { key: "tests-skipped", label: "skipped", tone: "info" },
    { key: "caller-count", label: "callers", tone: "info" }
  ]
});
export {
  render
};
