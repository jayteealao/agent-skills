import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-O7ZFQFR4.mjs";
import "../chunk-XYPPR6B7.mjs";
import "../chunk-RHQB6O5G.mjs";
import "../chunk-U7AGHKEY.mjs";
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
