import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-3SBQMBRC.mjs";
import "../chunk-E6PUIM7I.mjs";
import "../chunk-I2V5XQAR.mjs";
import "../chunk-A7URF4DO.mjs";
import "../chunk-4WRIEOIP.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/docs-generate.mjs
var render = laneRenderer({
  title: "Docs \xB7 generate",
  metricFields: [
    { key: "actions-completed", label: "completed", tone: "ok" },
    { key: "actions-skipped", label: "skipped", tone: "info" }
  ]
});
export {
  render
};
