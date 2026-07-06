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

// renderers/investigate.mjs
var render = laneRenderer({
  title: "Investigation",
  lede: (fm) => fm["problem-statement"],
  metricFields: [
    { key: "option-count", label: "options", tone: "info" }
  ]
});
export {
  render
};
