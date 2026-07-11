import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-M4DMHVNA.mjs";
import "../chunk-V6E4JKT7.mjs";
import "../chunk-LUBDSB2U.mjs";
import "../chunk-VZTPBQ7Z.mjs";
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
