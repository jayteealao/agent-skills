import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-YIGRWHEV.mjs";
import "../chunk-25WB5H5Q.mjs";
import "../chunk-VYZ64EKU.mjs";
import "../chunk-6TC2JV7H.mjs";
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
