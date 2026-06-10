import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-2RFG6G6A.mjs";
import "../chunk-YAOZZWBS.mjs";
import "../chunk-556LQVZA.mjs";
import "../chunk-SFNXDR4Z.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-4WRIEOIP.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/dep-plan.mjs
var render = laneRenderer({
  title: "Deps \xB7 plan",
  metricFields: [
    { key: "p0-count", label: "P0 security", tone: "bad" },
    { key: "p1-count", label: "P1 major", tone: "warn" },
    { key: "p2-count", label: "P2 safe", tone: "info" },
    { key: "hold-count", label: "hold", tone: "info" }
  ]
});
export {
  render
};
