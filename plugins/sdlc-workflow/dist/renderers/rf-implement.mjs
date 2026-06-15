import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-EV6O77SG.mjs";
import "../chunk-6GWVKKG2.mjs";
import "../chunk-ZXXZROFY.mjs";
import "../chunk-PJSJRLI2.mjs";
import "../chunk-4WRIEOIP.mjs";
import "../chunk-LFGT2BKG.mjs";
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
