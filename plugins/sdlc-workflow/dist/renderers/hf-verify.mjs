import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-VTSIYY3H.mjs";
import "../chunk-JR76U6AX.mjs";
import "../chunk-GHAL7GD5.mjs";
import "../chunk-KVPDAGUS.mjs";
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
