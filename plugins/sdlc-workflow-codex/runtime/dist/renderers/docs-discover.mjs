import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  laneRenderer
} from "../chunk-46KWRO3G.mjs";
import "../chunk-RTLZL6LC.mjs";
import "../chunk-PGWPW65K.mjs";
import "../chunk-65SPV7VQ.mjs";
import "../chunk-4WRIEOIP.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/docs-discover.mjs
var render = laneRenderer({
  title: "Docs \xB7 discover",
  lede: (fm) => fm.scope,
  metricFields: [
    { key: "doc-files-found", label: "docs found", tone: "info" },
    { key: "gaps-found", label: "gaps", tone: "warn" },
    { key: "has-docs-folder", label: "docs folder", tone: "info" }
  ]
});
export {
  render
};
