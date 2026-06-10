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

// renderers/docs-audit.mjs
var render = laneRenderer({
  title: "Docs \xB7 audit",
  metricFields: [
    { key: "files-audited", label: "audited", tone: "info" },
    { key: "accuracy-issues", label: "accuracy issues", tone: "warn" },
    { key: "quadrant-violations", label: "quadrant issues", tone: "warn" },
    { key: "gaps-found", label: "gaps", tone: "warn" }
  ]
});
export {
  render
};
