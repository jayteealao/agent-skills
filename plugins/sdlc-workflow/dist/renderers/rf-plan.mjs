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

// renderers/rf-plan.mjs
var render = laneRenderer({
  title: "Refactor \xB7 plan",
  metricFields: [
    { key: "step-count", label: "steps", tone: "info" },
    { key: "pattern-used", label: "pattern", tone: "info" },
    { key: "api-surface-changes", label: "api changes", tone: "warn" }
  ]
});
export {
  render
};
