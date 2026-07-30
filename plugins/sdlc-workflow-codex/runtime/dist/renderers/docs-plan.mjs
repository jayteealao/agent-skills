import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-2XPRZNBM.mjs";
import "../chunk-MZFZ5NFZ.mjs";
import "../chunk-LNVPU46M.mjs";
import "../chunk-SHCWNU77.mjs";
import "../chunk-4WRIEOIP.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/docs-plan.mjs
var render = laneRenderer({
  title: "Docs \xB7 plan",
  metricFields: [
    { key: "total-actions", label: "actions", tone: "info" },
    { key: "p0-count", label: "P0", tone: "bad" },
    { key: "p1-count", label: "P1", tone: "warn" },
    { key: "audit-only", label: "audit only", tone: "info" }
  ]
});
export {
  render
};
