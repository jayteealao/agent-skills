import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-DUWS6DOA.mjs";
import "../chunk-QTFX7DYX.mjs";
import "../chunk-2GLGHA75.mjs";
import "../chunk-WIORX67G.mjs";
import "../chunk-4WRIEOIP.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/discover.mjs
var render = laneRenderer({
  title: "Discovery",
  lede: (fm) => fm.hypothesis,
  metricFields: [
    { key: "verdict", label: "verdict", tone: "info" },
    { key: "confidence", label: "confidence", tone: "info" },
    { key: "recommended-next", label: "next", tone: "info" }
  ]
});
export {
  render
};
