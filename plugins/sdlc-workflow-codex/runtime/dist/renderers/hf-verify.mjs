import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-7OCKWBEF.mjs";
import "../chunk-BBWH3K5O.mjs";
import "../chunk-JSXOG6GY.mjs";
import "../chunk-HCXJSDRK.mjs";
import "../chunk-4WRIEOIP.mjs";
import "../chunk-LFGT2BKG.mjs";
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
