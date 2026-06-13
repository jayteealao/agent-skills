import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-P6YOY473.mjs";
import "../chunk-TJIQVNDY.mjs";
import "../chunk-QBYHB6G7.mjs";
import "../chunk-RDFEVHOZ.mjs";
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
