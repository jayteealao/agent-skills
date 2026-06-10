import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-NMYDQTWY.mjs";
import "../chunk-JBFGCKL3.mjs";
import "../chunk-JG2HXKMN.mjs";
import "../chunk-UFJT6WFJ.mjs";
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
