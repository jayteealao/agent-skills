import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-AGXWJQ6L.mjs";
import "../chunk-FMAJ6EBW.mjs";
import "../chunk-3GHD3DNQ.mjs";
import "../chunk-32BBY5UE.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-4WRIEOIP.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/dep-scan.mjs
var render = laneRenderer({
  title: "Deps \xB7 scan",
  metricFields: [
    { key: "total-deps", label: "total", tone: "info" },
    { key: "outdated-count", label: "outdated", tone: "warn" },
    { key: "vulnerable-count", label: "vulnerable", tone: "bad" }
  ]
});
export {
  render
};
