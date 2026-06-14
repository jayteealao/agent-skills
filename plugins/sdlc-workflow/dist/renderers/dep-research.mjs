import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-JTBEIV7I.mjs";
import "../chunk-YSAIAJ5Y.mjs";
import "../chunk-M7PE3G72.mjs";
import "../chunk-DH7J226J.mjs";
import "../chunk-BTT5W62B.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-KGLQRRIU.mjs";

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
