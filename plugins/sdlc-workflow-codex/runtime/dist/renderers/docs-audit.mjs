import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-EPD3J56P.mjs";
import "../chunk-Q3L3JIQR.mjs";
import "../chunk-6MPRWIFN.mjs";
import "../chunk-NPQPIV7J.mjs";
import "../chunk-4WRIEOIP.mjs";
import "../chunk-LFGT2BKG.mjs";
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
