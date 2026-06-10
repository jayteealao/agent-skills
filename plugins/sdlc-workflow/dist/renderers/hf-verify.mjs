import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-2RFG6G6A.mjs";
import "../chunk-YAOZZWBS.mjs";
import "../chunk-556LQVZA.mjs";
import "../chunk-SFNXDR4Z.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-4WRIEOIP.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/hf-verify.mjs
var render = laneRenderer({
  title: "Hotfix \xB7 verify",
  metricFields: [
    { key: "result", label: "result", tone: "info" },
    { key: "symptom-confirmed-fixed", label: "symptom fixed", tone: "ok" },
    { key: "tests-pass", label: "tests", tone: "info" }
  ]
});
export {
  render
};
