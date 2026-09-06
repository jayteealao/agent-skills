import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-URRI46F6.mjs";
import "../chunk-76JFDSWK.mjs";
import "../chunk-JFIFDBVI.mjs";
import "../chunk-SUJ36R7O.mjs";
import "../chunk-4WRIEOIP.mjs";
import "../chunk-EQC6XDOG.mjs";
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
