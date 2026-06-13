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

// renderers/dep-research.mjs
var render = laneRenderer({
  title: "Deps \xB7 research",
  metricFields: [
    { key: "packages-researched", label: "researched", tone: "info" },
    { key: "packages-update-now", label: "update now", tone: "ok" },
    { key: "packages-migration-needed", label: "migration", tone: "warn" },
    { key: "packages-hold", label: "hold", tone: "warn" }
  ]
});
export {
  render
};
