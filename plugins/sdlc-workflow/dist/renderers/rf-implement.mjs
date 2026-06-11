import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-3MTQEURK.mjs";
import "../chunk-K6PIKTF7.mjs";
import "../chunk-7C3X3TLC.mjs";
import "../chunk-P6EMQ23V.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-4WRIEOIP.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/rf-implement.mjs
var render = laneRenderer({
  title: "Refactor \xB7 implement",
  metricFields: [
    { key: "steps-completed", label: "completed", tone: "ok" },
    { key: "steps-failed", label: "failed", tone: "bad" },
    { key: "api-surface-changed", label: "api changed", tone: "warn" }
  ]
});
export {
  render
};
