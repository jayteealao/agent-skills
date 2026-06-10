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
