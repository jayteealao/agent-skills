import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-G2ZSY6WC.mjs";
import "../chunk-6F3J7CCL.mjs";
import "../chunk-VGNHSPZH.mjs";
import "../chunk-6MTQED5X.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-4WRIEOIP.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/hf-plan.mjs
var render = laneRenderer({
  title: "Hotfix \xB7 plan",
  metricFields: [
    { key: "step-count", label: "steps", tone: "info" },
    { key: "data-remediation-needed", label: "data remediation", tone: "warn" }
  ]
});
export {
  render
};
